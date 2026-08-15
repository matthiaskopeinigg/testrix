import { z } from 'zod';

import { dedupeFolderTreeById } from '../config/insert-folder-tree-child';

export const SAVED_QUERIES_FILE_NAME = 'queries.json';

/** Maximum nesting depth for Database sidebar query folders. */
export const SAVED_QUERY_MAX_FOLDER_DEPTH = 15;

const boundedName = z.string().min(1).max(256);

export const savedDatabaseQuerySchema = z.object({
  id: z.string().min(1),
  kind: z.literal('query').default('query'),
  name: boundedName,
  connectionId: z.string().default(''),
  query: z.string().max(512_000).default(''),
  updatedAt: z.string(),
  readOnly: z.boolean().optional(),
});

export type SavedDatabaseQuery = z.infer<typeof savedDatabaseQuerySchema>;

export type SavedQueryFolder = {
  readonly id: string;
  readonly kind: 'folder';
  readonly name: string;
  readonly children: readonly SavedQueryTreeItem[];
  readonly updatedAt: string;
};

export type SavedQueryTreeItem = SavedQueryFolder | SavedDatabaseQuery;

export const savedQueryFolderSchema: z.ZodType<SavedQueryFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    kind: z.literal('folder'),
    name: boundedName,
    children: z.array(savedQueryTreeItemSchema).default([]),
    updatedAt: z.string(),
  }),
);

export const savedQueryTreeItemSchema: z.ZodType<SavedQueryTreeItem> = z.lazy(() =>
  z.unknown().transform((value, ctx) => {
    if (typeof value !== 'object' || value === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid saved query tree item' });
      return z.NEVER;
    }
    const record = value as Record<string, unknown>;
    if (record['kind'] === 'folder' || (record['kind'] !== 'query' && Array.isArray(record['children']))) {
      const parsed = savedQueryFolderSchema.safeParse({ ...record, kind: 'folder' });
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid query folder' });
        return z.NEVER;
      }
      return parsed.data;
    }
    const parsed = savedDatabaseQuerySchema.safeParse({ ...record, kind: 'query' });
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid saved query' });
      return z.NEVER;
    }
    return parsed.data;
  }),
);

export const savedQueriesFileSchema = z.object({
  schemaVersion: z.literal(2),
  nodes: z.array(savedQueryTreeItemSchema).default([]),
});

export type SavedQueriesFile = z.infer<typeof savedQueriesFileSchema>;

const savedQueriesFileV1Schema = z.object({
  schemaVersion: z.literal(1),
  queries: z.array(savedDatabaseQuerySchema).default([]),
});

/** True when a tree item is a saved query (not a folder). */
export function isSavedDatabaseQuery(item: SavedQueryTreeItem): item is SavedDatabaseQuery {
  return item.kind === 'query';
}

/** True when a tree item is a folder. */
export function isSavedQueryFolder(item: SavedQueryTreeItem): item is SavedQueryFolder {
  return item.kind === 'folder';
}

/** Empty saved-queries workspace file. */
export function createDefaultSavedQueriesFile(): SavedQueriesFile {
  return { schemaVersion: 2, nodes: [] };
}

function migrateV1Queries(queries: readonly SavedDatabaseQuery[]): SavedQueryTreeItem[] {
  return queries.map((query) => ({ ...query, kind: 'query' as const }));
}

/** Parses a saved-queries file, migrating v1 flat lists. */
export function parseSavedQueriesFile(raw: unknown): SavedQueriesFile {
  const v2 = savedQueriesFileSchema.safeParse(raw);
  if (v2.success) {
    return {
      ...v2.data,
      nodes: dedupeFolderTreeById(
        v2.data.nodes,
        isSavedQueryFolder,
        (folder, children) => (isSavedQueryFolder(folder) ? { ...folder, children } : folder),
        (item) => (isSavedQueryFolder(item) ? item.children : []),
      ),
    };
  }
  const v1 = savedQueriesFileV1Schema.safeParse(raw);
  if (v1.success) {
    return { schemaVersion: 2, nodes: migrateV1Queries(v1.data.queries) };
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { queries?: unknown }).queries)) {
    const loose = z.array(savedDatabaseQuerySchema).safeParse((raw as { queries: unknown }).queries);
    if (loose.success) {
      return { schemaVersion: 2, nodes: migrateV1Queries(loose.data) };
    }
  }
  return createDefaultSavedQueriesFile();
}

