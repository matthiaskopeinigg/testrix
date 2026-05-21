import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import type { TxCodeEditorCompletionItem } from './tx-code-editor-completion';

/** Maps dynamic-variable catalog rows to code-editor completion items. */
export function dynamicCatalogToCompletionItems(
  items: readonly DynamicVariableCatalogItem[],
): readonly TxCodeEditorCompletionItem[] {
  return items.map((item) => ({
    label: item.label,
    insert: item.insert,
    detail: item.detail,
    caretOffsetFromEnd: item.hasArgs ? 1 : undefined,
  }));
}

/** Merges language snippets with variable catalog; dedupes by insert text. */
export function mergeCodeEditorCompletionCatalogs(
  ...groups: readonly (readonly TxCodeEditorCompletionItem[])[]
): readonly TxCodeEditorCompletionItem[] {
  const seen = new Set<string>();
  const out: TxCodeEditorCompletionItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.insert)) {
        continue;
      }
      seen.add(item.insert);
      out.push(item);
    }
  }
  return out;
}
