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
  /**
   * `seed` = only selected/default schemas (fast open).
   * `full` = complete directory from the database (Schemas… picker).
   */
  readonly schemaDirectory: 'seed' | 'full';
  readonly schemas: readonly DatabaseCatalogSchemaItem[];
  readonly tablesBySchema: Readonly<Record<string, readonly DatabaseCatalogTable[]>>;
  readonly detailsByTable: Readonly<Record<string, ConnectionCatalogTableDetail>>;
}

export function emptyConnectionCatalogState(): ConnectionCatalogState {
  return {
    state: 'idle',
    schemaDirectory: 'seed',
    schemas: [],
    tablesBySchema: {},
    detailsByTable: {},
  };
}

export function catalogTableKey(schema: string, table: string): string {
  return `${schema || 'main'}.${table}`;
}
