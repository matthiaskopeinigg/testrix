import type { DatabaseType } from '../config/database-settings.schema';

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
export function tableDataWhereFilterError(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes(';')) {
    return 'The filter must be a single WHERE clause, without extra statements.';
  }
  return null;
}

/**
 * Builds `SELECT * FROM schema.table` with an optional DataGrip-style WHERE filter.
 */
export function buildTableDataSelectSql(options: {
  readonly schema: string;
  readonly table: string;
  readonly type: DatabaseType | null | undefined;
  readonly filter?: string;
}): string {
  const qualified = qualifySqlTableName(options.schema, options.table, options.type);
  const where = normalizeTableDataWhereFilter(options.filter ?? '');
  if (!where) {
    return `SELECT * FROM ${qualified}`;
  }
  return `SELECT * FROM ${qualified} WHERE (${where})`;
}
