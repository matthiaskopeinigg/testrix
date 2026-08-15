import { describe, expect, it } from 'vitest';

import { postgresPoolFingerprint, resolvePostgresDatabaseName } from './resolve-postgres-database';

describe('resolvePostgresDatabaseName', () => {
  it('returns a trimmed name', () => {
    expect(resolvePostgresDatabaseName('testrix')).toBe('testrix');
    expect(resolvePostgresDatabaseName('  testrix  ')).toBe('testrix');
  });

  it('omits empty names so pg can default to the username', () => {
    expect(resolvePostgresDatabaseName(undefined)).toBeUndefined();
    expect(resolvePostgresDatabaseName('')).toBeUndefined();
    expect(resolvePostgresDatabaseName('   ')).toBeUndefined();
  });
});

describe('postgresPoolFingerprint', () => {
  it('changes when the database name changes', () => {
    const base = { host: 'localhost', port: 5432, user: 'testrix', password: 'testrix' };
    expect(postgresPoolFingerprint({ ...base, database: undefined })).not.toBe(
      postgresPoolFingerprint({ ...base, database: 'testrix' }),
    );
  });
});
