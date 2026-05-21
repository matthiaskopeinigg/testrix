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

  const style = getComputedStyle(input);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return text.length;
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
