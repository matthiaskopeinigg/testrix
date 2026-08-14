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
});
