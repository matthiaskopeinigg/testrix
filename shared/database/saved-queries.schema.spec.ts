import { describe, expect, it } from 'vitest';

import {
  createDefaultSavedQueriesFile,
  databaseTableTabResourceId,
  flattenSavedQueries,
  isSavedDatabaseQuery,
  isSavedQueryFolder,
  parseDatabaseTableTabResourceId,
  parseSavedQueriesFile,
} from './saved-queries.schema';

describe('parseSavedQueriesFile', () => {
  it('returns an empty v2 file for invalid input', () => {
    expect(parseSavedQueriesFile(null)).toEqual(createDefaultSavedQueriesFile());
  });

  it('migrates a v1 flat query list to root query nodes', () => {
    const parsed = parseSavedQueriesFile({
      schemaVersion: 1,
      queries: [
        {
          id: 'q1',
          name: 'Users',
          connectionId: 'c1',
          query: 'SELECT 1',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]).toMatchObject({
      id: 'q1',
      kind: 'query',
      name: 'Users',
      query: 'SELECT 1',
    });
  });

  it('keeps folders and nested queries in a v2 file', () => {
    const parsed = parseSavedQueriesFile({
      schemaVersion: 2,
      nodes: [
        {
          id: 'f1',
          kind: 'folder',
          name: 'Auth',
          updatedAt: '2020-01-01T00:00:00.000Z',
          children: [
            {
              id: 'q1',
              kind: 'query',
              name: 'Login',
              connectionId: '',
              query: 'SELECT 1',
              updatedAt: '2020-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    });
    expect(isSavedQueryFolder(parsed.nodes[0]!)).toBe(true);
    expect(flattenSavedQueries(parsed.nodes).map((q) => q.id)).toEqual(['q1']);
    expect(isSavedDatabaseQuery(flattenSavedQueries(parsed.nodes)[0]!)).toBe(true);
  });

  it('keeps a query with an accidental children array as a query', () => {
    const parsed = parseSavedQueriesFile({
      schemaVersion: 2,
      nodes: [
        {
          id: 'q1',
          kind: 'query',
          name: 'Users',
          connectionId: '',
          query: 'SELECT 1',
          updatedAt: '2020-01-01T00:00:00.000Z',
          children: [],
        },
      ],
    });
    expect(parsed.nodes[0]).toMatchObject({ id: 'q1', kind: 'query', name: 'Users' });
  });

  it('drops duplicate query ids copied into every folder', () => {
    const query = {
      id: 'q1',
      kind: 'query',
      name: 'Users',
      connectionId: '',
      query: 'SELECT 1',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    const parsed = parseSavedQueriesFile({
      schemaVersion: 2,
      nodes: [
        {
          id: 'f1',
          kind: 'folder',
          name: 'A',
          updatedAt: '2020-01-01T00:00:00.000Z',
          children: [query],
        },
        {
          id: 'f2',
          kind: 'folder',
          name: 'B',
          updatedAt: '2020-01-01T00:00:00.000Z',
          children: [query],
        },
      ],
    });
    expect(flattenSavedQueries(parsed.nodes).map((item) => item.id)).toEqual(['q1']);
    expect(parsed.nodes[1]).toMatchObject({ id: 'f2', children: [] });
  });
});

describe('databaseTableTabResourceId', () => {
  it('round-trips connection, schema, and table including reserved characters', () => {
    const id = databaseTableTabResourceId('conn/a', 'public', 'user/roles');
    expect(id.startsWith('dbt:')).toBe(true);
    expect(parseDatabaseTableTabResourceId(id)).toEqual({
      connectionId: 'conn/a',
      schema: 'public',
      table: 'user/roles',
    });
    expect(parseDatabaseTableTabResourceId('dbq:x')).toBeNull();
  });
});
