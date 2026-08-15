import { describe, expect, it } from 'vitest';

import { buildTableDmlStatements, refuseTableDml, sqlLiteral } from './build-table-dml';
import { addTableDataInsertRow, applyTableDataCellEdit, emptyTableDataDraft, tableDataPkIndexes, toggleTableDataDelete, buildTableDataDisplayRows } from './table-data-edits';

const COLUMNS = ['id', 'name'] as const;
const ORIGINAL = [
  ['1', 'Ada'],
  ['2', 'Grace'],
] as const;

describe('build-table-dml', () => {
  it('refuses view, Redis, and no-PK tables', () => {
    expect(refuseTableDml({ type: 'redis', isView: false, pkColumns: ['id'] })).toBe('redis');
    expect(refuseTableDml({ type: 'postgresql', isView: true, pkColumns: ['id'] })).toBe('view');
    expect(refuseTableDml({ type: 'postgresql', isView: false, pkColumns: [] })).toBe('no-pk');
    expect(refuseTableDml({ type: 'postgresql', isView: false, pkColumns: ['id'] })).toBeNull();
    expect(() =>
      buildTableDmlStatements({
        type: 'postgresql',
        schema: 'public',
        table: 'users',
        isView: true,
        columns: COLUMNS,
        pkColumns: ['id'],
        originalRows: ORIGINAL,
        draft: emptyTableDataDraft(),
      }),
    ).toThrow(/read-only/i);
  });

  it('builds UPDATE INSERT DELETE with quoted PK predicates', () => {
    const pkIndexes = tableDataPkIndexes(COLUMNS, ['id']);
    let draft = emptyTableDataDraft();
    const display = buildTableDataDisplayRows(ORIGINAL, COLUMNS, pkIndexes, draft);
    draft = applyTableDataCellEdit(draft, display[0]!, COLUMNS, ORIGINAL[0]!, 1, "O'Brien");
    draft = toggleTableDataDelete(draft, display[1]!);
    draft = addTableDataInsertRow(draft, COLUMNS.length);
    draft = applyTableDataCellEdit(
      draft,
      buildTableDataDisplayRows(ORIGINAL, COLUMNS, pkIndexes, draft)[2]!,
      COLUMNS,
      null,
      0,
      '3',
    );
    draft = applyTableDataCellEdit(
      draft,
      buildTableDataDisplayRows(ORIGINAL, COLUMNS, pkIndexes, draft)[2]!,
      COLUMNS,
      null,
      1,
      'Alan',
    );

    const statements = buildTableDmlStatements({
      type: 'postgresql',
      schema: 'public',
      table: 'users',
      isView: false,
      columns: COLUMNS,
      pkColumns: ['id'],
      originalRows: ORIGINAL,
      draft,
    });
    expect(statements.map((item) => item.kind)).toEqual(['delete', 'update', 'insert']);
    expect(statements[0]?.sql).toBe(`DELETE FROM public.users WHERE id = '2'`);
    expect(statements[1]?.sql).toBe(`UPDATE public.users SET name = 'O''Brien' WHERE id = '1'`);
    expect(statements[2]?.sql).toBe(`INSERT INTO public.users (id, name) VALUES ('3', 'Alan')`);
  });

  it('quotes mysql literals with backslashes', () => {
    expect(sqlLiteral(`a\\b'c`, 'mysql')).toBe(`'a\\\\b''c'`);
  });
});
