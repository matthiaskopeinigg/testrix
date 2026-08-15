import { describe, expect, it } from 'vitest';

import { isSystemSchemaName, qualifySqlTableName, quoteSqlIdentifier } from './sql-identifier';

describe('quoteSqlIdentifier', () => {
  it('leaves plain names unquoted for postgres', () => {
    expect(quoteSqlIdentifier('users', 'postgresql')).toBe('users');
  });

  it('quotes names that are not plain identifiers', () => {
    expect(quoteSqlIdentifier('order items', 'postgresql')).toBe('"order items"');
    expect(quoteSqlIdentifier('order items', 'mysql')).toBe('`order items`');
  });
});

describe('qualifySqlTableName', () => {
  it('omits sqlite schema', () => {
    expect(qualifySqlTableName('main', 'users', 'sqlite')).toBe('users');
  });

  it('prefixes postgres schema', () => {
    expect(qualifySqlTableName('public', 'users', 'postgresql')).toBe('public.users');
  });
});

describe('isSystemSchemaName', () => {
  it('hides engine catalogs', () => {
    expect(isSystemSchemaName('pg_catalog')).toBe(true);
    expect(isSystemSchemaName('information_schema')).toBe(true);
    expect(isSystemSchemaName('mysql')).toBe(true);
    expect(isSystemSchemaName('sys')).toBe(true);
    expect(isSystemSchemaName('public')).toBe(false);
  });
});
