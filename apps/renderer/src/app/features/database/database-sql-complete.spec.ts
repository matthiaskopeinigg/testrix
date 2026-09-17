import { describe, expect, it } from 'vitest';

import { formatSql, sqlGhost, suggestSql, tokenizeSqlHighlight } from './database-sql-complete';

const context = {
  schemas: ['public'],
  tables: [{ schema: 'public', name: 'sample_items' }, { schema: 'public', name: 'orders' }],
  columns: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'varchar' }],
  routines: [{ name: 'item_count', kind: 'function' }],
};

describe('suggestSql', () => {
  it('completes tables after FROM', () => {
    const items = suggestSql('SELECT * FROM sa', 16, context);
    expect(items.map((item) => item.value)).toContain('sample_items');
  });

  it('completes tables after a schema qualifier', () => {
    const sql = 'SELECT * FROM public.';
    const items = suggestSql(sql, sql.length, context);
    expect(items.map((item) => item.value)).toEqual(['sample_items', 'orders']);
  });

  it('includes catalog routines and keywords', () => {
    const items = suggestSql('item', 4, context);
    expect(items.map((item) => item.value)).toContain('item_count');
    expect(items.some((item) => item.kind === 'keyword')).toBe(false);
  });
});

describe('sqlGhost', () => {
  it('ghosts the table name after schema.', () => {
    const sql = 'SELECT * FROM public.';
    expect(sqlGhost(sql, sql.length, { value: 'sample_items', label: 'public.sample_items', detail: 'table', kind: 'table' })).toEqual({
      pad: sql,
      rest: 'sample_items',
    });
  });
});

describe('tokenizeSqlHighlight', () => {
  it('marks keywords, strings, and comments', () => {
    const kinds = tokenizeSqlHighlight("SELECT 'x' -- hi\nFROM t").map((token) => token.kind);
    expect(kinds).toContain('keyword');
    expect(kinds).toContain('string');
    expect(kinds).toContain('comment');
  });
});

describe('formatSql', () => {
  it('uppercases keywords and keeps strings', () => {
    expect(formatSql("select * from 'From'")).toBe("SELECT * FROM 'From'");
  });
});
