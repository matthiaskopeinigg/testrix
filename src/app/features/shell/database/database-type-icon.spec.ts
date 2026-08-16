import { describe, expect, it } from 'vitest';

import { DATABASE_TYPE_IDS } from '@shared/config';

import { iconForDatabaseType } from './database-type-icon';

describe('iconForDatabaseType', () => {
  it('maps every supported engine to a matching icon', () => {
    for (const type of DATABASE_TYPE_IDS) {
      expect(iconForDatabaseType(type)).toBe(type);
    }
  });

  it('falls back to the generic database icon', () => {
    expect(iconForDatabaseType(undefined)).toBe('database');
    expect(iconForDatabaseType('unknown')).toBe('database');
  });
});
