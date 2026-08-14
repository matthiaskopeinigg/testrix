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

/** Filters completion rows by label / insert prefix. */
export function filterTxCodeEditorCompletions(
  items: readonly TxCodeEditorCompletionItem[],
  needle: string,
): readonly TxCodeEditorCompletionItem[] {
  const q = needle.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter((item) => {
    const label = item.label.toLowerCase();
    const insert = item.insert.toLowerCase();
    return label.includes(q) || insert.includes(q);
  });
}
