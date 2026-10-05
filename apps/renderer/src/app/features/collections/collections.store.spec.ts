import { DEFAULT_COLLECTION_FILTERS, type CollectionNode } from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { filterCollectionTree } from './collections.store';

const ISO = '2026-01-01T00:00:00.000Z';

function emptyFolder(id: string, name = 'New folder'): CollectionNode {
  return { kind: 'folder', id, name, modifiedAt: ISO, children: [] };
}

function http(id: string, name = 'Get users'): CollectionNode {
  return { kind: 'http', id, name, modifiedAt: ISO, method: 'GET', status: null };
}

describe('filterCollectionTree', () => {
  it('keeps an empty folder when there is no search query', () => {
    const visible = filterCollectionTree([emptyFolder('folder-new')], DEFAULT_COLLECTION_FILTERS, '');
    expect(visible.map((node) => node.id)).toEqual(['folder-new']);
  });

  it('hides an empty folder whose name does not match the search', () => {
    const visible = filterCollectionTree([emptyFolder('folder-new')], DEFAULT_COLLECTION_FILTERS, 'auth');
    expect(visible).toEqual([]);
  });

  it('keeps an empty folder whose name matches the search', () => {
    const visible = filterCollectionTree(
      [emptyFolder('folder-new', 'New folder')],
      DEFAULT_COLLECTION_FILTERS,
      'new',
    );
    expect(visible.map((node) => node.id)).toEqual(['folder-new']);
  });

  it('hides an empty folder when the type filter excludes folders', () => {
    const visible = filterCollectionTree(
      [emptyFolder('folder-new'), http('http-1')],
      { ...DEFAULT_COLLECTION_FILTERS, kinds: ['http'] },
      '',
    );
    expect(visible.map((node) => node.id)).toEqual(['http-1']);
  });
});
