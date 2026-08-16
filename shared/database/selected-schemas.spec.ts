import { describe, expect, it } from 'vitest';

import {
  defaultSelectedSchemaNames,
  filterSchemasBySelection,
  completionSchemaNames,
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

  it('shows no schemas until the user selects some', () => {
    expect(
      resolveVisibleDatabaseSchemas(
        { type: 'oracle', user: 'hr', selectedSchemas: undefined },
        many,
        false,
      ).map((schema) => schema.name),
    ).toEqual([]);
    expect(
      resolveVisibleDatabaseSchemas(
        { type: 'postgresql', database: 'app', selectedSchemas: undefined },
        [
          { name: 'pg_catalog', system: true },
          { name: 'public', system: false },
          { name: 'app', system: false },
        ],
        false,
      ).map((schema) => schema.name),
    ).toEqual([]);
  });

  it('seeds nothing when no schemas are selected', () => {
    expect(seedCatalogSchemaItems({ type: 'oracle', user: 'hr' })).toEqual([]);
    expect(seedCatalogSchemaItems({ type: 'postgresql', database: 'app' })).toEqual([]);
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

  it('limits completion schemas to selected names', () => {
    expect(completionSchemaNames({ type: 'oracle', user: 'hr' })).toEqual([]);
    expect(
      completionSchemaNames({
        type: 'oracle',
        user: 'hr',
        selectedSchemas: ['SCOTT', 'APP'],
      }),
    ).toEqual(['SCOTT', 'APP']);
  });
});
