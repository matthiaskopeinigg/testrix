import { Injectable, computed, signal, type TemplateRef } from '@angular/core';

import { applyScroll, computeScrollDelta } from './tx-autoscroll';
import { settleTo } from './tx-drop-settle';
import {
  toTxRect,
  type TxDragEndReason,
  type TxDragOrigin,
  type TxDragPreviewContext,
  type TxDragSessionInit,
  type TxPoint,
  type TxRect,
} from './tx-dnd.types';

/** Resting tilt of a lifted preview, in degrees. */
const TILT_BASE = 1.5;
/** Extra degrees of tilt per pixel of horizontal travel in a frame. */
const TILT_PER_PX = 0.5;
/** Ceiling on the velocity component of the tilt. */
const TILT_RANGE = 4;
/** Share of the gap to the target tilt closed each frame. */
const TILT_SMOOTHING = 0.18;

const BODY_DRAGGING_CLASS = 'tx-dnd-dragging';
/** Pointer may graze the sidebar edge this far before the preview is dismissed. */
const SURFACE_SLACK_PX = 8;

/** DOM handles the drag layer hands over so the loop can paint without change detection. */
export interface TxDragLayerHandles {
  /** Outermost element. Owns the pointer-follow transform and nothing else. */
  readonly root: HTMLElement;
  /** Reserved for the release flight, so it never fights the follow transform. */
  readonly settle: HTMLElement;
  /** Owns the velocity tilt. */
  readonly chip: HTMLElement;
}

/**
 * Owns one drag at a time: pointer tracking, the single animation frame loop,
 * edge autoscroll, cancellation, and the floating preview's position.
 *
 * Consumers never poll it. They pass callbacks through {@link beginDrag} and get at
 * most one `onMove` per frame, then exactly one `onEnd`.
 */
@Injectable({ providedIn: 'root' })
export class TxDndService {
  /** Payload of the active drag, for the preview template context. */
  readonly payload = signal<unknown>(null);
  /** Geometry of the row the drag started from. */
  readonly origin = signal<TxDragOrigin | null>(null);
  /** Consumer template rendered inside the floating layer. */
  readonly previewTemplate = signal<TemplateRef<TxDragPreviewContext> | null>(null);
  /** True while the pointer is down and the drag is live. */
  readonly isDragging = signal(false);
  /** True while the layer should be in the DOM, including the cancel flight. */
  readonly layerVisible = signal(false);

  readonly previewContext = computed<TxDragPreviewContext>(() => ({ $implicit: this.payload() }));

  private session: TxDragSessionInit | null = null;
  private layer: TxDragLayerHandles | null = null;

  private frame: number | null = null;
  private pendingPoint: TxPoint | null = null;
  private currentPoint: TxPoint = { x: 0, y: 0 };
  private lastPaintedPoint: TxPoint | null = null;
  private tilt = TILT_BASE;
  private scrollRect: TxRect | null = null;
  private settleToken = 0;
  private unbindGlobal: (() => void) | null = null;
  /** Sidebar (or scroll container) the preview is allowed to travel over. */
  private surface: HTMLElement | null = null;

  /**
   * Starts a drag. The caller has already cleared its movement threshold and taken
   * pointer capture, so this is only reached for a real drag.
   */
  beginDrag<T>(init: TxDragSessionInit<T>): void {
    if (this.session) {
      this.finish('cancel');
    }

    this.settleToken += 1;
    this.session = init as TxDragSessionInit;
    this.currentPoint = init.point;
    this.pendingPoint = init.point;
    this.lastPaintedPoint = null;
    this.tilt = TILT_BASE;
    this.scrollRect = init.scrollContainer
      ? toTxRect(init.scrollContainer.getBoundingClientRect())
      : null;
    this.surface = init.scrollContainer?.closest('tx-sidebar') ?? null;
    this.payload.set(init.payload);
    this.origin.set(init.origin);
    this.previewTemplate.set(init.previewTemplate as TemplateRef<TxDragPreviewContext> | null);
    this.isDragging.set(true);
    this.layerVisible.set(true);

    document.body.classList.add(BODY_DRAGGING_CLASS);
    this.bindGlobal();
    this.startLoop();
  }

  /** Records the latest pointer position. Resolution waits for the next frame. */
  updatePointer(point: TxPoint): void {
    if (!this.session) {
      return;
    }
    this.pendingPoint = point;
  }

  /** Ends the drag and commits it. */
  drop(): void {
    this.finish('drop');
  }

  /** Ends the drag without committing, flying the preview back to its source row. */
  cancel(): void {
    this.finish('cancel');
  }

  /**
   * Hides the floating preview immediately. Use when the source is gone, the
   * sidebar closed, or the pointer left the list — a settle flight would land
   * on empty canvas.
   */
  abort(): void {
    this.settleToken += 1;
    const session = this.session;
    this.session = null;
    this.stopLoop();
    this.unbindGlobal?.();
    this.unbindGlobal = null;
    document.body.classList.remove(BODY_DRAGGING_CLASS);
    this.isDragging.set(false);
    this.layerVisible.set(false);
    if (session) {
      session.onEnd('cancel', null);
    }
    this.reset();
  }

