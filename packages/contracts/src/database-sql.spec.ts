import { describe, expect, it } from 'vitest';

import {
  addTableDataInsertRow,
  addTableDataInsertRows,
  applyTableDataRowDeletes,
  buildRelationWhere,
  buildTableDataDisplayRows,
  emptyTableDataDraft,
  foreignKeyJumpByColumn,
  tableDataPkIndexes,
  toggleTableDataDelete,
} from './database-sql';

const columns = ['id', 'name'];
const original = [
  ['1', 'a'],
  ['2', 'b'],
  ['3', 'c'],
] as const;
const pkIndexes = tableDataPkIndexes(columns, ['id']);

describe('addTableDataInsertRows', () => {
  it('appends a blank row by default', () => {
    const draft = addTableDataInsertRow(emptyTableDataDraft(), 2);
    expect(draft.inserts).toEqual([[null, null]]);
  });

  it('clones cell values into new insert rows', () => {
    const draft = addTableDataInsertRows(emptyTableDataDraft(), 2, [
      ['1', 'a'],
      undefined,
    ]);
    expect(draft.inserts).toEqual([
      ['1', 'a'],
      [null, null],
    ]);
  });
});

describe('applyTableDataRowDeletes', () => {
  it('marks existing rows deleted and drops inserts high-index first', () => {
    const withInserts = addTableDataInsertRows(emptyTableDataDraft(), 2, [
      ['10', 'x'],
      ['11', 'y'],
    ]);
    const display = buildTableDataDisplayRows(original, columns, pkIndexes, withInserts);
    const next = applyTableDataRowDeletes(withInserts, [display[0]!, display[3]!, display[4]!], 'delete');
    expect(next.deletes).toEqual(['["1"]']);
    expect(next.inserts).toEqual([]);
  });

  it('restores deleted rows without touching inserts', () => {
    const display = buildTableDataDisplayRows(original, columns, pkIndexes, emptyTableDataDraft());
    const deleted = toggleTableDataDelete(emptyTableDataDraft(), display[1]!);
    const restored = applyTableDataRowDeletes(
      deleted,
      buildTableDataDisplayRows(original, columns, pkIndexes, deleted),
      'restore',
    );
    expect(restored.deletes).toEqual([]);
  });
});

describe('foreignKeyJumpByColumn', () => {
  it('maps each source column to the referenced table', () => {
    const jumps = foreignKeyJumpByColumn(
      [
        {
          name: 'orders_customer_id_fkey',
          table: 'orders',
          columns: ['customer_id'],
          referencedSchema: 'public',
          referencedTable: 'customers',
          referencedColumns: ['id'],
        },
      ],
      'public',
    );
    expect(jumps['customer_id']).toEqual({
      schema: 'public',
      table: 'customers',
      sourceColumns: ['customer_id'],
      referencedColumns: ['id'],
    });
  });
});

describe('buildRelationWhere', () => {
  it('quotes the referenced key for postgres', () => {
    expect(
      buildRelationWhere(
        {
          schema: 'public',
          table: 'customers',
          sourceColumns: ['customer_id'],
          referencedColumns: ['id'],
        },
        { customer_id: '42' },
        'postgresql',
      ),
    ).toBe(`"id" = '42'`);
  });
});
