/** How a Listen / Intercept URL pattern is applied to a captured hit. */
export type FlowHttpUrlMatch = 'contains' | 'equals' | 'path' | 'regex';

export interface FlowHttpHitIdentity {
  readonly method: string;
  readonly url: string;
}

export interface FlowHttpMatchFilter {
  /** Empty or `*` = any method. */
  readonly method?: string;
  readonly match?: string;
  /** Pattern; empty = any URL that passes the method filter. */
  readonly url?: string;
}

/**
 * Pathname of an absolute or relative URL (query stripped). Falls back to `/` + raw path.
 */
export function flowHttpUrlPath(url: string): string {
  const trimmed = url.trim();
  if (!trimmed)
    return '/';
  try {
    if (trimmed.includes('://'))
      return new URL(trimmed).pathname || '/';
    const noQuery = trimmed.split('?')[0] ?? trimmed;
    return noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
  } catch {
    const noQuery = trimmed.split('?')[0] ?? trimmed;
    return noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
  }
}

function normalizeMatchMode(mode: string | undefined): FlowHttpUrlMatch {
  if (mode === 'equals' || mode === 'path' || mode === 'regex')
    return mode;
  return 'contains';
}

function methodMatches(actual: string, expected: string | undefined): boolean {
  const needle = (expected ?? '').trim();
  if (!needle || needle === '*')
    return true;
  return actual.trim().toUpperCase() === needle.toUpperCase();
}

function urlMatches(actualUrl: string, pattern: string, mode: FlowHttpUrlMatch): boolean {
  const needle = pattern.trim();
  if (!needle)
    return true;
  if (mode === 'equals')
    return actualUrl === needle;
  if (mode === 'path') {
    const path = flowHttpUrlPath(actualUrl).toLowerCase();
    return path.includes(needle.toLowerCase());
  }
  if (mode === 'regex') {
    try {
      return new RegExp(needle).test(actualUrl);
    } catch {
      return false;
    }
  }
  return actualUrl.toLowerCase().includes(needle.toLowerCase());
}

/**
 * True when a captured HTTP hit satisfies Listen / Intercept method + URL filters.
 */
export function flowHttpHitMatches(hit: FlowHttpHitIdentity, filter: FlowHttpMatchFilter): boolean {
  if (!methodMatches(hit.method, filter.method))
    return false;
  return urlMatches(hit.url, filter.url ?? '', normalizeMatchMode(filter.match));
}
