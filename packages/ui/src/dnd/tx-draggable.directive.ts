import { DestroyRef, Directive, ElementRef, inject, input, output, signal, type TemplateRef } from '@angular/core';

import { TxDndService } from './tx-dnd.service';
import {
  toTxRect,
  type TxDragEndEvent,
  type TxDragEndReason,
  type TxDragMoveEvent,
  type TxDragPreviewContext,
  type TxDragStartEvent,
  type TxPoint,
  type TxRect,
} from './tx-dnd.types';

/** Travel required before a press turns into a drag. */
export const TX_DRAG_THRESHOLD_PX = 4;

interface PendingPress {
  readonly pointerId: number;
  readonly start: TxPoint;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rect: TxRect;
}

/**
 * Makes the host element draggable through {@link TxDndService}.
 *
 * Takes pointer capture once the press clears {@link TX_DRAG_THRESHOLD_PX}, so a fast
 * drag or one that leaves the window still reaches this element. Swallows the click
 * the browser fires after a drag, which frees rows from having to guess.
 */
@Directive({
  selector: '[txDraggable]',
  standalone: true,
  host: {
    '(pointerdown)': 'handlePointerDown($event)',
    '(pointermove)': 'handlePointerMove($event)',
    '(pointerup)': 'handlePointerUp($event)',
    '(pointercancel)': 'handlePointerCancel($event)',
    '(lostpointercapture)': 'handleLostPointerCapture($event)',
    '[class.tx-dragging]': 'dragging()',
    '[attr.draggable]': 'false',
    '[style.touch-action]': "'none'",
  },
})
export class TxDraggableDirective<T = unknown> {
  readonly payload = input.required<T>({ alias: 'txDraggable' });
  readonly disabled = input(false, { alias: 'txDraggableDisabled' });
  readonly preview = input<TemplateRef<TxDragPreviewContext<T>> | null>(null, {
    alias: 'txDraggablePreview',
  });
  readonly scrollContainer = input<HTMLElement | null>(null, {
    alias: 'txDraggableScrollContainer',
  });

  readonly dragStarted = output<TxDragStartEvent<T>>();
  readonly dragMoved = output<TxDragMoveEvent<T>>();
  readonly dragEnded = output<TxDragEndEvent<T>>();

  /** True while this element is the drag source. Drives the dimmed source styling. */
  readonly dragging = signal(false);

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly dnd = inject(TxDndService);

  private pending: PendingPress | null = null;
  private suppressClick = false;
  private detachFallback: (() => void) | null = null;

  constructor() {
    const swallowClick = (event: MouseEvent): void => {
      if (!this.suppressClick) {
        return;
      }
      this.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    this.host.addEventListener('click', swallowClick, true);
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('click', swallowClick, true);
      this.detachFallback?.();
      if (this.dragging()) {
        this.dnd.abort();
      }
    });
  }

  handlePointerDown(event: PointerEvent): void {
    if (this.dragging()) {
      // A second pointer, or a right-click mid-drag, abandons the gesture.
      this.dnd.cancel();
      return;
    }
    // A drag that produced no click must not poison the next real one.
    this.suppressClick = false;

    if (this.disabled() || event.button !== 0 || !event.isPrimary) {
      return;
    }

    const origin = event.target;
    if (
      origin instanceof Element &&
      origin.closest('input, textarea, select, button, a, [contenteditable="true"]')
    ) {
      return;
    }

    const rect = this.host.getBoundingClientRect();
    this.pending = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      rect: toTxRect(rect),
    };
  }

  handlePointerMove(event: PointerEvent): void {
    const pending = this.pending;
    if (!pending || event.pointerId !== pending.pointerId) {
      return;
    }

    const point: TxPoint = { x: event.clientX, y: event.clientY };

    if (!this.dragging()) {
      const travel = Math.hypot(point.x - pending.start.x, point.y - pending.start.y);
      if (travel < TX_DRAG_THRESHOLD_PX) {
        return;
      }
      this.startDrag(pending, point);
    }

    event.preventDefault();
    this.dnd.updatePointer(point);
  }

  handlePointerUp(event: PointerEvent): void {
    if (!this.pending || event.pointerId !== this.pending.pointerId) {
      return;
    }
    this.pending = null;
    if (this.dragging()) {
      this.dnd.drop();
    }
  }

  handlePointerCancel(event: PointerEvent): void {
    if (!this.pending || event.pointerId !== this.pending.pointerId) {
      return;
    }
    this.pending = null;
    if (this.dragging()) {
      this.dnd.cancel();
    }
  }

  /**
   * Capture is released on mouseup. Source rows often cannot see `pointerup`, so treat a
   * zero-button capture loss as a drop. A live pointer (buttons still down) is ignored —
   * window `pointerup` commits the gesture.
   */
  handleLostPointerCapture(event: PointerEvent): void {
    if (!this.pending || event.pointerId !== this.pending.pointerId || !this.dragging()) {
      return;
    }
    if (event.buttons !== 0) {
      return;
    }
    this.pending = null;
    this.dnd.drop();
  }

  private startDrag(pending: PendingPress, point: TxPoint): void {
    const payload = this.payload();
    const origin = {
      rect: pending.rect,
      offsetX: pending.offsetX,
      offsetY: pending.offsetY,
    };

    // Capture throws when the pointer is not active, which must not abort the drag.
    try {
      this.host.setPointerCapture(pending.pointerId);
    } catch {
      // Document listeners below still drive the gesture.
    }

    this.detachFallback?.();
    this.listenOnDocument();

    this.dragging.set(true);

    this.dnd.beginDrag<T>({
      payload,
      origin,
      point,
      previewTemplate: this.preview(),
      scrollContainer: this.scrollContainer(),
      onMove: (next) => this.dragMoved.emit({ payload, point: next }),
      onEnd: (reason, releaseRect) => this.handleEnd(pending.pointerId, payload, reason, releaseRect),
    });

    this.dragStarted.emit({ payload, origin, point });
  }

  /** Keeps the drag alive when pointer capture is unavailable. */
  private listenOnDocument(): void {
    const onMove = (event: PointerEvent): void => this.handlePointerMove(event);
    const onUp = (event: PointerEvent): void => this.handlePointerUp(event);
    const onCancel = (event: PointerEvent): void => this.handlePointerCancel(event);

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);

    this.detachFallback = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onCancel, true);
      this.detachFallback = null;
    };
  }

  private handleEnd(
    pointerId: number,
    payload: T,
    reason: TxDragEndReason,
    releaseRect: TxRect | null,
  ): void {
    this.dragging.set(false);
    this.pending = null;
    this.suppressClick = true;
    this.detachFallback?.();
    try {
      if (this.host.hasPointerCapture(pointerId)) {
        this.host.releasePointerCapture(pointerId);
      }
    } catch {
      // Already released by the browser.
    }
    this.dragEnded.emit({ payload, reason, releaseRect });
  }
}
