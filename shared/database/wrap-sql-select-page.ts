import type { DatabaseType } from '../config/database-settings.schema';

/** Default SELECT page size for the Data query console. */
export const DATABASE_QUERY_PAGE_SIZE_DEFAULT = 500;

/** Page-size choices shown in the query result toolbar. */
export const DATABASE_QUERY_PAGE_SIZES = [100, 500, 1000] as const;

export type DatabaseQueryPageSize = (typeof DATABASE_QUERY_PAGE_SIZES)[number];

/**
 * True when a single SELECT/WITH statement can be wrapped for LIMIT/OFFSET paging.
 */
export function canPageSqlSelect(
  query: string,
  type: DatabaseType | null | undefined,
): boolean {
  if (type === 'redis') {
    return false;
  }
  const trimmed = stripTrailingSemicolons(query);
  if (!trimmed || trimmed.includes(';')) {
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
  const inner = stripTrailingSemicolons(query);
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeOffset = Math.max(0, Math.floor(offset));
  if (type === 'mssql') {
    return `SELECT * FROM (\n${inner}\n) AS _tx_page ORDER BY (SELECT NULL) OFFSET ${safeOffset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`;
  }
  return `SELECT * FROM (\n${inner}\n) AS _tx_page LIMIT ${safeLimit} OFFSET ${safeOffset}`;
}

function stripTrailingSemicolons(query: string): string {
  return query.trim().replace(/;+\s*$/g, '');
}
