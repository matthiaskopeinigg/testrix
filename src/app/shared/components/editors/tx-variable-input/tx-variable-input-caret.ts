/**
 * Maps a horizontal click position to a caret index in a single-line text control.
 */
export function caretIndexFromClientX(
  input: HTMLInputElement,
  clientX: number,
): number {
  const text = input.value;
  if (!text) {
    return 0;
  }

  const context = createInputMeasureContext(input);
  if (!context) {
    return text.length;
  }

  const style = getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const targetX = clientX - rect.left - paddingLeft + input.scrollLeft;

  let caret = 0;
  for (let index = 1; index <= text.length; index += 1) {
    const width = context.measureText(text.slice(0, index)).width;
    if (width <= targetX + 0.5) {
      caret = index;
    } else {
      break;
    }
  }

  return caret;
}

/**
 * Adjusts horizontal scroll so the caret/selection stays inside the padded viewport.
 * Used by mirror-overlay inputs where native scroll-to-caret can sit flush on the border.
 */
export function ensureInputCaretVisible(input: HTMLInputElement, marginPx = 12): void {
  const text = input.value;
  if (!text.length) {
    input.scrollLeft = 0;
    return;
  }

  const context = createInputMeasureContext(input);
  if (!context) {
    return;
  }

  const style = getComputedStyle(input);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const innerWidth = Math.max(0, input.clientWidth - paddingLeft - paddingRight);
  if (innerWidth <= 0) {
    return;
  }

  const selectionStart = input.selectionStart ?? 0;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  const selStartX = context.measureText(text.slice(0, selectionStart)).width;
  const selEndX = context.measureText(text.slice(0, selectionEnd)).width;

  let scrollLeft = input.scrollLeft;
  const visibleRight = scrollLeft + innerWidth - marginPx;
  if (selEndX > visibleRight) {
    scrollLeft = Math.max(0, selEndX - innerWidth + marginPx);
  }

  const visibleLeft = scrollLeft + marginPx;
  if (selStartX < visibleLeft) {
    scrollLeft = Math.max(0, selStartX - marginPx);
  }

  if (scrollLeft !== input.scrollLeft) {
    input.scrollLeft = scrollLeft;
  }
}

function createInputMeasureContext(input: HTMLInputElement): CanvasRenderingContext2D | null {
  const style = getComputedStyle(input);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.font = [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.lineHeight === 'normal' ? '' : `/ ${style.lineHeight}`,
    style.fontFamily,
  ]
    .filter(Boolean)
    .join(' ');

  return context;
}
