export type KeyValueSuggestKeyInput = 'text' | 'http-headers' | 'query-params';

/**
 * Resolves key-column autocomplete mode from explicit {@link explicit} input or
 * {@link labels} heuristics (`addLabel` / `keyLabel`).
 */
export function resolveKeyValueSuggestKeyInput(
  explicit: KeyValueSuggestKeyInput,
  labels: { readonly keyLabel: string; readonly addLabel: string },
): KeyValueSuggestKeyInput {
  if (explicit !== 'text') {
    return explicit;
  }
  const add = labels.addLabel.trim().toLowerCase();
  const key = labels.keyLabel.trim().toLowerCase();
  if (add.includes('header') || key === 'header') {
    return 'http-headers';
  }
  if (
    add.includes('query param') ||
    add.includes('query-param') ||
    (add.includes('param') && !add.includes('header'))
  ) {
    return 'query-params';
  }
  return 'text';
}
