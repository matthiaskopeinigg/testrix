/**
 * Prefix-filtered suggestions for plain-text autocomplete lists.
 * An empty query returns the first {@link limit} catalog entries.
 */
export function filterPrefixSuggestions(
  query: string,
  catalog: readonly string[],
  limit = 12,
): readonly string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return catalog.slice(0, limit);
  }
  const lower = trimmed.toLowerCase();
  const matches: string[] = [];
  for (const item of catalog) {
    if (item.toLowerCase().startsWith(lower)) {
      matches.push(item);
      if (matches.length >= limit) {
        break;
      }
    }
  }
  return matches;
}
