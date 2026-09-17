import { z } from 'zod';

import { CONFIG_SCHEMA_VERSION } from './settings';

export const DATABASE_TYPE_IDS = [
  'redis',
  'postgresql',
  'mysql',
  'mariadb',
  'mssql',
  'sqlite',
  'oracle',
  'mongodb',
] as const;

export const databaseTypeSchema = z.enum(DATABASE_TYPE_IDS);

export type DatabaseType = z.infer<typeof databaseTypeSchema>;

export const DATABASE_CONNECTION_MAX_FOLDER_DEPTH = 15;

export const SAVED_QUERY_MAX_FOLDER_DEPTH = 15;

export const DATABASE_IDLE_DISCONNECT_MINUTES_MIN = 0;

export const DATABASE_IDLE_DISCONNECT_MINUTES_MAX = 120;

export const DATABASE_IDLE_DISCONNECT_MINUTES_DEFAULT = 0;

export const DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MIN = 0;

export const DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MAX = 600;

export const DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_DEFAULT = 60;

const boundedName = z.string().min(1).max(256);

export const DATABASE_TYPE_LABELS: Readonly<Record<DatabaseType, string>> = {
  redis: 'Redis',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  mssql: 'SQL Server',
  sqlite: 'SQLite',
  oracle: 'Oracle',
  mongodb: 'MongoDB',
};

export const DATABASE_DEFAULT_PORTS: Readonly<Record<DatabaseType, number>> = {
  redis: 6379,
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  mssql: 1433,
  sqlite: 0,
  oracle: 1521,
  mongodb: 27017,
};

export const databaseConnectionSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('connection').default('connection'),
  name: boundedName,
  type: databaseTypeSchema,
  host: z.string().default('localhost'),
  port: z.number().int().default(5432),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  filePath: z.string().optional(),
  clientPath: z.string().optional(),
  useSid: z.boolean().optional(),
  selectedSchemas: z.array(z.string().min(1).max(256)).max(500).optional(),
  tls: z.boolean().optional(),
  connectTimeoutMs: z.number().int().optional(),
  commandTimeoutMs: z.number().int().optional(),
  busyTimeoutMs: z.number().int().optional(),
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
    updatedAt: z.string().min(1),
  }),
);

export const databaseConnectionTreeItemSchema: z.ZodType<DatabaseConnectionTreeItem> = z.lazy(() =>
  z.union([databaseConnectionFolderSchema, databaseConnectionSchema]),
);

export const databasesFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  nodes: z.array(databaseConnectionTreeItemSchema).default([]),
});

export type DatabasesFile = z.infer<typeof databasesFileSchema>;

export const DEFAULT_DATABASES_FILE: DatabasesFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  nodes: [],
};

export const SAVED_QUERY_LAST_RESULT_MAX_ROWS = 1000;

export const SAVED_QUERY_LAST_RESULT_MAX_COLUMNS = 256;

const savedQueryResultCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const savedQueryLastResultSchema = z.object({
  table: z.object({
    columns: z.array(z.string().max(512)).max(SAVED_QUERY_LAST_RESULT_MAX_COLUMNS),
    rows: z
      .array(z.array(savedQueryResultCellSchema).max(SAVED_QUERY_LAST_RESULT_MAX_COLUMNS))
      .max(SAVED_QUERY_LAST_RESULT_MAX_ROWS),
    hasMore: z.boolean().default(false),
    affectedRows: z.number().optional(),
  }),
  durationMs: z.number().nonnegative(),
  hidden: z.boolean().optional(),
  consoleHeight: z.number().int().min(80).max(4000).optional(),
});

export type SavedQueryLastResult = z.infer<typeof savedQueryLastResultSchema>;

export const savedDatabaseQuerySchema = z.object({
  id: z.string().min(1),
  kind: z.literal('query').default('query'),
  name: boundedName,
  connectionId: z.string().default(''),
  query: z.string().max(512_000).default(''),
  updatedAt: z.string().min(1),
  readOnly: z.boolean().optional(),
  environmentId: z.string().optional(),
  lastResult: savedQueryLastResultSchema.optional(),
});

export type SavedDatabaseQuery = z.infer<typeof savedDatabaseQuerySchema>;

