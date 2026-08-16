import { Injectable, inject, signal } from '@angular/core';

import type { DatabaseConnection } from '@shared/config';
import type {
  DatabaseCatalogColumn,
  DatabaseCatalogSchemaItem,
  DatabaseCatalogTable,
  DatabaseCatalogCompletionSource,
} from '@shared/database';
import {
  formatDatabaseConnectionError,
  completionSchemaNames,
  seedCatalogSchemaItems,
} from '@shared/database';

import { ElectronService } from '@app/core/electron/electron.service';

import {
  catalogTableKey,
  emptyConnectionCatalogState,
  type ConnectionCatalogState,
  type ConnectionCatalogTableDetail,
} from './database-catalog.types';

/** Hard caps so autocomplete stays cheap even after a large schema load. */
const MAX_COMPLETION_SCHEMAS = 128;
const MAX_COMPLETION_TABLES = 64;
const MAX_COMPLETION_COLUMN_TABLES = 16;
const MAX_COMPLETION_COLUMNS_PER_TABLE = 48;

/**
 * In-memory live catalog for Database sidebar object explorer (not written to settings.json).
 */
@Injectable({ providedIn: 'root' })
export class DatabaseCatalogService {
  private readonly electron = inject(ElectronService);
  private readonly catalogs = signal<Readonly<Record<string, ConnectionCatalogState>>>({});
  private readonly version = signal(0);
  private readonly inflight = new Map<string, Promise<void>>();

  readonly revision = this.version.asReadonly();

  snapshot(connectionId: string): ConnectionCatalogState | undefined {
    void this.revision();
    return this.catalogs()[connectionId];
  }

  /**
   * Catalog slice for SQL autocomplete. Only selected schemas — never the
   * full schema directory (Oracle `all_users` can be 200+ and freezes the editor).
   * Tables/columns are hard-capped so a loaded schema with thousands of objects stays cheap.
   *
   * @param connectionId Connection id.
   * @param connection Profile used to resolve which schemas may appear in suggestions.
   */
  completionSource(
    connectionId: string,
    connection?: Pick<
      DatabaseConnection,
      'type' | 'user' | 'database' | 'selectedSchemas'
    > | null,
  ): DatabaseCatalogCompletionSource | null {
    const catalog = this.snapshot(connectionId);
    if (!catalog) {
      return null;
    }

    const allowedNames = connection
      ? completionSchemaNames(connection)
      : catalog.schemaDirectory === 'full'
        ? []
        : catalog.schemas.map((schema) => schema.name);
    const allowed = new Set(allowedNames.map((name) => name.toLowerCase()));

    // Prefer catalog rows that match the selection; fall back to seed names.
    const fromCatalog = catalog.schemas.filter((schema) => allowed.has(schema.name.toLowerCase()));
    const seed = connection ? seedCatalogSchemaItems(connection) : [];
    const schemasRaw =
      fromCatalog.length > 0
        ? fromCatalog
        : seed.filter((schema) => allowed.size === 0 || allowed.has(schema.name.toLowerCase()));
    const schemas = schemasRaw.slice(0, MAX_COMPLETION_SCHEMAS);

    const tables: DatabaseCatalogTable[] = [];
    for (const [schema, schemaTables] of Object.entries(catalog.tablesBySchema)) {
      if (allowed.size > 0 && !allowed.has(schema.toLowerCase())) {
        continue;
      }
      for (const table of schemaTables) {
        tables.push(table);
        if (tables.length >= MAX_COMPLETION_TABLES) {
          break;
        }
      }
      if (tables.length >= MAX_COMPLETION_TABLES) {
        break;
      }
    }

    const columnsByTable: Record<string, readonly DatabaseCatalogColumn[]> = {};
    let columnTables = 0;
    for (const [key, detail] of Object.entries(catalog.detailsByTable)) {
      const schemaPart = key.includes('.') ? key.slice(0, key.indexOf('.')) : key;
      if (allowed.size > 0 && !allowed.has(schemaPart.toLowerCase())) {
        continue;
      }
      columnsByTable[key] = detail.columns.slice(0, MAX_COMPLETION_COLUMNS_PER_TABLE);
      columnTables += 1;
      if (columnTables >= MAX_COMPLETION_COLUMN_TABLES) {
        break;
      }
    }

    return {
      schemas,
      tables,
      columnsByTable,
    };
  }

  clear(connectionId: string): void {
    const next = { ...this.catalogs() };
    delete next[connectionId];
    this.catalogs.set(next);
    this.version.update((value) => value + 1);
  }

  async openConnection(connection: DatabaseConnection): Promise<void> {
    const state = this.snapshot(connection.id)?.state;
    if (state === 'ready' || state === 'error') {
      return;
    }
    await this.refreshConnection(connection);
  }

  /**
   * Opens the catalog with only selected schemas (no full schema directory query).
   */
  async refreshConnection(connection: DatabaseConnection): Promise<void> {
    await this.enqueue(`root:${connection.id}`, async () => {
      this.patch(connection.id, {
        ...emptyConnectionCatalogState(),
        state: 'loading',
      });
      try {
        if (connection.type === 'redis') {
          this.patch(connection.id, { ...emptyConnectionCatalogState(), state: 'ready' });
          return;
        }
        const api = this.api();
        if (connection.type === 'sqlite') {
          const tables = await api.introspect({ connection, level: 'tables' });
          this.patch(connection.id, {
            state: 'ready',
            schemaDirectory: 'full',
            schemas: [{ name: 'main', system: false }],
            tablesBySchema: { main: tables.level === 'tables' ? tables.tables : [] },
            detailsByTable: {},
          });
          return;
        }
        // Avoid SELECT all_users / every namespace on open — that freezes large Oracle DBs.
        this.patch(connection.id, {
          state: 'ready',
          schemaDirectory: 'seed',
          schemas: seedCatalogSchemaItems(connection),
          tablesBySchema: {},
          detailsByTable: {},
        });
      } catch (error) {
        this.patch(connection.id, {
          ...emptyConnectionCatalogState(),
          state: 'error',
          error: formatDatabaseConnectionError(error),
        });
      }
    });
  }

