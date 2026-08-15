import { describe, expect, it } from 'vitest';

import { dedupeFolderTreeById, insertChildIntoFolderTree } from './insert-folder-tree-child';

type TestNode =
  | { readonly id: string; readonly kind: 'leaf'; readonly name: string }
  | {
      readonly id: string;
      readonly kind: 'folder';
      readonly name: string;
      readonly children: readonly TestNode[];
    };

function isFolder(item: TestNode): boolean {
  return item.kind === 'folder';
}

function getChildren(item: TestNode): readonly TestNode[] {
  return item.kind === 'folder' ? item.children : [];
}

function withChildren(folder: TestNode, children: readonly TestNode[]): TestNode {
  if (folder.kind !== 'folder') {
    return folder;
  }
  return { ...folder, children };
}

function folder(id: string, children: readonly TestNode[] = []): TestNode {
  return { id, kind: 'folder', name: id, children };
}

function leaf(id: string): TestNode {
  return { id, kind: 'leaf', name: id };
}

describe('insertChildIntoFolderTree', () => {
  it('appends at the root when parentId is null', () => {
    const nodes = [folder('a'), folder('b')];
    const next = insertChildIntoFolderTree(nodes, null, leaf('c'), isFolder, withChildren, getChildren);
    expect(next.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('inserts into only the matching folder among empty siblings', () => {
    const nodes = [folder('a'), folder('b'), folder('c')];
    const next = insertChildIntoFolderTree(nodes, 'b', leaf('conn'), isFolder, withChildren, getChildren);
    expect(getChildren(next[0]!)).toEqual([]);
    expect(getChildren(next[1]!).map((child) => child.id)).toEqual(['conn']);
    expect(getChildren(next[2]!)).toEqual([]);
  });

  it('does not copy the child into nested empty folders', () => {
    const nodes = [folder('outer', [folder('inner')]), folder('other')];
    const next = insertChildIntoFolderTree(
      nodes,
      'inner',
      leaf('conn'),
      isFolder,
      withChildren,
      getChildren,
    );
    const inner = getChildren(next[0]!)[0];
    expect(inner).toMatchObject({
      id: 'inner',
      children: [expect.objectContaining({ id: 'conn' })],
    });
    expect(getChildren(next[1]!)).toEqual([]);
  });

  it('falls back to the root when the parent id is missing', () => {
    const nodes = [folder('a')];
    const next = insertChildIntoFolderTree(
      nodes,
      'missing',
      leaf('conn'),
      isFolder,
      withChildren,
      getChildren,
    );
    expect(next.map((item) => item.id)).toEqual(['a', 'conn']);
    expect(getChildren(next[0]!)).toEqual([]);
  });
});

describe('dedupeFolderTreeById', () => {
  it('keeps the first copy of a duplicated leaf and leaves later folders empty', () => {
    const conn = leaf('conn');
    const nodes = [folder('a', [conn]), folder('b', [conn])];
    const next = dedupeFolderTreeById(nodes, isFolder, withChildren, getChildren);
    expect(getChildren(next[0]!).map((child) => child.id)).toEqual(['conn']);
    expect(getChildren(next[1]!)).toEqual([]);
  });
});
