import { type GlobalPositionStrategy, Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import { serviceGroups, findServiceNode, type ServiceId, type ServiceItem, type ServiceTreeNode } from '@testrix/contracts';
import { TxHintComponent, TxToastService, playLeaveThen } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { PalettePinsStore } from '../../core/palette-pins.store';
import {
  isEditableKeyboardTarget,
  isFlowCanvasKeyboardTarget,
  isModKey,
  ownsTreeClipboardShortcut,
  shouldDeferToFlowCanvas,
} from '../../core/selection-hotkeys';
import { TreeClipboardService } from '../../core/tree-clipboard.service';
import { ServiceIconComponent } from './service-icon.component';
import { ServicesStore } from './services.store';
import { ServiceListPaneComponent } from './shared/service-list-pane.component';
import { EmulatorSidebarComponent } from './emulator/emulator-sidebar.component';
import { MockSidebarComponent } from './mock/mock-sidebar.component';

interface ServicesMenu {
  readonly serviceId: ServiceId;
  readonly target:
    | { readonly kind: 'root' }
    | { readonly kind: 'folder' | 'artifact'; readonly id: string; readonly name: string };
}

@Component({
  selector: 'tx-services-sidebar',
  standalone: true,
  imports: [
    TxHintComponent,
    ServiceIconComponent,
    ServiceListPaneComponent,
    EmulatorSidebarComponent,
    MockSidebarComponent,
  ],
  templateUrl: './services-sidebar.component.html',
  styleUrl: './services-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tree-clipboard': 'services' },
})
export class ServicesSidebarComponent {
  readonly store = inject(ServicesStore);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly clipboard = inject(TreeClipboardService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly toasts = inject(TxToastService);
  private readonly palettePins = inject(PalettePinsStore);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('servicesMenu');
  /** Toast ids for pending deletes so Ctrl+Z can dismiss without committing. */
  private readonly pendingToastByDelete = new WeakMap<object, string>();

  readonly groups = serviceGroups();
  readonly renamingId = signal<string | null>(null);
  readonly menu = signal<ServicesMenu | null>(null);
  private renameDraft = '';
  private overlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.closeMenu(true));
  }

  handleOpen(service: ServiceItem): void {
    this.store.drillIn(service.id);
  }

  handleRowKeydown(service: ServiceItem, event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ')
      return;
    event.preventDefault();
    this.handleOpen(service);
  }

  isHubActive(id: string): boolean {
    return this.store.activeService() === id;
  }

  paneEnter(): string | undefined {
    return this.store.paneSlideDir() ? 'tx-sidebar-pane-in' : undefined;
  }

  noun(id: ServiceId): string {
    if (id === 'flows')
      return 'flow';
    if (id === 'load')
      return 'load';
    if (id === 'regression')
      return 'regression';
    if (id === 'emulator')
      return 'emulator';
    if (id === 'mocks')
      return 'endpoint';
    if (id === 'listeners')
      return 'listener';
    if (id === 'intercept')
      return 'rule';
    return 'item';
  }

  canCreateFolder(id: ServiceId): boolean {
    return id !== 'emulator';
  }

  handleEmptyMenu(serviceId: ServiceId, event: MouseEvent): void {
    this.openMenu(event, { serviceId, target: { kind: 'root' } });
  }

  handleMenu(
    serviceId: ServiceId,
    event: { readonly node: ServiceTreeNode<Record<string, unknown>>; readonly event: MouseEvent },
  ): void {
    if (!this.store.selectedIds().includes(event.node.id))
      this.store.applyPointerSelect(serviceId, event.node.id, event.event);
    this.openMenu(event.event, {
      serviceId,
      target: { kind: event.node.kind === 'folder' ? 'folder' : 'artifact', id: event.node.id, name: event.node.name },
    });
  }

  handleRenameInput(payload: { readonly id: string; readonly name: string }): void {
    this.renameDraft = payload.name;
  }

  finishRename(): void {
    const id = this.renamingId();
    const serviceId = this.store.activeService();
    if (id && serviceId && this.renameDraft.trim())
      void this.store.rename(serviceId, id, this.renameDraft.trim());
    this.renamingId.set(null);
  }

  async handleEmptyNewFlow(): Promise<void> {
    const id = await this.store.createArtifact('flows', null);
    this.renameDraft = 'New flow';
    this.renamingId.set(id);
  }

  async handleMenuNew(kind: 'folder' | 'artifact'): Promise<void> {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu)
      return;
    const parentId = menu.target.kind === 'folder' ? menu.target.id : null;
    const id =
      kind === 'folder'
        ? await this.store.createFolder(menu.serviceId, parentId)
        : await this.store.createArtifact(menu.serviceId, parentId);
    this.renameDraft = kind === 'folder' ? 'New folder' : `New ${this.noun(menu.serviceId)}`;
    this.renamingId.set(id);
  }

  handleMenuOpen(): void {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu || menu.target.kind !== 'artifact')
      return;
    this.store.openArtifact(menu.serviceId, menu.target.id, menu.target.name);
  }

  handleMenuRename(): void {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu || menu.target.kind === 'root')
      return;
    this.renameDraft = menu.target.name;
    this.renamingId.set(menu.target.id);
  }

  async handleMenuDuplicate(): Promise<void> {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu || menu.target.kind === 'root')
      return;
    const selected = this.store.selectedIds();
    const ids =
      selected.includes(menu.target.id) && selected.length > 1 ? [...selected] : [menu.target.id];
    for (const id of ids)
      await this.store.duplicate(menu.serviceId, id);
  }

  async handleMenuPinToggle(): Promise<void> {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu || menu.serviceId !== 'flows' || menu.target.kind !== 'artifact')
      return;
    await this.palettePins.toggle('flow', menu.target.id, menu.target.name);
  }

  pinLabel(): string {
    const menu = this.menu();
    if (!menu || menu.serviceId !== 'flows' || menu.target.kind !== 'artifact')
      return 'Pin to palette';
    return this.palettePins.isPinned('flow', menu.target.id) ? 'Unpin from palette' : 'Pin to palette';
  }

  canPinFlow(): boolean {
    const menu = this.menu();
    return Boolean(menu && menu.serviceId === 'flows' && menu.target.kind === 'artifact');
  }

  async handleMenuDelete(): Promise<void> {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu || menu.target.kind === 'root')
      return;
    const selected = this.store.selectedIds();
    const ids =
      selected.includes(menu.target.id) && selected.length > 1 ? [...selected] : [menu.target.id];
    await this.confirmAndDelete(menu.serviceId, ids);
  }

  private async confirmAndDelete(serviceId: ServiceId, ids: readonly string[]): Promise<void> {
    if (ids.length === 0)
      return;
    const names = ids
      .map((id) => findServiceNode(this.store.visibleTree(serviceId), id)?.name.trim() || this.noun(serviceId))
      .slice(0, 3);
    const ok = await this.confirm.ask({
      title: ids.length === 1 ? `Delete ${this.noun(serviceId)}?` : `Delete ${ids.length} items?`,
      body:
        ids.length === 1
          ? `This removes ${names[0]} from this workspace. You can Undo for a few seconds.`
          : `This removes ${ids.length} items from this workspace. You can Undo for a few seconds.`,
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    const deferred = this.store.removeDeferred(serviceId, ids);
    if (!deferred)
      return;
    const message =
      ids.length === 1
        ? `Deleted ${names[0] ?? this.noun(serviceId)}`
        : `Deleted ${ids.length} items`;
    const toastId = this.toasts.show({
      message,
      action: {
        label: 'Undo',
        onClick: () => deferred.restore(),
      },
      onExpire: () => void deferred.commit(),
    });
    this.pendingToastByDelete.set(deferred, toastId);
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
    if (this.menu()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMenu();
      }
      return;
    }
    if (this.renamingId()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.renamingId.set(null);
      }
      return;
    }

    const serviceId = this.store.activeService();
    if (!serviceId)
      return;
    if (isEditableKeyboardTarget(event.target))
      return;
    // Flow canvas owns shortcuts while it has focus and a graph selection.
    if (shouldDeferToFlowCanvas(event))
      return;

    if (event.key === 'Escape') {
      if (this.store.selectedIds().length === 0)
        return;
      event.preventDefault();
      this.store.clearSelection();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = this.store.selectionOrActive(serviceId);
      if (ids.length === 0)
        return;
      event.preventDefault();
      void this.confirmAndDelete(serviceId, ids);
      return;
    }

    if (isModKey(event, 'a')) {
      event.preventDefault();
      this.store.selectAllVisible(serviceId);
      return;
    }

    if (isModKey(event, 'd')) {
      const ids = this.store.selectionOrActive(serviceId);
      if (ids.length === 0)
        return;
      event.preventDefault();
      void (async () => {
        for (const id of ids)
          await this.store.duplicate(serviceId, id);
      })();
      return;
    }

    if (
      !event.shiftKey &&
      (isModKey(event, 'c') || isModKey(event, 'v')) &&
      ownsTreeClipboardShortcut(this.host.nativeElement, event, true)
    ) {
      if (isModKey(event, 'c')) {
        const nodes = this.store.copySelection(serviceId);
        if (nodes.length > 0) {
          event.preventDefault();
          this.clipboard.set({ kind: 'service', serviceId, nodes });
        }
        return;
      }
      const memory = this.clipboard.peek('service', serviceId);
      if (memory) {
        event.preventDefault();
        this.store.setSearch(serviceId, '');
        void this.store.pasteCopied(serviceId, memory.nodes);
        return;
      }
      void this.clipboard.get('service', serviceId).then((payload) => {
        if (!payload)
          return;
        this.store.setSearch(serviceId, '');
        void this.store.pasteCopied(serviceId, payload.nodes);
      });
      return;
    }

    if (isModKey(event, 'z') && !event.shiftKey) {
      if (isFlowCanvasKeyboardTarget(document.activeElement))
        return;
      const deferred = this.store.undoLastDelete();
      if (!deferred)
        return;
      event.preventDefault();
      const toastId = this.pendingToastByDelete.get(deferred);
      if (toastId)
        this.toasts.dismiss(toastId);
    }
  }

  private openMenu(event: MouseEvent, partial: ServicesMenu): void {
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
    const menu = overlayRef.overlayElement.querySelector('.tx-services__menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 188;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 180;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }
}
