import type { DatabaseConnection, DatabaseType } from '@shared/config';
import type {
  DatabaseCatalogColumn,
  DatabaseCatalogIndex,
  DatabaseCatalogSchemaItem,
  DatabaseCatalogTable,
} from '@shared/database';
import {
  databaseSupportsSchemaSelection,
  isSystemSchemaName,
  resolveVisibleDatabaseSchemas,
  seedCatalogSchemaItems,
} from '@shared/database';

import type {
  ConnectionCatalogState,
  ConnectionCatalogTableDetail,
} from '@app/core/database/database-catalog.types';
import { catalogTableKey } from '@app/core/database/database-catalog.types';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import { connectionCatalogId } from './connection-catalog.ids';
import type { ConnectionTreeNode } from './connection-tree.types';

export type { ConnectionCatalogState, ConnectionCatalogTableDetail } from '@app/core/database/database-catalog.types';

const EMPTY_CATALOG_CHILDREN: ConnectionTreeNode[] = [];

/**
 * Sidebar label for the schema-picker action row under a connection.
 *
 * @param count Number of schemas currently selected for the connection.
 */
export function databaseSchemasSelectedLabel(count: number): string {
  return `${count} Schemas selected`;
}

/**
 * Per-connection memo so a table-detail patch reuses unchanged schema/table nodes.
 */
export interface ConnectionCatalogBuildMemo {
  readonly nodes: Map<string, ConnectionTreeNode>;
  readonly tableDetails: Map<string, ConnectionCatalogTableDetail | undefined>;
  readonly schemaTables: Map<string, readonly DatabaseCatalogTable[] | undefined>;
}

/** Creates an empty {@link ConnectionCatalogBuildMemo}. */
export function createConnectionCatalogBuildMemo(): ConnectionCatalogBuildMemo {
  return {
    nodes: new Map(),
    tableDetails: new Map(),
    schemaTables: new Map(),
  };
}

export interface BuildConnectionCatalogOptions {
  readonly showSystemObjects: boolean;
  /** Connection fields used to resolve which schemas appear in the tree. */
  readonly connection?: Pick<
    DatabaseConnection,
    'type' | 'user' | 'database' | 'selectedSchemas'
  > | null;
}

/**
 * Builds live object-explorer children under a connection row.
 *
 * When `memo` is provided, schema/table nodes are reused while their catalog
 * inputs keep the same object identity.
 */
