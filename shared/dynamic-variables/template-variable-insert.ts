export interface TemplateVariableInsertOptions {
  /** When true, wraps `$` / `{{}}` tokens in JSON string quotes when inserted as a value. */
  readonly json?: boolean;
}

export interface NormalizedTemplateVariableInsert {
  readonly insert: string;
  readonly replaceStart: number;
  readonly replaceEnd: number;
  readonly caretOffsetFromEnd: number;
}

/**
 * Normalizes catalog insert text for editor completion (dedupe `{{`, JSON quoting).
 */
export function normalizeTemplateVariableInsert(
  value: string,
  replaceStart: number,
  replaceEnd: number,
  insert: string,
  options: TemplateVariableInsertOptions = {},
): NormalizedTemplateVariableInsert {
  let start = replaceStart;
  let end = replaceEnd;
  let text = insert;
  let caretOffsetFromEnd = 0;

  const brace = normalizeBraceTemplateInsert(value, start, end, text);
  start = brace.replaceStart;
  end = brace.replaceEnd;
  text = brace.insert;

  if (options.json && text && shouldWrapTemplateInsertInJsonString(value, start, end)) {
    if (!text.startsWith('"')) {
      text = `"${text}"`;
      caretOffsetFromEnd = 1;
    }
  }

  return {
    insert: text,
    replaceStart: start,
    replaceEnd: end,
    caretOffsetFromEnd,
  };
}

/** Extends brace completion range to consume an empty `}}` stub left by smart backspace pairs. */
export function adjustBraceTemplateReplaceEnd(
  value: string,
  openIndex: number,
  caret: number,
  segment: string,
): number {
  if (segment.length > 0) {
    return caret;
  }
  if (value.slice(openIndex, openIndex + 2) !== '{{') {
    return caret;
  }
  if (value.slice(caret, caret + 2) === '}}') {
    return caret + 2;
  }
  return caret;
}

function normalizeBraceTemplateInsert(
  value: string,
  replaceStart: number,
  replaceEnd: number,
  insert: string,
): { readonly insert: string; readonly replaceStart: number; readonly replaceEnd: number } {
  if (!insert.startsWith('{{') || !insert.endsWith('}}')) {
    return { insert, replaceStart, replaceEnd };
  }

  const slice = value.slice(replaceStart, replaceEnd);
  if (slice.startsWith('{{') && slice.endsWith('}}')) {
    return { insert, replaceStart, replaceEnd };
  }

  return { insert, replaceStart, replaceEnd };
}

/**
 * True when the caret is in a JSON value position that still needs an opening quote.
 */
export function shouldWrapTemplateInsertInJsonString(
  value: string,
  replaceStart: number,
  _replaceEnd: number,
): boolean {
  if (isInsideJsonString(value, replaceStart)) {
    return false;
  }

  let i = replaceStart - 1;
  while (i >= 0 && /\s/.test(value[i]!)) {
    i--;
  }
  if (i < 0) {
    return false;
  }

  const ch = value[i]!;
  return ch === ':' || ch === ',' || ch === '[' || ch === '{';
}

function isInsideJsonString(value: string, index: number): boolean {
  let i = 0;
  while (i < index) {
    if (value[i] === '"') {
      const end = skipJsonString(value, i);
      if (index > i && index < end) {
        return true;
      }
      i = end;
      continue;
    }
    i++;
  }
  return false;
}

function skipJsonString(value: string, start: number): number {
  let i = start + 1;
  while (i < value.length) {
    if (value[i] === '\\') {
      i += 2;
      continue;
    }
    if (value[i] === '"') {
      return i + 1;
    }
    i++;
  }
  return value.length;
}
