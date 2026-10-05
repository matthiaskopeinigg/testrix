const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * True when the host is loopback, LAN mDNS, or a literal IP.
 */
export function isLocalRequestHost(hostname: string): boolean {
  const host = hostname.trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (!host)
    return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
    return true;
  if (host.includes(':') || IPV4_RE.test(host))
    return true;
  return false;
}

/**
 * Prefix `https://` (or `http://` for local hosts) when the URL has no scheme.
 */
export function ensureRequestUrlScheme(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || SCHEME_RE.test(trimmed))
    return trimmed;
  const rest = trimmed.startsWith('//') ? trimmed.slice(2) : trimmed;
  if (!rest || rest.startsWith('/'))
    return trimmed;
  const hostToken = rest.split(/[/?#]/)[0] ?? '';
  if (hostToken.includes('{{'))
    return trimmed;
  const hostname = hostOfToken(hostToken);
  if (!hostname)
    return trimmed;
  const scheme = isLocalRequestHost(hostname) ? 'http' : 'https';
  return `${scheme}://${rest}`;
}

/**
 * Prefix `wss://` (or `ws://` for local hosts) when the URL has no WebSocket scheme.
 * `http://` and `https://` are rewritten to `ws://` and `wss://`.
 */
export function ensureWebsocketUrlScheme(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed)
    return trimmed;
  if (/^wss?:\/\//i.test(trimmed))
    return trimmed;
  if (/^https:\/\//i.test(trimmed))
    return `wss://${trimmed.slice('https://'.length)}`;
  if (/^http:\/\//i.test(trimmed))
    return `ws://${trimmed.slice('http://'.length)}`;
  const withHttp = ensureRequestUrlScheme(trimmed);
  if (withHttp.startsWith('https://'))
    return `wss://${withHttp.slice('https://'.length)}`;
  if (withHttp.startsWith('http://'))
    return `ws://${withHttp.slice('http://'.length)}`;
  return trimmed;
}

/**
 * Insert `www.` before the hostname. Returns null when the host already has it,
 * is local, or the URL cannot be parsed.
 */
export function withWwwHost(raw: string): string | null {
  const source = ensureRequestUrlScheme(raw.trim());
  if (!source)
    return null;
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname.startsWith('www.') || isLocalRequestHost(hostname))
    return null;
  const nextHost = parsed.port ? `www.${parsed.hostname}:${parsed.port}` : `www.${parsed.hostname}`;
  const index = source.toLowerCase().indexOf(parsed.host.toLowerCase());
  if (index < 0)
    return null;
  return `${source.slice(0, index)}${nextHost}${source.slice(index + parsed.host.length)}`;
}

/**
 * Candidate URLs to try when opening a browser page (scheme fill, then www.).
 * Plain hostnames like `magenta.at` become `https://magenta.at`, then `https://www.magenta.at`.
 */
export function browserOpenUrlCandidates(raw: string): readonly string[] {
  const trimmed = raw.trim();
  if (!trimmed)
    return [];
  const withScheme = ensureRequestUrlScheme(trimmed);
  if (!withScheme)
    return [];
  const www = withWwwHost(withScheme);
  return www && www !== withScheme ? [withScheme, www] : [withScheme];
}

/**
 * True when a load/fetch failure looks like DNS or host reachability.
 */
export function isDnsOrHostLoadError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('err_name_not_resolved') ||
    message.includes('err_internet_disconnected') ||
    message.includes('err_address_unreachable') ||
    message.includes('enotfound') ||
    message.includes('getaddrinfo') ||
    message.includes('name_not_resolved')
  );
}

/**
 * True when Chromium aborted a navigation (common on HTTP redirects).
 * The page may still have landed on the redirect target.
 */
export function isAbortedNavigationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('err_aborted') ||
    message.includes('net::err_aborted') ||
    /[^0-9]-3(?:\D|$)/.test(message) ||
    message.includes('(-3)')
  );
}

/** True when a BrowserWindow URL is a real page (not blank / chrome error). */
export function isUsableBrowserPageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'about:blank')
    return false;
  if (trimmed.startsWith('chrome-error://') || trimmed.startsWith('chrome://'))
    return false;
  return /^https?:\/\//i.test(trimmed) || /^file:/i.test(trimmed);
}

function hostOfToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed)
    return '';
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end >= 0 ? trimmed.slice(1, end) : '';
  }
  return trimmed.split(':')[0] ?? '';
}
