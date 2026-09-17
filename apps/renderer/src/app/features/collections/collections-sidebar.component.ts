import { GlobalPositionStrategy, Overlay, OverlayRef } from '@angular/cdk/overlay';
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
import { TxEmptyStateComponent, playLeaveThen } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
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
  imports: [CollectionsToolbarComponent, CollectionsTreeComponent, TxEmptyStateComponent],
  templateUrl: './collections-sidebar.component.html',
  styleUrl: './collections-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsSidebarComponent {
  readonly store = inject(CollectionsStore);
  readonly dnd = inject(CollectionsDndService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

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

  handleNew(kind: CollectionNodeKind): void {
    const parentId = this.menu()?.kind === 'folder' ? this.menu()?.id ?? null : null;
    this.closeMenu();
    this.store.setSearchQuery('');
    const node = this.store.create(kind, parentId);
    if (kind === 'http' || kind === 'websocket')
      this.workbench.openFromNode(node);
    this.startRename(node.id);
  }

  handleOpen(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    const node = id ? this.store.nodeById(id) : null;
    if (node && node.kind !== 'folder')
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
    const node = this.store.duplicate(id);
    if (node)
      this.startRename(node.id);
  }

  async handleDelete(): Promise<void> {
    const menu = this.menu();
    this.closeMenu();
    const selected = this.store.selectedIds();
    const targetId = menu?.id;
    const ids =
      targetId && selected.includes(targetId) && selected.length > 1 ? [...selected] : targetId ? [targetId] : [];
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
    const removed = this.store.remove(ids);
    this.workbench.closeCollectionTabs(removed);
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
    if (event.key !== 'Escape')
      return;
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
    this.store.clearSelection();
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
