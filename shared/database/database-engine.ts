import type { DatabaseType } from '../config/database-settings.schema';

/**
 * Driver family used for quoting, catalog SQL, paging, and pooling.
 * Aliases such as `mariadb` and `cockroachdb` share a wire-compatible family.
 */
export type DatabaseEngineFamily =
  | 'postgresql'
  | 'mysql'
  | 'mssql'
  | 'sqlite'
  | 'oracle'
  | 'clickhouse'
  | 'mongodb'
  | 'redis';

/**
 * Maps a saved connection type onto the driver family that executes it.
 */
export function databaseEngineFamily(
  type: DatabaseType | null | undefined,
): DatabaseEngineFamily | null {
  switch (type) {
    case 'postgresql':
    case 'cockroachdb':
      return 'postgresql';
    case 'mysql':
    case 'mariadb':
      return 'mysql';
    case 'mssql':
      return 'mssql';
    case 'sqlite':
      return 'sqlite';
    case 'oracle':
      return 'oracle';
    case 'clickhouse':
      return 'clickhouse';
    case 'mongodb':
      return 'mongodb';
    case 'redis':
      return 'redis';
    default:
      return null;
  }
}

/**
 * True when the engine runs SQL (including ClickHouse), not Redis or MongoDB.
 */
export function isSqlDatabaseType(type: DatabaseType | null | undefined): boolean {
  const family = databaseEngineFamily(type);
  return family != null && family !== 'redis' && family !== 'mongodb';
}

/**
 * True when the engine is Redis or MongoDB (no SQL DML / EXPLAIN).
 */
export function isNonSqlDatabaseType(type: DatabaseType | null | undefined): boolean {
  const family = databaseEngineFamily(type);
  return family === 'redis' || family === 'mongodb';
}

/**
 * Label for the connection-editor database field.
 */
export function databaseNameFieldLabel(type: DatabaseType | null | undefined): string {
  if (type === 'redis') {
    return 'Database index';
  }
  if (type === 'oracle') {
    return 'Service name / SID';
  }
  if (type === 'mongodb') {
    return 'Database name';
  }
  return 'Database name';
}

/**
 * Placeholder for the connection-editor database field.
 */
export function databaseNameFieldPlaceholder(type: DatabaseType | null | undefined): string {
  if (type === 'oracle') {
    return 'XEPDB1 or ORCL';
  }
  if (type === 'redis') {
    return '0';
  }
  if (type === 'clickhouse') {
    return 'default';
  }
  if (type === 'cockroachdb') {
    return 'defaultdb';
  }
  return '';
}
