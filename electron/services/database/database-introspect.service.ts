import type { DatabaseConnection, DatabaseType } from '../../../shared/config/database-settings.schema';
import {
  mapCatalogColumns,
  mapCatalogForeignKeys,
  mapCatalogIndexes,
  mapCatalogSchemas,
  mapCatalogTables,
  reconstructCreateTableDdl,
  type DatabaseCatalogColumn,
  type DatabaseIntrospectLevel,
  type DatabaseIntrospectResult,
} from '../../../shared/database';
import { quoteSqlIdentifier } from '../../../shared/database/sql-identifier';

import { databaseQueryService } from './database-query.service';

export interface DatabaseIntrospectRequest {
  readonly connection: DatabaseConnection;
  readonly level: DatabaseIntrospectLevel;
  readonly schema?: string;
  readonly table?: string;
}

/**
 * Lazy object-explorer metadata using the same pools as query execution.
 */
export class DatabaseIntrospectService {
  async introspect(request: DatabaseIntrospectRequest): Promise<DatabaseIntrospectResult> {
    const type = request.connection.type;
    if (type === 'redis') {
      if (request.level === 'schemas') {
        return { level: 'schemas', schemas: [] };
      }
      if (request.level === 'tables') {
        return { level: 'tables', tables: [] };
      }
      throw new Error('Redis does not expose a table catalog.');
    }
    switch (request.level) {
      case 'schemas':
        return { level: 'schemas', schemas: mapCatalogSchemas(await this.loadSchemas(request.connection)) };
      case 'tables':
        return {
          level: 'tables',
          tables: mapCatalogTables(await this.loadTables(request.connection, request.schema), request.schema ?? ''),
        };
      case 'columns':
        return {
          level: 'columns',
          columns: mapCatalogColumns(
            await this.loadColumns(request.connection, request.schema ?? '', request.table ?? ''),
          ),
        };
      case 'indexes':
        return {
          level: 'indexes',
          indexes: mapCatalogIndexes(
            await this.loadIndexes(request.connection, request.schema ?? '', request.table ?? ''),
          ),
        };
      case 'foreignKeys':
        return {
          level: 'foreignKeys',
          foreignKeys: mapCatalogForeignKeys(
            await this.loadForeignKeys(request.connection, request.schema ?? '', request.table ?? ''),
          ),
        };
      case 'ddl': {
        const ddl = await this.loadDdl(request.connection, request.schema ?? '', request.table ?? '');
        return { level: 'ddl', ddl };
      }
      default:
        throw new Error('Unsupported introspect level');
    }
  }

  private async loadSchemas(connection: DatabaseConnection): Promise<Record<string, unknown>[]> {
    if (connection.type === 'sqlite') {
      return [{ name: 'main' }];
    }
    if (connection.type === 'postgresql') {
      return this.rows(connection, `SELECT nspname AS name FROM pg_namespace ORDER BY nspname`);
    }
    if (connection.type === 'mysql') {
      return this.rows(connection, `SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME`);
    }
    return this.rows(
      connection,
      `SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME`,
    );
  }

  private async loadTables(
    connection: DatabaseConnection,
    schema: string | undefined,
  ): Promise<Record<string, unknown>[]> {
    if (connection.type === 'sqlite') {
      return this.rows(
        connection,
        `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`,
      );
    }
    if (connection.type === 'postgresql') {
      const schemaFilter = schema
        ? `AND table_schema = ${sqlString(schema)}`
        : `AND table_schema NOT IN ('pg_catalog','information_schema')`;
      return this.rows(
        connection,
        `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') ${schemaFilter} ORDER BY table_schema, table_name`,
      );
    }
    const schemaFilter = schema
      ? `AND TABLE_SCHEMA = ${sqlString(schema)}`
      : '';
    return this.rows(
      connection,
      `SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name, TABLE_TYPE AS table_type FROM information_schema.TABLES WHERE TABLE_TYPE IN ('BASE TABLE','VIEW') ${schemaFilter} ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    );
  }

  private async loadColumns(
    connection: DatabaseConnection,
    schema: string,
    table: string,
  ): Promise<Record<string, unknown>[]> {
    this.requireTable(table);
    if (connection.type === 'sqlite') {
      return this.rows(connection, `PRAGMA table_info(${quoteSqlIdentifier(table, 'sqlite')})`);
    }
    if (connection.type === 'postgresql') {
      return this.rows(
        connection,
        `SELECT c.column_name, c.data_type, c.is_nullable,
          CASE WHEN kcu.column_name IS NULL THEN FALSE ELSE TRUE END AS is_pk
         FROM information_schema.columns c
         LEFT JOIN information_schema.table_constraints tc
           ON tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND tc.constraint_type = 'PRIMARY KEY'
         LEFT JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
           AND kcu.table_name = tc.table_name AND kcu.column_name = c.column_name
         WHERE c.table_schema = ${sqlString(schema || 'public')} AND c.table_name = ${sqlString(table)}
         ORDER BY c.ordinal_position`,
      );
    }
    const schemaSql = sqlString(schema || connection.database || '');
    return this.rows(
      connection,
      `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable, COLUMN_KEY AS column_key
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ${schemaSql} AND TABLE_NAME = ${sqlString(table)}
       ORDER BY ORDINAL_POSITION`,
    );
  }

  private async loadIndexes(
    connection: DatabaseConnection,
    schema: string,
    table: string,
  ): Promise<Record<string, unknown>[]> {
    this.requireTable(table);
    if (connection.type === 'sqlite') {
      const list = await this.rows(connection, `PRAGMA index_list(${quoteSqlIdentifier(table, 'sqlite')})`);
      const out: Record<string, unknown>[] = [];
      for (const item of list) {
        const name = String(item['name'] ?? '');
        if (!name) {
          continue;
        }
        const info = await this.rows(connection, `PRAGMA index_info(${quoteSqlIdentifier(name, 'sqlite')})`);
        for (const col of info) {
          out.push({
            name,
            unique: Number(item['unique']) === 1,
            column_name: col['name'],
          });
        }
      }
      return out;
    }
    if (connection.type === 'postgresql') {
      return this.rows(
        connection,
        `SELECT i.relname AS name, ix.indisunique, a.attname
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
         WHERE n.nspname = ${sqlString(schema || 'public')} AND t.relname = ${sqlString(table)}
         ORDER BY i.relname, k.ord`,
      );
    }
    return this.rows(
      connection,
      `SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique, COLUMN_NAME AS column_name
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ${sqlString(schema || connection.database || '')}
         AND TABLE_NAME = ${sqlString(table)}
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    );
  }