export function toSavedQueryLastResult(options: {
  readonly table: {
    readonly columns: readonly string[];
    readonly rows: readonly (readonly (string | number | boolean | null)[])[];
    readonly hasMore: boolean;
    readonly affectedRows?: number;
  };
  readonly durationMs: number;
  readonly hidden?: boolean;
  readonly consoleHeight?: number;
}): SavedQueryLastResult {
  const columns = options.table.columns.slice(0, SAVED_QUERY_LAST_RESULT_MAX_COLUMNS);
  const maxRows = Math.min(
    SAVED_QUERY_LAST_RESULT_MAX_ROWS,
    options.table.rows.length,
    Math.max(1, Math.floor(10_000 / Math.max(1, columns.length))),
  );
  const truncated =
    options.table.rows.length > maxRows || options.table.columns.length > columns.length;
  return {
    table: {
      columns,
      rows: options.table.rows.slice(0, maxRows).map((row) => row.slice(0, columns.length)),
      hasMore: options.table.hasMore || truncated,
      ...(options.table.affectedRows == null ? {} : { affectedRows: options.table.affectedRows }),
    },
    durationMs: options.durationMs,
    ...(options.hidden == null ? {} : { hidden: options.hidden }),
    ...(options.consoleHeight == null ? {} : { consoleHeight: options.consoleHeight }),
  };
}

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
    updatedAt: z.string().min(1),
  }),
);

export const savedQueryTreeItemSchema: z.ZodType<SavedQueryTreeItem> = z.lazy(() =>
  z.union([savedQueryFolderSchema, savedDatabaseQuerySchema]),
);

export const queriesFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  nodes: z.array(savedQueryTreeItemSchema).default([]),
});

export type QueriesFile = z.infer<typeof queriesFileSchema>;

export const DEFAULT_QUERIES_FILE: QueriesFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  nodes: [],
};

export const databasePrefsSchema = z.object({
  connectOnStartup: z.boolean(),
  idleDisconnectMinutes: z
    .number()
    .int()
    .min(DATABASE_IDLE_DISCONNECT_MINUTES_MIN)
    .max(DATABASE_IDLE_DISCONNECT_MINUTES_MAX),
  uncommittedRollbackSeconds: z
    .number()
    .int()
    .min(DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MIN)
    .max(DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MAX),
});

export type DatabasePrefs = z.infer<typeof databasePrefsSchema>;

export const DEFAULT_DATABASE_PREFS: DatabasePrefs = {
  connectOnStartup: false,
  idleDisconnectMinutes: DATABASE_IDLE_DISCONNECT_MINUTES_DEFAULT,
  uncommittedRollbackSeconds: DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_DEFAULT,
};

export const databaseSortModeSchema = z.enum([
  'saved',
  'name-asc',
  'name-desc',
  'date-new',
  'date-old',
]);

export type DatabaseSortMode = z.infer<typeof databaseSortModeSchema>;

export const databaseSidebarFilterSchema = z.enum(['all', 'folders', 'queries']);

export type DatabaseSidebarFilter = z.infer<typeof databaseSidebarFilterSchema>;

export const DATABASE_QUERY_TAB_PREFIX = 'dbq:';

export const DATABASE_CONNECTION_TAB_PREFIX = 'dbc:';

export const DATABASE_TABLE_TAB_PREFIX = 'dbt:';

export const DATABASE_DIAGRAM_TAB_PREFIX = 'dbd:';

export interface DatabaseTableTabTarget {
  readonly connectionId: string;
  readonly schema: string;
  readonly table: string;
}

export interface DatabaseDiagramTabTarget {
  readonly connectionId: string;
  readonly schema: string;
}

export function isDatabaseConnectionFolder(
  node: DatabaseConnectionTreeItem,
): node is DatabaseConnectionFolder {
  return node.kind === 'folder';
}

export function isSavedQueryFolder(node: SavedQueryTreeItem): node is SavedQueryFolder {
  return node.kind === 'folder';
}

export function flattenDatabaseConnections(
  nodes: readonly DatabaseConnectionTreeItem[],
): DatabaseConnection[] {
  const out: DatabaseConnection[] = [];
  for (const node of nodes) {
    if (isDatabaseConnectionFolder(node)) {
      out.push(...flattenDatabaseConnections(node.children));
      continue;
    }
    out.push(node);
  }
  return out;
}

export function flattenSavedQueries(nodes: readonly SavedQueryTreeItem[]): SavedDatabaseQuery[] {
  const out: SavedDatabaseQuery[] = [];
  for (const node of nodes) {
    if (isSavedQueryFolder(node)) {
      out.push(...flattenSavedQueries(node.children));
      continue;
    }
    out.push(node);
  }
  return out;
}

export function collectDatabaseTreeIds(nodes: readonly DatabaseConnectionTreeItem[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (isDatabaseConnectionFolder(node))
      ids.push(...collectDatabaseTreeIds(node.children));
  }
  return ids;
}

