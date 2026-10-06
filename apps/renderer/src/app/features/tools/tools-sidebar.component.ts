import { GlobalPositionStrategy, Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  effect,
  inject,
  signal,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import type { PlantumlNode } from '@testrix/contracts';
import { TxEmptyStateComponent, TxHintComponent, playLeaveThen } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { isEditableKeyboardTarget, isModKey, ownsTreeClipboardShortcut } from '../../core/selection-hotkeys';
import { TreeClipboardService } from '../../core/tree-clipboard.service';
import { ToolsDndService } from './tools-dnd.service';
import { ToolsListComponent } from './tools-list.component';
import { ToolsStore } from './tools.store';
import { PlantumlListPaneComponent } from './plantuml/plantuml-list-pane.component';
import { PlantumlStore } from './plantuml/plantuml.store';

interface DrillMenu {
  readonly target:
    | { readonly kind: 'root' }
    | { readonly kind: 'folder'; readonly id: string; readonly name: string }
    | { readonly kind: 'artifact'; readonly id: string; readonly name: string };
}

@Component({
  selector: 'tx-tools-sidebar',
  standalone: true,
  imports: [
    ToolsListComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    PlantumlListPaneComponent,
  ],
  templateUrl: './tools-sidebar.component.html',
  styleUrl: './tools-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tree-clipboard': 'tools' },
})
export class ToolsSidebarComponent {
  readonly store = inject(ToolsStore);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly clipboard = inject(TreeClipboardService);
  readonly plantuml = inject(PlantumlStore);
  readonly dnd = inject(ToolsDndService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('plantumlMenu');
  private readonly listPane = viewChild(PlantumlListPaneComponent);

  readonly menu = signal<DrillMenu | null>(null);
  private overlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;

  constructor() {
    effect(() => {
      this.dnd.registerSurface(
        this.rootRef()?.nativeElement ?? null,
        this.scrollerRef()?.nativeElement ?? null,
      );
    });
    this.destroyRef.onDestroy(() => this.closeMenu(true));
  }

  paneEnter(): string | undefined {
    return this.store.paneSlideDir() ? 'tx-sidebar-pane-in' : undefined;
  }

  handleChromeClick(event: MouseEvent): void {
    if (this.store.drillId())
      return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-tool-id], button, tx-hint'))
      return;
    this.store.clearListSelection();
  }

  handlePlantumlMenu(payload: { readonly node: PlantumlNode | null; readonly event: MouseEvent }): void {
    if (!payload.node) {
      this.openMenu(payload.event, { target: { kind: 'root' } });
      return;
    }
    this.plantuml.select(payload.node.id);
    this.openMenu(payload.event, {
      target: {
        kind: payload.node.kind === 'folder' ? 'folder' : 'artifact',
        id: payload.node.id,
        name: payload.node.name,
      },
    });
  }

  async handleMenuNew(kind: 'folder' | 'artifact'): Promise<void> {
    const menu = this.menu();
    this.closeMenu();
    const parentId = menu?.target.kind === 'folder' ? menu.target.id : null;
    if (kind === 'folder') {
      const id = await this.plantuml.createFolder(parentId);
      this.listPane()?.startRename(id);
      return;
    }
    await this.plantuml.createDiagram(parentId);
  }

  async handleMenuNewDiagram(
    diagramKind: 'sequence' | 'class' | 'activity',
  ): Promise<void> {
    const menu = this.menu();
    this.closeMenu();
    const parentId = menu?.target.kind === 'folder' ? menu.target.id : null;
    await this.plantuml.createDiagram(parentId, diagramKind);
  }

  handleMenuOpen(): void {
    const menu = this.menu();
    this.closeMenu();
    if (menu?.target.kind !== 'artifact')
      return;
    this.plantuml.openDiagram(menu.target.id, menu.target.name);
  }

  handleMenuRename(): void {
    const menu = this.menu();
    this.closeMenu();
    if (menu?.target.kind !== 'folder' && menu?.target.kind !== 'artifact')
      return;
    this.listPane()?.startRename(menu.target.id);
  }

  async handleMenuDuplicate(): Promise<void> {
    const menu = this.menu();
    this.closeMenu();
    if (!menu || menu.target.kind === 'root')
      return;
    const selected = this.plantuml.selectedIds();
    const ids =
      selected.includes(menu.target.id) && selected.length > 1 ? [...selected] : [menu.target.id];
    for (const id of ids)
      await this.plantuml.duplicate(id);
  }

