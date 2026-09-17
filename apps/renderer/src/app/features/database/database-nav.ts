import type {
  DatabaseCatalogColumn,
  DatabaseCatalogForeignKey,
  DatabaseCatalogIndex,
  DatabaseCatalogRoutine,
  DatabaseCatalogSequence,
  DatabaseCatalogTable,
  DatabaseCatalogTrigger,
  DatabaseCatalogUser,
  DatabaseConnectionStatusState,
  DatabaseType,
} from '@testrix/contracts';

export type DatabaseNavKind =
  | 'folder'
  | 'connection'
  | 'query'
  | 'picker'
  | 'schema'
  | 'group'
  | 'table'
  | 'view'
  | 'column'
  | 'index'
  | 'fk'
  | 'routine'
  | 'trigger'
  | 'sequence'
  | 'user';

export type DatabaseNavSection = 'connections' | 'queries';

export interface DatabaseNavNode {
  readonly id: string;
  readonly kind: DatabaseNavKind;
  readonly name: string;
  readonly section: DatabaseNavSection;
  readonly children?: readonly DatabaseNavNode[];
  readonly connectionId?: string;
  readonly queryId?: string;
  readonly schema?: string;
  readonly table?: string;
  readonly engine?: DatabaseType;
  readonly status?: DatabaseConnectionStatusState;
  readonly detail?: string;
  readonly isView?: boolean;
  readonly referencedSchema?: string;
  readonly referencedTableName?: string;
}

export interface ConnectionCatalogCache {
  readonly schemas: readonly string[];
  readonly tablesBySchema: Readonly<Record<string, readonly DatabaseCatalogTable[]>>;
  readonly columnsByTable: Readonly<Record<string, readonly DatabaseCatalogColumn[]>>;
  readonly indexesByTable: Readonly<Record<string, readonly DatabaseCatalogIndex[]>>;
  readonly foreignKeysByTable: Readonly<Record<string, readonly DatabaseCatalogForeignKey[]>>;
  readonly foreignKeysBySchema: Readonly<Record<string, readonly DatabaseCatalogForeignKey[]>>;
  readonly routinesBySchema: Readonly<Record<string, readonly DatabaseCatalogRoutine[]>>;
  readonly triggersBySchema: Readonly<Record<string, readonly DatabaseCatalogTrigger[]>>;
  readonly sequencesBySchema: Readonly<Record<string, readonly DatabaseCatalogSequence[]>>;
  readonly usersBySchema: Readonly<Record<string, readonly DatabaseCatalogUser[]>>;
  readonly ddlByTable: Readonly<Record<string, string>>;
}

export function isDatabaseFolderNav(node: DatabaseNavNode): boolean {
  return node.kind === 'folder';
}

export function isDatabaseCatalogNav(node: DatabaseNavNode): boolean {
  return (
    node.kind === 'picker' ||
    node.kind === 'schema' ||
    node.kind === 'group' ||
    node.kind === 'table' ||
    node.kind === 'view' ||
    node.kind === 'column' ||
    node.kind === 'index' ||
    node.kind === 'fk' ||
    node.kind === 'routine' ||
    node.kind === 'trigger' ||
    node.kind === 'sequence' ||
    node.kind === 'user'
  );
}

export function isDatabaseDraggableNav(node: DatabaseNavNode): boolean {
  return node.kind === 'folder' || node.kind === 'connection' || node.kind === 'query';
}

export function isDatabaseExpandableNav(node: DatabaseNavNode): boolean {
  if (
    node.kind === 'folder' ||
    node.kind === 'connection' ||
    node.kind === 'schema' ||
    node.kind === 'table' ||
    node.kind === 'view'
  )
    return true;
  return (node.children?.length ?? 0) > 0;
}

export function catalogTableKey(schema: string, table: string): string {
  return `${schema}.${table}`;
}

