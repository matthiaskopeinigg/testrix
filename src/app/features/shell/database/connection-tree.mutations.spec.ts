import { describe, expect, it } from 'vitest';

import { fromConnectionTreeNodesWithExisting, toConnectionTreeNodes } from './connection-tree.adapter';
import {
  collectConnectionIdsForDeletion,
  createConnectionTreeNode,
  deleteConnectionTreeNode,
  findConnectionNode,
  isConnectionFolderNode,
  isConnectionLeafNode,
} from './connection-tree.mutations';
import { filterConnectionTree } from './connection-tree.view';

describe('connection-tree', () => {
  it('round-trips a folder with a connection', () => {
    const items = [
      {
        id: 'f1',
        kind: 'folder' as const,
        name: 'Prod',
        updatedAt: '2020-01-01T00:00:00.000Z',
        children: [
          {
            id: 'c1',
            kind: 'connection' as const,
            name: 'Primary',
            type: 'postgresql' as const,
            host: 'db.example',
            port: 5432,
            connectOnBoot: false,
            password: 'secret',
          },
        ],
      },
    ];
    const tree = toConnectionTreeNodes(items);
    expect(isConnectionFolderNode(tree[0]!)).toBe(true);
    expect(isConnectionLeafNode(tree[0]!.children![0]!)).toBe(true);
    expect(tree[0]!.children![0]!.subtitle).toBe('db.example:5432');
    const back = fromConnectionTreeNodesWithExisting(tree, items);
    expect(back).toEqual(items);
  });

  it('does not persist live catalog children on a connection', () => {
    const items = [
      {
        id: 'c1',
        kind: 'connection' as const,
        name: 'Primary',
        type: 'postgresql' as const,
        host: 'db.example',
        port: 5432,
        connectOnBoot: false,
      },
    ];
    const tree = toConnectionTreeNodes(items);
    tree[0] = {
      ...tree[0]!,
      children: [
        {
          id: 'c1::tx::schema::::public::',
          label: 'public',
          kind: 'schema',
          data: { kind: 'schema', connectionId: 'c1', schema: 'public' },
        },
      ],
    };
    const back = fromConnectionTreeNodesWithExisting(tree, items);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: 'c1', kind: 'connection', name: 'Primary' });
    expect('children' in (back[0] ?? {})).toBe(false);
  });

  it('creates a connection under a folder', () => {
    const created = createConnectionTreeNode([], null, 'folder', 'Prod');
    expect(created).not.toBeNull();
    const nested = createConnectionTreeNode(created!.nodes, created!.nodeId, 'connection', 'Primary');
    expect(nested).not.toBeNull();
    const loc = findConnectionNode(nested!.nodes, nested!.nodeId);
    expect(loc?.parent?.id).toBe(created!.nodeId);
  });

  it('deletes a folder and keeps search ancestors', () => {
    const folder = createConnectionTreeNode([], null, 'folder', 'Prod')!;
    const withConn = createConnectionTreeNode(folder.nodes, folder.nodeId, 'connection', 'Primary')!;
    const remaining = deleteConnectionTreeNode(withConn.nodes, folder.nodeId);
    expect(remaining).toEqual([]);
    expect(collectConnectionIdsForDeletion(withConn.nodes, folder.nodeId)).toEqual([
      withConn.nodeId,
    ]);
    const filtered = filterConnectionTree(withConn.nodes, 'pri');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.children?.[0]?.label).toBe('Primary');
  });

  it('returns the same array when the search query is empty', () => {
    const created = createConnectionTreeNode([], null, 'connection', 'Primary');
    expect(created).not.toBeNull();
    expect(filterConnectionTree(created!.nodes, '')).toBe(created!.nodes);
    expect(filterConnectionTree(created!.nodes, '   ')).toBe(created!.nodes);
  });
});