  /** Called by the drag layer once its elements exist. */
  attachLayer(handles: TxDragLayerHandles): void {
    this.layer = handles;
    this.paint();
  }

  /** Called by the drag layer as it unmounts. */
  detachLayer(): void {
    this.layer = null;
  }

  private finish(reason: TxDragEndReason): void {
    const session = this.session;
    if (!session) {
      return;
    }
    this.session = null;

    this.stopLoop();
    this.unbindGlobal?.();
    this.unbindGlobal = null;
    document.body.classList.remove(BODY_DRAGGING_CLASS);
    this.isDragging.set(false);

    const releaseRect = this.layerRect();

    if (reason === 'drop') {
      // Hide first: the consumer hands `releaseRect` to a FLIP, and two copies of the
      // same row on screen for even one frame reads as a glitch.
      this.layerVisible.set(false);
      session.onEnd('drop', releaseRect);
      this.reset();
      return;
    }

    session.onEnd('cancel', releaseRect);

    const target = this.origin()?.rect ?? null;
    const settle = this.layer?.settle ?? null;
    const surfaceGone = !this.surface?.isConnected || (this.surface.offsetWidth ?? 0) < 1;
    if (!settle || !releaseRect || !target || surfaceGone) {
      this.layerVisible.set(false);
      this.reset();
      return;
    }

    const token = (this.settleToken += 1);
    void settleTo(settle, releaseRect, target).then(() => {
      if (this.settleToken !== token) {
        return;
      }
      this.layerVisible.set(false);
      this.reset();
    });
  }

  private reset(): void {
    this.payload.set(null);
    this.origin.set(null);
    this.previewTemplate.set(null);
    this.pendingPoint = null;
    this.lastPaintedPoint = null;
    this.scrollRect = null;
    this.surface = null;
  }

  private startLoop(): void {
    if (this.frame != null) {
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.frame != null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  private readonly tick = (): void => {
    const session = this.session;
    if (!session) {
      this.frame = null;
      return;
    }
    this.frame = requestAnimationFrame(this.tick);

    const next = this.pendingPoint;
    const pointerMoved = next !== null && (next.x !== this.currentPoint.x || next.y !== this.currentPoint.y);
    if (next) {
      this.pendingPoint = null;
      this.currentPoint = next;
    }

    if (this.hasLeftSurface(this.currentPoint)) {
      this.abort();
      return;
    }

    // Autoscroll slides content under a stationary pointer, so it counts as a move.
    const scrolled = this.stepAutoscroll(session.scrollContainer);

    this.paint();

    if (pointerMoved || scrolled !== 0) {
      session.onMove(this.currentPoint);
    }
  };

  private stepAutoscroll(container: HTMLElement | null): number {
    if (!container || !this.scrollRect) {
      return 0;
    }
    const delta = computeScrollDelta(this.scrollRect, this.currentPoint.y);
    return delta === 0 ? 0 : applyScroll(container, delta);
  }

  private paint(): void {
    const layer = this.layer;
    const origin = this.origin();
    if (!layer || !origin) {
      return;
    }

    const x = this.currentPoint.x - origin.offsetX;
    const y = this.currentPoint.y - origin.offsetY;

    const previous = this.lastPaintedPoint;
    const dx = previous ? this.currentPoint.x - previous.x : 0;
    this.lastPaintedPoint = this.currentPoint;

    const targetTilt =
      TILT_BASE + Math.max(-TILT_RANGE, Math.min(TILT_RANGE, dx * TILT_PER_PX));
    this.tilt += (targetTilt - this.tilt) * TILT_SMOOTHING;

    layer.root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    layer.chip.style.transform = `rotate(${this.tilt.toFixed(2)}deg)`;
    layer.root.style.visibility = 'visible';
  }

  private hasLeftSurface(point: TxPoint): boolean {
    const surface = this.surface;
    if (!surface) {
      return false;
    }
    if (!surface.isConnected || surface.offsetWidth < 1) {
      return true;
    }
    const box = surface.getBoundingClientRect();
    return (
      point.x < box.left - SURFACE_SLACK_PX ||
      point.x > box.right + SURFACE_SLACK_PX ||
      point.y < box.top - SURFACE_SLACK_PX ||
      point.y > box.bottom + SURFACE_SLACK_PX
    );
  }

  private layerRect(): TxRect | null {
    const origin = this.origin();
    if (!origin) {
      return null;
    }
    return {
      left: this.currentPoint.x - origin.offsetX,
      top: this.currentPoint.y - origin.offsetY,
      width: origin.rect.width,
      height: origin.rect.height,
    };
  }

  private bindGlobal(): void {
    const handlePointerUp = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      this.drop();
    };
    const handleMouseUp = (event: MouseEvent): void => {
      if (event.button !== 0) {
        return;
      }
      this.drop();
    };
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    };
    const handleContextMenu = (event: Event): void => {
      event.preventDefault();
      this.cancel();
    };
    const handleBlur = (): void => this.cancel();
    const handleResize = (): void => {
      const container = this.session?.scrollContainer;
      this.scrollRect = container ? toTxRect(container.getBoundingClientRect()) : null;
    };

    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('resize', handleResize);

    this.unbindGlobal = () => {
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('keydown', handleKeydown, true);
      window.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('resize', handleResize);
    };
  }
}