export function collectQueryTreeIds(nodes: readonly SavedQueryTreeItem[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (isSavedQueryFolder(node))
      ids.push(...collectQueryTreeIds(node.children));
  }
  return ids;
}

export function findDatabaseConnection(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
): DatabaseConnection | null {
  return flattenDatabaseConnections(nodes).find((item) => item.id === id) ?? null;
}

export function findSavedQuery(
  nodes: readonly SavedQueryTreeItem[],
  id: string,
): SavedDatabaseQuery | null {
  return flattenSavedQueries(nodes).find((item) => item.id === id) ?? null;
}

export function findDatabaseTreeItem(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
): DatabaseConnectionTreeItem | null {
  for (const node of nodes) {
    if (node.id === id)
      return node;
    if (isDatabaseConnectionFolder(node)) {
      const nested = findDatabaseTreeItem(node.children, id);
      if (nested)
        return nested;
    }
  }
  return null;
}

export function findQueryTreeItem(
  nodes: readonly SavedQueryTreeItem[],
  id: string,
): SavedQueryTreeItem | null {
  for (const node of nodes) {
    if (node.id === id)
      return node;
    if (isSavedQueryFolder(node)) {
      const nested = findQueryTreeItem(node.children, id);
      if (nested)
        return nested;
    }
  }
  return null;
}

export function collectDatabaseSecrets(file: DatabasesFile): string[] {
  return flattenDatabaseConnections(file.nodes)
    .map((item) => item.password?.trim() ?? '')
    .filter((value) => value.length > 0);
}

const CONNECTION_STRING_SCHEMES: Readonly<Record<string, DatabaseType>> = {
  postgres: 'postgresql',
  postgresql: 'postgresql',
  pgsql: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mariadb',
  mssql: 'mssql',
  sqlserver: 'mssql',
  mongodb: 'mongodb',
  'mongodb+srv': 'mongodb',
  redis: 'redis',
  rediss: 'redis',
  oracle: 'oracle',
  oracledb: 'oracle',
  sqlite: 'sqlite',
  file: 'sqlite',
};

export interface ParsedDatabaseConnectionString {
  readonly type?: DatabaseType;
  readonly host?: string;
  readonly port?: number;
  readonly user?: string;
  readonly password?: string;
  readonly database?: string;
  readonly filePath?: string;
  readonly tls?: boolean;
}

/**
 * Parses a URI or key=value connection string into connection fields.
 */
export function parseDatabaseConnectionString(raw: string): ParsedDatabaseConnectionString | null {
  const trimmed = raw.trim();
  if (!trimmed)
    return null;
  if (!trimmed.includes('://') && /[=;]/.test(trimmed) && /(host|server|data\s*source)/i.test(trimmed))
    return parseKeyValueConnectionString(trimmed);
  let source = trimmed;
  if (source.toLowerCase().startsWith('jdbc:'))
    source = source.slice(5);
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  const protocol = url.protocol.replace(/:$/, '').toLowerCase();
  const type = CONNECTION_STRING_SCHEMES[protocol];
  if (!type)
    return null;
  if (type === 'sqlite') {
    const path = decodeURIComponent(`${url.host}${url.pathname}` || url.pathname);
    const filePath = path.replace(/^\/([A-Za-z]:)/, '$1');
    return { type, filePath: filePath || undefined };
  }
  const port = url.port ? Number.parseInt(url.port, 10) : undefined;
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')).split('/')[0] || undefined;
  const tls =
    protocol === 'rediss' ||
    protocol === 'mongodb+srv' ||
    parseConnectionStringTls(url.searchParams);
  return {
    type,
    host: url.hostname || undefined,
    port: Number.isFinite(port) ? port : undefined,
    user: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database,
    tls: tls || undefined,
  };
}

/**
 * Builds a URI from the current connection fields.
 */
export function formatDatabaseConnectionString(
  connection: Pick<
    DatabaseConnection,
    'type' | 'host' | 'port' | 'user' | 'password' | 'database' | 'filePath' | 'tls'
  >,
): string {
  if (connection.type === 'sqlite')
    return connection.filePath ? `sqlite:///${connection.filePath.replace(/\\/g, '/')}` : '';
  const scheme =
    connection.type === 'postgresql'
      ? 'postgres'
      : connection.type === 'mssql'
        ? 'sqlserver'
        : connection.type === 'redis' && connection.tls
          ? 'rediss'
          : connection.type;
  const auth =
    connection.user || connection.password
      ? `${encodeURIComponent(connection.user ?? '')}:${encodeURIComponent(connection.password ?? '')}@`
      : '';
  const port = connection.port ? `:${connection.port}` : '';
  const database = connection.database ? `/${encodeURIComponent(connection.database)}` : '';
  const tlsQuery =
    connection.tls && connection.type !== 'redis' ? '?sslmode=require' : '';
  return `${scheme}://${auth}${connection.host || 'localhost'}${port}${database}${tlsQuery}`;
}

