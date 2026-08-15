import type { DatabaseQueryTable } from './normalize-query-result';

export type DatabaseQuerySortDirection = 'asc' | 'desc';

export interface DatabaseQuerySortState {
  readonly columnIndex: number;
  readonly direction: DatabaseQuerySortDirection;
}

/**
 * Cycles header sort: none → asc → desc → none.
 */
export function nextDatabaseQuerySort(
  current: DatabaseQuerySortState | null,
  columnIndex: number,
): DatabaseQuerySortState | null {
  if (!current || current.columnIndex !== columnIndex) {
    return { columnIndex, direction: 'asc' };
  }
  if (current.direction === 'asc') {
    return { columnIndex, direction: 'desc' };
  }
  return null;
}

/**
 * Sorts loaded rows with nulls last. Numeric strings compare as numbers.
 */
export function sortDatabaseQueryRows(
  rows: readonly (readonly (string | null)[])[],
  sort: DatabaseQuerySortState | null,
): (readonly (string | null)[])[] {
  if (!sort) {
    return [...rows];
  }
  const { columnIndex, direction } = sort;
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = left[columnIndex] ?? null;
    const b = right[columnIndex] ?? null;
    if (a === null && b === null) {
      return 0;
    }
    if (a === null) {
      return 1;
    }
    if (b === null) {
      return -1;
    }
    const numeric = compareNumeric(a, b);
    if (numeric !== null) {
      return numeric * factor;
    }
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }) * factor;
  });
}

/**
 * Case-insensitive substring match across visible cells on the current page.
 */
export function filterDatabaseQueryRows(
  table: Pick<DatabaseQueryTable, 'rows'>,
  query: string,
): (readonly (string | null)[])[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...table.rows];
  }
  return table.rows.filter((row) =>
    row.some((cell) => (cell ?? '').toLowerCase().includes(needle)),
  );
}

function compareNumeric(a: string, b: string): number | null {
  if (!isNumericCell(a) || !isNumericCell(b)) {
    return null;
  }
  const diff = Number(a) - Number(b);
  if (diff < 0) {
    return -1;
  }
  if (diff > 0) {
    return 1;
  }
  return 0;
}

function isNumericCell(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}
