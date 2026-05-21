import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import type { TxContextMenuItem, TxContextMenuPosition } from './tx-context-menu.types';

const MENU_PADDING = 8;

@Component({
  selector: 'tx-context-menu',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './tx-context-menu.component.html',
  styleUrl: './tx-context-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxContextMenuComponent {
  readonly open = input(false);
  readonly position = input<TxContextMenuPosition>({ x: 0, y: 0 });
  readonly items = input<readonly TxContextMenuItem[]>([]);

  readonly itemSelect = output<string>();
  readonly closed = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly activeIndex = signal(0);
  protected readonly clampedPosition = signal<TxContextMenuPosition>({ x: 0, y: 0 });

  protected readonly actionableItems = computed(() =>
    this.items().filter((item) => !item.separator && !item.disabled),
  );

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      this.activeIndex.set(0);
      queueMicrotask(() => {
        this.portalPanelToBody();
        this.clampToViewport();
      });
    });

    effect(() => {
      if (this.open()) {
        this.position();
        this.items();
        queueMicrotask(() => {
          this.portalPanelToBody();
          this.clampToViewport();
        });
      }
    });

    this.destroyRef.onDestroy(() => {
      const panel = this.panelRef()?.nativeElement;
      if (panel?.isConnected) {
        panel.remove();
      }
    });
  }

  protected isActive(index: number): boolean {
    const item = this.items()[index];
    if (!item || item.separator || item.disabled) {
      return false;
    }
    const actionable = this.actionableItems();
    const active = actionable[this.activeIndex()] ?? null;
    return active?.id === item.id;
  }

  protected handleItemClick(item: TxContextMenuItem, event: Event): void {
    event.stopPropagation();
    if (item.disabled || item.separator) {
      return;
    }
    this.itemSelect.emit(item.id);
    this.close();
  }

  protected handlePanelKeydown(event: KeyboardEvent): void {
    const actionable = this.actionableItems();
    if (actionable.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => (i + 1) % actionable.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => (i - 1 + actionable.length) % actionable.length);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const item = actionable[this.activeIndex()];
      if (item) {
        this.itemSelect.emit(item.id);
        this.close();
      }
    }
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  protected handleDocumentPointerDown(event: PointerEvent): void {
    if (!this.open()) {
      return;
    }
    const panel = this.panelRef()?.nativeElement;
    if (panel?.contains(event.target as Node)) {
      return;
    }
    this.close();
  }

  private close(): void {
    this.closed.emit();
  }

  /** Escapes sidebar overflow clipping by mounting the panel on `document.body`. */
  private portalPanelToBody(): void {
    const panel = this.panelRef()?.nativeElement;
    if (!panel || panel.parentElement === this.document.body) {
      return;
    }

    this.document.body.appendChild(panel);
  }

  private clampToViewport(): void {
    const panel = this.panelRef()?.nativeElement;
    const { x, y } = this.position();
    if (!panel) {
      this.clampedPosition.set({ x, y });
      return;
    }

    const rect = panel.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - MENU_PADDING;
    const maxY = window.innerHeight - rect.height - MENU_PADDING;
    this.clampedPosition.set({
      x: Math.max(MENU_PADDING, Math.min(x, maxX)),
      y: Math.max(MENU_PADDING, Math.min(y, maxY)),
    });
  }
}
