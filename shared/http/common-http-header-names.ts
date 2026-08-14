import { HTTP_COMPLETION_SUGGESTION_LIMIT } from './http-completion-limits';

/** Canonical names for common HTTP request/response headers (Postman-style picker). */
export const COMMON_HTTP_HEADER_NAMES = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Origin',
  'Access-Control-Expose-Headers',
  'Access-Control-Max-Age',
  'Access-Control-Request-Headers',
  'Access-Control-Request-Method',
  'Age',
  'Allow',
  'Alt-Svc',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Disposition',
  'Content-Encoding',
  'Content-Language',
  'Content-Length',
  'Content-Location',
  'Content-MD5',
  'Content-Range',
  'Content-Type',
  'Cookie',
  'Date',
  'DNT',
  'ETag',
  'Expect',
  'Expires',
  'Forwarded',
  'From',
  'Host',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'If-Unmodified-Since',
  'Last-Modified',
  'Link',
  'Location',
  'Max-Forwards',
  'Origin',
  'Pragma',
  'Proxy-Authenticate',
  'Proxy-Authorization',
  'Range',
  'Referer',
  'Retry-After',
  'Sec-Fetch-Dest',
  'Sec-Fetch-Mode',
  'Sec-Fetch-Site',
  'Server',
  'Set-Cookie',
  'Strict-Transport-Security',
  'TE',
  'Trailer',
  'Transfer-Encoding',
  'Upgrade',
  'Upgrade-Insecure-Requests',
  'User-Agent',
  'Via',
  'Warning',
  'WWW-Authenticate',
  'X-Api-Key',
  'X-Correlation-Id',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Real-IP',
  'X-Request-Id',
  'X-Requested-With',
] as const;

export type CommonHttpHeaderName = (typeof COMMON_HTTP_HEADER_NAMES)[number];

/**
 * Prefix-matched header name suggestions for autocomplete (case-insensitive).
 * An empty query returns the first {@link limit} catalog entries.
 */
export function filterHttpHeaderNameSuggestions(
  query: string,
  options?: { readonly limit?: number },
): readonly CommonHttpHeaderName[] {
  const limit = options?.limit ?? HTTP_COMPLETION_SUGGESTION_LIMIT;
  const trimmed = query.trim();
  if (!trimmed) {
    return COMMON_HTTP_HEADER_NAMES.slice(0, limit);
  }
  const lower = trimmed.toLowerCase();
  const matches: CommonHttpHeaderName[] = [];
  for (const name of COMMON_HTTP_HEADER_NAMES) {
    if (name.toLowerCase().startsWith(lower)) {
      matches.push(name);
      if (matches.length >= limit) {
        break;
      }
    }
  }
  return matches;
}
