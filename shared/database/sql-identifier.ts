import type { DatabaseType } from '../config/database-settings.schema';

const UNQUOTED = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Quotes a SQL identifier for the given engine when it is not a plain name.
 */
export function quoteSqlIdentifier(name: string, type: DatabaseType | null | undefined): string {
  if (UNQUOTED.test(name) && type !== 'mssql') {
    return name;
  }
  if (type === 'mysql') {
    return `\`${name.replace(/`/g, '``')}\``;
  }
  if (type === 'mssql') {
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
  if (!trimmedSchema || trimmedSchema === 'main' || type === 'sqlite') {
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
    n === 'mysql' ||
    n === 'performance_schema' ||
    n === 'sys' ||
    n === 'sysdiag' ||
    n === 'guest' ||
    n === 'INFORMATION_SCHEMA'.toLowerCase()
  );
}