function parseConnectionStringTls(params: URLSearchParams): boolean {
  const sslmode = (params.get('sslmode') ?? '').toLowerCase();
  if (sslmode === 'require' || sslmode === 'verify-full' || sslmode === 'verify-ca')
    return true;
  const flag = (params.get('ssl') ?? params.get('tls') ?? params.get('encrypt') ?? '').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'require';
}

function parseKeyValueConnectionString(raw: string): ParsedDatabaseConnectionString {
  const parts = raw.split(/[;]+/).map((part) => part.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index <= 0)
      continue;
    map.set(part.slice(0, index).trim().toLowerCase(), part.slice(index + 1).trim());
  }
  const host = map.get('host') ?? map.get('server') ?? map.get('data source') ?? map.get('datasource');
  const portRaw = map.get('port');
  const port = portRaw ? Number.parseInt(portRaw, 10) : undefined;
  const typeHint = (map.get('type') ?? map.get('provider') ?? '').toLowerCase();
  const type = CONNECTION_STRING_SCHEMES[typeHint];
  return {
    type,
    host: host || undefined,
    port: Number.isFinite(port) ? port : undefined,
    user: map.get('user') ?? map.get('uid') ?? map.get('username') ?? map.get('user id') ?? undefined,
    password: map.get('password') ?? map.get('pwd') ?? undefined,
    database: map.get('database') ?? map.get('initial catalog') ?? map.get('db') ?? undefined,
    tls: (() => {
      const ssl = (map.get('ssl') ?? map.get('tls') ?? map.get('encrypt') ?? map.get('sslmode') ?? '').toLowerCase();
      return ssl === 'true' || ssl === '1' || ssl === 'require' || ssl === 'verify-full' || ssl === 'verify-ca'
        ? true
        : undefined;
    })(),
  };
}

export function createDefaultDatabaseConnection(
  type: DatabaseType = 'postgresql',
  now = new Date().toISOString(),
): DatabaseConnection {
  return {
    id: globalThis.crypto.randomUUID(),
    kind: 'connection',
    name: DATABASE_TYPE_LABELS[type],
    type,
    host: type === 'sqlite' ? '' : 'localhost',
    port: DATABASE_DEFAULT_PORTS[type],
    connectOnBoot: false,
  };
}

export function createDefaultSavedQuery(
  connectionId = '',
  now = new Date().toISOString(),
): SavedDatabaseQuery {
  return {
    id: globalThis.crypto.randomUUID(),
    kind: 'query',
    name: 'New query',
    connectionId,
    query: '',
    updatedAt: now,
  };
}

export function createDatabaseFolder(name = 'New folder', now = new Date().toISOString()): DatabaseConnectionFolder {
  return {
    id: globalThis.crypto.randomUUID(),
    kind: 'folder',
    name,
    children: [],
    updatedAt: now,
  };
}

export function createQueryFolder(name = 'New folder', now = new Date().toISOString()): SavedQueryFolder {
  return {
    id: globalThis.crypto.randomUUID(),
    kind: 'folder',
    name,
    children: [],
    updatedAt: now,
  };
}

export function parseDatabasesFile(raw: unknown): DatabasesFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ...DEFAULT_DATABASES_FILE, nodes: [] };
  const source = raw as Record<string, unknown>;
  const nodes = Array.isArray(source['nodes'])
    ? source['nodes']
    : Array.isArray(source['connections'])
      ? source['connections']
      : [];
  const parsed = databasesFileSchema.safeParse({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    nodes: stripDroppedDatabaseNodes(nodes),
  });
  if (!parsed.success)
    return { ...DEFAULT_DATABASES_FILE, nodes: [] };
  return { ...parsed.data, schemaVersion: CONFIG_SCHEMA_VERSION };
}

const DROPPED_DATABASE_TYPES = new Set(['clickhouse', 'cockroachdb']);

function stripDroppedDatabaseNodes(nodes: readonly unknown[]): unknown[] {
  return nodes.flatMap((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node))
      return [];
    const item = node as Record<string, unknown>;
    if (item['kind'] === 'folder') {
      const children = Array.isArray(item['children']) ? stripDroppedDatabaseNodes(item['children']) : [];
      return [{ ...item, children }];
    }
    if (typeof item['type'] === 'string' && DROPPED_DATABASE_TYPES.has(item['type']))
      return [];
    return [item];
  });
}

