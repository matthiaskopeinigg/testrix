import type { DatabaseType } from '../config/database-settings.schema';

import { databaseEngineFamily } from './database-engine';
import { qualifySqlTableName } from './sql-identifier';

/**
 * Normalizes a DataGrip-style table filter: optional leading `WHERE`, no trailing semicolons.
 */
export function normalizeTableDataWhereFilter(raw: string): string {
  const stripped = raw.trim().replace(/;+\s*$/g, '').trim();
  if (!stripped) {
    return '';
  }
  return stripped.replace(/^(where)\s+/i, '').trim();
}

/**
 * Returns an error when the filter cannot be applied as a single WHERE clause.
 */
export function tableDataWhereFilterError(
  raw: string,
  type?: DatabaseType | null,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes(';')) {
    return 'The filter must be a single WHERE clause, without extra statements.';
  }
  if (databaseEngineFamily(type) === 'mongodb') {
    const body = normalizeTableDataWhereFilter(trimmed);
    if (body && !body.startsWith('{')) {
      return 'MongoDB filters must be a JSON object, for example { "status": "active" }.';
    }
  }
  return null;
}

/**
 * Builds `SELECT * FROM schema.table` with an optional DataGrip-style WHERE filter.
 * MongoDB collections use `db.getCollection("name").find({})`.
 */
export function buildTableDataSelectSql(options: {
  readonly schema: string;
  readonly table: string;
  readonly type: DatabaseType | null | undefined;
  readonly filter?: string;
}): string {
  if (databaseEngineFamily(options.type) === 'mongodb') {
    const collection = JSON.stringify(options.table);
    const dbExpr = options.schema.trim()
      ? `db.getSiblingDB(${JSON.stringify(options.schema)})`
      : 'db';
    const where = normalizeTableDataWhereFilter(options.filter ?? '');
    const filter = where || '{}';
    return `${dbExpr}.getCollection(${collection}).find(${filter})`;
  }
  const qualified = qualifySqlTableName(options.schema, options.table, options.type);
  const where = normalizeTableDataWhereFilter(options.filter ?? '');
  if (!where) {
    return `SELECT * FROM ${qualified}`;
  }
  return `SELECT * FROM ${qualified} WHERE (${where})`;
}
