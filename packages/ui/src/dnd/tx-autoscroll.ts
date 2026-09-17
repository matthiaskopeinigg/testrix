import type { TxRect } from './tx-dnd.types';

/** Height of the hot band at each edge of a scroll container. */
export const TX_AUTOSCROLL_EDGE = 32;
/** Pixels scrolled per frame when the pointer sits right at the container edge. */
export const TX_AUTOSCROLL_MAX_SPEED = 16;

/**
 * Pixels to scroll this frame for a pointer near a container edge.
 * Ramps from 0 at the inner boundary of the hot band to `maxSpeed` at the edge itself,
 * so a slow approach nudges and a deliberate one flies.
 *
 * @returns Negative to scroll up, positive to scroll down, 0 when outside both bands.
 */
export function computeScrollDelta(
  rect: TxRect,
  pointerY: number,
  edge: number = TX_AUTOSCROLL_EDGE,
  maxSpeed: number = TX_AUTOSCROLL_MAX_SPEED,
): number {
  const bottom = rect.top + rect.height;

  if (pointerY < rect.top + edge) {
    const ratio = Math.min(1, (rect.top + edge - pointerY) / edge);
    return -Math.ceil(ratio * maxSpeed);
  }

  if (pointerY > bottom - edge) {
    const ratio = Math.min(1, (pointerY - (bottom - edge)) / edge);
    return Math.ceil(ratio * maxSpeed);
  }

  return 0;
}

/**
 * Scrolls `container` by `delta`, clamped to its real scroll range.
 *
 * @returns The distance actually scrolled, which is 0 once an end is reached.
 */
export function applyScroll(container: HTMLElement, delta: number): number {
  if (!delta) {
    return 0;
  }
  const before = container.scrollTop;
  container.scrollTop = before + delta;
  return container.scrollTop - before;
}