function catalogLeaf(
  kind: 'column' | 'index' | 'fk' | 'routine' | 'trigger' | 'sequence' | 'user',
  id: string,
  name: string,
  connectionId: string,
  schema: string,
  table: string,
  detail?: string,
  extra?: Pick<DatabaseNavNode, 'referencedSchema' | 'referencedTableName'>,
): DatabaseNavNode {
  return {
    id,
    kind,
    name,
    detail,
    section: 'connections',
    connectionId,
    schema,
    table,
    ...extra,
  };
}

function catalogGroup(
  id: string,
  name: string,
  connectionId: string,
  schema: string,
  table: string,
  children: readonly DatabaseNavNode[],
): DatabaseNavNode {
  return {
    id,
    kind: 'group',
    name,
    detail: String(children.length),
    section: 'connections',
    connectionId,
    schema,
    table,
    children,
  };
}

function mergeCatalogIndexes(indexes: readonly DatabaseCatalogIndex[]): DatabaseCatalogIndex[] {
  const map = new Map<string, DatabaseCatalogIndex>();
  for (const index of indexes) {
    const current = map.get(index.name);
    if (!current) {
      map.set(index.name, { ...index, columns: [...(index.columns ?? [])] });
      continue;
    }
    map.set(index.name, {
      ...current,
      unique: current.unique || index.unique,
      primary: current.primary || index.primary,
      columns: [...(current.columns ?? []), ...(index.columns ?? [])],
    });
  }
  return [...map.values()];
}

function indexDetail(index: DatabaseCatalogIndex): string | undefined {
  const columns = (index.columns ?? []).filter(Boolean);
  const parts: string[] = [];
  if (columns.length)
    parts.push(`(${columns.join(', ')})`);
  if (index.unique)
    parts.push('UNIQUE');
  return parts.length ? parts.join(' ') : undefined;
}

export function buildTableCatalogChildren(options: {
  readonly connectionId: string;
  readonly schema: string;
  readonly table: string;
  readonly columns: readonly DatabaseCatalogColumn[];
  readonly indexes: readonly DatabaseCatalogIndex[];
  readonly foreignKeys: readonly DatabaseCatalogForeignKey[];
}): DatabaseNavNode[] {
  const { connectionId, schema, table } = options;
  const key = catalogTableKey(schema, table);
  const prefix = `${connectionId}:${key}`;
  const columnNodes = options.columns.map((column) =>
    catalogLeaf(
      'column',
      `col:${prefix}:${column.name}`,
      column.name,
      connectionId,
      schema,
      table,
      column.type,
    ),
  );
  const indexes = mergeCatalogIndexes(options.indexes);
  const pkColumns = options.columns.filter((column) => column.primaryKey).map((column) => column.name);
  const keyNodes: DatabaseNavNode[] = [];
  if (pkColumns.length) {
    keyNodes.push(
      catalogLeaf('index', `key:${prefix}:PRIMARY`, 'PRIMARY', connectionId, schema, table, `(${pkColumns.join(', ')})`),
    );
  }
  for (const index of indexes) {
    if (index.primary || !index.unique)
      continue;
    keyNodes.push(
      catalogLeaf('index', `key:${prefix}:${index.name}`, index.name, connectionId, schema, table, indexDetail(index)),
    );
  }
  const indexNodes = indexes.map((index) =>
    catalogLeaf('index', `idx:${prefix}:${index.name}`, index.name, connectionId, schema, table, indexDetail(index)),
  );
  const fkNodes = options.foreignKeys.map((fk) =>
    catalogLeaf(
      'fk',
      `fk:${prefix}:${fk.name}`,
      fk.name,
      connectionId,
      schema,
      fk.table ?? table,
      fkDetail(fk),
      {
        referencedSchema: fk.referencedSchema,
        referencedTableName: fk.referencedTable,
      },
    ),
  );
  const groups = [
    catalogGroup(`group:${prefix}:columns`, 'columns', connectionId, schema, table, columnNodes),
    catalogGroup(`group:${prefix}:keys`, 'keys', connectionId, schema, table, keyNodes),
    catalogGroup(`group:${prefix}:indexes`, 'indexes', connectionId, schema, table, indexNodes),
  ];
  if (fkNodes.length)
    groups.push(catalogGroup(`group:${prefix}:fks`, 'foreign keys', connectionId, schema, table, fkNodes));
  return groups;
}

