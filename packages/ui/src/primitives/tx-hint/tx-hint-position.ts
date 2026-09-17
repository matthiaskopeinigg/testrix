export type TxHintPlacement = 'top' | 'right' | 'bottom' | 'left';

const HINT_GAP = 10;
const HINT_MARGIN = 8;
const HINT_MAX_WIDTH = 220;
const HINT_HEIGHT = 36;

/**
 * Approximate the viewport-fixed bubble size so placement can center on the
 * trigger instead of assuming the CSS max-width.
 */
export function estimateHintSize(text: string, keyCount: number): { width: number; height: number } {
  const paddingX = 20;
  const keysWidth = keyCount > 0 ? keyCount * 26 + Math.max(0, keyCount - 1) * 4 : 0;
  const gap = keyCount > 0 && text ? 8 : 0;
  const textWidth = Math.ceil(Math.min(200, Math.max(text ? 24 : 0, text.length * 7.2)));
  const width = Math.min(HINT_MAX_WIDTH, paddingX + keysWidth + gap + textWidth);
  return { width: Math.max(36, width), height: HINT_HEIGHT };
}

export function placeHint(
  placement: TxHintPlacement,
  rect: DOMRect,
  width: number,
  height: number,
  viewportWidth = typeof window === 'undefined' ? width : window.innerWidth,
  viewportHeight = typeof window === 'undefined' ? height : window.innerHeight,
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

export function clampHint(value: number, min: number, max: number): number {
  if (max < min)
    return min;
  return Math.min(Math.max(value, min), max);
}
