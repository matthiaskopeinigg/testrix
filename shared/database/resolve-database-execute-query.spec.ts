import { describe, expect, it } from 'vitest';

import { resolveDatabaseExecuteQuery } from './resolve-database-execute-query';

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
});