export function parseQueriesFile(raw: unknown): QueriesFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ...DEFAULT_QUERIES_FILE, nodes: [] };
  const source = raw as Record<string, unknown>;
  const nodes = Array.isArray(source['nodes'])
    ? source['nodes']
    : Array.isArray(source['queries'])
      ? source['queries']
      : [];
  const parsed = queriesFileSchema.safeParse({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    nodes,
  });
  if (!parsed.success)
    return { ...DEFAULT_QUERIES_FILE, nodes: [] };
  return { ...parsed.data, schemaVersion: CONFIG_SCHEMA_VERSION };
}

export function parseDatabasePrefs(raw: unknown): DatabasePrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ...DEFAULT_DATABASE_PREFS };
  const source = raw as Record<string, unknown>;
  const parsed = databasePrefsSchema.safeParse({
    connectOnStartup: source['connectOnStartup'] === true,
    idleDisconnectMinutes: clampInt(
      source['idleDisconnectMinutes'],
      DATABASE_IDLE_DISCONNECT_MINUTES_MIN,
      DATABASE_IDLE_DISCONNECT_MINUTES_MAX,
      DATABASE_IDLE_DISCONNECT_MINUTES_DEFAULT,
    ),
    uncommittedRollbackSeconds: clampInt(
      source['uncommittedRollbackSeconds'],
      DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MIN,
      DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MAX,
      DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_DEFAULT,
    ),
  });
  return parsed.success ? parsed.data : { ...DEFAULT_DATABASE_PREFS };
}

export function databaseQueryTabNodeId(queryId: string): string {
  return `${DATABASE_QUERY_TAB_PREFIX}${queryId}`;
}

export function databaseConnectionTabNodeId(connectionId: string): string {
  return `${DATABASE_CONNECTION_TAB_PREFIX}${connectionId}`;
}

export function databaseTableTabNodeId(target: DatabaseTableTabTarget): string {
  return `${DATABASE_TABLE_TAB_PREFIX}${encodeURIComponent(target.connectionId)}:${encodeURIComponent(target.schema)}:${encodeURIComponent(target.table)}`;
}

export function parseDatabaseQueryTabNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith(DATABASE_QUERY_TAB_PREFIX))
    return null;
  const id = nodeId.slice(DATABASE_QUERY_TAB_PREFIX.length);
  return id || null;
}

export function parseDatabaseConnectionTabNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith(DATABASE_CONNECTION_TAB_PREFIX))
    return null;
  const id = nodeId.slice(DATABASE_CONNECTION_TAB_PREFIX.length);
  return id || null;
}

export function parseDatabaseTableTabNodeId(nodeId: string): DatabaseTableTabTarget | null {
  if (!nodeId.startsWith(DATABASE_TABLE_TAB_PREFIX))
    return null;
  const rest = nodeId.slice(DATABASE_TABLE_TAB_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length < 3)
    return null;
  try {
    return {
      connectionId: decodeURIComponent(parts[0] ?? ''),
      schema: decodeURIComponent(parts[1] ?? ''),
      table: decodeURIComponent(parts.slice(2).join(':')),
    };
  } catch {
    return null;
  }
}

export function databaseDiagramTabNodeId(target: DatabaseDiagramTabTarget): string {
  return `${DATABASE_DIAGRAM_TAB_PREFIX}${encodeURIComponent(target.connectionId)}:${encodeURIComponent(target.schema)}`;
}

export function parseDatabaseDiagramTabNodeId(nodeId: string): DatabaseDiagramTabTarget | null {
  if (!nodeId.startsWith(DATABASE_DIAGRAM_TAB_PREFIX))
    return null;
  const rest = nodeId.slice(DATABASE_DIAGRAM_TAB_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length < 2)
    return null;
  try {
    return {
      connectionId: decodeURIComponent(parts[0] ?? ''),
      schema: decodeURIComponent(parts.slice(1).join(':')),
    };
  } catch {
    return null;
  }
}

export function validDatabaseTabNodeIds(
  databases: DatabasesFile,
  queries: QueriesFile,
): Set<string> {
  const ids = new Set<string>();
  for (const connection of flattenDatabaseConnections(databases.nodes)) {
    ids.add(databaseConnectionTabNodeId(connection.id));
  }
  for (const query of flattenSavedQueries(queries.nodes)) {
    ids.add(databaseQueryTabNodeId(query.id));
  }
  return ids;
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value))
    return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
