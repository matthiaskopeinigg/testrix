import { z } from 'zod';

import { dedupeFolderTreeById } from './insert-folder-tree-child';

export const DATABASE_TYPE_IDS = [
  'redis',
  'postgresql',
  'mysql',
  'mariadb',
  'mssql',
  'sqlite',
  'oracle',
  'mongodb',
  'clickhouse',
  'cockroachdb',
] as const;

export const databaseTypeSchema = z.enum(DATABASE_TYPE_IDS);
export type DatabaseType = z.infer<typeof databaseTypeSchema>;

/** Maximum nesting depth for Database sidebar connection folders. */
export const DATABASE_CONNECTION_MAX_FOLDER_DEPTH = 15;

const boundedName = z.string().min(1).max(256);

export const databaseConnectionSchema = z.object({
  id: z.string(),
  kind: z.literal('connection').default('connection'),
  name: z.string(),
  type: databaseTypeSchema,
  host: z.string().default('localhost'),
  port: z.number().int().default(5432),
  user: z.string().optional(),
  password: z.string().optional(),
  /** DB name (SQL) or Redis logical DB index, depending on `type`. */
  database: z.string().optional(),
  /** SQLite file path (when `type` is `sqlite`); if set, host/port are ignored. */
  filePath: z.string().optional(),
  /** Oracle Instant Client directory for Thick mode (10G password verifiers). */
  clientPath: z.string().optional(),
  /** When true, Oracle `database` is a SID (DataGrip `@host:port:SID`) not a service name. */
  useSid: z.boolean().optional(),
  tls: z.boolean().optional(),
  connectTimeoutMs: z.number().int().optional(),
  commandTimeoutMs: z.number().int().optional(),
  busyTimeoutMs: z.number().int().optional(),
  /** When true, Testrix probes this connection on app startup. */
  connectOnBoot: z.boolean().default(false),
});

export type DatabaseConnection = z.infer<typeof databaseConnectionSchema>;

export type DatabaseConnectionFolder = {
  readonly id: string;
  readonly kind: 'folder';
  readonly name: string;
  readonly children: readonly DatabaseConnectionTreeItem[];
  readonly updatedAt: string;
};

export type DatabaseConnectionTreeItem = DatabaseConnectionFolder | DatabaseConnection;

export const databaseConnectionFolderSchema: z.ZodType<DatabaseConnectionFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    kind: z.literal('folder'),
    name: boundedName,
    children: z.array(databaseConnectionTreeItemSchema).default([]),
    updatedAt: z.string(),
  }),
);

export const databaseConnectionTreeItemSchema: z.ZodType<DatabaseConnectionTreeItem> = z.lazy(() =>
  z.unknown().transform((value, ctx) => {
    if (typeof value !== 'object' || value === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid database connection tree item' });
      return z.NEVER;
    }
    const record = value as Record<string, unknown>;
    if (record['kind'] === 'folder' || (record['kind'] !== 'connection' && Array.isArray(record['children']))) {
      const parsed = databaseConnectionFolderSchema.safeParse({ ...record, kind: 'folder' });
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid connection folder' });
        return z.NEVER;
      }
      return parsed.data;
    }
    const parsed = databaseConnectionSchema.safeParse({ ...record, kind: 'connection' });
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid database connection' });
      return z.NEVER;
    }
    return parsed.data;
  }),
);

const databaseSettingsShapeSchema = z.object({
  connections: z.array(databaseConnectionSchema).default([]),
  nodes: z.array(databaseConnectionTreeItemSchema).optional(),
});

export type DatabaseSettings = {
  readonly connections: readonly DatabaseConnection[];
  readonly nodes: readonly DatabaseConnectionTreeItem[];
};

/** True when a tree item is a connection (not a folder). */
export function isDatabaseConnectionLeaf(
  item: DatabaseConnectionTreeItem,
): item is DatabaseConnection {
  return item.kind !== 'folder';
}

/** True when a tree item is a folder. */
export function isDatabaseConnectionFolder(
  item: DatabaseConnectionTreeItem,
): item is DatabaseConnectionFolder {
  return item.kind === 'folder';
}

