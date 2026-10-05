export type TxHintPlacement = 'top' | 'right' | 'bottom' | 'left';

export const HINT_GAP = 10;
export const HINT_MARGIN = 8;
/** Matches `.tx-hint-layer__bubble` max-width. */
export const HINT_MAX_WIDTH = 420;
const HINT_MIN_HEIGHT = 36;
const HINT_PAD_X = 20;
const HINT_PAD_Y = 14;
const HINT_LINE = 17;
const CHAR_PX = 7.2;

/**
 * CSS max-width of the bubble: `min(420px, 100vw - 24px)`.
 */
export function hintMaxWidth(
  viewportWidth = typeof window === 'undefined'
    ? HINT_MAX_WIDTH
    : (window.visualViewport?.width ?? window.innerWidth),
): number {
  return Math.min(HINT_MAX_WIDTH, Math.max(36, viewportWidth - HINT_MARGIN * 3));
}

/**
 * Approximate the viewport-fixed bubble size so placement can center on the
 * trigger instead of assuming the CSS max-width.
 */
export function estimateHintSize(
  text: string,
  keyCount: number,
  viewportWidth?: number,
): { width: number; height: number } {
  const maxWidth = hintMaxWidth(viewportWidth);
  const keysWidth = keyCount > 0 ? keyCount * 26 + Math.max(0, keyCount - 1) * 4 : 0;
  const gap = keyCount > 0 && text ? 8 : 0;
  const textWant = Math.ceil(Math.max(text ? 24 : 0, text.length * CHAR_PX));
  const innerMax = Math.max(24, maxWidth - HINT_PAD_X - keysWidth - gap);
  const textWidth = Math.min(textWant, innerMax);
  const lines = Math.max(1, Math.ceil(textWant / innerMax));
  const width = Math.min(maxWidth, HINT_PAD_X + keysWidth + gap + textWidth);
  const height = Math.max(HINT_MIN_HEIGHT, HINT_PAD_Y + lines * HINT_LINE);
  return { width: Math.max(36, width), height };
}

export function placeHint(
  placement: TxHintPlacement,
  rect: DOMRect,
  width: number,
  height: number,
  viewportWidth = typeof window === 'undefined'
    ? width
    : (window.visualViewport?.width ?? window.innerWidth),
  viewportHeight = typeof window === 'undefined'
    ? height
    : (window.visualViewport?.height ?? window.innerHeight),
): { x: number; y: number } {
  const maxX = viewportWidth - width - HINT_MARGIN;
  const maxY = viewportHeight - height - HINT_MARGIN;
  let x = rect.left;
  let y = rect.bottom + HINT_GAP;
  if (placement === 'left') {
    x = rect.left - HINT_GAP - width;
    y = rect.top + rect.height / 2 - height / 2;
  } else if (placement === 'top') {
    x = rect.left + rect.width / 2 - width / 2;
    y = rect.top - HINT_GAP - height;
  } else if (placement === 'bottom') {
    x = rect.left + rect.width / 2 - width / 2;
    y = rect.bottom + HINT_GAP;
  } else {
    x = rect.right + HINT_GAP;
    y = rect.top + rect.height / 2 - height / 2;
  }
  return { x: clampHint(x, HINT_MARGIN, maxX), y: clampHint(y, HINT_MARGIN, maxY) };
}

/** Shifts an already-measured bubble so it stays fully on screen. */
export function fitHintInViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  return {
    x: clampHint(x, HINT_MARGIN, viewportWidth - width - HINT_MARGIN),
    y: clampHint(y, HINT_MARGIN, viewportHeight - height - HINT_MARGIN),
  };
}

export function clampHint(value: number, min: number, max: number): number {
  if (max < min)
    return min;
  return Math.min(Math.max(value, min), max);
}
