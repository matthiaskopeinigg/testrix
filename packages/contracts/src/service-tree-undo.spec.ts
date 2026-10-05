import { describe, expect, it } from 'vitest';

import {
  findServiceNode,
  findServiceParentIndex,
  insertServiceChildAt,
  removeServiceNode,
  type ServiceTreeNode,
} from './service-tree';

interface Artifact {
  readonly note?: string;
}

function artifact(id: string, name: string): ServiceTreeNode<Artifact> {
  return { kind: 'artifact', id, name, updatedAt: 't0', note: name };
}

function folder(
  id: string,
  name: string,
  children: readonly ServiceTreeNode<Artifact>[],
): ServiceTreeNode<Artifact> {
  return { kind: 'folder', id, name, updatedAt: 't0', children };
}

describe('service tree deferred-delete restore', () => {
  it('findServiceParentIndex reports root and nested positions', () => {
    const tree = [
      artifact('a', 'A'),
      folder('f1', 'Folder', [artifact('b', 'B'), artifact('c', 'C')]),
    ];
    expect(findServiceParentIndex(tree, 'a')).toEqual({ parentId: null, index: 0 });
    expect(findServiceParentIndex(tree, 'f1')).toEqual({ parentId: null, index: 1 });
    expect(findServiceParentIndex(tree, 'b')).toEqual({ parentId: 'f1', index: 0 });
    expect(findServiceParentIndex(tree, 'c')).toEqual({ parentId: 'f1', index: 1 });
    expect(findServiceParentIndex(tree, 'missing')).toBeNull();
  });

  it('remove then insertServiceChildAt restores original order', () => {
    const tree = [
      artifact('a', 'A'),
      folder('f1', 'Folder', [artifact('b', 'B'), artifact('c', 'C')]),
      artifact('d', 'D'),
    ];
    const loc = findServiceParentIndex(tree, 'c');
    const node = findServiceNode(tree, 'c');
    expect(loc).not.toBeNull();
    expect(node).not.toBeNull();

    const without = removeServiceNode(tree, 'c');
    expect(findServiceNode(without, 'c')).toBeNull();

    const restored = insertServiceChildAt(without, loc!.parentId, loc!.index, node!);
    expect(findServiceParentIndex(restored, 'c')).toEqual({ parentId: 'f1', index: 1 });
    expect(findServiceNode(restored, 'c')?.name).toBe('C');
  });

  it('restores multiple deletes in reverse index order under the same parent', () => {
    const tree = [artifact('a', 'A'), artifact('b', 'B'), artifact('c', 'C')];
    const entries = ['a', 'c'].map((id) => {
      const loc = findServiceParentIndex(tree, id)!;
      const node = findServiceNode(tree, id)!;
      return { node, parentId: loc.parentId, index: loc.index };
    });

    let next = tree;
    for (const id of ['a', 'c'])
      next = removeServiceNode(next, id);

    const sorted = [...entries].sort((left, right) => right.index - left.index);
    for (const entry of sorted)
      next = insertServiceChildAt(next, entry.parentId, entry.index, entry.node);

    expect(next.map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });
});