/** Walks the tree and returns every saved query. */
export function flattenSavedQueries(nodes: readonly SavedQueryTreeItem[]): SavedDatabaseQuery[] {
  const out: SavedDatabaseQuery[] = [];
  const walk = (list: readonly SavedQueryTreeItem[]): void => {
    for (const item of list) {
      if (isSavedDatabaseQuery(item)) {
        out.push(item);
      } else {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/** Finds a query by id anywhere in the tree. */
export function findSavedQuery(
  nodes: readonly SavedQueryTreeItem[],
  id: string,
): SavedDatabaseQuery | null {
  for (const item of nodes) {
    if (isSavedDatabaseQuery(item) && item.id === id) {
      return item;
    }
    if (isSavedQueryFolder(item)) {
      const found = findSavedQuery(item.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Maps every node, replacing queries that match `id`. */
export function mapSavedQueryTree(
  nodes: readonly SavedQueryTreeItem[],
  mapItem: (item: SavedQueryTreeItem) => SavedQueryTreeItem,
): SavedQueryTreeItem[] {
  return nodes.map((item) => {
    const next = mapItem(item);
    if (isSavedQueryFolder(next)) {
      return { ...next, children: mapSavedQueryTree(next.children, mapItem) };
    }
    return next;
  });
}

export const DATABASE_QUERY_TAB_PREFIX = 'dbq:';
export const DATABASE_CONNECTION_TAB_PREFIX = 'dbc:';
export const DATABASE_TABLE_TAB_PREFIX = 'dbt:';

/** Builds a database query workspace tab resource id. */
export function databaseQueryTabResourceId(id: string): string {
  return `${DATABASE_QUERY_TAB_PREFIX}${id}`;
}

/** Builds a database connection workspace tab resource id. */
export function databaseConnectionTabResourceId(id: string): string {
  return `${DATABASE_CONNECTION_TAB_PREFIX}${id}`;
}

/** Parses a database query workspace tab resource id. */
export function parseDatabaseQueryTabResourceId(resourceId: string): string | null {
  if (!resourceId.startsWith(DATABASE_QUERY_TAB_PREFIX)) {
    return null;
  }
  const id = resourceId.slice(DATABASE_QUERY_TAB_PREFIX.length);
  return id.trim() ? id : null;
}

/** Parses a database connection workspace tab resource id. */
export function parseDatabaseConnectionTabResourceId(resourceId: string): string | null {
  if (!resourceId.startsWith(DATABASE_CONNECTION_TAB_PREFIX)) {
    return null;
  }
  const id = resourceId.slice(DATABASE_CONNECTION_TAB_PREFIX.length);
  return id.trim() ? id : null;
}

/** Parsed `dbt:` table data tab target. */
export interface DatabaseTableTabTarget {
  readonly connectionId: string;
  readonly schema: string;
  readonly table: string;
}

/** Builds a table data workspace tab resource id. */
export function databaseTableTabResourceId(
  connectionId: string,
  schema: string,
  table: string,
): string {
  return `${DATABASE_TABLE_TAB_PREFIX}${encodeURIComponent(connectionId)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`;
}

/** Parses a table data workspace tab resource id. */
export function parseDatabaseTableTabResourceId(
  resourceId: string,
): DatabaseTableTabTarget | null {
  if (!resourceId.startsWith(DATABASE_TABLE_TAB_PREFIX)) {
    return null;
  }
  const rest = resourceId.slice(DATABASE_TABLE_TAB_PREFIX.length);
  const parts = rest.split('/');
  if (parts.length !== 3) {
    return null;
  }
  const [connectionId, schema, table] = parts.map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return '';
    }
  });
  if (!connectionId?.trim() || !table?.trim()) {
    return null;
  }
  return { connectionId, schema: schema ?? '', table };
}
