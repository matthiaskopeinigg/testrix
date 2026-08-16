import { describe, expect, it } from 'vitest';

import { extractNamedParameterNames, rewriteNamedParameters } from './sql-named-parameters';

describe('extractNamedParameterNames', () => {
  it('collects unique names in appearance order', () => {
    expect(
      extractNamedParameterNames('SELECT * FROM users WHERE email = :email AND id = :id OR email = :email'),
    ).toEqual(['email', 'id']);
  });

  it('ignores strings, comments, and postgres casts', () => {
    const sql = `
      SELECT ':email' AS a, -- :skip
      /* :also */ id::text
      FROM users WHERE name = :name
    `;
    expect(extractNamedParameterNames(sql)).toEqual(['name']);
  });
});

describe('rewriteNamedParameters', () => {
  it('rewrites postgres placeholders with stable indexes', () => {
    const names = extractNamedParameterNames('SELECT :email, :id, :email');
    expect(rewriteNamedParameters('SELECT :email, :id, :email', 'postgresql', names)).toEqual({
      sql: 'SELECT $1, $2, $1',
      names: ['email', 'id'],
    });
  });

  it('keeps oracle named binds', () => {
    expect(rewriteNamedParameters('SELECT :email', 'oracle', ['email']).sql).toBe('SELECT :email');
  });

  it('keeps sqlite named binds', () => {
    expect(rewriteNamedParameters('SELECT :email', 'sqlite', ['email']).sql).toBe('SELECT :email');
  });
});
