import type { HttpUrlSchemeId } from './http-settings.schema';

export interface NormalizeOutgoingUrlOptions {
  readonly defaultScheme: HttpUrlSchemeId;
  readonly enabled: boolean;
  readonly prependWww: boolean;
}

/**
 * Normalizes a request URL immediately before send: default scheme, optional `www.` for bare domains.
 * Does not change relative paths (`/api/...`) or hosts that contain template placeholders.
 */
export function normalizeOutgoingRequestUrl(
  raw: string,
  options: NormalizeOutgoingUrlOptions,
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (!options.enabled) {
    return trimmed;
  }

  let url = trimmed;
  let hash = '';
  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0) {
    hash = url.slice(hashIndex);
    url = url.slice(0, hashIndex);
  }

  let query = '';
  const queryIndex = url.indexOf('?');
  if (queryIndex >= 0) {
    query = url.slice(queryIndex);
    url = url.slice(0, queryIndex);
  }

  let scheme = '';
  const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (schemeMatch) {
    scheme = schemeMatch[1]!.toLowerCase();
    url = url.slice(schemeMatch[0].length);
  }

  if (!scheme && url.startsWith('/')) {
    return trimmed;
  }

  const slashIndex = url.indexOf('/');
  const hostPart = slashIndex === -1 ? url : url.slice(0, slashIndex);
  const pathPart = slashIndex === -1 ? '' : url.slice(slashIndex);

  if (!hostPart || /[\{$]/.test(hostPart)) {
    return trimmed;
  }

  let host = hostPart;
  if (options.prependWww && shouldPrependWww(host)) {
    host = `www.${host}`;
  }

  const finalScheme = scheme || options.defaultScheme;
  return `${finalScheme}://${host}${pathPart}${query}${hash}`;
}

function shouldPrependWww(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower.startsWith('www.')) {
    return false;
  }
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return false;
  }
  if (host.includes(':')) {
    return false;
  }
  const labels = host.split('.');
  return labels.length === 2 && labels.every((label) => label.length > 0);
}
