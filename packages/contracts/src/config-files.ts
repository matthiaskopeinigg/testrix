import { z } from 'zod';

import { collectionTreeSchema } from './collection-tree';
import { CONFIG_SCHEMA_VERSION } from './settings';

export const CONFIG_GLOBAL_FILES = ['settings.json', 'session.json'] as const;
export const CONFIG_WORKSPACE_FILES = [
  'environments.json',
  'collections.json',
  'database.json',
  'queries.json',
  'history.json',
  'cookies.json',
  'flows.json',
  'load.json',
  'mocks.json',
  'listeners.json',
  'intercept.json',
  'regressions.json',
  'emulator.json',
  'flow-templates.json',
  'plantuml.json',
] as const;
export const CONFIG_FILE_NAMES = [
  ...CONFIG_GLOBAL_FILES,
  'workspaces.json',
  ...CONFIG_WORKSPACE_FILES,
] as const;

export type ConfigFileName = (typeof CONFIG_FILE_NAMES)[number];
export type ConfigGlobalFileName = (typeof CONFIG_GLOBAL_FILES)[number];
export type ConfigWorkspaceFileName = (typeof CONFIG_WORKSPACE_FILES)[number];

export const collectionsFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  collections: collectionTreeSchema,
});

export type CollectionsFile = z.infer<typeof collectionsFileSchema>;

export const DEFAULT_COLLECTIONS_FILE: CollectionsFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  collections: [],
};

/**
 * Parses `collections.json`. When some nodes fail the schema, valid siblings and
 * descendants are kept: a broken folder's valid children move up one level, so a
 * single bad request never hides a whole tree. `onDropped` receives what was lost.
 */
export function parseCollectionsFile(
  raw: unknown,
  onDropped?: (dropped: readonly CollectionsDroppedNode[]) => void,
): CollectionsFile {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const list = Array.isArray(source['collections']) ? source['collections'] : [];
  const parsed = collectionsFileSchema.safeParse({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    collections: list,
  });
  if (parsed.success) {
    return {
      ...parsed.data,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    };
  }
  const dropped: CollectionsDroppedNode[] = [];
  const recovered = list.flatMap((entry) => salvageCollectionNode(entry, dropped));
  if (dropped.length > 0)
    onDropped?.(dropped);
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    collections: recovered as CollectionsFile['collections'],
  };
}

/** A collection node that failed the schema and could not be kept. */
export interface CollectionsDroppedNode {
  readonly id: string | null;
  readonly name: string | null;
  readonly issue: string;
}

function salvageCollectionNode(entry: unknown, dropped: CollectionsDroppedNode[]): unknown[] {
  const whole = collectionTreeSchema.safeParse([entry]);
  if (whole.success && whole.data[0])
    return [whole.data[0]];
  const record = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null;
  const children = record && Array.isArray(record['children']) ? record['children'] : null;
  if (!record || !children) {
    dropped.push(droppedNode(record, whole.success ? 'invalid node' : whole.error.issues[0]?.message));
    return [];
  }
  const keptChildren = children.flatMap((child) => salvageCollectionNode(child, dropped));
  const folder = collectionTreeSchema.safeParse([{ ...record, children: keptChildren }]);
  if (folder.success && folder.data[0])
    return [folder.data[0]];
  dropped.push(droppedNode(record, folder.success ? 'invalid folder' : folder.error.issues[0]?.message));
  return keptChildren;
}

function droppedNode(record: Record<string, unknown> | null, issue: string | undefined): CollectionsDroppedNode {
  return {
    id: typeof record?.['id'] === 'string' ? record['id'] : null,
    name: typeof record?.['name'] === 'string' ? record['name'] : null,
    issue: issue ?? 'invalid node',
  };
}

export const configFileEntrySchema = z.object({
  name: z.enum(CONFIG_FILE_NAMES),
  path: z.string().min(1),
  directory: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  exists: z.boolean(),
});

export type ConfigFileEntry = z.infer<typeof configFileEntrySchema>;

export const configPathsSchema = z.object({
  folder: z.string().min(1),
  configsFolder: z.string().min(1),
  workspacesFolder: z.string().min(1),
  logsFolder: z.string().min(1),
  files: z.array(configFileEntrySchema),
});

export type ConfigPaths = z.infer<typeof configPathsSchema>;

export const configRevealTargetSchema = z.enum([
  'folder',
  'logs',
  'configs',
  'workspaces',
  ...CONFIG_FILE_NAMES,
]);

export type ConfigRevealTarget = z.infer<typeof configRevealTargetSchema>;

/** Approximate local workspace weight for perf-budget UI. */
export const workspaceFootprintSchema = z.object({
  totalBytes: z.number().int().nonnegative(),
  historyEntries: z.number().int().nonnegative(),
  tabCount: z.number().int().nonnegative(),
  byCategory: z.record(z.string(), z.number().int().nonnegative()),
});

export type WorkspaceFootprintDto = z.infer<typeof workspaceFootprintSchema>;
