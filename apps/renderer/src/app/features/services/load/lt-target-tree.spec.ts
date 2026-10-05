import { describe, expect, it } from 'vitest';
import type { CollectionNode } from '@testrix/contracts';

import { buildTargetTreeRows, filterCollectionHttpTree, findHttpRequest } from './lt-target-tree';

const tree: readonly CollectionNode[] = [
  {
    kind: 'folder',
    id: 'f1',
    name: 'API',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    children: [
      {
        kind: 'http',
        id: 'r1',
        name: 'List users',
        method: 'GET',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        status: null,
      },
      {
        kind: 'websocket',
        id: 'ws1',
        name: 'Feed',
        modifiedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
];

describe('lt-target-tree', () => {
  it('filters to HTTP requests and keeps folders with matches', () => {
    const filtered = filterCollectionHttpTree(tree, 'list');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.kind).toBe('folder');
    if (filtered[0]?.kind !== 'folder')
      return;
    expect(filtered[0].children).toHaveLength(1);
    expect(filtered[0].children[0]?.kind).toBe('http');
  });

  it('finds HTTP requests and skips websockets', () => {
    expect(findHttpRequest(tree, 'r1')?.name).toBe('List users');
    expect(findHttpRequest(tree, 'ws1')).toBeNull();
  });

  it('builds visible rows from expanded folders', () => {
    const rows = buildTargetTreeRows({ nodes: tree, expandedIds: new Set(['f1']) });
    expect(rows.map((row) => row.kind)).toEqual(['folder', 'http']);
  });
});
