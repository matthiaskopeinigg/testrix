import type { PlaceholderSuggestion } from './placeholder-complete';

interface HeaderName {
  readonly name: string;
  readonly detail: string;
}

interface HeaderValue {
  readonly value: string;
  readonly detail: string;
}

const COMMON_HEADER_NAMES: readonly HeaderName[] = [
  { name: 'Accept', detail: 'Response media types' },
  { name: 'Accept-Encoding', detail: 'Compression' },
  { name: 'Accept-Language', detail: 'Preferred languages' },
  { name: 'Authorization', detail: 'Credentials' },
  { name: 'Cache-Control', detail: 'Caching' },
  { name: 'Connection', detail: 'Connection options' },
  { name: 'Content-Encoding', detail: 'Body compression' },
  { name: 'Content-Length', detail: 'Body size' },
  { name: 'Content-Type', detail: 'Body media type' },
  { name: 'Cookie', detail: 'Stored cookies' },
  { name: 'Expect', detail: 'Required server behavior' },
  { name: 'Forwarded', detail: 'Proxy forwarding' },
  { name: 'From', detail: 'Controller email' },
  { name: 'Host', detail: 'Target host' },
  { name: 'If-Match', detail: 'Conditional ETag' },
  { name: 'If-Modified-Since', detail: 'Conditional date' },
  { name: 'If-None-Match', detail: 'Conditional ETag' },
  { name: 'If-Range', detail: 'Partial range' },
  { name: 'If-Unmodified-Since', detail: 'Conditional date' },
  { name: 'Origin', detail: 'CORS origin' },
  { name: 'Pragma', detail: 'Legacy cache' },
  { name: 'Proxy-Authorization', detail: 'Proxy credentials' },
  { name: 'Range', detail: 'Byte range' },
  { name: 'Referer', detail: 'Previous URL' },
  { name: 'TE', detail: 'Transfer encodings' },
  { name: 'Transfer-Encoding', detail: 'Framing' },
  { name: 'Upgrade', detail: 'Protocol switch' },
  { name: 'User-Agent', detail: 'Client identity' },
  { name: 'Via', detail: 'Proxies' },
  { name: 'X-Api-Key', detail: 'API key' },
  { name: 'X-Correlation-Id', detail: 'Trace id' },
  { name: 'X-CSRF-Token', detail: 'CSRF token' },
  { name: 'X-Forwarded-For', detail: 'Client IP' },
  { name: 'X-Forwarded-Host', detail: 'Original host' },
  { name: 'X-Forwarded-Proto', detail: 'Original scheme' },
  { name: 'X-Request-Id', detail: 'Request id' },
  { name: 'X-Requested-With', detail: 'Ajax marker' },
];

const MEDIA_TYPES: readonly HeaderValue[] = [
  { value: '*/*', detail: 'Any type' },
  { value: 'application/json', detail: 'JSON' },
  { value: 'application/xml', detail: 'XML' },
  { value: 'application/x-www-form-urlencoded', detail: 'Form URL encoded' },
  { value: 'application/octet-stream', detail: 'Binary' },
  { value: 'application/pdf', detail: 'PDF' },
  { value: 'multipart/form-data', detail: 'Multipart form' },
  { value: 'text/plain', detail: 'Plain text' },
  { value: 'text/html', detail: 'HTML' },
  { value: 'text/csv', detail: 'CSV' },
  { value: 'text/xml', detail: 'XML text' },
];

