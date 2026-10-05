import { z } from 'zod';

import type { CollectionFolderNode, CollectionNode, CollectionTree } from './collection-tree';
import { newEntityId } from './entity-id';

/** One enabled key/value row on a folder or request. */
export const collectionKvRowSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  key: z.string().default(''),
  value: z.string().default(''),
  description: z.string().default(''),
});

export type CollectionKvRow = z.infer<typeof collectionKvRowSchema>;

export const collectionFolderAuthTypeSchema = z.enum([
  'none',
  'bearer',
  'basic',
  'apikey',
  'digest',
  'oauth2',
]);

export type CollectionFolderAuthType = z.infer<typeof collectionFolderAuthTypeSchema>;

export const COLLECTION_FOLDER_AUTH_TYPES = collectionFolderAuthTypeSchema.options;

export const oauthGrantTypeSchema = z.enum([
  'authorization_code',
  'client_credentials',
  'password',
  'device_code',
]);

export type OAuthGrantType = z.infer<typeof oauthGrantTypeSchema>;

export const OAUTH_GRANT_TYPES = oauthGrantTypeSchema.options;

export const oauthCodeChallengeMethodSchema = z.literal('S256');

export type OAuthCodeChallengeMethod = z.infer<typeof oauthCodeChallengeMethodSchema>;

export const apiKeyInSchema = z.enum(['header', 'query']);

export type ApiKeyIn = z.infer<typeof apiKeyInSchema>;

export const collectionFolderAuthSchema = z.object({
  type: collectionFolderAuthTypeSchema.default('none'),
  token: z.string().default(''),
  username: z.string().default(''),
  password: z.string().default(''),
  realm: z.string().default(''),
  apiKey: z.string().default(''),
  apiKeyHeader: z.string().default('X-Api-Key'),
  apiKeyIn: apiKeyInSchema.default('header'),
  grantType: oauthGrantTypeSchema.default('authorization_code'),
  pkce: z.boolean().default(true),
  codeChallengeMethod: oauthCodeChallengeMethodSchema.default('S256'),
  authUrl: z.string().default(''),
  tokenUrl: z.string().default(''),
  deviceAuthUrl: z.string().default(''),
  clientId: z.string().default(''),
  clientSecret: z.string().default(''),
  scope: z.string().default(''),
  audience: z.string().default(''),
  redirectUri: z.string().default(''),
  accessToken: z.string().default(''),
  refreshToken: z.string().default(''),
  tokenType: z.string().default('Bearer'),
  expiresAt: z.string().default(''),
});

export type CollectionFolderAuth = z.infer<typeof collectionFolderAuthSchema>;

export const collectionFolderScriptsSchema = z.object({
  preRequest: z.string().default(''),
  postResponse: z.string().default(''),
});

export type CollectionFolderScripts = z.infer<typeof collectionFolderScriptsSchema>;

export const collectionCookieSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  name: z.string().default(''),
  value: z.string().default(''),
  domain: z.string().default(''),
  path: z.string().default('/'),
  expires: z.string().default(''),
  secure: z.boolean().default(false),
  httpOnly: z.boolean().default(false),
});

export type CollectionCookie = z.infer<typeof collectionCookieSchema>;

export const collectionFolderSettingsSchema = z.object({
  followRedirects: z.boolean().default(true),
  /** When true, use workspace Settings → Certificates verify TLS instead of {@link verifyTls}. */
  verifyTlsInherit: z.boolean().default(true),
  verifyTls: z.boolean().default(true),
  sendCookies: z.boolean().default(true),
  storeCookies: z.boolean().default(true),
  timeoutMs: z.number().int().min(1).max(300000).default(30000),
  cookies: z.array(collectionCookieSchema).default([]),
});

export type CollectionFolderSettings = z.infer<typeof collectionFolderSettingsSchema>;

/**
 * Resolves whether TLS verification is on for a send, using workspace defaults when inheriting.
 */
