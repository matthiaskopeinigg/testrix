import type { DatabaseType } from '@shared/config';
import type { DatabaseCatalogColumn, DatabaseCatalogIndex, DatabaseCatalogTable } from '@shared/database';
import { isSystemSchemaName } from '@shared/database';

import type {
  ConnectionCatalogState,
  ConnectionCatalogTableDetail,
} from '@app/core/database/database-catalog.types';
import { catalogTableKey } from '@app/core/database/database-catalog.types';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import { connectionCatalogId } from './connection-catalog.ids';
import type { ConnectionTreeNode } from './connection-tree.types';

export type { ConnectionCatalogState, ConnectionCatalogTableDetail } from '@app/core/database/database-catalog.types';


/**
 * Builds live object-explorer children under a connection row.
 */
export function buildConnectionCatalogChildren(
  connectionId: string,
  type: DatabaseType | undefined,
  catalog: ConnectionCatalogState | undefined,
  showSystemObjects: boolean,
): ConnectionTreeNode[] {
  if (type === 'redis') {
    return [
      {
        id: connectionCatalogId(connectionId, 'keys', { name: 'keys' }),
        label: 'Keys',
        kind: 'keys',
        icon: 'hash',
        subtitle: 'Use Redis commands in a query tab',
        draggable: false,
        droppable: false,
        data: { kind: 'keys', connectionId },
      },
    ];
  }
  if (!catalog || catalog.state === 'idle' || catalog.state === 'loading') {
    return [];
  }
  if (catalog.state === 'error') {
    return [statusNode(connectionId, 'Could not load objects', catalog.error)];
  }
  if (type === 'sqlite') {
    const tables = filterTables(catalog.tablesBySchema['main'] ?? flattenTables(catalog.tablesBySchema), true);
    return buildTableGroups(connectionId, 'main', tables, catalog);
  }
  const schemas = catalog.schemas.filter((schema) => showSystemObjects || !schema.system);
  if (schemas.length === 0) {
    return [statusNode(connectionId, 'No schemas')];
  }
  return schemas.map((schema) => {
    const schemaTables = catalog.tablesBySchema[schema.name];
    const tables = filterTables(schemaTables, showSystemObjects);
    const loadingSchema = schemaTables === undefined;
    return {
      id: connectionCatalogId(connectionId, 'schema', { schema: schema.name, name: schema.name }),
      label: schema.name,
      kind: 'schema',
      icon: 'layers' as TxIconName,
      subtitle: schema.system ? 'System' : undefined,
      draggable: false,
      droppable: false,
      data: { kind: 'schema', connectionId, schema: schema.name },
      children: loadingSchema
        ? [statusNode(connectionId, 'Loading tables…', undefined, schema.name)]
        : buildTableGroups(connectionId, schema.name, tables, catalog),
    };
  });
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

function buildTableGroups(
  connectionId: string,
  schema: string,
  tables: readonly DatabaseCatalogTable[],
  catalog: ConnectionCatalogState,
): ConnectionTreeNode[] {
  const baseTables = tables.filter((table) => table.kind === 'table');
  const views = tables.filter((table) => table.kind === 'view');
  const groups: ConnectionTreeNode[] = [];
  if (baseTables.length > 0) {
    groups.push(groupNode(connectionId, schema, 'tables', 'Tables', baseTables, catalog, 'list'));
  }
  if (views.length > 0) {
    groups.push(groupNode(connectionId, schema, 'views', 'Views', views, catalog, 'fileText'));
  }
  return groups;
}

function groupNode(
  connectionId: string,
  schema: string,
  group: 'tables' | 'views',
  label: string,
  tables: readonly DatabaseCatalogTable[],
  catalog: ConnectionCatalogState,
  icon: TxIconName,
): ConnectionTreeNode {
  return {
    id: connectionCatalogId(connectionId, 'group', { schema, group, name: group }),
    label,
    kind: 'group',
    icon,
    subtitle: String(tables.length),
    draggable: false,
    droppable: false,
    data: { kind: 'group', connectionId, schema, group },
    children: tables.map((table) => tableNode(connectionId, table, catalog)),
  };
}

function tableNode(
  connectionId: string,
  table: DatabaseCatalogTable,
  catalog: ConnectionCatalogState,
): ConnectionTreeNode {
  const kind = table.kind === 'view' ? 'view' : 'table';
  const detail = catalog.detailsByTable[catalogTableKey(table.schema, table.name)];
  const loadingDetail = !detail || detail.state === 'idle' || detail.state === 'loading';
  return {
    id: connectionCatalogId(connectionId, kind, {
      schema: table.schema,
      table: table.name,
      name: table.name,
    }),
    label: table.name,
    kind,
    icon: kind === 'view' ? 'fileText' : 'database',
    subtitle: loadingDetail
      ? 'Loading…'
      : detail.state === 'ready'
        ? String(detail.columns.length)
        : undefined,
    draggable: false,
    droppable: false,
    data: {
      kind,
      connectionId,
      schema: table.schema,
      table: table.name,
    },
    children: loadingDetail ? [] : tableDetailChildren(connectionId, table, detail),
  };
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