  async handleMenuDelete(): Promise<void> {
    const menu = this.menu();
    this.closeMenu();
    if (!menu || menu.target.kind === 'root')
      return;
    const selected = this.plantuml.selectedIds();
    const ids =
      selected.includes(menu.target.id) && selected.length > 1 ? [...selected] : [menu.target.id];
    await this.confirmAndDelete(ids, menu.target.name, menu.target.kind === 'folder');
  }

  private async confirmAndDelete(
    ids: readonly string[],
    name?: string,
    isFolder = false,
  ): Promise<void> {
    if (ids.length === 0)
      return;
    const ok = await this.confirm.ask({
      title: ids.length === 1
        ? `Delete ${name ?? 'item'}?`
        : `Delete ${ids.length} items?`,
      body: ids.length === 1 && isFolder
        ? 'Folders and items inside will be removed.'
        : ids.length === 1
          ? 'This diagram will be removed from the workspace.'
          : 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    await this.plantuml.removeMany(ids);
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (this.menu()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMenu();
      }
      return;
    }

    const renamingId = this.listPane()?.renamingId() ?? null;
    if (renamingId) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.listPane()?.finishRename();
      }
      return;
    }

    if (this.store.drillId() !== 'plantuml')
      return;
    if (isEditableKeyboardTarget(event.target))
      return;

    if (event.key === 'Escape') {
      if (this.plantuml.selectedIds().length === 0)
        return;
      event.preventDefault();
      this.plantuml.clearSelection();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = this.plantuml.selectionOrActive();
      if (ids.length === 0)
        return;
      event.preventDefault();
      const first = findDrillLabel(this.plantuml, ids[0]);
      void this.confirmAndDelete(ids, first?.name, first?.isFolder);
      return;
    }

    if (isModKey(event, 'a')) {
      event.preventDefault();
      this.plantuml.selectAllVisible();
      return;
    }

    if (isModKey(event, 'd')) {
      const ids = this.plantuml.selectionOrActive();
      if (ids.length === 0)
        return;
      event.preventDefault();
      void (async () => {
        for (const id of ids)
          await this.plantuml.duplicate(id);
      })();
      return;
    }

    if (!ownsTreeClipboardShortcut(this.host.nativeElement, event, true))
      return;

    if (isModKey(event, 'c') && !event.shiftKey) {
      const nodes = this.plantuml.copySelection();
      if (nodes.length === 0)
        return;
      event.preventDefault();
      this.clipboard.set({ kind: 'plantuml', nodes });
      return;
    }

    if (isModKey(event, 'v') && !event.shiftKey) {
      const memory = this.clipboard.peek('plantuml');
      if (memory) {
        event.preventDefault();
        this.plantuml.search.set('');
        void this.plantuml.pasteCopied(memory.nodes);
        return;
      }
      void this.clipboard.get('plantuml').then((payload) => {
        if (!payload)
          return;
        this.plantuml.search.set('');
        void this.plantuml.pasteCopied(payload.nodes);
      });
    }
  }

  private openMenu(event: MouseEvent, menu: DrillMenu): void {
    this.closeMenu(true);
    this.menu.set(menu);
    const position = new GlobalPositionStrategy()
      .left(`${event.clientX}px`)
      .top(`${event.clientY}px`);
    this.overlayRef = this.overlay.create({
      positionStrategy: position,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.close(),
    });
    this.overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.overlayRef.backdropClick().subscribe(() => this.closeMenu());
  }

  private closeMenu(immediate = false): void {
    const overlayRef = this.overlayRef;
    this.menuCloseToken += 1;
    const token = this.menuCloseToken;
    if (!overlayRef) {
      this.menu.set(null);
      return;
    }
    const dispose = (): void => {
      if (token !== this.menuCloseToken)
        return;
      overlayRef.dispose();
      if (this.overlayRef === overlayRef) {
        this.overlayRef = null;
        this.menu.set(null);
      }
    };
    if (immediate) {
      dispose();
      return;
    }
    const menu = overlayRef.overlayElement.querySelector('.tx-menu');
    playLeaveThen(menu instanceof HTMLElement ? menu : null, dispose);
  }
}

function findDrillLabel(
  store: PlantumlStore,
  id: string,
): { readonly name: string; readonly isFolder: boolean } | null {
  const node = store.visibleRows().find((row) => row.node.id === id)?.node;
  return node ? { name: node.name, isFolder: node.kind === 'folder' } : null;
}
