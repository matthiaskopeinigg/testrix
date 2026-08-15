import type { DatabaseType } from '../config/database-settings.schema';

import { databaseEngineFamily } from './database-engine';
import { canPageMongoFind, wrapMongoFindPage } from './mongo-shell-query';
import { stripTrailingSqlSemicolons } from './strip-trailing-sql-semicolons';

/** Default SELECT page size for the Data query console. */
export const DATABASE_QUERY_PAGE_SIZE_DEFAULT = 500;

/** Page-size choices shown in the query result toolbar. */
export const DATABASE_QUERY_PAGE_SIZES = [100, 500, 1000] as const;

export type DatabaseQueryPageSize = (typeof DATABASE_QUERY_PAGE_SIZES)[number];

/**
 * True when a single SELECT/WITH (or Mongo `find`) can be wrapped for paging.
 */
export function canPageSqlSelect(
  query: string,
  type: DatabaseType | null | undefined,
): boolean {
  if (type === 'redis') {
    return false;
  }
  if (databaseEngineFamily(type) === 'mongodb') {
    return canPageMongoFind(query);
  }
  const trimmed = stripTrailingSqlSemicolons(query);
  if (!trimmed || trimmed.includes(';') || trimmed.includes('；')) {
    return false;
  }
  const head = trimmed.replace(/^\s*\(\s*/i, '');
  return /^(select|with)\b/i.test(head);
}

/**
 * Wraps a SELECT/WITH query so the engine returns `limit` rows starting at `offset`.
 */
export function wrapSqlSelectPage(
  query: string,
  limit: number,
  offset: number,
  type: DatabaseType | null | undefined,
): string {
  const family = databaseEngineFamily(type);
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeOffset = Math.max(0, Math.floor(offset));
  if (family === 'mongodb') {
    return wrapMongoFindPage(query, safeLimit, safeOffset);
  }
  const inner = stripTrailingSqlSemicolons(query);
  if (family === 'mssql') {
    return `SELECT * FROM (\n${inner}\n) AS tx_page ORDER BY (SELECT NULL) OFFSET ${safeOffset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`;
  }
  if (family === 'oracle') {
    // Oracle rejects unquoted identifiers that start with `_` (ORA-00911).
    return `SELECT * FROM (\n${inner}\n) tx_page OFFSET ${safeOffset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`;
  }
  return `SELECT * FROM (\n${inner}\n) AS tx_page LIMIT ${safeLimit} OFFSET ${safeOffset}`;
}