const HEADER_VALUES: Readonly<Record<string, readonly HeaderValue[]>> = {
  accept: MEDIA_TYPES,
  'accept-encoding': [
    { value: 'gzip', detail: 'Gzip' },
    { value: 'deflate', detail: 'Deflate' },
    { value: 'br', detail: 'Brotli' },
    { value: 'identity', detail: 'No encoding' },
    { value: 'gzip, deflate, br', detail: 'Common set' },
  ],
  'accept-language': [
    { value: '*', detail: 'Any' },
    { value: 'en', detail: 'English' },
    { value: 'en-US', detail: 'English (US)' },
    { value: 'de', detail: 'German' },
    { value: 'de-AT', detail: 'German (Austria)' },
  ],
  authorization: [
    { value: 'Bearer ', detail: 'Bearer token' },
    { value: 'Basic ', detail: 'Basic auth' },
    { value: 'Digest ', detail: 'Digest auth' },
  ],
  'cache-control': [
    { value: 'no-cache', detail: 'Revalidate' },
    { value: 'no-store', detail: 'Do not store' },
    { value: 'no-transform', detail: 'Do not transform' },
    { value: 'max-age=0', detail: 'Already stale' },
    { value: 'private', detail: 'Private cache' },
    { value: 'public', detail: 'Shared cache' },
    { value: 'must-revalidate', detail: 'Must revalidate' },
  ],
  connection: [
    { value: 'keep-alive', detail: 'Reuse' },
    { value: 'close', detail: 'Close after response' },
  ],
  'content-encoding': [
    { value: 'gzip', detail: 'Gzip' },
    { value: 'deflate', detail: 'Deflate' },
    { value: 'br', detail: 'Brotli' },
    { value: 'identity', detail: 'No encoding' },
  ],
  'content-type': MEDIA_TYPES.filter((item) => item.value !== '*/*'),
  pragma: [{ value: 'no-cache', detail: 'Legacy no-cache' }],
  'x-requested-with': [{ value: 'XMLHttpRequest', detail: 'Ajax' }],
  'x-forwarded-proto': [
    { value: 'https', detail: 'HTTPS' },
    { value: 'http', detail: 'HTTP' },
  ],
};

export function suggestHeaderNames(
  query: string,
  usedKeys: readonly string[] = [],
  extraNames: readonly string[] = [],
): PlaceholderSuggestion[] {
  const used = new Set(usedKeys.map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0));
  const needle = query.trim().toLowerCase();
  const extras = extraNames
    .map((name) => name.trim())
    .filter(
      (name) =>
        name.length > 0 && !COMMON_HEADER_NAMES.some((item) => item.name.toLowerCase() === name.toLowerCase()),
    )
    .map((name) => ({ name, detail: 'API key' }));
  const catalog = [...COMMON_HEADER_NAMES, ...extras];
  return catalog
    .filter((item) => {
      if (used.has(item.name.toLowerCase()) && item.name.toLowerCase() !== needle)
        return false;
      return headerMatchRank(item.name, needle) < 99;
    })
    .map((item) => ({
      insert: item.name,
      label: item.name,
      detail: item.detail,
    }))
    .sort((left, right) => {
      const delta = headerMatchRank(left.insert, needle) - headerMatchRank(right.insert, needle);
      if (delta !== 0)
        return delta;
      return left.insert.localeCompare(right.insert);
    });
}

export function suggestHeaderValues(headerName: string, query: string): PlaceholderSuggestion[] {
  const values = HEADER_VALUES[headerName.trim().toLowerCase()] ?? [];
  const needle = query.trim().toLowerCase();
  return values
    .filter((item) => headerMatchRank(item.value, needle) < 99)
    .map((item) => ({
      insert: item.value,
      label: item.value,
      detail: item.detail,
    }))
    .sort((left, right) => {
      const delta = headerMatchRank(left.insert, needle) - headerMatchRank(right.insert, needle);
      if (delta !== 0)
        return delta;
      return left.insert.localeCompare(right.insert);
    });
}

export interface FieldGhost {
  readonly pad: string;
  readonly rest: string;
}

export function headerGhost(value: string, suggestion: PlaceholderSuggestion | null | undefined): FieldGhost | null {
  if (!suggestion)
    return null;
  const typed = value;
  if (!typed)
    return null;
  const insert = suggestion.insert;
  if (!insert.toLowerCase().startsWith(typed.toLowerCase()))
    return null;
  if (insert.length <= typed.length)
    return null;
  return { pad: typed, rest: insert.slice(typed.length) };
}

function headerMatchRank(value: string, needle: string): number {
  if (!needle)
    return 0;
  const lower = value.toLowerCase();
  if (lower === needle)
    return 0;
  if (lower.startsWith(needle))
    return 1;
  const compact = lower.replace(/[^a-z0-9]+/g, '');
  const compactNeedle = needle.replace(/[^a-z0-9]+/g, '');
  if (compactNeedle && compact.startsWith(compactNeedle))
    return 2;
  if (value.split(/[-/,;\s]+/).some((part) => part.toLowerCase().startsWith(needle)))
    return 3;
  return 99;
}
