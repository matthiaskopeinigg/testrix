import type { DatabaseType } from '../config/database-settings.schema';

/**
 * Prefixes a statement with the engine EXPLAIN form. Redis is unsupported.
 */
export function wrapSqlExplain(
  query: string,
  type: DatabaseType | null | undefined,
): string | null {
  if (!type || type === 'redis' || type === 'mssql') {
    return null;
  }
  const trimmed = query.trim().replace(/;+\s*$/g, '');
  if (!trimmed) {
    return null;
  }
  if (type === 'sqlite') {
    return `EXPLAIN QUERY PLAN ${trimmed}`;
  }
  return `EXPLAIN ${trimmed}`;
}

/** True when the Data console can run Explain for this engine. */
export function canExplainSql(type: DatabaseType | null | undefined): boolean {
  return type === 'postgresql' || type === 'mysql' || type === 'sqlite';
}
