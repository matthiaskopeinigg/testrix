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
import { TxButtonComponent, TxEmptyStateComponent, TxToastService, forwardPaddingContextMenu, playLeaveThen } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { isContextMenuLeftOfRow, isSidebarToolbarContext } from '../../core/tree-context-menu';
import {
  isEditableKeyboardTarget,
  isModKey,
  ownsTreeClipboardShortcut,
  shouldDeferToFlowCanvas,
} from '../../core/selection-hotkeys';
import { TreeClipboardService } from '../../core/tree-clipboard.service';
import {
  collectOpenRequestVariableNames,
  missingEnvironmentVariableNames,
} from './open-request-variables';
import { CollectionsStore } from '../collections/collections.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import { EnvironmentsDndService } from './environments-dnd.service';
import { EnvironmentsListComponent } from './environments-list.component';
import type { EnvironmentsMenuRequest } from './environments-list-item.component';
import { EnvironmentsStore } from './environments.store';
import { EnvironmentsToolbarComponent } from './environments-toolbar.component';

interface EnvListMenu {
  readonly kind: 'root' | 'item';
  readonly id: string | null;
}

@Component({
  selector: 'tx-environments-sidebar',
  standalone: true,
  imports: [EnvironmentsToolbarComponent, EnvironmentsListComponent, TxButtonComponent, TxEmptyStateComponent],
  templateUrl: './environments-sidebar.component.html',
  styleUrl: './environments-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tree-clipboard': 'environments' },
})
export class EnvironmentsSidebarComponent {
  readonly store = inject(EnvironmentsStore);
  readonly dnd = inject(EnvironmentsDndService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly collections = inject(CollectionsStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly clipboard = inject(TreeClipboardService);

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('envListMenu');

  readonly menu = signal<EnvListMenu | null>(null);
  readonly renamingId = signal<string | null>(null);
  readonly deleteLabel = computed(() => {
    const id = this.menu()?.id;
    const selected = this.store.selectedIds();
    if (id && selected.includes(id) && selected.length > 1) {
      return 'Delete selected';
    }
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
  }

  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-env-id], button, input, tx-hint')) {
      return;
    }
    this.store.clearListSelection();
  }

  handleChromeMenu(event: MouseEvent): void {
    event.preventDefault();
    if (!isSidebarToolbarContext(event))
      return;
    this.openMenu(event, { kind: 'root', id: null });
  }

  handleRootMenu(event: MouseEvent): void {
    if (forwardPaddingContextMenu(event))
      return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-env-id]')) {
      return;
    }
    this.openMenu(event, { kind: 'root', id: null });
  }

  handleItemMenu(request: EnvironmentsMenuRequest): void {
    if (isContextMenuLeftOfRow(request.event)) {
      this.openMenu(request.event, { kind: 'root', id: null });
      return;
    }
    if (!this.store.selectedIds().includes(request.id)) {
      this.store.applyListPointerSelect(request.id, {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      });
    }
    this.openMenu(request.event, { kind: 'item', id: request.id });
  }

  handleNewEnvironment(): void {
    this.closeMenu();
    this.store.setSearchQuery('');
    const item = this.store.create();
    this.startRename(item.id);
  }

  handleScanOpenRequests(): void {
    const referenced = collectOpenRequestVariableNames({
      workbench: this.workbench,
      nodeById: (id) => this.collections.nodeById(id),
    });
    let env =
      (this.store.activeId() ? this.store.environmentById(this.store.activeId()!) : null) ??
      this.store.items()[0] ??
      null;
    if (!env)
      env = this.store.create();
    const missing = missingEnvironmentVariableNames(env.variables, referenced);
    if (missing.length === 0) {
      this.workbench.openFromEnvironment(env);
      return;
    }
    this.store.addMissingVariableKeys(env.id, missing);
    this.workbench.openFromEnvironment(env);
  }

  handleOpen(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    const env = id ? this.store.environmentById(id) : null;
    if (env) {
      this.workbench.openFromEnvironment(env);
    }
  }

  handleRenameFromMenu(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    if (id) {
      this.startRename(id);
    }
  }

  handleDuplicate(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    if (!id) {
      return;
    }
    this.store.setSearchQuery('');
    const item = this.store.duplicate(id);
    if (item) {
      this.startRename(item.id);
    }
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

  private readonly toasts = inject(TxToastService);

  private async deleteIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0)
      return;
    const names = ids
      .map((id) => this.store.environmentById(id)?.name.trim() || 'Environment')
      .slice(0, 3);
    const extra = ids.length > 3 ? ` and ${ids.length - 3} more` : '';
    const ok = await this.confirm.ask({
      title: ids.length === 1 ? 'Delete environment' : 'Delete environments',
      body:
        ids.length === 1
          ? `This removes ${names[0]} and its variables from this workspace.`
          : `This removes ${names.join(', ')}${extra} from this workspace.`,
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    const deferred = this.store.removeDeferred(ids);
    if (!deferred)
      return;
    this.workbench.closeEnvironmentTabs(deferred.removedIds);
    const message =
      ids.length === 1
        ? `Deleted ${names[0] ?? 'environment'}`
        : `Deleted ${ids.length} environments`;
    this.toasts.show({
      message,
      action: {
        label: 'Undo',
        onClick: () => deferred.restore(),
      },
      onExpire: () => deferred.commit(),
    });
  }

  startRename(id: string): void {
    this.renameDraft = this.store.environmentById(id)?.name ?? '';
    this.renamingId.set(id);
    this.closeMenu();
    afterNextRender(
      () => {
        const match = this.host.nativeElement.querySelector(`[data-env-rename="${id}"]`);
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
    if (event.key !== 'Enter' && event.key !== 'Escape') {
      return;
    }
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
    if (!id) {
      return;
    }
    const name = this.renameDraft.trim() || 'Environment';
    this.store.rename(id, name);
    this.workbench.renameEnvironmentTabs(id, name);
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
      }
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
      const ids = this.store.visibleEnvironments().map((item) => item.id);
      if (ids.length === 0)
        return;
      event.preventDefault();
      this.store.selectedIds.set(ids);
      this.store.selectionAnchorId.set(ids[0] ?? null);
      return;
    }

    if (isModKey(event, 'd')) {
      const ids = [...this.store.selectedIds()];
      if (ids.length === 0)
        return;
      event.preventDefault();
      for (const id of ids)
        this.store.duplicate(id);
      return;
    }

    if (!ownsTreeClipboardShortcut(this.host.nativeElement, event, true))
      return;

    if (isModKey(event, 'c') && !event.shiftKey) {
      const items = this.store.copySelection();
      if (items.length === 0)
        return;
      event.preventDefault();
      this.clipboard.set({ kind: 'environments', items });
      return;
    }

    if (isModKey(event, 'v') && !event.shiftKey) {
      const memory = this.clipboard.peek('environments');
      if (memory) {
        event.preventDefault();
        this.store.setSearchQuery('');
        this.store.pasteCopied(memory.items);
        return;
      }
      void this.clipboard.get('environments').then((payload) => {
        if (!payload)
          return;
        this.store.setSearchQuery('');
        this.store.pasteCopied(payload.items);
      });
    }
  }

  private openMenu(event: MouseEvent, partial: EnvListMenu): void {
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
      if (this.overlayRef === overlayRef) {
        this.placeMenu(overlayRef, position, x, y);
      }
    });
    window.setTimeout(() => {
      if (this.overlayRef !== overlayRef) {
        return;
      }
      overlayRef.outsidePointerEvents().subscribe(() => this.closeMenu());
    });
  }

  private placeMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-environments-menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 188;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 160;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }
}
