import { z } from 'zod';

import { collabRepoSchema, type CollabRepo } from './collab';

/** Connected repositories on this PC. Lives next to `workspaces.json`. */
export const COLLAB_REPOS_FILE_NAME = 'collab-repos.json';

/** Clones of connected repositories live under `workspaces/repos/<repoId>`. */
export const COLLAB_REPOS_DIR = 'repos';

export const collabReposFileSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  items: z.array(collabRepoSchema).default([]),
});

export type CollabReposFile = z.infer<typeof collabReposFileSchema>;

export function createDefaultCollabReposFile(): CollabReposFile {
  return { schemaVersion: 1, items: [] };
}

/** Reads the repositories file, dropping unreadable entries and duplicate ids or addresses. */
export function parseCollabReposFile(raw: unknown): CollabReposFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return createDefaultCollabReposFile();
  const source = raw as Record<string, unknown>;
  const items: CollabRepo[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const entry of Array.isArray(source['items']) ? source['items'] : []) {
    const parsed = collabRepoSchema.safeParse(entry);
    if (!parsed.success)
      continue;
    const url = normalizeRemote(parsed.data.remoteUrl);
    if (ids.has(parsed.data.id) || urls.has(url))
      continue;
    ids.add(parsed.data.id);
    urls.add(url);
    items.push(parsed.data);
  }
  return { schemaVersion: 1, items };
}

/** Compares repository addresses ignoring case, trailing slashes, and `.git`. */
export function normalizeRemote(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase();
}

/** Catalog folder of a workspace inside a repository clone, relative to the workspaces root. */
export function collabLinkedFolder(repoId: string, folder: string): string {
  return `${COLLAB_REPOS_DIR}/${repoId}/workspaces/${folder}`;
}
