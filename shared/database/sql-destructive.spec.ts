import { describe, expect, it } from 'vitest';

import { detectDestructiveSql } from './sql-destructive';

describe('detectDestructiveSql', () => {
  it('detects leading verbs', () => {
    expect(detectDestructiveSql('UPDATE users SET n = 1')).toBe('UPDATE');
    expect(detectDestructiveSql('DELETE FROM users')).toBe('DELETE');
    expect(detectDestructiveSql('DROP TABLE users')).toBe('DROP');
    expect(detectDestructiveSql('TRUNCATE TABLE users')).toBe('TRUNCATE');
    expect(detectDestructiveSql('ALTER TABLE users ADD x int')).toBe('ALTER');
  });

  it('ignores verbs inside strings and comments', () => {
    expect(detectDestructiveSql("SELECT 'DELETE FROM users'")).toBeNull();
    expect(detectDestructiveSql('-- DROP TABLE users\nSELECT 1')).toBeNull();
  });

  it('detects DML after WITH', () => {
    expect(detectDestructiveSql('WITH x AS (SELECT 1) DELETE FROM users')).toBe('DELETE');
  });
});
