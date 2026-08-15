import type { TxCodeEditorCompletionItem } from './tx-code-editor-completion';

export interface TxCodeEditorCompletionContext {
  readonly replaceStart: number;
  readonly replaceEnd: number;
  readonly needle: string;
}

/**
 * Derives the replace range and filter needle for autocomplete at the caret.
 */
export function txCodeEditorCompletionContext(
  value: string,
  caret: number,
): TxCodeEditorCompletionContext {
  const before = value.slice(0, caret);
  const match = before.match(/(?:^|[^\w$])([\w$.]*)$/);
  const token = match?.[1] ?? '';
  const start = caret - token.length;
  return {
    replaceStart: start,
    replaceEnd: caret,
    needle: token.toLowerCase(),
  };
}

/** Filters completion rows by label / insert prefix (prefix matches first). */
export function filterTxCodeEditorCompletions(
  items: readonly TxCodeEditorCompletionItem[],
  needle: string,
): readonly TxCodeEditorCompletionItem[] {
  const q = needle.trim().toLowerCase();
  if (!q) {
    return items;
  }
  const prefix: TxCodeEditorCompletionItem[] = [];
  const substring: TxCodeEditorCompletionItem[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    const insert = item.insert.toLowerCase();
    if (label.startsWith(q) || insert.startsWith(q)) {
      prefix.push(item);
      continue;
    }
    if (label.includes(q) || insert.includes(q)) {
      substring.push(item);
    }
  }
  return [...prefix, ...substring];
}

/**
 * Gray remainder for inline ghost text when {@link insert} continues the typed token.
 *
 * @param token Text already typed (may include `schema.`).
 * @param insert Full completion insert text.
 */
export function txCodeEditorInlineGhostSuffix(token: string, insert: string): string {
  if (!insert) {
    return '';
  }
  if (!token) {
    return insert;
  }
  if (insert.toLowerCase().startsWith(token.toLowerCase())) {
    return insert.slice(token.length);
  }
  const dot = token.lastIndexOf('.');
  if (dot >= 0) {
    const qualifier = token.slice(0, dot + 1);
    const partial = token.slice(dot + 1);
    if (
      insert.toLowerCase().startsWith(qualifier.toLowerCase()) &&
      insert.slice(qualifier.length).toLowerCase().startsWith(partial.toLowerCase())
    ) {
      return insert.slice(token.length);
    }
  }
  return '';
}