export function buildConnectionCatalogChildren(
  connectionId: string,
  type: DatabaseType | undefined,
  catalog: ConnectionCatalogState | undefined,
  showSystemObjectsOrOptions: boolean | BuildConnectionCatalogOptions,
  memo?: ConnectionCatalogBuildMemo,
): ConnectionTreeNode[] {
  const options: BuildConnectionCatalogOptions =
    typeof showSystemObjectsOrOptions === 'boolean'
      ? { showSystemObjects: showSystemObjectsOrOptions }
      : showSystemObjectsOrOptions;
  const showSystemObjects = options.showSystemObjects;
  const connection = options.connection ?? {
    type: type ?? 'postgresql',
    selectedSchemas: undefined,
  };

  if (type === 'redis') {
    const id = connectionCatalogId(connectionId, 'keys', { name: 'keys' });
    const prev = memo?.nodes.get(id);
    if (prev) {
      return [prev];
    }
    const keys: ConnectionTreeNode = {
      id,
      label: 'Keys',
      kind: 'keys',
      icon: 'hash',
      subtitle: 'Use Redis commands in a query tab',
      draggable: false,
      droppable: false,
      data: { kind: 'keys', connectionId },
    };
    memo?.nodes.set(id, keys);
    return [keys];
  }
  if (!catalog || catalog.state === 'idle' || catalog.state === 'loading') {
    const seeded = visibleSelectedSchemas(connection, [], showSystemObjects);
    if (seeded.length === 0) {
      memo?.nodes.clear();
      memo?.tableDetails.clear();
      memo?.schemaTables.clear();
      return withSchemasPicker(connectionId, type, connection, EMPTY_CATALOG_CHILDREN, memo);
    }
    catalog = {
      state: 'ready',
      schemaDirectory: 'seed',
      schemas: seeded,
      tablesBySchema: {},
      detailsByTable: {},
    };
  }
  if (catalog.state === 'error') {
    return withSchemasPicker(
      connectionId,
      type,
      connection,
      [statusNode(connectionId, 'Could not load objects', catalog.error)],
      memo,
    );
  }
  if (type === 'sqlite') {
    const tables = filterTables(catalog.tablesBySchema['main'] ?? flattenTables(catalog.tablesBySchema), true);
    return buildTableGroups(connectionId, 'main', tables, catalog, memo);
  }
  const schemaQuery = {
    type: connection.type ?? type ?? 'postgresql',
    user: connection.user,
    database: connection.database,
    selectedSchemas: connection.selectedSchemas,
  };
  let schemas = resolveVisibleDatabaseSchemas(schemaQuery, catalog.schemas, showSystemObjects);
  if (schemas.length === 0 && (connection.selectedSchemas?.length ?? 0) > 0) {
    schemas = visibleSelectedSchemas(connection, catalog.schemas, showSystemObjects);
  }
  if (schemas.length === 0) {
    const emptyStatus =
      catalog.schemaDirectory === 'full' && catalog.schemas.length === 0
        ? [statusNode(connectionId, 'No schemas')]
        : EMPTY_CATALOG_CHILDREN;
    return withSchemasPicker(connectionId, type, connection, emptyStatus, memo);
  }
  return withSchemasPicker(
    connectionId,
    type,
    connection,
    schemas.map((schema) => {
      const id = connectionCatalogId(connectionId, 'schema', { schema: schema.name, name: schema.name });
      const schemaTables = catalog.tablesBySchema[schema.name];
      const tables = filterTables(schemaTables, showSystemObjects);
      const loadingSchema = schemaTables === undefined;
      const prev = memo?.nodes.get(id);
      if (
        prev &&
        memo?.schemaTables.get(id) === schemaTables &&
        (loadingSchema || schemaTableDetailsUnchanged(connectionId, tables, catalog, memo))
      ) {
        return prev;
      }
      const node: ConnectionTreeNode = {
        id,
        label: schema.name,
        kind: 'schema',
        icon: 'layers' as TxIconName,
        subtitle: schema.system ? 'System' : undefined,
        draggable: false,
        droppable: false,
        data: { kind: 'schema', connectionId, schema: schema.name },
        children: loadingSchema
          ? [statusNode(connectionId, 'Loading tables…', undefined, schema.name)]
          : buildTableGroups(connectionId, schema.name, tables, catalog, memo),
      };
      memo?.nodes.set(id, node);
      memo?.schemaTables.set(id, schemaTables);
      return node;
    }),
    memo,
  );
}

/**
 * Selected schemas from the catalog, falling back to the persisted seed list.
 * A stale seed catalog (opened before the user picked schemas) otherwise hides
 * every selected schema until the connection is fully refreshed.
 */
function visibleSelectedSchemas(
  connection: Pick<DatabaseConnection, 'type' | 'user' | 'database' | 'selectedSchemas'>,
  catalogSchemas: readonly DatabaseCatalogSchemaItem[],
  showSystemObjects: boolean,
): DatabaseCatalogSchemaItem[] {
  const fromCatalog = resolveVisibleDatabaseSchemas(connection, catalogSchemas, showSystemObjects);
  if (fromCatalog.length > 0) {
    return fromCatalog;
  }
  return resolveVisibleDatabaseSchemas(connection, seedCatalogSchemaItems(connection), showSystemObjects);
}

/**
 * Prepends the schema-picker action row when the engine supports schema selection.
 */
function withSchemasPicker(
  connectionId: string,
  type: DatabaseType | undefined,
  connection: Pick<DatabaseConnection, 'type' | 'user' | 'database' | 'selectedSchemas'>,
  children: readonly ConnectionTreeNode[],
  memo?: ConnectionCatalogBuildMemo,
): ConnectionTreeNode[] {
  const picker = schemasPickerNode(connectionId, type, connection, memo);
  if (!picker) {
    return children as ConnectionTreeNode[];
  }
  if (children === EMPTY_CATALOG_CHILDREN || children.length === 0) {
    return [picker];
  }
  return [picker, ...children];
}

/**
 * Live catalog row that opens the schema picker. Not expandable.
 */
function schemasPickerNode(
  connectionId: string,
  type: DatabaseType | undefined,
  connection: Pick<DatabaseConnection, 'type' | 'user' | 'database' | 'selectedSchemas'>,
  memo?: ConnectionCatalogBuildMemo,
): ConnectionTreeNode | null {
  if (!databaseSupportsSchemaSelection(type ?? connection.type)) {
    return null;
  }
  const id = connectionCatalogId(connectionId, 'schemas', { name: 'schemas' });
  const count = connection.selectedSchemas?.length ?? 0;
  const label = databaseSchemasSelectedLabel(count);
  const prev = memo?.nodes.get(id);
  if (prev && prev.label === label && prev.icon === 'sliders') {
    return prev;
  }
  const node: ConnectionTreeNode = {
    id,
    label,
    kind: 'schemas',
    icon: 'sliders' as TxIconName,
    draggable: false,
    droppable: false,
    data: { kind: 'schemas', connectionId },
  };
  memo?.nodes.set(id, node);
  return node;
}