  private async loadForeignKeys(
    connection: DatabaseConnection,
    schema: string,
    table: string,
  ): Promise<Record<string, unknown>[]> {
    this.requireTable(table);
    if (connection.type === 'sqlite') {
      return this.rows(connection, `PRAGMA foreign_key_list(${quoteSqlIdentifier(table, 'sqlite')})`);
    }
    if (connection.type === 'postgresql') {
      return this.rows(
        connection,
        `SELECT con.conname AS name,
                att.attname AS column_name,
                nf.nspname AS ref_schema,
                cf.relname AS ref_table,
                attf.attname AS ref_column
         FROM pg_constraint con
         JOIN pg_class t ON t.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
         JOIN pg_attribute att ON att.attrelid = t.oid AND att.attnum = cols.attnum
         JOIN pg_class cf ON cf.oid = con.confrelid
         JOIN pg_namespace nf ON nf.oid = cf.relnamespace
         JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fcols(attnum, ord) ON fcols.ord = cols.ord
         JOIN pg_attribute attf ON attf.attrelid = cf.oid AND attf.attnum = fcols.attnum
         WHERE con.contype = 'f' AND n.nspname = ${sqlString(schema || 'public')} AND t.relname = ${sqlString(table)}
         ORDER BY con.conname, cols.ord`,
      );
    }
    return this.rows(
      connection,
      `SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS column_name,
              REFERENCED_TABLE_SCHEMA AS ref_schema, REFERENCED_TABLE_NAME AS ref_table,
              REFERENCED_COLUMN_NAME AS ref_column
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ${sqlString(schema || connection.database || '')}
         AND TABLE_NAME = ${sqlString(table)}
         AND REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
    );
  }

  private async loadDdl(connection: DatabaseConnection, schema: string, table: string): Promise<string> {
    this.requireTable(table);
    if (connection.type === 'sqlite') {
      const rows = await this.rows(
        connection,
        `SELECT sql FROM sqlite_master WHERE name = ${sqlString(table)} AND sql IS NOT NULL LIMIT 1`,
      );
      const sql = String(rows[0]?.['sql'] ?? '').trim();
      if (sql) {
        return sql.endsWith(';') ? sql : `${sql};`;
      }
    }
    if (connection.type === 'mysql') {
      const rows = await this.rows(
        connection,
        `SHOW CREATE TABLE ${qualify(connection.type, schema, table)}`,
      );
      const sql = String(rows[0]?.['Create Table'] ?? rows[0]?.['Create View'] ?? '').trim();
      if (sql) {
        return sql.endsWith(';') ? sql : `${sql};`;
      }
    }
    const columns = mapCatalogColumns(await this.loadColumns(connection, schema, table));
    return reconstructCreateTableDdl(schema, table, columns as DatabaseCatalogColumn[], connection.type);
  }

  private async rows(connection: DatabaseConnection, sql: string): Promise<Record<string, unknown>[]> {
    const result = await databaseQueryService.query(connection, sql);
    const raw = result.rows;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
  }

  private requireTable(table: string): void {
    if (!table.trim()) {
      throw new Error('Table name is required');
    }
  }
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function qualify(type: DatabaseType, schema: string, table: string): string {
  const quotedTable = quoteSqlIdentifier(table, type);
  if (!schema.trim() || type === 'sqlite') {
    return quotedTable;
  }
  return `${quoteSqlIdentifier(schema, type)}.${quotedTable}`;
}

/** Shared singleton for the app session. */
export const databaseIntrospectService = new DatabaseIntrospectService();
