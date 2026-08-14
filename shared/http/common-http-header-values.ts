import { HTTP_COMPLETION_SUGGESTION_LIMIT } from './http-completion-limits';

/** Common example values keyed by lowercase HTTP header name. */
export const COMMON_HTTP_HEADER_VALUES: Readonly<Record<string, readonly string[]>> = {
  accept: ['*/*', 'application/json', 'application/xml', 'text/html', 'text/plain'],
  'accept-encoding': ['gzip, deflate, br', 'gzip', 'deflate', 'br', 'identity'],
  'accept-language': ['en-US,en;q=0.9', 'en-US', '*'],
  'access-control-request-headers': ['content-type', 'authorization'],
  'access-control-request-method': ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  authorization: ['Bearer ', 'Basic ', 'Digest '],
  'cache-control': [
    'no-cache',
    'no-store',
    'max-age=0',
    'max-age=3600',
    'private',
    'public',
    'must-revalidate',
  ],
  connection: ['keep-alive', 'close'],
  'content-disposition': ['attachment', 'inline'],
  'content-encoding': ['gzip', 'deflate', 'br', 'identity'],
  'content-language': ['en-US'],
  'content-type': [
    'application/json',
    'application/xml',
    'application/pdf',
    'text/plain',
    'text/html',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
  ],
  cookie: ['session='],
  dnt: ['1', '0'],
  expect: ['100-continue'],
  host: ['localhost:3000', 'api.example.com'],
  'if-none-match': ['*', 'W/"etag"'],
  origin: ['https://example.com', 'http://localhost:3000'],
  pragma: ['no-cache'],
  referer: ['https://example.com/', 'http://localhost:3000/'],
  'sec-fetch-dest': ['empty', 'document'],
  'sec-fetch-mode': ['cors', 'navigate', 'same-origin'],
  'sec-fetch-site': ['same-origin', 'cross-site', 'none'],
  'set-cookie': ['session=; Path=/; HttpOnly'],
  'strict-transport-security': ['max-age=31536000; includeSubDomains'],
  te: ['trailers'],
  'transfer-encoding': ['chunked'],
  upgrade: ['websocket'],
  'upgrade-insecure-requests': ['1'],
  'user-agent': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'PostmanRuntime/7.36.0',
  ],
  'www-authenticate': ['Bearer realm="api"', 'Basic realm="api"'],
  'x-api-key': [''],
  'x-correlation-id': [''],
  'x-forwarded-for': ['127.0.0.1'],
  'x-forwarded-host': ['api.example.com'],
  'x-forwarded-proto': ['https', 'http'],
  'x-real-ip': ['127.0.0.1'],
  'x-request-id': [''],
  'x-requested-with': ['XMLHttpRequest'],
};

/**
 * Returns suggested values for a header key (case-insensitive).
 * Empty when the key is unknown or blank.
 */
export function getHttpHeaderValueSuggestions(headerKey: string): readonly string[] {
  const key = headerKey.trim().toLowerCase();
  if (!key) {
    return [];
  }
  return COMMON_HTTP_HEADER_VALUES[key] ?? [];
}

/**
 * Prefix-filtered header value suggestions for autocomplete.
 */
export function filterHttpHeaderValueSuggestions(
  headerKey: string,
  valuePrefix: string,
  options?: { readonly limit?: number },
): readonly string[] {
  const limit = options?.limit ?? HTTP_COMPLETION_SUGGESTION_LIMIT;
  const catalog = getHttpHeaderValueSuggestions(headerKey);
  const trimmed = valuePrefix.trim();
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
