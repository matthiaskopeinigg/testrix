import type { CollectionFolderAuth } from './collection-folder-settings.schema';
import type { AncestorFolderRef } from './collect-collection-ancestors';

export interface ResolvedCollectionRequestAuth {
  readonly auth: CollectionFolderAuth;
  readonly source: 'request' | 'folder' | 'none';
  readonly folderId?: string;
  readonly folderLabel?: string;
}

/**
 * Resolves auth for a request: request auth unless `inherit`, then nearest ancestor
 * folder with a concrete auth type (leaf → root). Folder `inherit` and legacy `none`
 * entries pass through so parent folder auth (e.g. API key on a root folder) still
 * applies to deeply nested requests. Request-level `none` disables auth entirely.
 */
export function resolveCollectionRequestAuth(
  requestAuth: CollectionFolderAuth,
  ancestorFolders: readonly AncestorFolderRef[],
): ResolvedCollectionRequestAuth {
  if (requestAuth.type !== 'inherit') {
    return { auth: requestAuth, source: 'request' };
  }

  for (let i = ancestorFolders.length - 1; i >= 0; i--) {
    const folder = ancestorFolders[i];
    const auth = folder.settings.auth;
    if (auth.type === 'inherit' || auth.type === 'none') {
      continue;
    }
    return {
      auth,
      source: 'folder',
      folderId: folder.id,
      folderLabel: folder.label,
    };
  }

  return { auth: { type: 'none' }, source: 'none' };
}

/**
 * Resolves `{{variable}}` and `$` placeholders in auth field values before send.
 */
export function resolveCollectionFolderAuthValues(
  auth: CollectionFolderAuth,
  resolveText: (text: string) => string,
): CollectionFolderAuth {
  switch (auth.type) {
    case 'bearer':
      return { ...auth, token: resolveText(auth.token) };
    case 'basic':
      return {
        ...auth,
        username: resolveText(auth.username),
        password: resolveText(auth.password),
      };
    case 'apiKey':
      return {
        ...auth,
        name: resolveText(auth.name),
        value: resolveText(auth.value),
      };
    case 'oauth2':
      return {
        ...auth,
        authUrl: resolveText(auth.authUrl),
        tokenUrl: resolveText(auth.tokenUrl),
        clientId: resolveText(auth.clientId),
        clientSecret: resolveText(auth.clientSecret),
        scope: resolveText(auth.scope),
        redirectUri: resolveText(auth.redirectUri),
      };
    case 'inherit':
    case 'none':
    default:
      return auth;
  }
}

function headerKeyExists(headers: Readonly<Record<string, string>>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function encodeBasicCredentials(user: string, pass: string): string {
  const raw = `${user}:${pass}`;
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as {
      btoa?: (s: string) => string;
      Buffer?: { from(s: string, enc: string): { toString(enc: string): string } };
    };
    if (typeof g.btoa === 'function') {
      return g.btoa(raw);
    }
    if (g.Buffer) {
      return g.Buffer.from(raw, 'utf8').toString('base64');
    }
  }
  return raw;
}

function appendQueryParam(url: string, key: string, value: string): string {
  const qIndex = url.indexOf('?');
  const base = qIndex === -1 ? url : url.slice(0, qIndex);
  const search = qIndex === -1 ? '' : url.slice(qIndex + 1);
  const params = new URLSearchParams(search);
  params.set(key, value);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Applies resolved auth to headers and URL (query apiKey).
 */
export function applyCollectionRequestAuth(
  auth: CollectionFolderAuth,
  headers: Record<string, string>,
  url: string,
): string {
  switch (auth.type) {
    case 'bearer':
      if (auth.token.trim()) {
        headers['Authorization'] = `Bearer ${auth.token.trim()}`;
      }
      return url;
    case 'basic': {
      const user = auth.username ?? '';
      const pass = auth.password ?? '';
      if (user || pass) {
        headers['Authorization'] = `Basic ${encodeBasicCredentials(user, pass)}`;
      }
      return url;
    }
    case 'apiKey':
      if (!auth.name.trim()) {
        return url;
      }
      if (auth.in === 'header') {
        headers[auth.name.trim()] = auth.value;
        return url;
      }
      return appendQueryParam(url, auth.name.trim(), auth.value);
    case 'oauth2':
    case 'inherit':
    case 'none':
    default:
      return url;
  }
}
