import type {
  DatabaseCatalogColumn,
  DatabaseCatalogForeignKey,
  DatabaseCatalogIndex,
  DatabaseCatalogSchemaItem,
  DatabaseCatalogTable,
} from '@shared/database';

export type CatalogLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ConnectionCatalogTableDetail {
  readonly columns: readonly DatabaseCatalogColumn[];
  readonly indexes: readonly DatabaseCatalogIndex[];
  readonly foreignKeys: readonly DatabaseCatalogForeignKey[];
  readonly ddl?: string;
  readonly state: CatalogLoadState;
  readonly error?: string;
}

export interface ConnectionCatalogState {
  readonly state: CatalogLoadState;
  readonly error?: string;
  readonly schemas: readonly DatabaseCatalogSchemaItem[];
  readonly tablesBySchema: Readonly<Record<string, readonly DatabaseCatalogTable[]>>;
  readonly detailsByTable: Readonly<Record<string, ConnectionCatalogTableDetail>>;
}

export function emptyConnectionCatalogState(): ConnectionCatalogState {
  return {
    state: 'idle',
    schemas: [],
    tablesBySchema: {},
    detailsByTable: {},
  };
}

export function catalogTableKey(schema: string, table: string): string {
  return `${schema || 'main'}.${table}`;
}
