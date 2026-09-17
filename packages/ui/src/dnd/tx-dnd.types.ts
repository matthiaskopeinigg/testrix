import type { TemplateRef } from '@angular/core';

/** Viewport point in CSS pixels. */
export interface TxPoint {
  readonly x: number;
  readonly y: number;
}

/** Minimal rect, kept DOM-free so drop models stay unit-testable. */
export interface TxRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the pointer sat inside the source element when the drag began.
 * Preserving the offset keeps the preview under the same part of the row the user grabbed.
 */
export interface TxDragOrigin {
  readonly rect: TxRect;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Context handed to a consumer-supplied preview template. */
export interface TxDragPreviewContext<T = unknown> {
  readonly $implicit: T;
}

export type TxDragEndReason = 'drop' | 'cancel';

export interface TxDragStartEvent<T = unknown> {
  readonly payload: T;
  readonly origin: TxDragOrigin;
  readonly point: TxPoint;
}

export interface TxDragMoveEvent<T = unknown> {
  readonly payload: T;
  readonly point: TxPoint;
}

export interface TxDragEndEvent<T = unknown> {
  readonly payload: T;
  readonly reason: TxDragEndReason;
  /** Viewport rect of the floating preview at release, for hand-off to a FLIP animation. */
  readonly releaseRect: TxRect | null;
}

/** Everything the session needs to run a drag from first move to release. */
export interface TxDragSessionInit<T = unknown> {
  readonly payload: T;
  readonly origin: TxDragOrigin;
  readonly point: TxPoint;
  readonly previewTemplate: TemplateRef<TxDragPreviewContext<T>> | null;
  readonly scrollContainer: HTMLElement | null;
  /** Runs at most once per animation frame, and only when something actually moved. */
  readonly onMove: (point: TxPoint) => void;
  /** Runs exactly once, on drop or cancel. */
  readonly onEnd: (reason: TxDragEndReason, releaseRect: TxRect | null) => void;
}

/** Converts a live DOM rect into the plain shape used across the engine. */
export function toTxRect(rect: DOMRect): TxRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}
