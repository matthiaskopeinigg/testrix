import { z } from 'zod';

import { collectionTreeSchema } from './collection-tree';
import { CONFIG_SCHEMA_VERSION } from './settings';

export const CONFIG_GLOBAL_FILES = ['settings.json', 'session.json'] as const;
export const CONFIG_WORKSPACE_FILES = [
  'environments.json',
  'collections.json',
  'database.json',
  'queries.json',
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

export function parseCollectionsFile(raw: unknown): CollectionsFile {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const parsed = collectionsFileSchema.safeParse({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    collections: Array.isArray(source['collections']) ? source['collections'] : [],
  });
  if (!parsed.success) {
    return { ...DEFAULT_COLLECTIONS_FILE };
  }
  return {
    ...parsed.data,
    schemaVersion: CONFIG_SCHEMA_VERSION,
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
