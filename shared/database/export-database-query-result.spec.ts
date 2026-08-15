import { describe, expect, it } from 'vitest';

import {
  formatDatabaseQueryClipboardTsv,
  formatDatabaseQueryResult,
  isFullDatabaseQuerySelection,
  sliceDatabaseQueryTable,
} from './export-database-query-result';
import type { DatabaseQueryTable } from './normalize-query-result';

const TABLE: DatabaseQueryTable = {
  columns: ['id', 'name', 'notes'],
  rows: [
    ['1', 'Ada', null],
    ['2', 'Grace, Hopper', ''],
    ['3', 'Line\nBreak', 'a|b'],
  ],
  scalar: null,
};

describe('sliceDatabaseQueryTable', () => {
  it('returns the full table when no range is given', () => {
    expect(sliceDatabaseQueryTable(TABLE)).toEqual({
      columns: TABLE.columns,
      rows: TABLE.rows,
    });
  });

  it('slices an inclusive cell range', () => {
    expect(
      sliceDatabaseQueryTable(TABLE, { startRow: 1, startCol: 1, endRow: 2, endCol: 2 }),
    ).toEqual({
      columns: ['name', 'notes'],
      rows: [
        ['Grace, Hopper', ''],
        ['Line\nBreak', 'a|b'],
      ],
    });
  });
});

describe('isFullDatabaseQuerySelection', () => {
  it('treats a covering range as a full selection', () => {
    expect(
      isFullDatabaseQuerySelection(TABLE, { startRow: 2, startCol: 2, endRow: 0, endCol: 0 }),
    ).toBe(true);
    expect(
      isFullDatabaseQuerySelection(TABLE, { startRow: 0, startCol: 0, endRow: 1, endCol: 2 }),
    ).toBe(false);
  });
});

describe('formatDatabaseQueryResult', () => {
  it('quotes CSV fields that contain commas or newlines', () => {
    const csv = formatDatabaseQueryResult(TABLE, 'csv');
    expect(csv).toContain('id,name,notes');
    expect(csv).toContain('2,"Grace, Hopper",');
    expect(csv).toContain('3,"Line\nBreak",a|b');
  });

  it('exports TSV with a header row', () => {
    expect(formatDatabaseQueryResult(TABLE, 'tsv').split('\n')[0]).toBe('id\tname\tnotes');
  });

  it('exports JSON null for SQL NULL and empty string for empty cells', () => {
    const parsed = JSON.parse(formatDatabaseQueryResult(TABLE, 'json')) as readonly Record<
      string,
      string | null
    >[];
    expect(parsed[0]).toEqual({ id: '1', name: 'Ada', notes: null });
    expect(parsed[1]).toEqual({ id: '2', name: 'Grace, Hopper', notes: '' });
  });

  it('escapes pipes in Markdown and renders NULL', () => {
    const markdown = formatDatabaseQueryResult(TABLE, 'markdown');
    expect(markdown).toContain('| id | name | notes |');
    expect(markdown).toContain('| 1 | Ada | NULL |');
    expect(markdown).toContain('| 3 | Line Break | a\\|b |');
  });

  it('escapes HTML and marks NULL cells', () => {
    const html = formatDatabaseQueryResult(TABLE, 'html');
    expect(html).toContain('<th>id</th>');
    expect(html).toContain('<td><i>NULL</i></td>');
    expect(html).toContain('<td>Ada</td>');
  });

  it('exports a selection as CSV', () => {
    const csv = formatDatabaseQueryResult(TABLE, 'csv', {
      startRow: 0,
      startCol: 1,
      endRow: 0,
      endCol: 1,
    });
    expect(csv).toBe('name\nAda');
  });
});

describe('formatDatabaseQueryClipboardTsv', () => {
  it('omits the header row', () => {
    expect(formatDatabaseQueryClipboardTsv(TABLE)).toBe(
      '1\tAda\t\n2\tGrace, Hopper\t\n3\t"Line\nBreak"\ta|b',
    );
  });

  it('copies a single cell', () => {
    expect(
      formatDatabaseQueryClipboardTsv(TABLE, {
        startRow: 0,
        startCol: 1,
        endRow: 0,
        endCol: 1,
      }),
    ).toBe('Ada');
  });
});
