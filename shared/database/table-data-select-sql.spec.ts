import { describe, expect, it } from 'vitest';

import {
  buildTableDataSelectSql,
  normalizeTableDataWhereFilter,
  tableDataWhereFilterError,
} from './table-data-select-sql';

describe('normalizeTableDataWhereFilter', () => {
  it('strips WHERE, whitespace, and a trailing semicolon', () => {
    expect(normalizeTableDataWhereFilter("  WHERE id > 1;  ")).toBe('id > 1');
    expect(normalizeTableDataWhereFilter('')).toBe('');
  });
});

describe('tableDataWhereFilterError', () => {
  it('rejects extra statements', () => {
    expect(tableDataWhereFilterError("id > 1; DROP TABLE users")).toMatch(/single WHERE/i);
    expect(tableDataWhereFilterError('id > 1')).toBeNull();
  });
});

describe('buildTableDataSelectSql', () => {
  it('selects the qualified table without a filter', () => {
    expect(
      buildTableDataSelectSql({ schema: 'public', table: 'users', type: 'postgresql' }),
    ).toBe('SELECT * FROM public.users');
  });

  it('wraps a DataGrip-style condition in WHERE', () => {
    expect(
      buildTableDataSelectSql({
        schema: 'public',
        table: 'users',
        type: 'postgresql',
        filter: "WHERE email LIKE '%@test%' AND is_active",
      }),
    ).toBe("SELECT * FROM public.users WHERE (email LIKE '%@test%' AND is_active)");
  });

  it('omits the sqlite schema qualifier', () => {
    expect(
      buildTableDataSelectSql({
        schema: 'main',
        table: 'users',
        type: 'sqlite',
        filter: 'id = 1',
      }),
    ).toBe('SELECT * FROM users WHERE (id = 1)');
  });
});
