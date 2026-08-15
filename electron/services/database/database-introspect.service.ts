import type { DatabaseConnection, DatabaseType } from '../../../shared/config/database-settings.schema';
import {
  databaseEngineFamily,
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
    const family = databaseEngineFamily(type);
    if (family === 'redis') {
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
    const family = databaseEngineFamily(connection.type);
    if (family === 'sqlite') {
      return [{ name: 'main' }];
    }
    if (family === 'postgresql') {
      return this.rows(connection, `SELECT nspname AS name FROM pg_namespace ORDER BY nspname`);
    }
    if (family === 'mysql') {
      return this.rows(connection, `SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME`);
    }
    if (family === 'oracle') {
      return this.rows(
        connection,
        `SELECT username AS name FROM all_users
         UNION
         SELECT USER AS name FROM dual
         ORDER BY 1`,
      );
    }
    if (family === 'clickhouse') {
      return this.rows(connection, `SELECT name FROM system.databases ORDER BY name`);
    }
    if (family === 'mongodb') {
      return this.rows(connection, 'show dbs');
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
    const family = databaseEngineFamily(connection.type);
    if (family === 'sqlite') {
      return this.rows(
        connection,
        `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`,
      );
    }
    if (family === 'postgresql') {
      const schemaFilter = schema
        ? `AND table_schema = ${sqlString(schema)}`
        : `AND table_schema NOT IN ('pg_catalog','information_schema')`;
      return this.rows(
        connection,
        `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE','VIEW') ${schemaFilter} ORDER BY table_schema, table_name`,
      );
    }
    if (family === 'oracle') {
      const owner = sqlString((schema || connection.user || '').toUpperCase());
      return this.rows(
        connection,
        `SELECT owner AS table_schema, table_name, 'BASE TABLE' AS table_type FROM all_tables WHERE owner = ${owner}
         UNION ALL
         SELECT owner AS table_schema, view_name AS table_name, 'VIEW' AS table_type FROM all_views WHERE owner = ${owner}
         ORDER BY table_name`,
      );
    }
    if (family === 'clickhouse') {
      const schemaFilter = schema ? `AND database = ${sqlString(schema)}` : '';
      return this.rows(
        connection,
        `SELECT database AS table_schema, name AS table_name, engine AS table_type FROM system.tables WHERE is_temporary = 0 ${schemaFilter} ORDER BY database, name`,
      );
    }
    if (family === 'mongodb') {
      const namesQuery = schema
        ? `db.getSiblingDB(${JSON.stringify(schema)}).getCollectionNames()`
        : 'show collections';
      const rows = await this.rows(connection, namesQuery);
      return rows.map((row) => ({
        table_schema: schema || connection.database || '',
        table_name: row['name'] ?? row['table_name'],
        table_type: 'BASE TABLE',
      }));
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
    const family = databaseEngineFamily(connection.type);
    if (family === 'sqlite') {
      return this.rows(connection, `PRAGMA table_info(${quoteSqlIdentifier(table, 'sqlite')})`);
    }
    if (family === 'postgresql') {
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
    if (family === 'oracle') {
      const owner = sqlString((schema || connection.user || '').toUpperCase());
      const tableName = sqlString(table.toUpperCase());
      return this.rows(
        connection,
        `SELECT c.column_name, c.data_type,
                CASE WHEN c.nullable = 'Y' THEN 'YES' ELSE 'NO' END AS is_nullable,
                CASE WHEN pk.column_name IS NULL THEN 0 ELSE 1 END AS is_pk
         FROM all_tab_columns c
         LEFT JOIN (
           SELECT acc.column_name
           FROM all_constraints ac
           JOIN all_cons_columns acc
             ON ac.owner = acc.owner AND ac.constraint_name = acc.constraint_name
           WHERE ac.constraint_type = 'P' AND ac.owner = ${owner} AND ac.table_name = ${tableName}
         ) pk ON pk.column_name = c.column_name
         WHERE c.owner = ${owner} AND c.table_name = ${tableName}
         ORDER BY c.column_id`,
      );
    }
    if (family === 'clickhouse') {
      return this.rows(
        connection,
        `SELECT name AS column_name, type AS data_type, 'YES' AS is_nullable,
                0 AS is_pk
         FROM system.columns
         WHERE database = ${sqlString(schema || connection.database || 'default')}
           AND table = ${sqlString(table)}
         ORDER BY position`,
      );
    }
    if (family === 'mongodb') {
      return this.loadMongoColumns(connection, schema, table);
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

  private async loadMongoColumns(
    connection: DatabaseConnection,
    schema: string,
    table: string,
  ): Promise<Record<string, unknown>[]> {
    const dbExpr = schema.trim() ? `db.getSiblingDB(${JSON.stringify(schema)})` : 'db';
    const docs = await this.rows(
      connection,
      `${dbExpr}.getCollection(${JSON.stringify(table)}).find({}).limit(20)`,
    );
    const types = new Map<string, string>();
    for (const doc of docs) {
      for (const [key, value] of Object.entries(doc)) {
        if (!types.has(key)) {
          types.set(key, mongoJsType(value));
        }
      }
    }
    return [...types.entries()].map(([name, dataType]) => ({
      column_name: name,
      data_type: dataType,
      is_nullable: name === '_id' ? 'NO' : 'YES',
      is_pk: name === '_id' ? 1 : 0,
    }));
  }

  private async loadIndexes(
    connection: DatabaseConnection,
    schema: string,
    table: string,
  ): Promise<Record<string, unknown>[]> {
    this.requireTable(table);
    const family = databaseEngineFamily(connection.type);
    if (family === 'sqlite') {
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
    if (family === 'postgresql') {
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
    if (family === 'oracle') {
      const owner = sqlString((schema || connection.user || '').toUpperCase());
      const tableName = sqlString(table.toUpperCase());
      return this.rows(
        connection,
        `SELECT i.index_name AS name,
                CASE WHEN i.uniqueness = 'UNIQUE' THEN 1 ELSE 0 END AS indisunique,
                ic.column_name
         FROM all_indexes i
         JOIN all_ind_columns ic
           ON i.owner = ic.index_owner AND i.index_name = ic.index_name
         WHERE i.table_owner = ${owner} AND i.table_name = ${tableName}
         ORDER BY i.index_name, ic.column_position`,
      );
    }
    if (family === 'clickhouse') {
      return this.rows(
        connection,
        `SELECT name, type AS column_name, 0 AS unique
         FROM system.data_skipping_indices
         WHERE database = ${sqlString(schema || connection.database || 'default')}
           AND table = ${sqlString(table)}
         ORDER BY name`,
      );
    }
    if (family === 'mongodb') {
      const dbExpr = schema.trim() ? `db.getSiblingDB(${JSON.stringify(schema)})` : 'db';
      const rows = await this.rows(
        connection,
        `${dbExpr}.getCollection(${JSON.stringify(table)}).getIndexes()`,
      );
      const out: Record<string, unknown>[] = [];
      for (const row of rows) {
        const name = String(row['name'] ?? '');
        const key = row['key'];
        const columns =
          key && typeof key === 'object' && !Array.isArray(key) ? Object.keys(key as object) : [];
        for (const column of columns) {
          out.push({
            name,
            unique: Boolean(row['unique']),
            column_name: column,
          });
        }
      }
      return out;
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
    const family = databaseEngineFamily(connection.type);
    if (family === 'sqlite') {
      return this.rows(connection, `PRAGMA foreign_key_list(${quoteSqlIdentifier(table, 'sqlite')})`);
    }
    if (family === 'postgresql') {
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
    if (family === 'oracle') {
      const owner = sqlString((schema || connection.user || '').toUpperCase());
      const tableName = sqlString(table.toUpperCase());
      return this.rows(
        connection,
        `SELECT c.constraint_name AS name, cc.column_name,
                r.owner AS ref_schema, r.table_name AS ref_table, rc.column_name AS ref_column
         FROM all_constraints c
         JOIN all_cons_columns cc
           ON c.owner = cc.owner AND c.constraint_name = cc.constraint_name
         JOIN all_constraints r
           ON c.r_owner = r.owner AND c.r_constraint_name = r.constraint_name
         JOIN all_cons_columns rc
           ON r.owner = rc.owner AND r.constraint_name = rc.constraint_name AND cc.position = rc.position
         WHERE c.constraint_type = 'R' AND c.owner = ${owner} AND c.table_name = ${tableName}
         ORDER BY c.constraint_name, cc.position`,
      );
    }
    if (family === 'clickhouse' || family === 'mongodb') {
      return [];
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
    const family = databaseEngineFamily(connection.type);
    if (family === 'sqlite') {
      const rows = await this.rows(
        connection,
        `SELECT sql FROM sqlite_master WHERE name = ${sqlString(table)} AND sql IS NOT NULL LIMIT 1`,
      );
      const sql = String(rows[0]?.['sql'] ?? '').trim();
      if (sql) {
        return sql.endsWith(';') ? sql : `${sql};`;
      }
    }
    if (family === 'mysql') {
      const rows = await this.rows(
        connection,
        `SHOW CREATE TABLE ${qualify(connection.type, schema, table)}`,
      );
      const sql = String(rows[0]?.['Create Table'] ?? rows[0]?.['Create View'] ?? '').trim();
      if (sql) {
        return sql.endsWith(';') ? sql : `${sql};`;
      }
    }
    if (family === 'clickhouse') {
      const rows = await this.rows(
        connection,
        `SHOW CREATE TABLE ${qualify(connection.type, schema, table)}`,
      );
      const sql = String(rows[0]?.['statement'] ?? rows[0]?.['create_table_query'] ?? Object.values(rows[0] ?? {})[0] ?? '').trim();
      if (sql) {
        return sql.endsWith(';') ? sql : `${sql};`;
      }
    }
    if (family === 'mongodb') {
      return '';
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
  if (!schema.trim() || databaseEngineFamily(type) === 'sqlite') {
    return quotedTable;
  }
  return `${quoteSqlIdentifier(schema, type)}.${quotedTable}`;
}

function mongoJsType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value instanceof Date) {
    return 'date';
  }
  return typeof value;
}

/** Shared singleton for the app session. */
export const databaseIntrospectService = new DatabaseIntrospectService();