export function fkDetail(fk: DatabaseCatalogForeignKey): string | undefined {
  const source = (fk.columns ?? []).filter(Boolean).join(', ');
  const targetCols = (fk.referencedColumns ?? []).filter(Boolean).join(', ');
  const targetTable = [fk.referencedSchema, fk.referencedTable].filter(Boolean).join('.');
  if (!targetTable && !source)
    return undefined;
  const left = source || fk.name;
  const right = targetCols ? `${targetTable}.${targetCols}` : targetTable;
  return right ? `${left} → ${right}` : left;
}

export function emptyCatalogCache(): ConnectionCatalogCache {
  return {
    schemas: [],
    tablesBySchema: {},
    columnsByTable: {},
    indexesByTable: {},
    foreignKeysByTable: {},
    foreignKeysBySchema: {},
    routinesBySchema: {},
    triggersBySchema: {},
    sequencesBySchema: {},
    usersBySchema: {},
    ddlByTable: {},
  };
}

export function buildSchemaCatalogChildren(options: {
  readonly connectionId: string;
  readonly schema: string;
  readonly tables: readonly DatabaseCatalogTable[];
  readonly routines?: readonly DatabaseCatalogRoutine[];
  readonly triggers?: readonly DatabaseCatalogTrigger[];
  readonly sequences?: readonly DatabaseCatalogSequence[];
  readonly users?: readonly DatabaseCatalogUser[];
  readonly tableNav: (table: DatabaseCatalogTable) => DatabaseNavNode;
}): DatabaseNavNode[] {
  const { connectionId, schema } = options;
  const prefix = `${connectionId}:${schema}`;
  const tables = options.tables.filter((item) => item.kind !== 'view').map(options.tableNav);
  const views = options.tables.filter((item) => item.kind === 'view').map(options.tableNav);
  const routines = (options.routines ?? []).map((item) =>
    catalogLeaf(
      'routine',
      `routine:${prefix}:${item.name}`,
      item.name,
      connectionId,
      schema,
      '',
      [item.kind, item.returnType].filter(Boolean).join(' · ') || item.kind,
    ),
  );
  const triggers = (options.triggers ?? []).map((item) =>
    catalogLeaf(
      'trigger',
      `trigger:${prefix}:${item.name}`,
      item.name,
      connectionId,
      schema,
      item.table ?? '',
      [item.timing, item.event, item.table].filter(Boolean).join(' · ') || undefined,
    ),
  );
  const sequences = (options.sequences ?? []).map((item) =>
    catalogLeaf('sequence', `seq:${prefix}:${item.name}`, item.name, connectionId, schema, ''),
  );
  const users = (options.users ?? []).map((item) =>
    catalogLeaf(
      'user',
      `user:${prefix}:${item.name}`,
      item.name,
      connectionId,
      schema,
      '',
      item.canLogin === false ? 'NOLOGIN' : undefined,
    ),
  );
  const groups: DatabaseNavNode[] = [
    catalogGroup(`group:${prefix}:tables`, 'tables', connectionId, schema, '', tables),
  ];
  if (views.length)
    groups.push(catalogGroup(`group:${prefix}:views`, 'views', connectionId, schema, '', views));
  if (routines.length)
    groups.push(catalogGroup(`group:${prefix}:routines`, 'routines', connectionId, schema, '', routines));
  if (triggers.length)
    groups.push(catalogGroup(`group:${prefix}:triggers`, 'triggers', connectionId, schema, '', triggers));
  if (sequences.length)
    groups.push(catalogGroup(`group:${prefix}:sequences`, 'sequences', connectionId, schema, '', sequences));
  if (users.length)
    groups.push(catalogGroup(`group:${prefix}:users`, 'users', connectionId, schema, '', users));
  return groups;
}
