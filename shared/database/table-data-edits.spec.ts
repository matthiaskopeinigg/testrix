import { describe, expect, it } from 'vitest';

import {
  addTableDataInsertRow,
  applyTableDataCellEdit,
  buildTableDataDisplayRows,
  canEditTableData,
  emptyTableDataDraft,
  isTableDataDraftDirty,
  tableDataDirtyCellKeys,
  tableDataPkIndexes,
  toggleTableDataDelete,
} from './table-data-edits';

const COLUMNS = ['id', 'name'] as const;
const PK = ['id'] as const;
const ORIGINAL = [
  ['1', 'Ada'],
  ['2', 'Grace'],
] as const;

describe('table-data-edits', () => {
  it('refuses Redis, views, and tables without a primary key', () => {
    expect(canEditTableData({ type: 'redis', isView: false, pkColumns: ['id'] })).toBe(false);
    expect(canEditTableData({ type: 'mongodb', isView: false, pkColumns: ['_id'] })).toBe(false);
    expect(canEditTableData({ type: 'postgresql', isView: true, pkColumns: ['id'] })).toBe(false);
    expect(canEditTableData({ type: 'postgresql', isView: false, pkColumns: [] })).toBe(false);
    expect(canEditTableData({ type: 'postgresql', isView: false, pkColumns: ['id'] })).toBe(true);
  });

  it('marks a cell dirty then reverts to a clean draft', () => {
    const pkIndexes = tableDataPkIndexes(COLUMNS, PK);
    let draft = emptyTableDataDraft();
    const display = buildTableDataDisplayRows(ORIGINAL, COLUMNS, pkIndexes, draft);
    draft = applyTableDataCellEdit(draft, display[0]!, COLUMNS, ORIGINAL[0]!, 1, 'Ada Lovelace');
    expect(isTableDataDraftDirty(draft)).toBe(true);
    const dirty = tableDataDirtyCellKeys(
      buildTableDataDisplayRows(ORIGINAL, COLUMNS, pkIndexes, draft),
      COLUMNS,
      ORIGINAL,
      draft,
    );
    expect(dirty.has('0:1')).toBe(true);
    draft = applyTableDataCellEdit(
      draft,
      buildTableDataDisplayRows(ORIGINAL, COLUMNS, pkIndexes, draft)[0]!,
      COLUMNS,
      ORIGINAL[0]!,
      1,
      'Ada',
    );
    expect(isTableDataDraftDirty(draft)).toBe(false);
  });

  it('appends inserts and toggles delete', () => {
    const pkIndexes = tableDataPkIndexes(COLUMNS, PK);
    let draft = addTableDataInsertRow(emptyTableDataDraft(), COLUMNS.length);
    expect(draft.inserts).toHaveLength(1);
    const withInsert = buildTableDataDisplayRows(ORIGINAL, COLUMNS, pkIndexes, draft);
    expect(withInsert[2]?.kind).toBe('inserted');
    draft = toggleTableDataDelete(draft, withInsert[0]!);
    expect(draft.deletes).toEqual(['["1"]']);
    const deleted = buildTableDataDisplayRows(ORIGINAL, COLUMNS, pkIndexes, draft);
    expect(deleted[0]?.kind).toBe('deleted');
  });
});