  /**
   * Loads every schema/database name for the Schemas… picker.
   * Safe to call repeatedly; no-ops when the full directory is already cached.
   */
  async ensureFullSchemaDirectory(connection: DatabaseConnection): Promise<void> {
    await this.openConnection(connection);
    const current = this.snapshot(connection.id);
    if (!current || current.state !== 'ready' || current.schemaDirectory === 'full') {
      return;
    }
    if (connection.type === 'sqlite' || connection.type === 'redis') {
      return;
    }
    await this.enqueue(`schemas:${connection.id}`, async () => {
      const latest = this.snapshot(connection.id);
      if (!latest || latest.state !== 'ready' || latest.schemaDirectory === 'full') {
        return;
      }
      try {
        const schemasResult = await this.api().introspect({ connection, level: 'schemas' });
        const schemas: readonly DatabaseCatalogSchemaItem[] =
          schemasResult.level === 'schemas' ? schemasResult.schemas : [];
        this.patch(connection.id, {
          ...latest,
          schemaDirectory: 'full',
          schemas,
        });
      } catch (error) {
        this.patch(connection.id, {
          ...latest,
          state: 'error',
          error: formatDatabaseConnectionError(error),
        });
      }
    });
  }

  async loadSchema(connection: DatabaseConnection, schema: string): Promise<void> {
    await this.openConnection(connection);
    const current = this.snapshot(connection.id);
    if (!current || current.state !== 'ready' || current.tablesBySchema[schema]) {
      return;
    }
    await this.enqueue(`schema:${connection.id}:${schema}`, async () => {
      if (this.snapshot(connection.id)?.tablesBySchema[schema]) {
        return;
      }
      try {
        const result = await this.api().introspect({ connection, level: 'tables', schema });
        const tables: readonly DatabaseCatalogTable[] = result.level === 'tables' ? result.tables : [];
        const latest = this.snapshot(connection.id) ?? emptyConnectionCatalogState();
        this.patch(connection.id, {
          ...latest,
          state: 'ready',
          tablesBySchema: {
            ...latest.tablesBySchema,
            [schema]: tables,
          },
        });
      } catch (error) {
        this.patch(connection.id, {
          ...(this.snapshot(connection.id) ?? emptyConnectionCatalogState()),
          state: 'error',
          error: formatDatabaseConnectionError(error),
        });
      }
    });
  }

  async loadTable(connection: DatabaseConnection, schema: string, table: string): Promise<void> {
    const key = catalogTableKey(schema, table);
    const inflightKey = `table:${connection.id}:${key}`;
    if (this.snapshot(connection.id)?.detailsByTable[key]?.state === 'ready') {
      return;
    }
    await this.enqueue(inflightKey, async () => {
      if (this.snapshot(connection.id)?.detailsByTable[key]?.state === 'ready') {
        return;
      }
      this.patchTable(connection.id, key, { columns: [], indexes: [], foreignKeys: [], state: 'loading' });
      try {
        const api = this.api();
        const [columnsResult, indexesResult, fkResult] = await Promise.all([
          api.introspect({ connection, level: 'columns', schema, table }),
          api.introspect({ connection, level: 'indexes', schema, table }),
          api.introspect({ connection, level: 'foreignKeys', schema, table }),
        ]);
        this.patchTable(connection.id, key, {
          state: 'ready',
          columns: columnsResult.level === 'columns' ? columnsResult.columns : [],
          indexes: indexesResult.level === 'indexes' ? indexesResult.indexes : [],
          foreignKeys: fkResult.level === 'foreignKeys' ? fkResult.foreignKeys : [],
        });
      } catch (error) {
        this.patchTable(connection.id, key, {
          columns: [],
          indexes: [],
          foreignKeys: [],
          state: 'error',
          error: formatDatabaseConnectionError(error),
        });
      }
    });
  }

  async loadDdl(connection: DatabaseConnection, schema: string, table: string): Promise<string> {
    const result = await this.api().introspect({ connection, level: 'ddl', schema, table });
    return result.level === 'ddl' ? result.ddl : '';
  }

  private enqueue(key: string, work: () => Promise<void>): Promise<void> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const promise = work().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private api() {
    const api = this.electron.bridge()?.database;
    if (!api?.introspect) {
      throw new Error('Database catalog is unavailable.');
    }
    return api;
  }

  private patch(connectionId: string, next: ConnectionCatalogState): void {
    this.catalogs.update((current) => ({ ...current, [connectionId]: next }));
    this.version.update((value) => value + 1);
  }

  private patchTable(connectionId: string, key: string, detail: ConnectionCatalogTableDetail): void {
    const current = this.snapshot(connectionId) ?? emptyConnectionCatalogState();
    this.patch(connectionId, {
      ...current,
      detailsByTable: { ...current.detailsByTable, [key]: detail },
    });
  }
}
