/**
 * Viewport coordinates just below the caret, used to anchor execute choosers.
 */
export function textareaCaretViewportPosition(
  textarea: HTMLTextAreaElement,
): { readonly x: number; readonly y: number } {
  const style = getComputedStyle(textarea);
  const rect = textarea.getBoundingClientRect();
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const fontSize = Number.parseFloat(style.fontSize) || 13;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.4;
  const caret = textarea.selectionStart;
  const before = textarea.value.slice(0, caret);
  const lineIndex = before.split('\n').length - 1;
  const col = before.length - (before.lastIndexOf('\n') + 1);
  const x = rect.left + paddingLeft + col * fontSize * 0.62 - textarea.scrollLeft;
  const y = rect.top + paddingTop + (lineIndex + 1) * lineHeight - textarea.scrollTop;
  return {
    x: Math.min(Math.max(x, rect.left + 8), rect.right - 8),
    y: Math.min(Math.max(y, rect.top + 8), rect.bottom - 8),
  };
}

/** Inclusive 0-based line indexes covered by one or more character ranges. */
export function lineIndexesForCharacterRanges(
  value: string,
  ranges: readonly { readonly start: number; readonly end: number }[],
): readonly number[] {
  const lines = new Set<number>();
  for (const range of ranges) {
    for (const line of lineIndexesForCharacterRange(value, range.start, range.end)) {
      lines.add(line);
    }
  }
  return [...lines].sort((a, b) => a - b);
}
export function lineIndexesForCharacterRange(
  value: string,
  start: number,
  end: number,
): readonly number[] {
  const from = Math.max(0, Math.min(start, value.length));
  let to = Math.max(from, Math.min(end, value.length));
  if (to <= from) {
    return [];
  }
  if (value[to - 1] === '\n') {
    to -= 1;
  }
  const startLine = lineIndexAtOffset(value, from);
  const endLine = lineIndexAtOffset(value, to);
  const lines: number[] = [];
  for (let i = startLine; i <= endLine; i++) {
    lines.push(i);
  }
  return lines;
}

function lineIndexAtOffset(value: string, offset: number): number {
  if (offset <= 0) {
    return 0;
  }
  let line = 0;
  const limit = Math.min(offset, value.length);
  for (let i = 0; i < limit; i++) {
    if (value.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}
