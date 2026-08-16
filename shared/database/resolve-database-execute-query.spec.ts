import { describe, expect, it } from 'vitest';

import {
  resolveDatabaseExecuteHighlightRanges,
  resolveDatabaseExecuteQuery,
  shouldPromptDatabaseExecuteChooser,
} from './resolve-database-execute-query';

describe('resolveDatabaseExecuteQuery', () => {
  it('returns the selected range when present', () => {
    const source = 'SELECT 1;\nSELECT 2;';
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: 10,
        selectionEnd: source.length,
        language: 'sql',
      }),
    ).toBe('SELECT 2');
  });

  it('returns the SQL statement at the caret', () => {
    const source = 'SELECT 1;\nSELECT id FROM users;\nSELECT 3;';
    const caret = source.indexOf('users');
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: caret,
        selectionEnd: caret,
        language: 'sql',
      }),
    ).toBe('SELECT id FROM users');
  });

  it('ignores semicolons inside strings and comments', () => {
    const source = "SELECT ';';\n-- skip;\nSELECT 2;";
    const caret = source.indexOf('2');
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: caret,
        selectionEnd: caret,
        language: 'sql',
      }),
    ).toBe('SELECT 2');
  });

  it('returns the Redis line at the caret', () => {
    const source = 'SET a 1\nGET a\nDEL a';
    const caret = source.indexOf('GET');
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: caret,
        selectionEnd: caret,
        language: 'redis',
      }),
    ).toBe('GET a');
  });

  it('falls back to the previous SQL statement on a trailing blank line', () => {
    const source = 'SELECT 1;\nSELECT 2;\n\n';
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: source.length,
        selectionEnd: source.length,
        language: 'sql',
      }),
    ).toBe('SELECT 2');
  });

  it('keeps the first statement when the caret is after its semicolon', () => {
    const source = "SELECT * from public.users WHEre email = '';\n\nSELECT * from public.users;";
    const firstEnd = source.indexOf(';') + 1;
    const firstSql = "SELECT * from public.users WHEre email = ''";
    for (const caret of [firstEnd - 1, firstEnd, source.indexOf('\n\n') + 1]) {
      expect(
        resolveDatabaseExecuteQuery({
          source,
          selectionStart: caret,
          selectionEnd: caret,
          language: 'sql',
        }),
      ).toBe(firstSql);
      expect(
        resolveDatabaseExecuteHighlightRanges({
          source,
          selectionStart: caret,
          language: 'sql',
          mode: 'caret',
        }),
      ).toEqual([{ start: 0, end: firstEnd }]);
    }
    const second = source.lastIndexOf('SELECT');
    expect(
      resolveDatabaseExecuteHighlightRanges({
        source,
        selectionStart: second,
        language: 'sql',
        mode: 'caret',
      }),
    ).toEqual([{ start: second, end: source.length }]);
  });

  it('prompts the execute chooser when several SQL statements exist and nothing is selected', () => {
    const source = 'SELECT 1;\nSELECT 2;';
    expect(
      shouldPromptDatabaseExecuteChooser({
        source,
        selectionStart: source.length,
        selectionEnd: source.length,
        language: 'sql',
      }),
    ).toBe(true);
    expect(
      shouldPromptDatabaseExecuteChooser({
        source,
        selectionStart: 0,
        selectionEnd: source.length,
        language: 'sql',
      }),
    ).toBe(false);
    expect(
      shouldPromptDatabaseExecuteChooser({
        source: 'SELECT 1;',
        selectionStart: 0,
        selectionEnd: 0,
        language: 'sql',
      }),
    ).toBe(false);
  });

  it('highlights the statement at the caret or each executable statement', () => {
    const source = 'SELECT 1;\nSELECT id FROM users;\nSELECT 3;';
    const caret = source.indexOf('users');
    expect(
      resolveDatabaseExecuteHighlightRanges({
        source,
        selectionStart: caret,
        language: 'sql',
        mode: 'caret',
      }),
    ).toEqual([
      {
        start: source.indexOf('SELECT id'),
        end: source.indexOf(';\nSELECT 3') + 1,
      },
    ]);
    expect(
      resolveDatabaseExecuteHighlightRanges({
        source,
        selectionStart: caret,
        language: 'sql',
        mode: 'all',
      }),
    ).toEqual([
      { start: 0, end: 'SELECT 1;'.length },
      {
        start: source.indexOf('SELECT id'),
        end: source.indexOf(';\nSELECT 3') + 1,
      },
      { start: source.indexOf('SELECT 3'), end: source.length },
    ]);
  });

  it('omits leading comments and blank lines from all-query highlights', () => {
    const source = "/*++  MAXIT  */\n\nSELECT * from users;\n\nSELECT * from users where email = '';";
    const first = source.indexOf('SELECT * from users;');
    const second = source.indexOf("SELECT * from users where email");
    expect(
      resolveDatabaseExecuteHighlightRanges({
        source,
        selectionStart: second,
        language: 'sql',
        mode: 'all',
      }),
    ).toEqual([
      { start: first, end: first + 'SELECT * from users;'.length },
      { start: second, end: source.length },
    ]);
  });
});