/** Walks the tree and returns every connection. */
export function flattenDatabaseConnections(
  nodes: readonly DatabaseConnectionTreeItem[],
): DatabaseConnection[] {
  const out: DatabaseConnection[] = [];
  const walk = (list: readonly DatabaseConnectionTreeItem[]): void => {
    for (const item of list) {
      if (isDatabaseConnectionLeaf(item)) {
        out.push(item);
      } else {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/** Finds a connection by id anywhere in the tree. */
export function findDatabaseConnection(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
): DatabaseConnection | null {
  for (const item of nodes) {
    if (isDatabaseConnectionLeaf(item) && item.id === id) {
      return item;
    }
    if (isDatabaseConnectionFolder(item)) {
      const found = findDatabaseConnection(item.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Finds a tree item (folder or connection) by id. */
export function findDatabaseConnectionTreeItem(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
): DatabaseConnectionTreeItem | null {
  for (const item of nodes) {
    if (item.id === id) {
      return item;
    }
    if (isDatabaseConnectionFolder(item)) {
      const found = findDatabaseConnectionTreeItem(item.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Parent folder id for a connection or folder. `null` means the item is at the root.
 * `undefined` means the id is not in the tree.
 */
export function findDatabaseConnectionParentId(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const item of nodes) {
    if (item.id === id) {
      return parentId;
    }
    if (isDatabaseConnectionFolder(item)) {
      const found = findDatabaseConnectionParentId(item.children, id, item.id);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/** Folder option for the connection editor dropdown. */
export interface DatabaseConnectionFolderOption {
  readonly id: string;
  readonly name: string;
  readonly label: string;
}

/** Walks folders depth-first for a parent-folder picker. */
export function collectDatabaseConnectionFolders(
  nodes: readonly DatabaseConnectionTreeItem[],
  prefix = '',
): DatabaseConnectionFolderOption[] {
  const out: DatabaseConnectionFolderOption[] = [];
  for (const item of nodes) {
    if (!isDatabaseConnectionFolder(item)) {
      continue;
    }
    const label = prefix ? `${prefix} / ${item.name}` : item.name;
    out.push({ id: item.id, name: item.name, label });
    out.push(...collectDatabaseConnectionFolders(item.children, label));
  }
  return out;
}

/** Maps every node, replacing items that match. */
export function mapDatabaseConnectionTree(
  nodes: readonly DatabaseConnectionTreeItem[],
  mapItem: (item: DatabaseConnectionTreeItem) => DatabaseConnectionTreeItem,
): DatabaseConnectionTreeItem[] {
  return nodes.map((item) => {
    const next = mapItem(item);
    if (isDatabaseConnectionFolder(next)) {
      return { ...next, children: mapDatabaseConnectionTree(next.children, mapItem) };
    }
    return next;
  });
}

function wrapConnectionsAsNodes(
  connections: readonly DatabaseConnection[],
): DatabaseConnectionTreeItem[] {
  return connections.map((conn) => ({ ...conn, kind: 'connection' as const }));
}

/** Syncs `nodes` (source of truth when present) with the flat `connections` list. */
export function normalizeDatabaseSettings(input: {
  readonly connections?: readonly DatabaseConnection[];
  readonly nodes?: readonly DatabaseConnectionTreeItem[];
}): DatabaseSettings {
  if (input.nodes !== undefined) {
    const nodes = dedupeFolderTreeById(
      [...input.nodes],
      isDatabaseConnectionFolder,
      (folder, children) =>
        isDatabaseConnectionFolder(folder) ? { ...folder, children } : folder,
      (item) => (isDatabaseConnectionFolder(item) ? item.children : []),
    );
    return { nodes, connections: flattenDatabaseConnections(nodes) };
  }
  const connections = [...(input.connections ?? [])].map((conn) =>
    databaseConnectionSchema.parse(conn),
  );
  return { connections, nodes: wrapConnectionsAsNodes(connections) };
}

export const databaseSettingsSchema: z.ZodType<DatabaseSettings> = databaseSettingsShapeSchema.transform(
  (value) => normalizeDatabaseSettings(value),
);

/** Partial databases block for `settings.json` patches (does not flatten until parse). */
export const databaseSettingsPatchSchema = databaseSettingsShapeSchema.partial();

/** Default port for a database type when creating a new connection. */
export function defaultPortForDatabaseType(type: DatabaseType): number {
  switch (type) {
    case 'redis':
      return 6379;
    case 'postgresql':
      return 5432;
    case 'mysql':
    case 'mariadb':
      return 3306;
    case 'mssql':
      return 1433;
    case 'sqlite':
      return 0;
    case 'oracle':
      return 1521;
    case 'mongodb':
      return 27017;
    case 'clickhouse':
      return 8123;
    case 'cockroachdb':
      return 26257;
    default:
      return 5432;
  }
}

/** Creates a new empty connection profile with sensible defaults for the given type. */
export function createDefaultDatabaseConnection(
  type: DatabaseType = 'postgresql',
  id?: string,
): DatabaseConnection {
  return databaseConnectionSchema.parse({
    id: id ?? globalThis.crypto?.randomUUID?.() ?? `db-${Date.now()}`,
    kind: 'connection',
    name: 'New connection',
    type,
    host: 'localhost',
    port: defaultPortForDatabaseType(type),
  });
}
