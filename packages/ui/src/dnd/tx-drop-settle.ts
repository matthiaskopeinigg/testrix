import type { TxRect } from './tx-dnd.types';

const SETTLE_EASE = 'cubic-bezier(0.22, 1.2, 0.36, 1)';

/** Duration of the return flight when a drag is cancelled. */
export const TX_SETTLE_CANCEL_MS = 180;

function readCssNumber(name: string, fallback: number): number {
  if (typeof document === 'undefined')
    return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Reads `--tx-motion-scale`, the switch for open and in-app motion speed.
 */
export function readMotionScale(): number {
  return readCssNumber('--tx-motion-scale', 1);
}

/**
 * Reads `--tx-motion-leave-scale`, the switch for close and dismiss motion speed.
 */
export function readLeaveMotionScale(): number {
  return readCssNumber('--tx-motion-leave-scale', 1);
}

/**
 * Flies `el` from where it currently sits to `to`, fading out as it lands.
 *
 * The element must carry no transform of its own: the engine reserves one nesting
 * level per transform source so a settle can never fight the pointer-follow transform.
 *
 * @returns Resolves once the flight finishes, immediately when motion is disabled.
 */
export function settleTo(el: HTMLElement, from: TxRect, to: TxRect): Promise<void> {
  const scale = readMotionScale();
  if (scale === 0 || typeof el.animate !== 'function') {
    return Promise.resolve();
  }

  const dx = to.left - from.left;
  const dy = to.top - from.top;

  const animation = el.animate(
    [
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.96)`, opacity: 0 },
    ],
    {
      duration: Math.round(TX_SETTLE_CANCEL_MS * scale),
      easing: SETTLE_EASE,
      fill: 'both',
    },
  );

  const timeoutMs = Math.round(TX_SETTLE_CANCEL_MS * scale) + 80;
  return Promise.race([
    animation.finished.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    }),
  ]);
}
