export const CONNECTION_CATALOG_SEP = '::tx::';

export type ConnectionCatalogNodeKind =
  | 'schema'
  | 'group'
  | 'table'
  | 'view'
  | 'column'
  | 'index'
  | 'foreignKey'
  | 'status'
  | 'keys';

export interface ParsedConnectionCatalogId {
  readonly connectionId: string;
  readonly kind: ConnectionCatalogNodeKind;
  readonly schema: string;
  readonly table: string;
  readonly name: string;
  readonly group?: 'tables' | 'views' | 'columns' | 'indexes' | 'foreignKeys';
}

/**
 * Encodes a live catalog node id that will not collide with persisted connection ids.
 */
export function connectionCatalogId(
  connectionId: string,
  kind: ConnectionCatalogNodeKind,
  parts: {
    readonly schema?: string;
    readonly table?: string;
    readonly name?: string;
    readonly group?: ParsedConnectionCatalogId['group'];
  } = {},
): string {
  return [connectionId, kind, parts.schema ?? '', parts.table ?? '', parts.name ?? '', parts.group ?? ''].join(
    CONNECTION_CATALOG_SEP,
  );
}

/** Parses a live catalog node id, or `null` when the id is a persisted folder/connection. */
export function parseConnectionCatalogId(id: string): ParsedConnectionCatalogId | null {
  if (!id.includes(CONNECTION_CATALOG_SEP)) {
    return null;
  }
  const [connectionId, kind, schema, table, name, group] = id.split(CONNECTION_CATALOG_SEP);
  if (!connectionId || !kind) {
    return null;
  }
  return {
    connectionId,
    kind: kind as ConnectionCatalogNodeKind,
    schema: schema ?? '',
    table: table ?? '',
    name: name ?? '',
    group: (group || undefined) as ParsedConnectionCatalogId['group'],
  };
}
