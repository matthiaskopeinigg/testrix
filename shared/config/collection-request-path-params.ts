import type { CollectionRequestPathParam } from './collection-request-settings.schema';
import { createCollectionRequestPathParam } from './collection-request-settings.schema';

const PATH_PARAM_PATTERN = /:([A-Za-z0-9_]+)/g;

/** Extracts `:param` keys from a URL template in path order. */
export function parsePathParamKeysFromUrl(url: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of url.matchAll(PATH_PARAM_PATTERN)) {
    const key = match[1];
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Syncs path param rows with URL template keys: keeps values for existing keys, adds new rows.
 */
export function syncPathParamsWithUrl(
  url: string,
  existing: readonly CollectionRequestPathParam[],
): CollectionRequestPathParam[] {
  const keys = parsePathParamKeysFromUrl(url);
  const byKey = new Map(existing.map((row) => [row.key, row]));
  return keys.map((key) => {
    const prior = byKey.get(key);
    if (prior) {
      return prior;
    }
    return createCollectionRequestPathParam({ key, value: '' });
  });
}
