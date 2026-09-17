import { z } from 'zod';

import type { CollectionsFile } from './config-files';
import type { DatabasesFile, QueriesFile } from './database';
import type { EnvironmentsFile } from './environment';
import { CONFIG_SCHEMA_VERSION } from './settings';

export interface WorkspaceSnapshot {
  readonly workspaces: WorkspacesFile;
  readonly environments: EnvironmentsFile;
  readonly collections: CollectionsFile;
  readonly databases: DatabasesFile;
  readonly queries: QueriesFile;
}

export const CONFIGS_DIR = 'configs';
export const WORKSPACES_DIR = 'workspaces';
export const WORKSPACES_FILE_NAME = 'workspaces.json';
export const DEFAULT_WORKSPACE_ID = 'ws_1';
export const DEFAULT_WORKSPACE_FOLDER = 'workspace-1';
export const DEFAULT_WORKSPACE_NAME = 'Default';

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  folder: z.string().min(1),
  modifiedAt: z.string().min(1),
});

export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceListSchema = z.array(workspaceSchema);

export type WorkspaceList = z.infer<typeof workspaceListSchema>;

export const workspacesFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  items: workspaceListSchema,
  activeId: z.string().nullable(),
  orderIds: z.array(z.string()),
});

export type WorkspacesFile = z.infer<typeof workspacesFileSchema>;

export function createDefaultWorkspace(
  now = new Date().toISOString(),
  folder = nextWorkspaceFolder(),
): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
    folder,
    modifiedAt: now,
  };
}

export function createDefaultWorkspacesFile(
  now = new Date().toISOString(),
  folder = nextWorkspaceFolder(),
): WorkspacesFile {
  const item = createDefaultWorkspace(now, folder);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: [item],
    activeId: item.id,
    orderIds: [item.id],
  };
}

export function applyWorkspaceOrder(
  items: readonly Workspace[],
  orderIds: readonly string[],
): Workspace[] {
  if (orderIds.length === 0) {
    return [...items];
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const next: Workspace[] = [];
  for (const id of orderIds) {
    const item = byId.get(id);
    if (!item) {
      continue;
    }
    next.push(item);
    byId.delete(id);
  }
  for (const item of items) {
    if (byId.has(item.id)) {
      next.push(item);
    }
  }
  return next;
}

function nextIndex(values: readonly string[], prefix: string): number {
  let max = 0;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  for (const value of values) {
    const match = pattern.exec(value);
    if (!match) {
      continue;
    }
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) {
      max = n;
    }
  }
  return max + 1;
}

/** Next on-disk folder name. Uses a UUID so rename does not collide. */
export function nextWorkspaceFolder(folders: readonly string[] = []): string {
  const used = new Set(folders);
  let folder = globalThis.crypto.randomUUID();
  while (used.has(folder))
    folder = globalThis.crypto.randomUUID();
  return folder;
}

/** Next catalog id: ws_1, ws_2, … */
export function nextWorkspaceId(ids: readonly string[]): string {
  return `ws_${nextIndex(ids, 'ws_')}`;
}

export function duplicateWorkspaceName(name: string, existing: readonly string[]): string {
  const base = name.trim() || DEFAULT_WORKSPACE_NAME;
  const copy = `${base} copy`;
  if (!existing.includes(copy)) {
    return copy;
  }
  let n = 2;
  while (existing.includes(`${base} copy ${n}`)) {
    n += 1;
  }
  return `${base} copy ${n}`;
}

export function canDeleteWorkspace(items: readonly Workspace[]): boolean {
  return items.length > 1;
}

export function isDefaultWorkspace(item: Pick<Workspace, 'id'>): boolean {
  return item.id === DEFAULT_WORKSPACE_ID;
}

export function workspaceDisplayName(item: Pick<Workspace, 'id' | 'name'>): string {
  const name = item.name.trim();
  if (isDefaultWorkspace(item) && (!name || name === 'Personal')) {
    return DEFAULT_WORKSPACE_NAME;
  }
  return name || 'Workspace';
}

function migrateDefaultWorkspaceName(item: Workspace): Workspace {
  if (item.id !== DEFAULT_WORKSPACE_ID || item.name !== 'Personal') {
    return item;
  }
  return { ...item, name: DEFAULT_WORKSPACE_NAME };
}

export function removeWorkspaceFromCatalog(file: WorkspacesFile, id: string): WorkspacesFile | null {
  if (!canDeleteWorkspace(file.items)) {
    return null;
  }
  if (!file.items.some((item) => item.id === id)) {
    return null;
  }
  const items = file.items.filter((item) => item.id !== id);
  const orderIds = file.orderIds.filter((itemId) => itemId !== id);
  const activeId =
    file.activeId && items.some((item) => item.id === file.activeId)
      ? file.activeId
      : (items[0]?.id ?? null);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items,
    activeId,
    orderIds,
  };
}

export function resolveActiveWorkspace(file: WorkspacesFile): Workspace | null {
  const items = applyWorkspaceOrder(file.items, file.orderIds);
  if (file.activeId) {
    const match = items.find((item) => item.id === file.activeId);
    if (match) {
      return match;
    }
  }
  return items[0] ?? null;
}

export function shouldMigrateLegacyLayout(input: {
  readonly configsSettingsExists: boolean;
  readonly rootSettingsExists: boolean;
  readonly rootSessionExists: boolean;
  readonly rootEnvironmentsExists: boolean;
  readonly rootCollectionsExists: boolean;
}): boolean {
  if (input.configsSettingsExists) {
    return false;
  }
  return (
    input.rootSettingsExists ||
    input.rootSessionExists ||
    input.rootEnvironmentsExists ||
    input.rootCollectionsExists
  );
}

function parseWorkspace(raw: unknown, fallback: Workspace): Workspace {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }
  const source = raw as Record<string, unknown>;
  const parsed = workspaceSchema.safeParse({
    id: typeof source['id'] === 'string' && source['id'].trim() ? source['id'] : fallback.id,
    name: typeof source['name'] === 'string' ? source['name'] : fallback.name,
    folder:
      typeof source['folder'] === 'string' && source['folder'].trim()
        ? source['folder']
        : fallback.folder,
    modifiedAt:
      typeof source['modifiedAt'] === 'string' && source['modifiedAt'].trim()
        ? source['modifiedAt']
        : fallback.modifiedAt,
  });
  return parsed.success ? parsed.data : fallback;
}

export function parseWorkspacesFile(raw: unknown): WorkspacesFile {
  const fallback = createDefaultWorkspacesFile();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }
  const source = raw as Record<string, unknown>;
  const rawItems = Array.isArray(source['items']) ? source['items'] : [];
  const items =
    rawItems.length === 0
      ? fallback.items
      : rawItems.map((item, index) =>
          parseWorkspace(item, {
            id: `ws_${index + 1}`,
            name: DEFAULT_WORKSPACE_NAME,
            folder: `workspace-${index + 1}`,
            modifiedAt: fallback.items[0]?.modifiedAt ?? new Date().toISOString(),
          }),
        );
  const ordered = applyWorkspaceOrder(
    items.map(migrateDefaultWorkspaceName),
    Array.isArray(source['orderIds'])
      ? source['orderIds'].filter((id): id is string => typeof id === 'string')
      : items.map((item) => item.id),
  );
  const activeId =
    typeof source['activeId'] === 'string' && ordered.some((item) => item.id === source['activeId'])
      ? source['activeId']
      : (ordered[0]?.id ?? null);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: ordered,
    activeId,
    orderIds: ordered.map((item) => item.id),
  };
}
