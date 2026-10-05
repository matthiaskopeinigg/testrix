export type UrlCodecMode = 'encode' | 'decode';
export type UrlCodecKind = 'component' | 'uri';

export interface QueryPair {
  readonly key: string;
  readonly value: string;
}

export interface UrlCodecResult {
  readonly value: string;
  readonly error: string | null;
}

/**
 * Encode or decode a string with `encodeURIComponent` or `encodeURI`.
 */
export function transformUrl(input: string, mode: UrlCodecMode, kind: UrlCodecKind): UrlCodecResult {
  if (!input)
    return { value: '', error: null };
  try {
    if (mode === 'encode') {
      return { value: kind === 'uri' ? encodeURI(input) : encodeURIComponent(input), error: null };
    }
    return { value: kind === 'uri' ? decodeURI(input) : decodeURIComponent(input), error: null };
  } catch (error) {
    return { value: '', error: error instanceof Error ? error.message : 'Invalid URI encoding' };
  }
}

/**
 * Parse a query string or URL search into key/value pairs.
 */
export function parseQueryPairs(source: string): QueryPair[] {
  const trimmed = source.trim();
  if (!trimmed)
    return [{ key: '', value: '' }];
  try {
    const url = new URL(trimmed);
    return pairsFromSearch(url.searchParams);
  } catch {
    const query = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
    return pairsFromSearch(new URLSearchParams(query));
  }
}

/**
 * Serialize pairs as `application/x-www-form-urlencoded`.
 */
export function formatQueryPairs(pairs: readonly QueryPair[]): string {
  const params = new URLSearchParams();
  for (const pair of pairs) {
    if (!pair.key && !pair.value)
      continue;
    params.append(pair.key, pair.value);
  }
  return params.toString();
}

/**
 * Replace the search string of a URI, or emit a bare query string.
 */
export function applyQueryPairs(source: string, pairs: readonly QueryPair[]): string {
  const query = formatQueryPairs(pairs);
  const trimmed = source.trim();
  if (!trimmed)
    return query;
  try {
    const url = new URL(trimmed);
    url.search = query ? `?${query}` : '';
    return url.toString();
  } catch {
    return query;
  }
}

function pairsFromSearch(params: URLSearchParams): QueryPair[] {
  const pairs: QueryPair[] = [];
  for (const [key, value] of params.entries())
    pairs.push({ key, value });
  if (pairs.length === 0)
    return [{ key: '', value: '' }];
  return pairs;
}
