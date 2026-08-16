import { describe, expect, it } from 'vitest';

import { normalizeDatabaseQueryResult, stringifyDatabaseQueryCell } from './normalize-query-result';

describe('stringifyDatabaseQueryCell', () => {
  it('keeps empty strings and maps nullish values to null', () => {
    expect(stringifyDatabaseQueryCell(null)).toBeNull();
    expect(stringifyDatabaseQueryCell(undefined)).toBeNull();
    expect(stringifyDatabaseQueryCell('')).toBe('');
  });

  it('stringifies primitives and dates', () => {
    expect(stringifyDatabaseQueryCell(0)).toBe('0');
    expect(stringifyDatabaseQueryCell(false)).toBe('false');
    expect(stringifyDatabaseQueryCell(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '2026-01-02T03:04:05.000Z',
    );
  });
});

describe('normalizeDatabaseQueryResult', () => {
  it('maps row objects to columns', () => {
    const table = normalizeDatabaseQueryResult([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ]);
    expect(table.columns).toEqual(['id', 'name']);
    expect(table.rows).toEqual([
      ['1', 'Ada'],
      ['2', 'Grace'],
    ]);
  });

  it('preserves SQL NULL versus empty string', () => {
    const table = normalizeDatabaseQueryResult([
      { email: 'ada@example.test', bio: '', notes: null },
      { email: null, bio: 'Hello', notes: '' },
    ]);
    expect(table.rows).toEqual([
      ['ada@example.test', '', null],
      [null, 'Hello', ''],
    ]);
  });

  it('maps scalar objects to a single row', () => {
    const table = normalizeDatabaseQueryResult({ changes: 1, lastInsertRowid: 9 });
    expect(table.columns).toEqual(['changes', 'lastInsertRowid']);
    expect(table.rows[0]).toEqual(['1', '9']);
  });

  it('unwraps a query envelope with affected rows and paging', () => {
    const table = normalizeDatabaseQueryResult({
      rows: [{ id: 1 }],
      affectedRows: 3,
      columnTypes: ['int4'],
      hasMore: true,
    });
    expect(table.rows).toEqual([['1']]);
    expect(table.affectedRows).toBe(3);
    expect(table.columnTypes).toEqual(['int4']);
    expect(table.hasMore).toBe(true);
  });

  it('keeps envelope column names when the result has no rows', () => {
    const table = normalizeDatabaseQueryResult({
      rows: [],
      columns: ['id', 'email'],
      columnTypes: ['int4', 'text'],
    });
    expect(table.columns).toEqual(['id', 'email']);
    expect(table.rows).toEqual([]);
    expect(table.columnTypes).toEqual(['int4', 'text']);
  });
});
