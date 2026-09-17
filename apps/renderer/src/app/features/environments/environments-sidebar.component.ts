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
import { TxEmptyStateComponent, playLeaveThen } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
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
  imports: [EnvironmentsToolbarComponent, EnvironmentsListComponent, TxEmptyStateComponent],
  templateUrl: './environments-sidebar.component.html',
  styleUrl: './environments-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsSidebarComponent {
  readonly store = inject(EnvironmentsStore);
  readonly dnd = inject(EnvironmentsDndService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('envListMenu');

  readonly menu = signal<EnvListMenu | null>(null);
  readonly renamingId = signal<string | null>(null);
  readonly canDelete = computed(() => this.store.items().length > 1);
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

  handleRootMenu(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-env-id]')) {
      return;
    }
    this.openMenu(event, { kind: 'root', id: null });
  }

  handleItemMenu(request: EnvironmentsMenuRequest): void {
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
    if (ids.length === 0 || this.store.items().length <= 1) {
      return;
    }
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
    if (!ok) {
      return;
    }
    const removed = this.store.remove(ids);
    this.workbench.closeEnvironmentTabs(removed);
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
    if (event.key !== 'Escape' || !this.menu()) {
      return;
    }
    event.preventDefault();
    this.closeMenu();
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
