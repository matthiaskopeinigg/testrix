import { describe, expect, it } from 'vitest';

import { COLLECTION_TREE_MOCK } from './collection-tree.mock';
import { collectAllCollectionTreeTags, filterCollectionTreeByTags } from './collection-tree.tags';

describe('collectAllCollectionTreeTags', () => {
  it('returns sorted unique tags from the tree', () => {
    const nodes = [
      {
        id: 'a',
        label: 'A',
        tags: ['beta', 'alpha'],
        data: { kind: 'request' as const },
      },
      {
        id: 'b',
        label: 'B',
        tags: ['alpha'],
        data: { kind: 'folder' as const },
        children: [],
      },
    ];

    expect(collectAllCollectionTreeTags(nodes)).toEqual(['alpha', 'beta']);
  });
});

describe('filterCollectionTreeByTags', () => {
  it('keeps nodes matching selected tags and ancestor folders', () => {
    const nodes = [
      {
        id: 'folder',
        label: 'API',
        kind: 'folder' as const,
        children: [
          {
            id: 'req',
            label: 'Login',
            tags: ['auth'],
            data: { kind: 'request' as const, method: 'POST' },
          },
        ],
      },
    ];

    const result = filterCollectionTreeByTags(nodes, ['auth']);
    expect(result).toHaveLength(1);
    expect(result[0]?.children).toHaveLength(1);
    expect(result[0]?.children?.[0]?.label).toBe('Login');
  });

  it('returns full tree when tag filter is empty', () => {
    expect(filterCollectionTreeByTags(COLLECTION_TREE_MOCK, [])).toHaveLength(COLLECTION_TREE_MOCK.length);
  });
});