function flattenTables(
  bySchema: Readonly<Record<string, readonly DatabaseCatalogTable[]>>,
): readonly DatabaseCatalogTable[] {
  return Object.values(bySchema).flat();
}

function filterTables(
  tables: readonly DatabaseCatalogTable[] | undefined,
  showSystemObjects: boolean,
): DatabaseCatalogTable[] {
  return (tables ?? []).filter((table) => showSystemObjects || !isSystemSchemaName(table.schema));
}

function schemaTableDetailsUnchanged(
  connectionId: string,
  tables: readonly DatabaseCatalogTable[],
  catalog: ConnectionCatalogState,
  memo: ConnectionCatalogBuildMemo,
): boolean {
  for (const table of tables) {
    const kind = table.kind === 'view' ? 'view' : 'table';
    const id = connectionCatalogId(connectionId, kind, {
      schema: table.schema,
      table: table.name,
      name: table.name,
    });
    if (memo.tableDetails.get(id) !== catalog.detailsByTable[catalogTableKey(table.schema, table.name)]) {
      return false;
    }
  }
  return true;
}

function buildTableGroups(
  connectionId: string,
  schema: string,
  tables: readonly DatabaseCatalogTable[],
  catalog: ConnectionCatalogState,
  memo?: ConnectionCatalogBuildMemo,
): ConnectionTreeNode[] {
  const baseTables = tables.filter((table) => table.kind === 'table');
  const views = tables.filter((table) => table.kind === 'view');
  const groups: ConnectionTreeNode[] = [];
  if (baseTables.length > 0) {
    groups.push(groupNode(connectionId, schema, 'tables', 'Tables', baseTables, catalog, 'list', memo));
  }
  if (views.length > 0) {
    groups.push(groupNode(connectionId, schema, 'views', 'Views', views, catalog, 'fileText', memo));
  }
  return groups;
}

function sameChildList(
  previous: readonly ConnectionTreeNode[] | undefined,
  next: readonly ConnectionTreeNode[],
): boolean {
  return (
    !!previous &&
    previous.length === next.length &&
    previous.every((child, index) => child === next[index])
  );
}

function groupNode(
  connectionId: string,
  schema: string,
  group: 'tables' | 'views',
  label: string,
  tables: readonly DatabaseCatalogTable[],
  catalog: ConnectionCatalogState,
  icon: TxIconName,
  memo?: ConnectionCatalogBuildMemo,
): ConnectionTreeNode {
  const id = connectionCatalogId(connectionId, 'group', { schema, group, name: group });
  const children = tables.map((table) => tableNode(connectionId, table, catalog, memo));
  const subtitle = String(tables.length);
  const prev = memo?.nodes.get(id);
  if (prev && prev.subtitle === subtitle && sameChildList(prev.children, children)) {
    return prev;
  }
  const node: ConnectionTreeNode = {
    id,
    label,
    kind: 'group',
    icon,
    subtitle,
    draggable: false,
    droppable: false,
    data: { kind: 'group', connectionId, schema, group },
    children,
  };
  memo?.nodes.set(id, node);
  return node;
}

function tableNode(
  connectionId: string,
  table: DatabaseCatalogTable,
  catalog: ConnectionCatalogState,
  memo?: ConnectionCatalogBuildMemo,
): ConnectionTreeNode {
  const kind = table.kind === 'view' ? 'view' : 'table';
  const id = connectionCatalogId(connectionId, kind, {
    schema: table.schema,
    table: table.name,
    name: table.name,
  });
  const detail = catalog.detailsByTable[catalogTableKey(table.schema, table.name)];
  const prev = memo?.nodes.get(id);
  if (prev && memo?.tableDetails.get(id) === detail) {
    return prev;
  }
  const loadingDetail = !detail || detail.state === 'idle' || detail.state === 'loading';
  const node: ConnectionTreeNode = {
    id,
    label: table.name,
    kind,
    icon: kind === 'view' ? 'fileText' : 'database',
    subtitle: detail?.state === 'loading' ? 'Loading…' : undefined,
    draggable: false,
    droppable: false,
    data: {
      kind,
      connectionId,
      schema: table.schema,
      table: table.name,
    },
    children: loadingDetail ? EMPTY_CATALOG_CHILDREN : tableDetailChildren(connectionId, table, detail),
  };
  memo?.nodes.set(id, node);
  memo?.tableDetails.set(id, detail);
  return node;
}

