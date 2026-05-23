import { HTTP_COMPLETION_SUGGESTION_LIMIT } from './http-completion-limits';

/** Common HTTP query parameter names for autocomplete. */
export const COMMON_HTTP_QUERY_PARAM_NAMES = [
  'access_token',
  'api_key',
  'client_id',
  'client_secret',
  'cursor',
  'direction',
  'expand',
  'fields',
  'filter',
  'format',
  'id',
  'include',
  'key',
  'lang',
  'limit',
  'locale',
  'offset',
  'order',
  'page',
  'pageSize',
  'per_page',
  'q',
  'query',
  'search',
  'sort',
  'token',
  'version',
] as const;

export type CommonHttpQueryParamName = (typeof COMMON_HTTP_QUERY_PARAM_NAMES)[number];

/**
 * Prefix-matched query param name suggestions (case-insensitive).
 * An empty query returns the first {@link limit} catalog entries.
 */
export function filterHttpQueryParamNameSuggestions(
  query: string,
  options?: { readonly limit?: number },
): readonly CommonHttpQueryParamName[] {
  const limit = options?.limit ?? HTTP_COMPLETION_SUGGESTION_LIMIT;
  const trimmed = query.trim();
  if (!trimmed) {
    return COMMON_HTTP_QUERY_PARAM_NAMES.slice(0, limit);
  }
  const lower = trimmed.toLowerCase();
  const matches: CommonHttpQueryParamName[] = [];
  for (const name of COMMON_HTTP_QUERY_PARAM_NAMES) {
    if (name.toLowerCase().startsWith(lower)) {
      matches.push(name);
      if (matches.length >= limit) {
        break;
      }
    }
  }
  return matches;
}
