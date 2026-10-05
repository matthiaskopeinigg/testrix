import { z } from 'zod';

import { collectionCookieSchema, overlayCookies, type CollectionCookie } from './collection-folder';
import type { CollectionTree } from './collection-tree';
import { CONFIG_SCHEMA_VERSION } from './settings';

export const COOKIES_MAX_ENTRIES = 500;

export const cookiesFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  cookies: z.array(collectionCookieSchema).default([]),
});

export type CookiesFile = z.infer<typeof cookiesFileSchema>;

export const DEFAULT_COOKIES_FILE: CookiesFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  cookies: [],
};

export function parseCookiesFile(raw: unknown): CookiesFile {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const parsed = cookiesFileSchema.safeParse({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    cookies: Array.isArray(source['cookies']) ? source['cookies'] : [],
  });
  if (!parsed.success)
    return { ...DEFAULT_COOKIES_FILE };
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    cookies: parsed.data.cookies.slice(0, COOKIES_MAX_ENTRIES),
  };
}

export function mergeCookieJar(
  current: readonly CollectionCookie[],
  incoming: readonly CollectionCookie[],
): CollectionCookie[] {
  const next = new Map<string, CollectionCookie>();
  for (const cookie of current) {
    if (!cookie.name.trim())
      continue;
    next.set(cookieKey(cookie), cookie);
  }
  for (const cookie of incoming) {
    if (!cookie.name.trim())
      continue;
    next.set(cookieKey(cookie), cookie);
  }
  return [...next.values()].slice(0, COOKIES_MAX_ENTRIES);
}

function cookieKey(cookie: CollectionCookie): string {
  return `${cookie.name.trim().toLowerCase()}\0${cookie.domain.trim().toLowerCase()}\0${cookie.path || '/'}`;
}

export function collectFolderCookies(tree: CollectionTree): CollectionCookie[] {
  const found: CollectionCookie[] = [];
  walkFolders(tree, found);
  return overlayCookies([], found);
}

function walkFolders(nodes: CollectionTree, into: CollectionCookie[]): void {
  for (const node of nodes) {
    if (node.kind !== 'folder')
      continue;
    const cookies = node.config?.settings.cookies ?? [];
    into.push(...cookies);
    walkFolders(node.children, into);
  }
}
