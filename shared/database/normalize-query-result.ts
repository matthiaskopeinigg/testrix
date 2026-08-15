import { isDatabaseQueryEnvelope } from './database-introspect.schema';

export interface DatabaseQueryTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly (string | null)[])[];
  readonly scalar: string | null;
  readonly affectedRows?: number;
  readonly columnTypes?: readonly string[];
  readonly hasMore?: boolean;
}

/**
 * Converts a driver cell into a display/export value.
 * SQL NULL and missing fields become `null`; empty strings stay `''`.
 */
export function stringifyDatabaseQueryCell(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Normalizes engine-specific query results into a table the Data tab can render.
 */
export function normalizeDatabaseQueryResult(raw: unknown): DatabaseQueryTable {
  if (isQueryEnvelope(raw)) {
    const table = normalizeDatabaseQueryResult(raw.rows);
    return {
      ...table,
      affectedRows: raw.affectedRows,
      columnTypes: raw.columnTypes,
      hasMore: raw.hasMore,
    };
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return { columns: [], rows: [], scalar: null };
    }
    if (raw.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      const columns: string[] = [];
      for (const row of raw) {
        for (const key of Object.keys(row as Record<string, unknown>)) {
          if (!columns.includes(key)) {
            columns.push(key);
          }
        }
      }
      const rows = raw.map((row) => {
        const record = row as Record<string, unknown>;
        return columns.map((column) => stringifyDatabaseQueryCell(record[column]));
      });
      return { columns, rows, scalar: null };
    }
    return {
      columns: ['value'],
      rows: raw.map((value) => [stringifyDatabaseQueryCell(value)]),
      scalar: null,
    };
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const columns = Object.keys(record);
    return {
      columns,
      rows: [columns.map((column) => stringifyDatabaseQueryCell(record[column]))],
      scalar: null,
    };
  }
  const scalar = stringifyDatabaseQueryCell(raw);
  return { columns: ['value'], rows: [[scalar]], scalar };
}

function isQueryEnvelope(
  raw: unknown,
): raw is {
  readonly rows: unknown;
  readonly affectedRows?: number;
  readonly columnTypes?: readonly string[];
  readonly hasMore?: boolean;
} {
  if (!isDatabaseQueryEnvelope(raw)) {
    return false;
  }
  const keys = Object.keys(raw as object);
  return keys.every((key) =>
    key === 'rows' || key === 'affectedRows' || key === 'columnTypes' || key === 'hasMore',
  );
}
