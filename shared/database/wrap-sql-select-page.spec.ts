import { describe, expect, it } from 'vitest';

import { canPageSqlSelect, wrapSqlSelectPage } from './wrap-sql-select-page';

describe('canPageSqlSelect', () => {
  it('allows a single SELECT or WITH', () => {
    expect(canPageSqlSelect('SELECT * FROM users', 'postgresql')).toBe(true);
    expect(canPageSqlSelect('WITH x AS (SELECT 1) SELECT * FROM x', 'sqlite')).toBe(true);
    expect(canPageSqlSelect('(SELECT 1)', 'mysql')).toBe(true);
  });

  it('refuses INSERT and multi-statement scripts', () => {
    expect(canPageSqlSelect('INSERT INTO users (name) VALUES (\'a\')', 'postgresql')).toBe(false);
    expect(canPageSqlSelect('SELECT 1; SELECT 2', 'postgresql')).toBe(false);
    expect(canPageSqlSelect('GET foo', 'redis')).toBe(false);
  });
});

describe('wrapSqlSelectPage', () => {
  it('wraps PostgreSQL with LIMIT/OFFSET', () => {
    expect(wrapSqlSelectPage('SELECT * FROM users;', 500, 0, 'postgresql')).toContain(
      'LIMIT 500 OFFSET 0',
    );
  });

  it('wraps SQL Server with OFFSET/FETCH', () => {
    const sql = wrapSqlSelectPage('SELECT * FROM users', 100, 200, 'mssql');
    expect(sql).toContain('OFFSET 200 ROWS FETCH NEXT 100 ROWS ONLY');
  });

  it('wraps Oracle with OFFSET/FETCH and no AS alias', () => {
    const sql = wrapSqlSelectPage('SELECT * FROM users', 50, 10, 'oracle');
    expect(sql).toContain('OFFSET 10 ROWS FETCH NEXT 50 ROWS ONLY');
    expect(sql).not.toContain('AS _tx_page');
  });

  it('pages Mongo find with skip/limit', () => {
    expect(canPageSqlSelect('db.users.find({})', 'mongodb')).toBe(true);
    expect(wrapSqlSelectPage('db.users.find({})', 25, 5, 'mongodb')).toBe(
      'db.users.find({}).skip(5).limit(25)',
    );
  });
});
