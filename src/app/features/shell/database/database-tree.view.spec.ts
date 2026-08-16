import { describe, expect, it } from 'vitest';

import {
  applyDatabaseTreeView,
  filterDatabaseTree,
  filterDatabaseTreeByConnection,
} from './database-tree.view';
import type { DatabaseTreeNode } from './database-tree.types';

function queryNode(
  id: string,
  label: string,
  connectionId: string,
  query: string,
): DatabaseTreeNode {
  return {
    id,
    label,
    kind: 'query',
    data: { kind: 'query', connectionId, query, updatedAt: '2020-01-01T00:00:00.000Z' },
  };
}

function folderNode(id: string, label: string, children: DatabaseTreeNode[]): DatabaseTreeNode {
  return {
    id,
    label,
    kind: 'folder',
    data: { kind: 'folder', updatedAt: '2020-01-02T00:00:00.000Z' },
    children,
  };
}

describe('database-tree.view', () => {
  const tree: DatabaseTreeNode[] = [
    folderNode('f1', 'Auth', [
      queryNode('q1', 'Find user', 'conn-a', 'SELECT * FROM users WHERE email = :email'),
      queryNode('q2', 'Orders', 'conn-b', 'SELECT 1'),
    ]),
    queryNode('q3', 'Health', 'conn-a', 'SELECT 1'),
  ];

  it('searches SQL body as well as query names', () => {
    const filtered = filterDatabaseTree(tree, ':email');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('f1');
    expect(filtered[0]?.children?.map((n) => n.id)).toEqual(['q1']);
  });

  it('filters queries by connection and keeps ancestor folders', () => {
    const filtered = filterDatabaseTreeByConnection(tree, ['conn-b']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.children?.map((n) => n.id)).toEqual(['q2']);
  });

  it('treats an empty connection set as all queries', () => {
    expect(filterDatabaseTreeByConnection(tree, []).map((n) => n.id)).toEqual(['f1', 'q3']);
  });

  it('applies connection filter then search', () => {
    const viewed = applyDatabaseTreeView(tree, {
      query: 'select',
      kindFilter: 'all',
      sortBy: 'saved',
      connectionIds: ['conn-a'],
    });
    expect(viewed.map((n) => n.id)).toEqual(['f1', 'q3']);
    expect(viewed[0]?.children?.map((n) => n.id)).toEqual(['q1']);
  });
});
