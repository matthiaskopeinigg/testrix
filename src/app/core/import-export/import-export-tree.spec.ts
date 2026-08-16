import { describe, expect, it } from 'vitest';

import { filterBundle, TESTRIX_BUNDLE_SCHEMA_V1, type TestrixBundleV1 } from '@shared/import-export';

import { buildImportExportTree } from './import-export-tree';

describe('buildImportExportTree', () => {
  it('shows Database connections and queries instead of a Settings Databases blob', () => {
    const conn = {
      id: 'conn-1',
      kind: 'connection' as const,
      name: 'Local',
      type: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      connectOnBoot: false,
    };
    const bundle: TestrixBundleV1 = {
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      databases: {
        connections: { connections: [conn], nodes: [conn], idleDisconnectMinutes: 0 },
        queries: {
          schemaVersion: 2,
          nodes: [
            {
              id: 'q-1',
              kind: 'query',
              name: 'Count users',
              connectionId: 'conn-1',
              query: 'SELECT count(*) FROM users',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      },
      settings: {
        databases: { connections: [conn], nodes: [conn], idleDisconnectMinutes: 0 },
      },
    };

    const tree = buildImportExportTree(bundle);
    const labels = tree.map((node) => node.label);

    expect(labels).toContain('Database');
    expect(labels).not.toContain('Settings');

    const database = tree.find((node) => node.label === 'Database');
    expect(database?.children.map((child) => child.label)).toEqual(['Connections', 'Queries']);
    expect(database?.children[0]?.children[0]?.label).toBe('Local');
    expect(database?.children[1]?.children[0]?.label).toBe('Count users');
  });

  it('lifts a legacy settings.databases export into the Database tree', () => {
    const conn = {
      id: 'legacy',
      kind: 'connection' as const,
      name: 'Old export',
      type: 'redis' as const,
      host: 'localhost',
      port: 6379,
      connectOnBoot: false,
    };
    const tree = buildImportExportTree({
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      settings: {
        databases: { connections: [conn], nodes: [conn], idleDisconnectMinutes: 0 },
      },
    });

    expect(tree.map((node) => node.label)).toEqual(['Database']);
    expect(tree[0]?.children[0]?.children[0]?.label).toBe('Old export');
  });
});

describe('filterBundle databases', () => {
  it('prunes database connections without dropping queries', () => {
    const connA = {
      id: 'conn-a',
      kind: 'connection' as const,
      name: 'A',
      type: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      connectOnBoot: false,
    };
    const connB = { ...connA, id: 'conn-b', name: 'B' };
    const source: TestrixBundleV1 = {
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      databases: {
        connections: { connections: [connA, connB], nodes: [connA, connB], idleDisconnectMinutes: 0 },
        queries: {
          schemaVersion: 2,
          nodes: [
            {
              id: 'q-1',
              kind: 'query',
              name: 'Users',
              connectionId: 'conn-a',
              query: 'SELECT 1',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      },
    };

    const filtered = filterBundle(source, {
      sections: new Set(['databases']),
      databaseConnections: true,
      databaseConnectionItems: new Set(['conn-b']),
      databaseQueries: true,
      databaseQueryItems: new Set(['q-1']),
    });

    expect(filtered.databases?.connections?.connections.map((item) => item.id)).toEqual(['conn-b']);
    expect(filtered.databases?.queries?.nodes[0]?.id).toBe('q-1');
  });
});
