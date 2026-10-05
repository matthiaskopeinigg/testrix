import {
  folderConfigOf,
  oauthTokenExpired,
  requestConfigOf,
  type CollectionCookie,
  type CollectionFolderAuth,
  type CollectionNode,
  type CollectionTree,
} from '@testrix/contracts';

export interface AuthJarEntry {
  readonly id: string;
  readonly kind: 'folder' | 'http';
  readonly path: string;
  readonly authType: CollectionFolderAuth['type'];
  readonly summary: string;
  readonly expiresAt: string;
  readonly isExpired: boolean;
  readonly hasSecrets: boolean;
}

export interface CookieJarFilters {
  readonly query: string;
  readonly enabledOnly: boolean;
  readonly expiredOnly: boolean;
  readonly domain: string;
}

export function isCookieExpired(expires: string, now = new Date()): boolean {
  if (!expires.trim())
    return false;
  const at = Date.parse(expires);
  if (Number.isNaN(at))
    return false;
  return at <= now.getTime();
}

export function filterJarCookies(
  cookies: readonly CollectionCookie[],
  filters: CookieJarFilters,
  now = new Date(),
): CollectionCookie[] {
  const query = filters.query.trim().toLowerCase();
  const domain = filters.domain.trim().toLowerCase();
  return cookies.filter((cookie) => {
    if (filters.enabledOnly && !cookie.enabled)
      return false;
    const expired = isCookieExpired(cookie.expires, now);
    if (filters.expiredOnly && !expired)
      return false;
    if (domain && !cookie.domain.toLowerCase().includes(domain))
      return false;
    if (!query)
      return true;
    const haystack = `${cookie.name} ${cookie.value} ${cookie.domain} ${cookie.path}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function collectAuthEntries(tree: CollectionTree, now = new Date()): AuthJarEntry[] {
  const entries: AuthJarEntry[] = [];
  walkAuth(tree, [], entries, now);
  return entries;
}

function walkAuth(
  nodes: CollectionTree,
  path: readonly string[],
  into: AuthJarEntry[],
  now: Date,
): void {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const nextPath = [...path, node.name];
      const auth = folderConfigOf(node).auth;
      if (auth.type !== 'none')
        into.push(authEntry(node.id, 'folder', nextPath.join(' › '), auth, now));
      walkAuth(node.children, nextPath, into, now);
      continue;
    }
    if (node.kind === 'http') {
      const config = requestConfigOf(node);
      if (config.authMode === 'inherit' || config.authMode === 'none')
        continue;
      const auth =
        config.auth.type !== 'none'
          ? config.auth
          : { ...config.auth, type: config.authMode };
      into.push(authEntry(node.id, 'http', [...path, node.name].join(' › '), auth, now));
    }
  }
}

function authEntry(
  id: string,
  kind: 'folder' | 'http',
  path: string,
  auth: CollectionFolderAuth,
  now: Date,
): AuthJarEntry {
  return {
    id,
    kind,
    path,
    authType: auth.type,
    summary: authSummary(auth),
    expiresAt: auth.expiresAt,
    isExpired: auth.type === 'oauth2' && oauthTokenExpired(auth.expiresAt, 0, now),
    hasSecrets: authHasSecrets(auth),
  };
}

function authSummary(auth: CollectionFolderAuth): string {
  switch (auth.type) {
    case 'bearer':
      return auth.token.trim() ? 'Bearer token set' : 'Bearer (empty)';
    case 'basic':
      return auth.username.trim() ? `Basic · ${auth.username}` : 'Basic (empty user)';
    case 'apikey':
      return `${auth.apiKeyIn} · ${auth.apiKeyHeader || 'X-Api-Key'}`;
    case 'digest':
      return auth.username.trim() ? `Digest · ${auth.username}` : 'Digest (empty user)';
    case 'oauth2':
      return auth.accessToken.trim()
        ? `OAuth2 · ${auth.tokenType || 'Bearer'}`
        : 'OAuth2 (no access token)';
    default:
      return auth.type;
  }
}

function authHasSecrets(auth: CollectionFolderAuth): boolean {
  return Boolean(
    auth.token.trim() ||
      auth.password.trim() ||
      auth.apiKey.trim() ||
      auth.clientSecret.trim() ||
      auth.accessToken.trim() ||
      auth.refreshToken.trim(),
  );
}

/** Wipe secret fields; keep type and non-secret OAuth scaffolding. */
export function clearedAuthSecrets(auth: CollectionFolderAuth): CollectionFolderAuth {
  return {
    ...auth,
    token: '',
    password: '',
    apiKey: '',
    clientSecret: '',
    accessToken: '',
    refreshToken: '',
    expiresAt: '',
  };
}

export function maskSecret(value: string, revealed: boolean): string {
  if (revealed || !value)
    return value;
  return '••••••••';
}

export function findCollectionNode(
  tree: CollectionTree,
  id: string,
): CollectionNode | null {
  for (const node of tree) {
    if (node.id === id)
      return node;
    if (node.kind === 'folder') {
      const nested = findCollectionNode(node.children, id);
      if (nested)
        return nested;
    }
  }
  return null;
}
