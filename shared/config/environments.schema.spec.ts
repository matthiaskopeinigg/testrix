import { describe, expect, it } from 'vitest';

import { createDefaultEnvironments } from './defaults';
import { environmentsFileSchema } from './environments.schema';
import { migrateEnvironments } from './migrate';

describe('environmentsFileSchema', () => {
  it('accepts default environments file with no seeded environments', () => {
    const file = createDefaultEnvironments();
    const parsed = environmentsFileSchema.parse(file);
    expect(parsed.environments).toEqual([]);
  });

  it('accepts nested folders inside an environment scope', () => {
    expect(() =>
      environmentsFileSchema.parse({
        schemaVersion: 1,
        meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        environments: [
          {
            id: 'env-1',
            name: 'Test',
            nodes: [
              {
                id: 'folder-1',
                kind: 'folder',
                label: 'Group',
                children: [
                  {
                    id: 'nested-folder',
                    kind: 'folder',
                    label: 'Nested',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects empty variable keys', () => {
    expect(() =>
      environmentsFileSchema.parse({
        schemaVersion: 1,
        meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        environments: [
          {
            id: 'env-1',
            name: 'Test',
            nodes: [
              {
                id: 'var-1',
                kind: 'variable',
                key: '',
                value: 'x',
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});

describe('migrateEnvironments', () => {
  it('migrates legacy items array to environment definitions', () => {
    const migrated = migrateEnvironments({
      schemaVersion: 1,
      meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      items: [
        { id: 'env-local', label: 'Local', order: 0 },
        { id: 'env-staging', label: 'Staging', order: 10 },
      ],
    });

    expect(migrated.environments).toHaveLength(2);
    expect(migrated.environments[0]).toMatchObject({
      id: 'env-local',
      name: 'Local',
      nodes: [],
    });
  });

  it('migrates legacy root nodes to environment definitions', () => {
    const migrated = migrateEnvironments({
      schemaVersion: 1,
      meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      nodes: [
        {
          id: 'folder-local',
          kind: 'folder',
          label: 'Local',
          children: [
            {
              id: 'var-base-url',
              kind: 'variable',
              key: 'baseUrl',
              value: 'http://localhost:3000',
            },
          ],
        },
        {
          id: 'var-token',
          kind: 'variable',
          key: 'apiToken',
          value: '',
        },
      ],
    });

    expect(migrated.environments).toHaveLength(2);
    expect(migrated.environments[0]?.name).toBe('Global');
    expect(migrated.environments[1]).toMatchObject({
      id: 'folder-local',
      name: 'Local',
    });
    expect(migrated.environments[1]?.nodes[0]).toMatchObject({ key: 'baseUrl' });
  });
});