export function effectiveVerifyTls(
  settings: CollectionFolderSettings,
  workspaceVerifyTls: boolean,
): boolean {
  if (settings.verifyTlsInherit)
    return workspaceVerifyTls;
  return settings.verifyTls;
}

export const collectionFolderConfigSchema = z.object({
  tags: z.array(z.string()).default([]),
  description: z.string().default(''),
  variables: z.array(collectionKvRowSchema).default([]),
  headers: z.array(collectionKvRowSchema).default([]),
  params: z.array(collectionKvRowSchema).default([]),
  auth: collectionFolderAuthSchema.default(() => collectionFolderAuthSchema.parse({})),
  scripts: collectionFolderScriptsSchema.default(() => collectionFolderScriptsSchema.parse({})),
  settings: collectionFolderSettingsSchema.default(() => collectionFolderSettingsSchema.parse({})),
  docs: z.string().default(''),
});

export type CollectionFolderConfig = z.infer<typeof collectionFolderConfigSchema>;

export const DEFAULT_FOLDER_AUTH: CollectionFolderAuth = collectionFolderAuthSchema.parse({});
export const DEFAULT_FOLDER_SCRIPTS: CollectionFolderScripts = collectionFolderScriptsSchema.parse({});
export const DEFAULT_FOLDER_SETTINGS: CollectionFolderSettings = collectionFolderSettingsSchema.parse({});
export const DEFAULT_FOLDER_CONFIG: CollectionFolderConfig = collectionFolderConfigSchema.parse({});

/** Fills missing folder config fields so older collections.json still loads. */
export function parseCollectionFolderConfig(raw: unknown): CollectionFolderConfig {
  const parsed = collectionFolderConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_FOLDER_CONFIG };
}

export function folderConfigOf(node: CollectionFolderNode): CollectionFolderConfig {
  return parseCollectionFolderConfig(node.config ?? {});
}

export function emptyCollectionKvRow(_prefix = 'kv'): CollectionKvRow {
  return {
    id: newEntityId(),
    enabled: true,
    key: '',
    value: '',
    description: '',
  };
}

export function emptyCollectionCookie(_prefix = 'ck'): CollectionCookie {
  return {
    id: newEntityId(),
    enabled: true,
    name: '',
    value: '',
    domain: '',
    path: '/',
    expires: '',
    secure: false,
    httpOnly: false,
  };
}

function enabledRows(rows: readonly CollectionKvRow[]): CollectionKvRow[] {
  return rows.filter((row) => row.enabled && row.key.trim());
}

/** Later enabled rows win by case-insensitive key. */
export function overlayRows(
  base: readonly CollectionKvRow[],
  overlay: readonly CollectionKvRow[],
): CollectionKvRow[] {
  const next = new Map<string, CollectionKvRow>();
  for (const row of enabledRows(base))
    next.set(row.key.trim().toLowerCase(), row);
  for (const row of enabledRows(overlay))
    next.set(row.key.trim().toLowerCase(), row);
  return [...next.values()];
}

/** Origin id used when inherited rows come from workspace default headers. */
export const SETTINGS_KV_SOURCE_ID = 'settings';

export interface KvRowOrigin {
  readonly source: string;
  readonly sourceId?: string;
  readonly rows: readonly CollectionKvRow[];
}

export type InheritedKvRow = CollectionKvRow & {
  readonly source: string;
  readonly sourceId?: string;
};

/** Merges enabled layers root-to-leaf, then hides keys this node already defines. */
export function inheritedKvRows(
  layers: readonly KvRowOrigin[],
  own: readonly CollectionKvRow[] = [],
): InheritedKvRow[] {
  const next = new Map<string, InheritedKvRow>();
  for (const layer of layers) {
    for (const row of layer.rows) {
      if (!row.enabled || !row.key.trim())
        continue;
      next.set(row.key.trim().toLowerCase(), {
        ...row,
        source: layer.source,
        sourceId: layer.sourceId,
      });
    }
  }
  const ownKeys = new Set(
    own.filter((row) => row.key.trim()).map((row) => row.key.trim().toLowerCase()),
  );
  return [...next.values()].filter((row) => !ownKeys.has(row.key.trim().toLowerCase()));
}

