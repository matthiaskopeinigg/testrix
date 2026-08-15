import { describe, expect, it } from 'vitest';

import {
  filterDatabaseQueryRows,
  nextDatabaseQuerySort,
  sortDatabaseQueryRows,
} from './sort-query-table';

describe('nextDatabaseQuerySort', () => {
  it('cycles none → asc → desc → none', () => {
    const asc = nextDatabaseQuerySort(null, 1);
    expect(asc).toEqual({ columnIndex: 1, direction: 'asc' });
    const desc = nextDatabaseQuerySort(asc, 1);
    expect(desc).toEqual({ columnIndex: 1, direction: 'desc' });
    expect(nextDatabaseQuerySort(desc, 1)).toBeNull();
  });
});

describe('sortDatabaseQueryRows', () => {
  const rows = [
    ['2', 'b', null],
    ['10', 'a', 'x'],
    [null, 'c', 'y'],
  ];

  it('sorts numbers numerically and keeps nulls last', () => {
    const sorted = sortDatabaseQueryRows(rows, { columnIndex: 0, direction: 'asc' });
    expect(sorted.map((row) => row[0])).toEqual(['2', '10', null]);
  });

  it('sorts strings case-insensitively', () => {
    const sorted = sortDatabaseQueryRows(rows, { columnIndex: 1, direction: 'asc' });
    expect(sorted.map((row) => row[1])).toEqual(['a', 'b', 'c']);
  });
});

describe('filterDatabaseQueryRows', () => {
  it('matches any visible cell case-insensitively', () => {
    const filtered = filterDatabaseQueryRows(
      { rows: [['Ada', '1'], ['Grace', '2']] },
      'grace',
    );
    expect(filtered).toEqual([['Grace', '2']]);
  });
});
