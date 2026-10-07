import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  numberAttribute,
  output,
  signal,
} from '@angular/core';

import { TxHintComponent } from '../../primitives/tx-hint/tx-hint.component';
import { forwardPaddingContextMenu } from './forward-padding-context-menu';
import {
  clampSidebarWidth,
  TX_SIDEBAR_COLLAPSE_WIDTH,
  TX_SIDEBAR_DEFAULT_WIDTH,
  TX_SIDEBAR_MAX_WIDTH,
  TX_SIDEBAR_MIN_WIDTH,
} from './tx-sidebar.sizing';

export type TxSidebarEdge = 'start' | 'end';

/**
 * Collapsible workspace sidebar with a draggable edge.
 * `start` docks on the left (resize on the right); `end` docks on the right (resize on the left).
 */
@Component({
  selector: 'tx-sidebar',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './tx-sidebar.component.html',
  styleUrl: './tx-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-collapsed]': 'collapsed()',
    '[class.is-resizing]': 'resizing()',
    '[class.is-edge-end]': 'edge() === "end"',
    '[style.width.px]': 'hostWidth()',
    '[style.min-width.px]': 'hostWidth()',
    // `title` is also a native HTML tooltip attribute — never reflect it on the host.
    '[attr.title]': 'null',
  },
})
export class TxSidebarComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly title = input('Collections');
  /** Optional hint on the title. Use this instead of a native `title` tooltip. */
  readonly hint = input<string | null>(null);
  readonly collapsed = input(false);
  readonly edge = input<TxSidebarEdge>('start');
  readonly width = input(TX_SIDEBAR_DEFAULT_WIDTH, { transform: numberAttribute });
  /** Narrowest open width; dragging past it holds here until release collapses. */
  readonly minWidth = input(TX_SIDEBAR_MIN_WIDTH, { transform: numberAttribute });
  readonly maxWidth = input(TX_SIDEBAR_MAX_WIDTH, { transform: numberAttribute });

  readonly widthChange = output<number>();
  readonly collapse = output<void>();

  readonly resizing = signal(false);

  readonly hostWidth = computed(() => (this.collapsed() ? 0 : this.width()));
  readonly resizeHintPlacement = computed(() => (this.edge() === 'end' ? 'right' : 'left'));

  private dragStartX = 0;
  private dragStartWidth = TX_SIDEBAR_DEFAULT_WIDTH;
  private liveWidth = TX_SIDEBAR_DEFAULT_WIDTH;
  private dragWidth = TX_SIDEBAR_DEFAULT_WIDTH;
  private listenersBound = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.unbindDrag());
  }

  handleBodyContextMenu(event: MouseEvent): void {
    forwardPaddingContextMenu(event);
  }

  handleResizeStart(event: PointerEvent): void {
    if (this.collapsed() || event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.resizing.set(true);
    this.dragStartX = event.clientX;
    this.dragStartWidth = this.width();
    this.liveWidth = this.dragStartWidth;
    this.dragWidth = this.dragStartWidth;
    this.bindDrag();
  }

  handleResizeKey(event: KeyboardEvent): void {
    if (this.collapsed())
      return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      return;
    event.preventDefault();
    const growRight = event.key === 'ArrowRight';
    const delta = this.edge() === 'end'
      ? (growRight ? -16 : 16)
      : (growRight ? 16 : -16);
    this.widthChange.emit(this.clamp(this.width() + delta));
  }

  private clamp(width: number): number {
    return clampSidebarWidth(width, this.minWidth(), this.maxWidth());
  }

  private bindDrag(): void {
    if (this.listenersBound)
      return;
    this.listenersBound = true;
    window.addEventListener('pointermove', this.handleWindowMove);
    window.addEventListener('pointerup', this.handleWindowUp);
    window.addEventListener('pointercancel', this.handleWindowUp);
  }

  private unbindDrag(): void {
    if (!this.listenersBound)
      return;
    this.listenersBound = false;
    window.removeEventListener('pointermove', this.handleWindowMove);
    window.removeEventListener('pointerup', this.handleWindowUp);
    window.removeEventListener('pointercancel', this.handleWindowUp);
  }

  private readonly handleWindowMove = (event: PointerEvent): void => {
    if (!this.resizing())
      return;
    const delta = this.edge() === 'end'
      ? this.dragStartX - event.clientX
      : event.clientX - this.dragStartX;
    this.dragWidth = Math.round(this.dragStartWidth + delta);
    const next = this.clamp(this.dragWidth);
    if (next === this.liveWidth)
      return;
    this.liveWidth = next;
    this.widthChange.emit(this.liveWidth);
  };

  private readonly handleWindowUp = (): void => {
    if (!this.resizing())
      return;
    this.unbindDrag();
    this.resizing.set(false);
    if (this.dragWidth < TX_SIDEBAR_COLLAPSE_WIDTH) {
      this.widthChange.emit(this.clamp(this.dragStartWidth));
      this.collapse.emit();
      return;
    }
    this.widthChange.emit(this.clamp(this.liveWidth));
  };
}
