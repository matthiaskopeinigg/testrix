import type { DatabaseType } from '../config/database-settings.schema';

import { databaseEngineFamily } from './database-engine';

const UNQUOTED = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Quotes a SQL identifier for the given engine when it is not a plain name.
 */
export function quoteSqlIdentifier(name: string, type: DatabaseType | null | undefined): string {
  const family = databaseEngineFamily(type);
  if (UNQUOTED.test(name) && family !== 'mssql') {
    return name;
  }
  if (family === 'mysql' || family === 'clickhouse') {
    return `\`${name.replace(/`/g, '``')}\``;
  }
  if (family === 'mssql') {
    return `[${name.replace(/]/g, ']]')}]`;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Builds `schema.table` (or just `table` when the schema is empty / default).
 */
export function qualifySqlTableName(
  schema: string | null | undefined,
  table: string,
  type: DatabaseType | null | undefined,
): string {
  const quotedTable = quoteSqlIdentifier(table, type);
  const trimmedSchema = schema?.trim() ?? '';
  if (!trimmedSchema || trimmedSchema === 'main' || databaseEngineFamily(type) === 'sqlite') {
    return quotedTable;
  }
  return `${quoteSqlIdentifier(trimmedSchema, type)}.${quotedTable}`;
}

/**
 * True when a schema/name should stay hidden unless the user opts into system objects.
 */
export function isSystemSchemaName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === 'information_schema' ||
    n === 'pg_catalog' ||
    n.startsWith('pg_toast') ||
    n.startsWith('pg_temp') ||
    n === 'crdb_internal' ||
    n === 'mysql' ||
    n === 'performance_schema' ||
    n === 'sys' ||
    n === 'sysdiag' ||
    n === 'guest' ||
    n === 'system' ||
    n === 'sysaux' ||
    n === 'outln' ||
    n === 'xdb' ||
    n === 'dbsnmp' ||
    n === 'appqossys' ||
    n === 'ctxsys' ||
    n === 'mdsys' ||
    n === 'ordsys' ||
    n === 'wmsys' ||
    n === 'apex_public_user' ||
    n === 'ggsys' ||
    n === 'auidsys' ||
    n === 'local' ||
    n === 'config' ||
    n === 'admin' ||
    n === 'INFORMATION_SCHEMA'.toLowerCase()
  );
}
