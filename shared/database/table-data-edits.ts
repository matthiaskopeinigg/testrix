import type { DatabaseType } from '../config/database-settings.schema';

/** Cell value in a table data grid (SQL NULL is `null`). */
export type TableDataCell = string | null;

/** Local DML draft for a paged table editor. */
export interface TableDataDraft {
  readonly updates: Readonly<Record<string, Readonly<Record<string, TableDataCell>>>>;
  readonly inserts: readonly (readonly TableDataCell[])[];
  readonly deletes: readonly string[];
}

/** Display row after applying a draft (includes deleted originals and inserts). */
export type TableDataRowKind = 'existing' | 'inserted' | 'deleted';

/** Grid row produced from originals + draft. */
export interface TableDataDisplayRow {
  readonly kind: TableDataRowKind;
  readonly cells: readonly TableDataCell[];
  readonly pkKey: string | null;
  readonly insertIndex: number | null;
}

/** Empty draft. */
export function emptyTableDataDraft(): TableDataDraft {
  return { updates: {}, inserts: [], deletes: [] };
}

/** True when the draft has any pending write. */
export function isTableDataDraftDirty(draft: TableDataDraft): boolean {
  return (
    Object.keys(draft.updates).length > 0 || draft.inserts.length > 0 || draft.deletes.length > 0
  );
}

/** Stable key for a primary-key tuple. */
export function tableDataPkKey(values: readonly TableDataCell[]): string {
  return JSON.stringify(values);
}

/** Column indexes that make up the primary key. */
export function tableDataPkIndexes(
  columns: readonly string[],
  pkColumns: readonly string[],
): number[] {
  return pkColumns
    .map((name) => columns.indexOf(name))
    .filter((index) => index >= 0);
}

/** Reads PK cell values from a row. */
export function tableDataPkValues(
  row: readonly TableDataCell[],
  pkIndexes: readonly number[],
): TableDataCell[] {
  return pkIndexes.map((index) => row[index] ?? null);
}

/**
 * True when the table data editor may accept cell/row edits.
 * Redis, views, and tables without a primary key stay read-only.
 */
export function canEditTableData(options: {
  readonly type: DatabaseType | null | undefined;
  readonly isView: boolean;
  readonly pkColumns: readonly string[];
}): boolean {
  if (!options.type || options.type === 'redis' || options.isView) {
    return false;
  }
  return options.pkColumns.length > 0;
}

/**
 * Applies a cell edit to the draft. Inserted rows update `inserts`; existing rows
 * merge into `updates` keyed by PK. Deleted rows are not editable.
 */
export function applyTableDataCellEdit(
  draft: TableDataDraft,
  display: TableDataDisplayRow,
  columns: readonly string[],
  originalRow: readonly TableDataCell[] | null,
  col: number,
  value: TableDataCell,
): TableDataDraft {
  if (display.kind === 'deleted' || col < 0 || col >= columns.length) {
    return draft;
  }
  if (display.kind === 'inserted' && display.insertIndex != null) {
    const inserts = draft.inserts.map((row, index) =>
      index === display.insertIndex
        ? row.map((cell, cellIndex) => (cellIndex === col ? value : cell))
        : row,
    );
    return { ...draft, inserts };
  }
  if (!originalRow || !display.pkKey) {
    return draft;
  }
  const column = columns[col];
  if (!column) {
    return draft;
  }
  const previous = draft.updates[display.pkKey] ?? {};
  const originalValue = originalRow[col] ?? null;
  const nextValues: Record<string, TableDataCell> = { ...previous, [column]: value };
  if (valuesEqual(value, originalValue)) {
    delete nextValues[column];
  }
  const updates = { ...draft.updates };
  if (Object.keys(nextValues).length === 0) {
    delete updates[display.pkKey];
  } else {
    updates[display.pkKey] = nextValues;
  }
  return { ...draft, updates };
}

/** Appends an empty insert row matching `columnCount`. */
export function addTableDataInsertRow(draft: TableDataDraft, columnCount: number): TableDataDraft {
  const row = Array.from({ length: Math.max(0, columnCount) }, () => null);
  return { ...draft, inserts: [...draft.inserts, row] };
}

/**
 * Marks an existing row for delete, or drops an insert. Toggling delete on an
 * already-deleted PK restores it.
 */
export function toggleTableDataDelete(draft: TableDataDraft, display: TableDataDisplayRow): TableDataDraft {
  if (display.kind === 'inserted' && display.insertIndex != null) {
    return {
      ...draft,
      inserts: draft.inserts.filter((_, index) => index !== display.insertIndex),
    };
  }
  if (!display.pkKey) {
    return draft;
  }
  const has = draft.deletes.includes(display.pkKey);
  const deletes = has
    ? draft.deletes.filter((key) => key !== display.pkKey)
    : [...draft.deletes, display.pkKey];
  const updates = { ...draft.updates };
  if (!has) {
    delete updates[display.pkKey];
  }
  return { ...draft, deletes, updates };
}

/** Builds display rows: originals (with updates / deletes) then inserts. */
export function buildTableDataDisplayRows(
  originalRows: readonly (readonly TableDataCell[])[],
  columns: readonly string[],
  pkIndexes: readonly number[],
  draft: TableDataDraft,
): TableDataDisplayRow[] {
  const out: TableDataDisplayRow[] = [];
  for (const row of originalRows) {
    const pkKey = pkIndexes.length > 0 ? tableDataPkKey(tableDataPkValues(row, pkIndexes)) : null;
    const deleted = pkKey !== null && draft.deletes.includes(pkKey);
    const patch = pkKey ? draft.updates[pkKey] : undefined;
    const cells = columns.map((column, index) =>
      patch && Object.prototype.hasOwnProperty.call(patch, column) ? patch[column]! : (row[index] ?? null),
    );
    out.push({
      kind: deleted ? 'deleted' : 'existing',
      cells,
      pkKey,
      insertIndex: null,
    });
  }
  draft.inserts.forEach((row, insertIndex) => {
    out.push({
      kind: 'inserted',
      cells: columns.map((_, index) => row[index] ?? null),
      pkKey: null,
      insertIndex,
    });
  });
  return out;
}

/** Dirty cell keys as `row:col` against {@link buildTableDataDisplayRows} output. */
export function tableDataDirtyCellKeys(
  displayRows: readonly TableDataDisplayRow[],
  columns: readonly string[],
  originalRows: readonly (readonly TableDataCell[])[],
  draft: TableDataDraft,
): ReadonlySet<string> {
  const keys = new Set<string>();
  displayRows.forEach((row, rowIndex) => {
    if (row.kind === 'inserted') {
      row.cells.forEach((cell, col) => {
        if (cell !== null) {
          keys.add(`${rowIndex}:${col}`);
        }
      });
      return;
    }
    if (row.kind === 'deleted' || !row.pkKey) {
      return;
    }
    const patch = draft.updates[row.pkKey];
    if (!patch) {
      return;
    }
    const original = originalRows[rowIndex];
    columns.forEach((column, col) => {
      if (Object.prototype.hasOwnProperty.call(patch, column)) {
        const originalValue = original?.[col] ?? null;
        if (!valuesEqual(patch[column] ?? null, originalValue)) {
          keys.add(`${rowIndex}:${col}`);
        }
      }
    });
  });
  return keys;
}

function valuesEqual(a: TableDataCell, b: TableDataCell): boolean {
  return a === b;
}
