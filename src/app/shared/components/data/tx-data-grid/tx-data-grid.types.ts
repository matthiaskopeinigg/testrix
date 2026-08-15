import type { DatabaseQueryCellRange } from '@shared/database';

/** Cell coordinates in a `tx-data-grid`. */
export interface TxDataGridCell {
  readonly row: number;
  readonly col: number;
}

/** Whether an export should include the whole result or the selected range. */
export type TxDataGridExportScope = 'all' | 'selection';

/** Clipboard payload emitted after a successful TSV copy. */
export interface TxDataGridCopyEvent {
  readonly text: string;
  readonly range: DatabaseQueryCellRange;
}

/** Request from the grid context menu to open a format picker. */
export interface TxDataGridExportEvent {
  readonly scope: TxDataGridExportScope;
  readonly position: { readonly x: number; readonly y: number };
}

/** Committed inline cell edit from an editable grid. */
export interface TxDataGridCellCommitEvent {
  readonly row: number;
  readonly col: number;
  readonly value: string | null;
}

/** Visual row state for the table data editor. */
export type TxDataGridRowKind = 'existing' | 'inserted' | 'deleted';

/** Demo rows for the Design System panel. */
export const TX_DATA_GRID_DEMO_COLUMNS: readonly string[] = ['id', 'name', 'email', 'notes'];

export const TX_DATA_GRID_DEMO_ROWS: readonly (readonly (string | null)[])[] = [
  ['1', 'Ada Lovelace', 'ada@example.test', null],
  ['2', 'Grace Hopper', '', 'COBOL'],
  ['3', 'Alan Turing', null, ''],
  ['4', 'Katherine Johnson', 'kj@example.test', 'Trajectory'],
];
