import { describe, expect, it } from 'vitest';

import {
  defaultSelectedSchemaNames,
  filterSchemasBySelection,
  resolveVisibleDatabaseSchemas,
  seedCatalogSchemaItems,
} from './selected-schemas';

describe('selected-schemas', () => {
  const many = [
    { name: 'SYS', system: true },
    { name: 'HR', system: false },
    { name: 'SCOTT', system: false },
    { name: 'APP', system: false },
  ];

  it('defaults Oracle to the connection user instead of every schema', () => {
    expect(
      resolveVisibleDatabaseSchemas(
        { type: 'oracle', user: 'hr', selectedSchemas: undefined },
        many,
        false,
      ).map((schema) => schema.name),
    ).toEqual(['HR']);
  });

  it('seeds Oracle with the connection user without a full directory', () => {
    expect(seedCatalogSchemaItems({ type: 'oracle', user: 'hr' })).toEqual([
      { name: 'HR', system: false },
    ]);
  });

  it('defaults Postgres to public when present', () => {
    expect(
      defaultSelectedSchemaNames(
        { type: 'postgresql', database: 'app' },
        [
          { name: 'pg_catalog', system: true },
          { name: 'public', system: false },
          { name: 'app', system: false },
        ],
      ),
    ).toEqual(['public']);
  });

  it('shows only explicitly selected schemas', () => {
    expect(
      resolveVisibleDatabaseSchemas(
        { type: 'oracle', user: 'hr', selectedSchemas: ['scott', 'APP'] },
        many,
        false,
      ).map((schema) => schema.name),
    ).toEqual(['SCOTT', 'APP']);
  });

  it('returns an empty list when selection is an empty array', () => {
    expect(
      filterSchemasBySelection(
        [
          { name: 'public', system: false },
          { name: 'app', system: false },
        ],
        [],
      ),
    ).toEqual([]);
  });
});