function tableDetailChildren(
  connectionId: string,
  table: DatabaseCatalogTable,
  detail: ConnectionCatalogTableDetail | undefined,
): ConnectionTreeNode[] {
  if (!detail || detail.state === 'idle' || detail.state === 'loading') {
    return [];
  }
  if (detail.state === 'error') {
    return [statusNode(connectionId, 'Could not load objects', detail.error, table.schema, table.name)];
  }
  return [
    {
      id: connectionCatalogId(connectionId, 'group', {
        schema: table.schema,
        table: table.name,
        group: 'columns',
        name: 'columns',
      }),
      label: 'Columns',
      kind: 'group',
      icon: 'list',
      subtitle: String(detail.columns.length),
      draggable: false,
      droppable: false,
      data: { kind: 'group', connectionId, schema: table.schema, table: table.name, group: 'columns' },
      children: detail.columns.map((column) => ({
        id: connectionCatalogId(connectionId, 'column', {
          schema: table.schema,
          table: table.name,
          name: column.name,
        }),
        label: column.name,
        kind: 'column',
        icon: 'hash',
        subtitle: columnSubtitle(column),
        draggable: false,
        droppable: false,
        data: {
          kind: 'column',
          connectionId,
          schema: table.schema,
          table: table.name,
          name: column.name,
        },
      })),
    },
    {
      id: connectionCatalogId(connectionId, 'group', {
        schema: table.schema,
        table: table.name,
        group: 'indexes',
        name: 'indexes',
      }),
      label: 'Indexes',
      kind: 'group',
      icon: 'layers',
      subtitle: String(detail.indexes.length),
      draggable: false,
      droppable: false,
      data: { kind: 'group', connectionId, schema: table.schema, table: table.name, group: 'indexes' },
      children: detail.indexes.map((index) => ({
        id: connectionCatalogId(connectionId, 'index', {
          schema: table.schema,
          table: table.name,
          name: index.name,
        }),
        label: index.name,
        kind: 'index',
        icon: 'hash',
        subtitle: indexSubtitle(index),
        draggable: false,
        droppable: false,
        data: {
          kind: 'index',
          connectionId,
          schema: table.schema,
          table: table.name,
          name: index.name,
        },
      })),
    },
    {
      id: connectionCatalogId(connectionId, 'group', {
        schema: table.schema,
        table: table.name,
        group: 'foreignKeys',
        name: 'foreignKeys',
      }),
      label: 'Foreign keys',
      kind: 'group',
      icon: 'lock',
      subtitle: String(detail.foreignKeys.length),
      draggable: false,
      droppable: false,
      data: {
        kind: 'group',
        connectionId,
        schema: table.schema,
        table: table.name,
        group: 'foreignKeys',
      },
      children: detail.foreignKeys.map((fk) => ({
        id: connectionCatalogId(connectionId, 'foreignKey', {
          schema: table.schema,
          table: table.name,
          name: fk.name,
        }),
        label: fk.name,
        kind: 'foreignKey',
        icon: 'lock',
        subtitle: `${fk.columns.join(', ')} → ${fk.refTable}`,
        draggable: false,
        droppable: false,
        data: {
          kind: 'foreignKey',
          connectionId,
          schema: table.schema,
          table: table.name,
          name: fk.name,
        },
      })),
    },
  ];
}

function columnSubtitle(column: DatabaseCatalogColumn): string {
  const parts = [column.type];
  if (!column.nullable) {
    parts.push('NOT NULL');
  }
  if (column.primaryKey) {
    parts.push('PK');
  }
  return parts.join(' · ');
}

function indexSubtitle(index: DatabaseCatalogIndex): string {
  const uniq = index.unique ? 'unique' : 'index';
  const cols = index.columns.length ? index.columns.join(', ') : '';
  return cols ? `${uniq} · ${cols}` : uniq;
}

function statusNode(
  connectionId: string,
  label: string,
  subtitle?: string,
  schema = '',
  table = '',
): ConnectionTreeNode {
  return {
    id: connectionCatalogId(connectionId, 'status', { schema, table, name: label }),
    label,
    kind: 'status',
    subtitle,
    draggable: false,
    droppable: false,
    disabled: true,
    data: { kind: 'status', connectionId, schema, table },
  };
}