export interface FolderConfigOrigin {
  readonly id: string;
  readonly name: string;
  readonly config: CollectionFolderConfig;
}

function cookieKey(cookie: CollectionCookie): string {
  return `${cookie.name.trim().toLowerCase()}\0${cookie.domain.trim().toLowerCase()}\0${cookie.path || '/'}`;
}

export function overlayCookies(
  base: readonly CollectionCookie[],
  overlay: readonly CollectionCookie[],
): CollectionCookie[] {
  const next = new Map<string, CollectionCookie>();
  for (const cookie of base) {
    if (!cookie.enabled || !cookie.name.trim())
      continue;
    next.set(cookieKey(cookie), cookie);
  }
  for (const cookie of overlay) {
    if (!cookie.enabled || !cookie.name.trim())
      continue;
    next.set(cookieKey(cookie), cookie);
  }
  return [...next.values()];
}

/**
 * Walks root-to-leaf. Later folders override headers/params by key, auth when
 * not `none`, settings wholesale, and cookies by name+domain+path.
 */
export function mergeFolderConfigs(
  configs: readonly CollectionFolderConfig[],
): CollectionFolderConfig {
  let merged: CollectionFolderConfig = { ...DEFAULT_FOLDER_CONFIG };
  for (const config of configs) {
    merged = {
      tags: config.tags.length > 0 ? [...config.tags] : merged.tags,
      description: config.description.trim() ? config.description : merged.description,
      variables: overlayRows(merged.variables, config.variables),
      headers: overlayRows(merged.headers, config.headers),
      params: overlayRows(merged.params, config.params),
      auth: config.auth.type !== 'none' ? { ...config.auth } : merged.auth,
      scripts: {
        preRequest: [merged.scripts.preRequest, config.scripts.preRequest]
          .filter((block) => block.trim())
          .join('\n\n'),
        postResponse: [config.scripts.postResponse, merged.scripts.postResponse]
          .filter((block) => block.trim())
          .join('\n\n'),
      },
      settings: {
        followRedirects: config.settings.followRedirects,
        verifyTlsInherit: config.settings.verifyTlsInherit,
        verifyTls: config.settings.verifyTls,
        sendCookies: config.settings.sendCookies,
        storeCookies: config.settings.storeCookies,
        timeoutMs: config.settings.timeoutMs,
        cookies: overlayCookies(merged.settings.cookies, config.settings.cookies),
      },
      docs: config.docs.trim() ? config.docs : merged.docs,
    };
  }
  return merged;
}

export function findNodePath(tree: CollectionTree, id: string): CollectionNode[] | null {
  const walk = (nodes: CollectionTree, trail: CollectionNode[]): CollectionNode[] | null => {
    for (const node of nodes) {
      const next = [...trail, node];
      if (node.id === id)
        return next;
      if (node.kind === 'folder') {
        const nested = walk(node.children, next);
        if (nested)
          return nested;
      }
    }
    return null;
  };
  return walk(tree, []);
}

function folderOriginsOnPath(tree: CollectionTree, nodeId: string, excludeSelf: boolean): FolderConfigOrigin[] {
  const path = findNodePath(tree, nodeId);
  if (!path)
    return [];
  const folders = path.filter((node): node is CollectionFolderNode => node.kind === 'folder');
  const leaf = path[path.length - 1];
  const dropSelf = excludeSelf && leaf?.kind === 'folder' && leaf.id === nodeId;
  const selected = dropSelf ? folders.slice(0, -1) : folders;
  return selected.map((folder) => ({
    id: folder.id,
    name: folder.name,
    config: folderConfigOf(folder),
  }));
}

