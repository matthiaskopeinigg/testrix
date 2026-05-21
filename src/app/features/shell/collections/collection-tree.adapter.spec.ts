import { describe, expect, it } from 'vitest';

import {
  createDefaultCollectionFolderSettings,
  createDefaultCollectionRequestSettings,
} from '@shared/config';

import { fromTreeNodes, toTreeNodes } from './collection-tree.adapter';
import { COLLECTION_TREE_MOCK } from './collection-tree.mock';
describe('collection-tree.adapter', () => {
  it('round-trips folder settings', () => {
    const nodes = toTreeNodes(
      fromTreeNodes(COLLECTION_TREE_MOCK).map((node) => {
        if (node.kind !== 'folder') {
          return node;
        }
        return {
          ...node,
          settings: {
            ...createDefaultCollectionFolderSettings(),
            variables: [
              {
                id: 'v1',
                key: 'baseUrl',
                value: 'https://api.example.com',
                description: 'API root',
              },
            ],
          },
        };
      }),
    );

    const folder = nodes.find((n) => n.id === 'folder-auth');
    expect(folder?.data?.settings?.variables[0]?.key).toBe('baseUrl');

    const withDescription = toTreeNodes([
      {
        id: 'folder-notes',
        label: 'Notes',
        kind: 'folder' as const,
        description: 'Shared auth helpers',
        settings: createDefaultCollectionFolderSettings(),
        children: [],
      },
    ]);
    expect(withDescription[0]?.subtitle).toBe('Shared auth helpers');
    expect(fromTreeNodes(withDescription)[0]).toMatchObject({
      kind: 'folder',
      description: 'Shared auth helpers',
    });

    const persisted = fromTreeNodes(nodes);
    const persistedFolder = persisted.find((n) => n.kind === 'folder');
    expect(persistedFolder?.kind).toBe('folder');
    if (persistedFolder?.kind === 'folder') {
      expect(persistedFolder.settings.variables[0]?.key).toBe('baseUrl');
    }
  });

  it('round-trips request settings', () => {
    const settings = {
      ...createDefaultCollectionRequestSettings(),
      docs: 'API notes',
      body: { mode: 'json' as const, raw: '{"a":1}' },
    };
    const tree = toTreeNodes([
      {
        id: 'req-1',
        label: 'GET /x',
        kind: 'request',
        method: 'GET',
        url: '/x',
        settings,
      },
    ]);
    expect(tree[0]?.data?.requestSettings?.docs).toBe('API notes');

    const withDescription = toTreeNodes([
      {
        id: 'req-desc',
        label: 'POST /login',
        kind: 'request',
        method: 'POST',
        url: '/login',
        description: 'Authenticate user',
        settings: createDefaultCollectionRequestSettings(),
      },
    ]);
    expect(withDescription[0]?.subtitle).toBe('Authenticate user');

    const withTags = toTreeNodes([
      {
        id: 'req-tags',
        label: 'GET /items',
        kind: 'request',
        method: 'GET',
        url: '/items',
        settings: { ...createDefaultCollectionRequestSettings(), tags: ['api', 'v1'] },
      },
    ]);
    expect(withTags[0]?.tags).toEqual(['api', 'v1']);

    const persisted = fromTreeNodes(tree);
    expect(persisted[0]?.kind).toBe('request');
    if (persisted[0]?.kind === 'request') {
      expect(persisted[0].settings.docs).toBe('API notes');
      expect(persisted[0].settings.body).toEqual({ mode: 'json', raw: '{"a":1}' });
    }
  });
});
