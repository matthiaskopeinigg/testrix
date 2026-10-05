import { describe, expect, it } from 'vitest';

import { applyQueryResultView, inferSqlFromTable, parseQueryResultOrder } from './database-query-result-view';

const table = {
  columns: ['id', 'qty'],
  rows: [
    [2, 3],
    [1, 1],
    [3, 2],
  ],
  hasMore: false,
};

describe('inferSqlFromTable', () => {
  it('reads schema and table from a select', () => {
    expect(inferSqlFromTable('SELECT * FROM public.order_items;')).toEqual({
      schema: 'public',
      table: 'order_items',
    });
  });
});

describe('parseQueryResultOrder', () => {
  it('parses column and direction', () => {
    expect(parseQueryResultOrder('qty DESC, id')).toEqual([
      { column: 'qty', descending: true },
      { column: 'id', descending: false },
    ]);
  });
});

describe('applyQueryResultView', () => {
  it('sorts by order and filters by where', () => {
    const sorted = applyQueryResultView(table, '', 'qty DESC');
    expect(sorted.rows.map((row) => row[0])).toEqual([2, 3, 1]);
    const filtered = applyQueryResultView(table, 'id = 1', '');
    expect(filtered.rows).toEqual([[1, 1]]);
  });
});
