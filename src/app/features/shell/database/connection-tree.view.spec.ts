import { describe, expect, it } from 'vitest';

import { applyConnectionTreeView, sortConnectionTree } from './connection-tree.view';
import type { ConnectionTreeNode } from './connection-tree.types';

describe('connection-tree.view', () => {
  const nodes: ConnectionTreeNode[] = [
    { id: 'b', label: 'Beta', kind: 'connection', data: { kind: 'connection', type: 'postgresql' } },
    {
      id: 'f',
      label: 'Zeta',
      kind: 'folder',
      data: { kind: 'folder', updatedAt: '2020-01-01T00:00:00.000Z' },
      children: [
        { id: 'a', label: 'Alpha', kind: 'connection', data: { kind: 'connection', type: 'mysql' } },
      ],
    },
  ];

  it('sorts connections A–Z with folders first', () => {
    const sorted = sortConnectionTree(nodes, 'name-asc');
    expect(sorted.map((n) => n.id)).toEqual(['f', 'b']);
    expect(sorted[0]?.children?.map((n) => n.id)).toEqual(['a']);
  });

  it('returns the same reference when sort is saved and search is empty', () => {
    expect(applyConnectionTreeView(nodes, { query: '', sortBy: 'saved' })).toBe(nodes);
  });
});
