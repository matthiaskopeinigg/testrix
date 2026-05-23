import { describe, expect, it } from 'vitest';

import { filterCollectionTreeByMethod } from './collection-tree.filter-method';

describe('filterCollectionTreeByMethod', () => {
  const tree = [
    {
      id: 'folder',
      label: 'API',
      kind: 'folder' as const,
      children: [
        {
          id: 'get-req',
          label: 'List',
          tags: [],
          data: { kind: 'request' as const, method: 'GET' },
        },
        {
          id: 'post-req',
          label: 'Create',
          tags: [],
          data: { kind: 'request' as const, method: 'POST' },
        },
        {
          id: 'ws',
          label: 'Socket',
          data: { kind: 'websocket' as const, wsPath: 'ws://x' },
        },
      ],
    },
  ];

  it('filters requests by HTTP method and drops websockets', () => {
    const result = filterCollectionTreeByMethod(tree, ['POST']);
    expect(result).toHaveLength(1);
    expect(result[0]?.children).toHaveLength(1);
    expect(result[0]?.children?.[0]?.label).toBe('Create');
  });

  it('returns unchanged tree when method filter is empty', () => {
    expect(filterCollectionTreeByMethod(tree, [])).toHaveLength(1);
    expect(filterCollectionTreeByMethod(tree, [])[0]?.children).toHaveLength(3);
  });
});
