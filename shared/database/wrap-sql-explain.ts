import type { DatabaseType } from '../config/database-settings.schema';

import { databaseEngineFamily } from './database-engine';

/**
 * Prefixes a statement with the engine EXPLAIN form. Redis, MongoDB, Oracle, and SQL Server are unsupported.
 */
export function wrapSqlExplain(
  query: string,
  type: DatabaseType | null | undefined,
): string | null {
  const family = databaseEngineFamily(type);
  if (!family || family === 'redis' || family === 'mongodb' || family === 'mssql' || family === 'oracle') {
    return null;
  }
  const trimmed = query.trim().replace(/;+\s*$/g, '');
  if (!trimmed) {
    return null;
  }
  if (family === 'sqlite') {
    return `EXPLAIN QUERY PLAN ${trimmed}`;
  }
  return `EXPLAIN ${trimmed}`;
}

/** True when the Data console can run Explain for this engine. */
export function canExplainSql(type: DatabaseType | null | undefined): boolean {
  const family = databaseEngineFamily(type);
  return family === 'postgresql' || family === 'mysql' || family === 'sqlite' || family === 'clickhouse';
}
