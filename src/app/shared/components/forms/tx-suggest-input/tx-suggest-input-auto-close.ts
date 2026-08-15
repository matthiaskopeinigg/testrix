export interface SuggestInputAutoCloseResult {
  readonly value: string;
  readonly caret: number;
}

const OPEN_TO_CLOSE: Readonly<Record<string, string>> = {
  "'": "'",
  '"': '"',
  '(': ')',
};

/**
 * Inserts a matching closer (`'` → `''` with the caret between) or skips an existing closer.
 */
export function resolveSuggestInputAutoClose(
  key: string,
  value: string,
  caretStart: number,
  caretEnd: number,
): SuggestInputAutoCloseResult | null {
  const start = Math.max(0, Math.min(caretStart, value.length));
  const end = Math.max(start, Math.min(caretEnd, value.length));
  const close = OPEN_TO_CLOSE[key];
  if (close && start !== end) {
    const selected = value.slice(start, end);
    return {
      value: `${value.slice(0, start)}${key}${selected}${close}${value.slice(end)}`,
      caret: start + key.length + selected.length,
    };
  }
  if (start !== end) {
    return null;
  }
  if (value.charAt(start) === key && isCloser(key)) {
    return { value, caret: start + 1 };
  }
  if (!close) {
    return null;
  }
  return {
    value: `${value.slice(0, start)}${key}${close}${value.slice(start)}`,
    caret: start + key.length,
  };
}

/**
 * Removes an empty auto-inserted pair when Backspace is pressed between the delimiters.
 */
export function resolveSuggestInputAutoCloseBackspace(
  value: string,
  caret: number,
): SuggestInputAutoCloseResult | null {
  if (caret < 1 || caret > value.length) {
    return null;
  }
  const open = value.charAt(caret - 1);
  const close = OPEN_TO_CLOSE[open];
  if (!close || value.charAt(caret) !== close) {
    return null;
  }
  return {
    value: `${value.slice(0, caret - 1)}${value.slice(caret + close.length)}`,
    caret: caret - 1,
  };
}

function isCloser(key: string): boolean {
  return key === "'" || key === '"' || key === ')';
}