/** Folder configs from workspace root down to `nodeId` when it is a folder. */
export function ancestorFolderOrigins(tree: CollectionTree, nodeId: string): FolderConfigOrigin[] {
  return folderOriginsOnPath(tree, nodeId, false);
}

export function ancestorFolderConfigs(tree: CollectionTree, nodeId: string): CollectionFolderConfig[] {
  return ancestorFolderOrigins(tree, nodeId).map((item) => item.config);
}

/** Ancestor folders only — excludes `nodeId` when that node is a folder. */
export function parentFolderOrigins(tree: CollectionTree, nodeId: string): FolderConfigOrigin[] {
  return folderOriginsOnPath(tree, nodeId, true);
}

export function parentFolderConfigs(tree: CollectionTree, nodeId: string): CollectionFolderConfig[] {
  return parentFolderOrigins(tree, nodeId).map((item) => item.config);
}

export function variableMapFromRows(rows: readonly CollectionKvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of enabledRows(rows))
    out[row.key.trim()] = row.value;
  return out;
}

const VAR_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

/** Replaces `{{name}}` tokens. Unknown names stay as written. */
export function interpolateTemplate(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(VAR_PATTERN, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name))
      return vars[name];
    return match;
  });
}

export function interpolateKvRows(
  rows: readonly CollectionKvRow[],
  vars: Readonly<Record<string, string>>,
): CollectionKvRow[] {
  return rows.map((row) => ({
    ...row,
    key: interpolateTemplate(row.key, vars),
    value: interpolateTemplate(row.value, vars),
  }));
}

function hostMatchesCookieDomain(hostname: string, domain: string): boolean {
  const host = hostname.replace(/\.$/, '').toLowerCase();
  const cookieDomain = domain.replace(/^\./, '').replace(/\.$/, '').toLowerCase();
  if (!cookieDomain)
    return true;
  return host === cookieDomain || host.endsWith(`.${cookieDomain}`);
}

function pathMatchesCookiePath(pathname: string, cookiePath: string): boolean {
  const path = pathname || '/';
  const prefix = cookiePath || '/';
  if (path === prefix)
    return true;
  if (!path.startsWith(prefix))
    return false;
  return prefix.endsWith('/') || path.charAt(prefix.length) === '/';
}

function cookieExpired(expires: string, now: Date): boolean {
  if (!expires.trim())
    return false;
  const at = Date.parse(expires);
  if (Number.isNaN(at))
    return false;
  return at <= now.getTime();
}

/** Cookies that should be sent to `url` (domain, path, secure, expiry). */
export function cookiesMatchingUrl(
  cookies: readonly CollectionCookie[],
  url: string,
  now = new Date(),
): CollectionCookie[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  const secure = parsed.protocol === 'https:';
  return cookies.filter((cookie) => {
    if (!cookie.enabled || !cookie.name.trim())
      return false;
    if (cookie.secure && !secure)
      return false;
    if (cookieExpired(cookie.expires, now))
      return false;
    if (!hostMatchesCookieDomain(parsed.hostname, cookie.domain))
      return false;
    return pathMatchesCookiePath(parsed.pathname, cookie.path || '/');
  });
}

export function formatCookieHeader(cookies: readonly CollectionCookie[]): string {
  return cookies
    .filter((cookie) => cookie.enabled && cookie.name.trim())
    .map((cookie) => `${cookie.name.trim()}=${cookie.value}`)
    .join('; ');
}

export function oauthTokenExpired(expiresAt: string, skewMs = 30_000, now = new Date()): boolean {
  if (!expiresAt.trim())
    return false;
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at))
    return false;
  return at - skewMs <= now.getTime();
}

export function expiryFromExpiresIn(expiresIn: number, now = new Date()): string {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0)
    return '';
  return new Date(now.getTime() + expiresIn * 1000).toISOString();
}
