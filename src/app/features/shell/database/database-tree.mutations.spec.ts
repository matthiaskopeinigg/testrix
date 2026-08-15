import { describe, expect, it } from 'vitest';

import { toDatabaseTreeNodes, fromDatabaseTreeNodesWithExisting } from './database-tree.adapter';
import {
  createDatabaseNode,
  deleteDatabaseNode,
  findDatabaseNode,
  isDatabaseFolderNode,
  isDatabaseQueryNode,
} from './database-tree.mutations';
import { filterDatabaseTree, applyDatabaseTreeView } from './database-tree.view';

describe('database-tree', () => {
  it('round-trips a folder with a query', () => {
    const items = [
      {
        id: 'f1',
        kind: 'folder' as const,
        name: 'Auth',
        updatedAt: '2020-01-01T00:00:00.000Z',
        children: [
          {
            id: 'q1',
            kind: 'query' as const,
            name: 'Users',
            connectionId: 'c1',
            query: 'SELECT 1',
            updatedAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      },
    ];
    const tree = toDatabaseTreeNodes(items);
    expect(isDatabaseFolderNode(tree[0]!)).toBe(true);
    expect(isDatabaseQueryNode(tree[0]!.children![0]!)).toBe(true);
    const back = fromDatabaseTreeNodesWithExisting(tree, items);
    expect(back).toEqual(items);
  });

  it('creates a query under a folder', () => {
    const created = createDatabaseNode([], null, 'folder', 'Auth');
    expect(created).not.toBeNull();
    const nested = createDatabaseNode(created!.nodes, created!.nodeId, 'query', 'Ping');
    expect(nested).not.toBeNull();
    const loc = findDatabaseNode(nested!.nodes, nested!.nodeId);
    expect(loc?.parent?.id).toBe(created!.nodeId);
  });

  it('deletes a folder and keeps search ancestors', () => {
    const folder = createDatabaseNode([], null, 'folder', 'Auth')!;
    const withQuery = createDatabaseNode(folder.nodes, folder.nodeId, 'query', 'Users')!;
    const remaining = deleteDatabaseNode(withQuery.nodes, folder.nodeId);
    expect(remaining).toEqual([]);
    const filtered = filterDatabaseTree(withQuery.nodes, 'use');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.children?.[0]?.label).toBe('Users');
  });

  it('filters to queries only and sorts by name', () => {
    const folder = createDatabaseNode([], null, 'folder', 'Zebra')!;
    const withPing = createDatabaseNode(folder.nodes, folder.nodeId, 'query', 'Ping')!;
    const withUsers = createDatabaseNode(withPing.nodes, null, 'query', 'Alpha')!;
    const viewed = applyDatabaseTreeView(withUsers.nodes, {
      query: '',
      kindFilter: 'queries',
      sortBy: 'name-asc',
    });
    expect(viewed.map((node) => node.label)).toEqual(['Alpha', 'Ping']);
  });
});
