/**
 * Layout measurement for tree drag-and-drop.
 *
 * Row boxes are cached in tree-content coordinates, so scrolling shifts the pointer instead
 * of invalidating the cache. Re-measure only when rows are added, removed, or resized.
 */

import type { TxTreeRowBox } from './tx-tree-drop-slots';
import {
  TX_TREE_AUTO_SCROLL_EDGE_PX,
  TX_TREE_AUTO_SCROLL_MAX_PX_PER_FRAME,
  TX_TREE_ROW_INLINE_INSET_PX,
} from './tx-tree.types';

/** Pointer position and content metrics for one animation frame. */
export interface TxTreeDragFrame {
  /** Pointer Y relative to the tree content box. */
  readonly pointerYPx: number;
  /** Pointer X relative to the tree content box. */
  readonly pointerXPx: number;
  /** Left edge of depth-0 row content, relative to the tree content box. */
  readonly contentLeftPx: number;
}

/** Vertical extent of the measured rows, in tree-content coordinates. */
export interface TxTreeRowSpan {
  readonly topPx: number;
  readonly bottomPx: number;
}

/**
 * Caches row boxes relative to the tree content element.
 *
 * @param getTreeHost - Returns the `.tx-tree` content element, if mounted.
 */
export class TxTreeDragGeometry {
  private readonly boxes = new Map<string, TxTreeRowBox>();
  private measured = false;

  constructor(
    private readonly getTreeHost: () => HTMLElement | null,
    private readonly getRowElements: () => ReadonlyMap<string, HTMLElement>,
  ) {}

  /** Marks the cache stale; the next read re-measures every row. */
  invalidate(): void {
    this.measured = false;
  }

  reset(): void {
    this.boxes.clear();
    this.measured = false;
  }

  /** Row boxes in tree-content coordinates, measuring once per invalidation. */
  getBoxes(): ReadonlyMap<string, TxTreeRowBox> {
    if (!this.measured) {
      this.measure();
    }
    return this.boxes;
  }

  /**
   * Converts client coordinates into the frame the slot table is built in.
   *
   * The tree content element scrolls with its rows, so only its own rect is re-read here;
   * the cached row boxes stay valid across scrolling.
   */
  toFrame(clientX: number, clientY: number): TxTreeDragFrame {
    const hostRect = this.getTreeHost()?.getBoundingClientRect();

    return {
      pointerXPx: clientX - (hostRect?.left ?? 0),
      pointerYPx: clientY - (hostRect?.top ?? 0),
      contentLeftPx: TX_TREE_ROW_INLINE_INSET_PX,
    };
  }

  private measure(): void {
    const host = this.getTreeHost();
    if (!host) {
      return;
    }

    const hostTop = host.getBoundingClientRect().top;
    this.boxes.clear();

    for (const [nodeId, element] of this.getRowElements()) {
      const rect = element.getBoundingClientRect();
      this.boxes.set(nodeId, {
        topPx: rect.top - hostTop,
        bottomPx: rect.bottom - hostTop,
      });
    }

    this.measured = true;
  }
}

/**
 * Vertical extent covered by the measured rows.
 *
 * @returns `null` when no rows are measured.
 */
export function resolveTxTreeRowSpan(
  boxes: ReadonlyMap<string, TxTreeRowBox>,
): TxTreeRowSpan | null {
  let topPx = Number.POSITIVE_INFINITY;
  let bottomPx = Number.NEGATIVE_INFINITY;

  for (const box of boxes.values()) {
    topPx = Math.min(topPx, box.topPx);
    bottomPx = Math.max(bottomPx, box.bottomPx);
  }

  return topPx <= bottomPx ? { topPx, bottomPx } : null;
}

/**
 * How far from the pointer a drop candidate may sit and still be offered.
 *
 * The reach is the height of the row under the pointer, so a row can only ever claim its
 * own two seams. When every candidate belonging to the hovered row is illegal, the nearest
 * legal one lies further away than this and the drag shows no indicator at all.
 *
 * @param pointerYPx - Pointer Y in tree-content coordinates, clamped to the row span.
 * @returns The reach in pixels, or `null` when no rows are measured.
 */
export function resolveTxTreeDropReachPx(
  boxes: ReadonlyMap<string, TxTreeRowBox>,
  pointerYPx: number,
): number | null {
  let tallestPx = 0;

  for (const box of boxes.values()) {
    const heightPx = box.bottomPx - box.topPx;
    if (pointerYPx >= box.topPx && pointerYPx < box.bottomPx) {
      return heightPx;
    }
    tallestPx = Math.max(tallestPx, heightPx);
  }

  return tallestPx > 0 ? tallestPx : null;
}

/**
 * Nearest scrollable ancestor, used for drag auto-scroll.
 *
 * @param element - Any element inside the tree.
 */
export function findTxTreeScrollParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;

  while (current && current !== document.body) {
    const style = getComputedStyle(current);
    const scrollable = /(auto|scroll|overlay)/.test(`${style.overflowY}`);
    if (scrollable && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

/**
 * Scroll delta for a pointer near the edge of the scroll container.
 *
 * Speed ramps linearly from zero at {@link TX_TREE_AUTO_SCROLL_EDGE_PX} to
 * {@link TX_TREE_AUTO_SCROLL_MAX_PX_PER_FRAME} at the edge itself, so slow approaches nudge
 * and deliberate ones move quickly.
 *
 * @returns Pixels to scroll this frame; negative scrolls up, `0` disengages.
 */
export function resolveTxTreeAutoScrollDelta(
  clientY: number,
  containerRect: { readonly top: number; readonly bottom: number },
  edgePx: number = TX_TREE_AUTO_SCROLL_EDGE_PX,
  maxPxPerFrame: number = TX_TREE_AUTO_SCROLL_MAX_PX_PER_FRAME,
): number {
  const fromTop = clientY - containerRect.top;
  if (fromTop < edgePx) {
    const intensity = clamp01((edgePx - fromTop) / edgePx);
    return -Math.ceil(intensity * maxPxPerFrame);
  }

  const fromBottom = containerRect.bottom - clientY;
  if (fromBottom < edgePx) {
    const intensity = clamp01((edgePx - fromBottom) / edgePx);
    return Math.ceil(intensity * maxPxPerFrame);
  }

  return 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Applies an auto-scroll delta, returning the distance actually scrolled. */
export function applyTxTreeAutoScroll(container: HTMLElement, deltaPx: number): number {
  if (deltaPx === 0) {
    return 0;
  }

  const before = container.scrollTop;
  container.scrollTop = before + deltaPx;
  return container.scrollTop - before;
}
