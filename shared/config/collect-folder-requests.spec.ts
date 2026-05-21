import { describe, expect, it } from 'vitest';

import { createDefaultCollectionFolderSettings } from './collection-folder-settings.schema';
import { createDefaultCollectionRequestSettings } from './collection-request-settings.schema';
import type { CollectionNode } from './collections.schema';
import { collectRequestsInFolder } from './collect-folder-requests';

function folder(
  id: string,
  label: string,
  children: CollectionNode[],
  order = 0,
): CollectionNode {
  return {
    id,
    label,
    kind: 'folder',
    order,
    settings: createDefaultCollectionFolderSettings(),
    children,
  };
}

function request(id: string, label: string, order = 0): CollectionNode {
  return {
    id,
    label,
    kind: 'request',
    method: 'GET',
    url: '/',
    order,
    settings: createDefaultCollectionRequestSettings(),
  };
}

describe('collectRequestsInFolder', () => {
  const tree: CollectionNode[] = [
    folder('root-folder', 'API', [
      request('r1', 'One', 10),
      folder('nested', 'Nested', [request('r2', 'Two', 20)], 5),
      request('r3', 'Three', 30),
    ]),
  ];

  it('collects all requests in subtree in DFS order', () => {
    const entries = collectRequestsInFolder(tree, 'root-folder');
    expect(entries.map((e) => e.requestId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('includes ancestor folder ids', () => {
    const nested = collectRequestsInFolder(tree, 'root-folder').find((e) => e.requestId === 'r2');
    expect(nested?.ancestorFolderIds).toEqual(['root-folder', 'nested']);
  });
});
