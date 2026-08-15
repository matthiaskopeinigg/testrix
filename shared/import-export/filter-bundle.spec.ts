import { describe, expect, it } from 'vitest';

import { createDefaultCollectionFolderSettings } from '../config/collection-folder-settings.schema';
import { createDefaultCollectionRequestSettings } from '../config/collection-request-settings.schema';
import type { CollectionNode } from '../config/collections.schema';
import { TESTRIX_BUNDLE_SCHEMA_V1, type TestrixBundleV1 } from './testrix-bundle.schema';
import { filterBundle } from './bundle-selection';

function folder(id: string, label: string, children: CollectionNode[]): CollectionNode {
  return {
    id,
    label,
    kind: 'folder',
    settings: createDefaultCollectionFolderSettings(),
    children,
  };
}

function request(id: string, label: string): CollectionNode {
  return {
    id,
    label,
    kind: 'request',
    method: 'GET',
    url: '/',
    settings: createDefaultCollectionRequestSettings(),
  };
}

function createTestBundle(): TestrixBundleV1 {
  return {
    schema: TESTRIX_BUNDLE_SCHEMA_V1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    appVersion: '0.1.0',
    collections: {
      schemaVersion: 1,
      meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      nodes: [folder('folder-a', 'Folder A', [request('req-1', 'Request 1')]), request('req-2', 'Request 2')],
    },
    environments: {
      schemaVersion: 1,
      meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      environments: [
        {
          id: 'env-a',
          name: 'Local',
          nodes: [{ id: 'var-1', kind: 'variable', key: 'baseUrl', value: '', order: 0 }],
        },
        {
          id: 'env-b',
          name: 'Prod',
          nodes: [],
        },
      ],
    },
  };
}

describe('filterBundle', () => {
  it('keeps only selected collection subtree nodes', () => {
    const source = createTestBundle();

    const filtered = filterBundle(source, {
      sections: new Set(['collections']),
      collectionItems: new Set(['req-2']),
    });

    expect(filtered.collections?.nodes).toHaveLength(1);
    expect(filtered.collections?.nodes[0]?.id).toBe('req-2');
    expect(filtered.environments).toBeUndefined();
  });

  it('keeps only selected environment definitions', () => {
    const source = createTestBundle();

    const filtered = filterBundle(source, {
      sections: new Set(['environments']),
      environments: new Set(['env-a']),
    });

    expect(filtered.environments?.environments).toHaveLength(1);
    expect(filtered.environments?.environments[0]?.id).toBe('env-a');
    expect(filtered.collections).toBeUndefined();
  });

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
        connections: { connections: [connA, connB], nodes: [connA, connB] },
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
    expect(filtered.databases?.queries?.nodes).toHaveLength(1);
    expect(filtered.databases?.queries?.nodes[0]?.id).toBe('q-1');
  });

  it('lifts a legacy settings.databases blob when filtering', () => {
    const conn = {
      id: 'legacy-1',
      kind: 'connection' as const,
      name: 'Legacy',
      type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      connectOnBoot: false,
    };
    const source: TestrixBundleV1 = {
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      settings: {
        databases: { connections: [conn], nodes: [conn] },
      },
    };

    const filtered = filterBundle(source, {
      sections: new Set(['databases']),
      databaseConnections: true,
    });

    expect(filtered.settings).toBeUndefined();
    expect(filtered.databases?.connections?.connections[0]?.id).toBe('legacy-1');
  });
});
