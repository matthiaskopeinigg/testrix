import { emptyCollectionCookie, type CollectionCookie } from '@testrix/contracts';

function cookieAttr(map: Record<string, string>, name: string): string {
  return map[name] ?? map[name.toLowerCase()] ?? '';
}

/** Parses a single Set-Cookie header into a collection cookie. */
export function parseSetCookie(header: string, fallbackDomain = ''): CollectionCookie | null {
  const parts = header.split(';').map((part) => part.trim()).filter(Boolean);
  const first = parts.shift();
  if (!first)
    return null;
  const eq = first.indexOf('=');
  if (eq <= 0)
    return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  const attrs: Record<string, string> = {};
  let secure = false;
  let httpOnly = false;
  for (const part of parts) {
    const [rawKey, ...rest] = part.split('=');
    const key = rawKey.trim().toLowerCase();
    const attrValue = rest.join('=').trim();
    if (key === 'secure') {
      secure = true;
      continue;
    }
    if (key === 'httponly') {
      httpOnly = true;
      continue;
    }
    attrs[key] = attrValue;
  }
  const cookie = emptyCollectionCookie('set');
  const maxAge = cookieAttr(attrs, 'max-age');
  let expires = cookieAttr(attrs, 'expires');
  if (!expires && maxAge) {
    const seconds = Number.parseInt(maxAge, 10);
    if (Number.isFinite(seconds))
      expires = new Date(Date.now() + seconds * 1000).toUTCString();
  }
  return {
    ...cookie,
    name,
    value,
    domain: cookieAttr(attrs, 'domain') || fallbackDomain,
    path: cookieAttr(attrs, 'path') || '/',
    expires,
    secure,
    httpOnly,
  };
}

export function parseSetCookieHeaders(
  headers: ReadonlyArray<{ key: string; value: string }>,
  fallbackDomain = '',
): CollectionCookie[] {
  const out: CollectionCookie[] = [];
  for (const header of headers) {
    if (header.key.toLowerCase() !== 'set-cookie')
      continue;
    const parsed = parseSetCookie(header.value, fallbackDomain);
    if (parsed)
      out.push(parsed);
  }
  return out;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
