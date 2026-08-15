import { describe, expect, it } from 'vitest';

import {
  canSuggestSqlColumn,
  isInsideSqlSingleQuotes,
  isSqlStringLiteralContext,
  lastIdentifierToken,
} from './tx-suggest-input-token';

describe('lastIdentifierToken', () => {
  it('reads the identifier touching the caret', () => {
    expect(lastIdentifierToken('email LIKE', 2)).toEqual({ start: 0, end: 5, text: 'email' });
    expect(lastIdentifierToken('id > 1 AND em', 13)).toEqual({ start: 11, end: 13, text: 'em' });
    expect(lastIdentifierToken('AND ', 4)).toEqual({ start: 4, end: 4, text: '' });
  });

  it('does not treat a trailing number as an identifier start', () => {
    expect(lastIdentifierToken('id > 1', 6)).toEqual({ start: 6, end: 6, text: '' });
  });
});

describe('isInsideSqlSingleQuotes', () => {
  it('tracks SQL single-quoted strings and escaped quotes', () => {
    expect(isInsideSqlSingleQuotes("email = '", 9)).toBe(true);
    expect(isInsideSqlSingleQuotes("email = ''", 10)).toBe(false);
    expect(isInsideSqlSingleQuotes("name = 'O''C", 13)).toBe(true);
  });
});

describe('isSqlStringLiteralContext', () => {
  it('hides identifier suggestions inside and on an opening quote', () => {
    expect(isSqlStringLiteralContext("name = ''", 8)).toBe(true);
    expect(isSqlStringLiteralContext("name = ''", 7)).toBe(true);
    expect(isSqlStringLiteralContext("name = ''", 9)).toBe(false);
    expect(isSqlStringLiteralContext('name = ', 7)).toBe(false);
  });
});

describe('canSuggestSqlColumn', () => {
  it('allows columns at the start and after boolean introducers', () => {
    expect(canSuggestSqlColumn('', 0)).toBe(true);
    expect(canSuggestSqlColumn('na', 2)).toBe(true);
    expect(canSuggestSqlColumn("name = 'x' AND ", 16)).toBe(true);
    expect(canSuggestSqlColumn("name = 'x' AND em", 17)).toBe(true);
    expect(canSuggestSqlColumn("name = 'x' OR ", 15)).toBe(true);
    expect(canSuggestSqlColumn('AND NOT ', 8)).toBe(true);
    expect(canSuggestSqlColumn('( ', 2)).toBe(true);
  });

  it('hides columns after a value, operator, or stray space', () => {
    expect(canSuggestSqlColumn('name ', 5)).toBe(false);
    expect(canSuggestSqlColumn('name = ', 7)).toBe(false);
    expect(canSuggestSqlColumn("name = ' '", 10)).toBe(false);
    expect(canSuggestSqlColumn("name = ' '", 8)).toBe(false);
    expect(canSuggestSqlColumn('IS NOT ', 7)).toBe(false);
    expect(canSuggestSqlColumn('price BETWEEN 1 AND ', 20)).toBe(false);
  });
});
