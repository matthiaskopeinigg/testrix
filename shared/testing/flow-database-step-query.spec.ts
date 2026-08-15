import { describe, expect, it } from 'vitest';

import type { SavedQueryTreeItem } from '../database/saved-queries.schema';

import {
  resolveDatabaseStepQueryBinding,
  resolveDatabaseStepQuerySource,
} from './flow-database-step-query';
import { createDefaultDatabaseStepConfig, databaseStepConfigSchema } from './test-suite-steps.schema';

const savedNodes: readonly SavedQueryTreeItem[] = [
  {
    id: 'folder-1',
    kind: 'folder',
    name: 'Reports',
    updatedAt: '2026-01-01T00:00:00.000Z',
    children: [
      {
        id: 'q-users',
        kind: 'query',
        name: 'List users',
        connectionId: 'conn-pg',
        query: 'SELECT * FROM users WHERE id = {{userId}}',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
];

describe('databaseStepConfigSchema', () => {
  it('defaults existing steps to an empty manual query', () => {
    const parsed = databaseStepConfigSchema.parse({ connectionId: 'c1', query: 'SELECT 1' });
    expect(parsed.querySource).toBeUndefined();
    expect(parsed.savedQueryId).toBeUndefined();
    expect(resolveDatabaseStepQuerySource(parsed)).toBe('manual');
  });

  it('creates a manual default config', () => {
    expect(createDefaultDatabaseStepConfig()).toEqual({
      connectionId: '',
      query: '',
      querySource: 'manual',
    });
  });
});

describe('resolveDatabaseStepQuerySource', () => {
  it('treats a savedQueryId as saved when querySource is omitted', () => {
    expect(resolveDatabaseStepQuerySource({ connectionId: '', query: '', savedQueryId: 'q-users' })).toBe(
      'saved',
    );
  });

  it('honors an explicit manual source even when a saved id is present', () => {
    expect(
      resolveDatabaseStepQuerySource({
        connectionId: '',
        query: 'SELECT 1',
        querySource: 'manual',
        savedQueryId: 'q-users',
      }),
    ).toBe('manual');
  });
});

describe('resolveDatabaseStepQueryBinding', () => {
  it('returns inline query text for manual steps', () => {
    expect(
      resolveDatabaseStepQueryBinding(
        { connectionId: 'conn-pg', query: 'SELECT 1', querySource: 'manual' },
        savedNodes,
      ),
    ).toEqual({ connectionId: 'conn-pg', query: 'SELECT 1' });
  });

  it('loads query text and connection from the saved sidebar query', () => {
    expect(
      resolveDatabaseStepQueryBinding(
        { connectionId: '', query: '', querySource: 'saved', savedQueryId: 'q-users' },
        savedNodes,
      ),
    ).toEqual({
      connectionId: 'conn-pg',
      query: 'SELECT * FROM users WHERE id = {{userId}}',
    });
  });

  it('keeps a step connection override over the saved query connection', () => {
    expect(
      resolveDatabaseStepQueryBinding(
        {
          connectionId: 'conn-override',
          query: '',
          querySource: 'saved',
          savedQueryId: 'q-users',
        },
        savedNodes,
      ),
    ).toEqual({
      connectionId: 'conn-override',
      query: 'SELECT * FROM users WHERE id = {{userId}}',
    });
  });

  it('throws when the saved query is missing', () => {
    expect(() =>
      resolveDatabaseStepQueryBinding(
        { connectionId: '', query: '', querySource: 'saved', savedQueryId: 'missing' },
        savedNodes,
      ),
    ).toThrow('Unknown saved query id: missing');
  });

  it('throws when saved source has no query id', () => {
    expect(() =>
      resolveDatabaseStepQueryBinding({ connectionId: '', query: '', querySource: 'saved' }, savedNodes),
    ).toThrow('DATABASE step needs a saved query.');
  });
});
