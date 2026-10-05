import { type GlobalPositionStrategy, Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  Injector,
  signal,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import type { CollectionNodeKind } from '@testrix/contracts';
import { TxButtonComponent, TxEmptyStateComponent, TxToastService, playLeaveThen } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';
import { PalettePinsStore } from '../../core/palette-pins.store';
import {
  isEditableKeyboardTarget,
  isModKey,
  shouldDeferToFlowCanvas,
} from '../../core/selection-hotkeys';
import { ImportWorkspaceDialogService } from '../workspace-transfer/import-workspace-dialog.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import { CollectionsDndService } from './collections-dnd.service';
import { CollectionsStore } from './collections.store';
import { CollectionsToolbarComponent } from './collections-toolbar.component';
import { CollectionsTreeComponent } from './collections-tree.component';
import type { CollectionsMenuRequest } from './collections-tree-node.component';

interface CollectionsMenu {
  readonly kind: 'root' | 'folder' | 'http' | 'websocket';
  readonly id: string | null;
}

@Component({
  selector: 'tx-collections-sidebar',
  standalone: true,
  imports: [CollectionsToolbarComponent, CollectionsTreeComponent, TxButtonComponent, TxEmptyStateComponent],
  templateUrl: './collections-sidebar.component.html',
  styleUrl: './collections-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsSidebarComponent {
  readonly store = inject(CollectionsStore);
  readonly dnd = inject(CollectionsDndService);
  readonly workbench = inject(WorkbenchStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toasts = inject(TxToastService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly desktop = inject(DesktopApiService);
  private readonly importWorkspace = inject(ImportWorkspaceDialogService);
  private readonly palettePins = inject(PalettePinsStore);

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('collectionsMenu');

  readonly menu = signal<CollectionsMenu | null>(null);
  readonly renamingId = signal<string | null>(null);
  readonly deleteLabel = computed(() => {
    const id = this.menu()?.id;
    const selected = this.store.selectedIds();
    if (id && selected.includes(id) && selected.length > 1)
      return 'Delete selected';
    return 'Delete';
  });
  readonly pinLabel = computed(() => {
    const menu = this.menu();
    if (!menu || (menu.kind !== 'http' && menu.kind !== 'websocket') || !menu.id)
      return 'Pin to palette';
    return this.palettePins.isPinned(menu.kind, menu.id) ? 'Unpin from palette' : 'Pin to palette';
  });
  readonly canPin = computed(() => {
    const menu = this.menu();
    return Boolean(menu && (menu.kind === 'http' || menu.kind === 'websocket') && menu.id);
  });
  private overlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;
  private renameDraft = '';

  constructor() {
    this.destroyRef.onDestroy(() => this.closeMenu(true));
    effect(() => {
      this.dnd.registerSurface(
        this.rootRef()?.nativeElement ?? null,
        this.scrollerRef()?.nativeElement ?? null,
      );
    });
    effect(() => {
      if (this.store.dragNode())
        this.closeMenu(true);
    });
  }

  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-node-id], button, input, tx-hint'))
      return;
    this.store.clearSelection();
  }

  handleRootMenu(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-node-id]'))
      return;
    this.openMenu(event, { kind: 'root', id: null });
  }

  handleItemMenu(request: CollectionsMenuRequest): void {
    if (!this.store.selectedIds().includes(request.node.id)) {
      this.store.applyPointerSelect(request.node.id, {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      });
    }
    this.openMenu(request.event, { kind: request.node.kind, id: request.node.id });
  }

  handleEmptyNewRequest(): void {
    this.store.setSearchQuery('');
    this.store.clearFilters();
    const node = this.store.create('http', null);
    this.workbench.openFromNode(node);
    this.startRename(node.id);
  }

  handleEmptyImport(): void {
    void this.pickImportSource();
  }

  handleClearFilters(): void {
    this.store.setSearchQuery('');
    this.store.clearFilters();
  }

  handleNew(kind: CollectionNodeKind): void {
    const parentId = this.menu()?.kind === 'folder' ? this.menu()?.id ?? null : null;
    this.closeMenu();
    this.store.setSearchQuery('');
    this.store.clearFilters();
    const node = this.store.create(kind, parentId);
    if (kind === 'http' || kind === 'websocket')
      this.workbench.openFromNode(node);
    this.startRename(node.id);
  }

  handleOpen(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    const node = id ? this.store.nodeById(id) : null;
    if (!node)
      return;
    if (node.kind === 'folder') {
      this.workbench.openFromCollectionFolder(node);
      return;
    }
    this.workbench.openFromNode(node);
  }

  handleRenameFromMenu(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    if (id)
      this.startRename(id);
  }

  handleDuplicate(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    if (!id)
      return;
    this.store.setSearchQuery('');
    this.store.clearFilters();
    const node = this.store.duplicate(id);
    if (node)
      this.startRename(node.id);
  }

  async handlePinToggle(): Promise<void> {
    const menu = this.menu();
    this.closeMenu();
    if (!menu || (menu.kind !== 'http' && menu.kind !== 'websocket') || !menu.id)
      return;
    const node = this.store.nodeById(menu.id);
    if (!node || (node.kind !== 'http' && node.kind !== 'websocket'))
      return;
    await this.palettePins.toggle(node.kind, node.id, node.name);
  }

  async handleDelete(): Promise<void> {
    const menu = this.menu();
    this.closeMenu();
    const selected = this.store.selectedIds();
    const targetId = menu?.id;
    const ids =
      targetId && selected.includes(targetId) && selected.length > 1 ? [...selected] : targetId ? [targetId] : [];
    await this.deleteIds(ids);
  }

  startRename(id: string): void {
    this.renameDraft = this.store.nodeById(id)?.name ?? '';
    this.renamingId.set(id);
    this.closeMenu();
    afterNextRender(
      () => {
        const match = this.host.nativeElement.querySelector(`[data-collections-rename="${id}"]`);
        if (match instanceof HTMLInputElement) {
          match.focus();
          match.select();
        }
      },
      { injector: this.injector },
    );
  }

  handleRenameInput(event: { readonly id: string; readonly value: string }): void {
    this.renameDraft = event.value;
  }

  handleRenameKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== 'Escape')
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.renamingId.set(null);
      return;
    }
    this.finishRename();
  }

  finishRename(): void {
    const id = this.renamingId();
    this.renamingId.set(null);
    if (!id)
      return;
    const node = this.store.nodeById(id);
    const name = this.renameDraft.trim() || node?.name || 'Item';
    this.store.rename(id, name);
    this.workbench.renameCollectionTabs(id, name);
  }

  closeMenu(immediate = false): void {
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

  @HostListener('window:resize')
  handleWindowResize(): void {
    this.closeMenu();
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.menu()) {
        event.preventDefault();
        this.closeMenu();
        return;
      }
      if (this.renamingId()) {
        event.preventDefault();
        this.renamingId.set(null);
        return;
      }
      if (this.store.selectedIds().length === 0)
        return;
      event.preventDefault();
      this.store.clearSelection();
      return;
    }

    if (this.menu() || this.renamingId())
      return;
    if (isEditableKeyboardTarget(event.target))
      return;
    if (shouldDeferToFlowCanvas(event))
      return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = [...this.store.selectedIds()];
      if (ids.length === 0)
        return;
      event.preventDefault();
      void this.deleteIds(ids);
      return;
    }

    if (isModKey(event, 'a')) {
      const ids = this.store.visibleIds();
      if (ids.length === 0)
        return;
      event.preventDefault();
      this.store.selectedIds.set([...ids]);
      this.store.selectionAnchorId.set(ids[0] ?? null);
      return;
    }

    if (isModKey(event, 'd')) {
      const ids = [...this.store.selectedIds()];
      if (ids.length === 0)
        return;
      event.preventDefault();
      this.store.setSearchQuery('');
      this.store.clearFilters();
      for (const id of ids)
        this.store.duplicate(id);
    }
  }

  private async deleteIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0)
      return;
    const names = ids
      .map((id) => this.store.nodeById(id)?.name.trim() || 'Item')
      .slice(0, 3);
    const extra = ids.length > 3 ? ` and ${ids.length - 3} more` : '';
    const folderHint = ids.some((id) => this.store.nodeById(id)?.kind === 'folder')
      ? ' Nested requests inside folders are removed too.'
      : '';
    const ok = await this.confirm.ask({
      title: ids.length === 1 ? 'Delete from collection' : 'Delete selected',
      body:
        ids.length === 1
          ? `This removes ${names[0]} from this workspace.${folderHint}`
          : `This removes ${names.join(', ')}${extra} from this workspace.${folderHint}`,
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    const deferred = this.store.removeDeferred(ids);
    if (!deferred)
      return;
    this.workbench.closeCollectionTabs(deferred.removedIds);
    const message =
      ids.length === 1
        ? `Deleted ${names[0] ?? 'item'}`
        : `Deleted ${ids.length} items`;
    this.toasts.show({
      message,
      action: {
        label: 'Undo',
        onClick: () => deferred.restore(),
      },
      onExpire: () => void deferred.commit(),
    });
  }

  private async pickImportSource(): Promise<void> {
    const path = await this.desktop.api.workspace.pickImportSource();
    if (!path)
      return;
    const inspected = await this.desktop.api.workspace.importInspect(path);
    this.importWorkspace.show(inspected);
  }

  private openMenu(event: MouseEvent, partial: CollectionsMenu): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    this.menu.set(partial);
    const x = event.clientX;
    const y = event.clientY;
    const position = this.overlay.position().global();
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'tx-overlay-menu',
    });
    overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.overlayRef = overlayRef;
    this.placeMenu(overlayRef, position, x, y);
    requestAnimationFrame(() => {
      if (this.overlayRef === overlayRef)
        this.placeMenu(overlayRef, position, x, y);
    });
    window.setTimeout(() => {
      if (this.overlayRef !== overlayRef)
        return;
      overlayRef.outsidePointerEvents().subscribe(() => this.closeMenu());
    });
  }

  private placeMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-collections-menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 188;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 180;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }
}
