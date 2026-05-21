import { describe, expect, it } from 'vitest';

import {
  createDefaultCollectionRequestSettings,
} from '@shared/config/collection-request-settings.schema';
import {
  collectionsFileSchema,
  enrichCollectionFolderNode,
  enrichCollectionRequestNode,
} from '@shared/config/collections.schema';

describe('collectionsFileSchema', () => {
  it('accepts nested folder, request, and websocket nodes', () => {
    const file = {
      schemaVersion: 1 as const,
      meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      nodes: [
        {
          id: 'folder-auth',
          label: 'Auth',
          kind: 'folder' as const,
          settings: {
            variables: [],
            headers: [],
            auth: { type: 'none' as const },
            scripts: { pre: '', post: '' },
          },
          children: [
            {
              id: 'req-login',
              label: 'POST /login',
              kind: 'request' as const,
              method: 'POST',
              url: '/login',
              settings: createDefaultCollectionRequestSettings(),
            },
          ],
        },
      ],
    };
    expect(collectionsFileSchema.parse(file).nodes.length).toBe(1);
  });

  it('enrichCollectionFolderNode fills default settings', () => {
    const enriched = enrichCollectionFolderNode({
      id: 'f1',
      label: 'Folder',
      kind: 'folder',
      children: [],
    });
    expect(enriched.settings.auth.type).toBe('none');
    expect(enriched.settings.scripts).toEqual({ pre: '', post: '' });
  });

  it('enrichCollectionRequestNode fills default settings', () => {
    const enriched = enrichCollectionRequestNode({
      id: 'r1',
      label: 'GET /x',
      kind: 'request',
      method: 'GET',
      url: '/x',
    });
    expect(enriched.settings.body.mode).toBe('none');
    expect(enriched.settings.auth.type).toBe('none');
  });

  it('rejects unknown node kinds', () => {
    expect(() =>
      collectionsFileSchema.parse({
        schemaVersion: 1,
        meta: { createdAt: 'x', updatedAt: 'x' },
        nodes: [{ id: 'bad', label: 'Bad', kind: 'environment' }],
      }),
    ).toThrow();
  });
});
