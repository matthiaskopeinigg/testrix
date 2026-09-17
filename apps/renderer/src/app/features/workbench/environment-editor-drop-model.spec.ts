import { describe, expect, it } from 'vitest';
import {
  isEnvironmentFolder,
  moveEnvironmentNode,
  moveEnvironmentNodes,
  type EnvironmentNode,
} from '@testrix/contracts';

import {
  collectDescendantIds,
  resolveEnvEditorDrop,
  type EnvEditorDropLayout,
  type EnvMeasuredNodeRow,
} from './environment-editor-drop-model';

function folder(id: string, children: EnvironmentNode[] = []): EnvironmentNode {
  return { kind: 'folder', id, name: id, description: '', collapsed: false, children };
}

function variable(id: string): EnvironmentNode {
  return { kind: 'variable', id, key: id, value: '', description: '', enabled: true, secret: false };
}

function threeFolders(): EnvironmentNode[] {
  return [folder('url'), folder('data', [folder('inner')]), folder('b2b')];
}

function row(
  patch: Partial<EnvMeasuredNodeRow> & Pick<EnvMeasuredNodeRow, 'id' | 'kind' | 'top'>,
): EnvMeasuredNodeRow {
  return {
    parentId: null,
    mixedIndex: 0,
    folderIndex: 0,
    depth: 0,
    collapsed: false,
    childCount: 0,
    height: 32,
    left: 8,
    ...patch,
  };
}

describe('moveEnvironmentNode', () => {
  it('nests a variable into a folder', () => {
    const tree = [folder('a', [variable('a1')]), variable('root')];
    const next = moveEnvironmentNode(tree, 'root', 'a', 2);
    expect(next).toBeTruthy();
    expect(isEnvironmentFolder(next![0]) ? next![0].children.map((child) => child.id) : []).toEqual(['a1', 'root']);
  });

  it('rejects dropping a folder into itself', () => {
    const tree = [folder('a', [folder('b')])];
    expect(moveEnvironmentNode(tree, 'a', 'b', 0)).toBeNull();
  });

  it('moves a middle folder to last among siblings', () => {
    const next = moveEnvironmentNode(threeFolders(), 'data', null, 3);
    expect(next?.map((node) => node.id)).toEqual(['url', 'b2b', 'data']);
  });

  it('moves a middle folder last even when variables sit between folders', () => {
    const tree = [folder('url'), folder('data'), variable('v1'), folder('b2b'), variable('v2')];
    const next = moveEnvironmentNode(tree, 'data', null, 3);
    expect(next?.filter(isEnvironmentFolder).map((node) => node.id)).toEqual(['url', 'b2b', 'data']);
  });
});

describe('moveEnvironmentNodes', () => {
  it('moves two sibling folders to last', () => {
    const tree = [folder('url'), folder('data'), folder('b2b')];
    const next = moveEnvironmentNodes(tree, ['url', 'data'], null, 3);
    expect(next?.map((node) => node.id)).toEqual(['b2b', 'url', 'data']);
  });

  it('nests two variables into a folder', () => {
    const tree = [folder('a'), variable('v1'), variable('v2')];
    const next = moveEnvironmentNodes(tree, ['v1', 'v2'], 'a', 1);
    const children = isEnvironmentFolder(next![0]) ? next![0].children : [];
    expect(children.map((child) => child.id)).toEqual(['v1', 'v2']);
  });

  it('skips a selected child when its parent is also selected', () => {
    const tree = [folder('data', [folder('inner')]), folder('b2b')];
    const next = moveEnvironmentNodes(tree, ['data', 'inner'], 'b2b', 0);
    const b2b = next?.find((node) => node.id === 'b2b');
    expect(isEnvironmentFolder(b2b!) ? b2b.children.map((child) => child.id) : []).toEqual(['data']);
  });

  it('moves a folder and an ungrouped variable into another folder', () => {
    const tree = [folder('url'), variable('base'), folder('b2b')];
    const next = moveEnvironmentNodes(tree, ['url', 'base'], 'b2b', 0);
    const b2b = next?.find((node) => node.id === 'b2b');
    expect(isEnvironmentFolder(b2b!) ? b2b.children.map((child) => child.id) : []).toEqual(['url', 'base']);
  });
});

describe('resolveEnvEditorDrop', () => {
  const layout: EnvEditorDropLayout = {
    rows: [
      row({ id: 'url', kind: 'folder', mixedIndex: 0, folderIndex: 0, top: 40, childCount: 1 }),
      row({ id: 'data', kind: 'folder', mixedIndex: 1, folderIndex: 1, top: 72, collapsed: true }),
      row({ id: 'b2b', kind: 'folder', mixedIndex: 2, folderIndex: 2, top: 104 }),
      row({ id: 'base', kind: 'variable', mixedIndex: 3, folderIndex: 3, top: 136 }),
    ],
    tree: { left: 0, right: 200, top: 0, bottom: 400 },
  };

  const draggedData = {
    id: 'data',
    kind: 'folder' as const,
    parentId: null,
    mixedIndex: 1,
  };

  it('drops into a folder from the middle of its row when dragging a variable', () => {
    const target = resolveEnvEditorDrop(
      layout,
      { x: 80, y: 56 },
      { id: 'v1', kind: 'variable', parentId: null, mixedIndex: 3 },
      new Set(),
    );
    expect(target?.mode).toBe('into');
    expect(target?.folderId).toBe('url');
  });

  it('places a variable before another variable', () => {
    const target = resolveEnvEditorDrop(
      layout,
      { x: 40, y: 140 },
      { id: 'v1', kind: 'variable', parentId: null, mixedIndex: 4 },
      new Set(),
    );
    expect(target).toMatchObject({ mode: 'between', parentId: null, index: 3 });
  });

  it('places a folder after the last sibling when dropped on that row', () => {
    const target = resolveEnvEditorDrop(layout, { x: 24, y: 128 }, draggedData, new Set(['inner']));
    expect(target).toMatchObject({ mode: 'between', parentId: null, index: 3, denied: false });
  });

  it('places a folder last when dropped in the empty space below the list', () => {
    const target = resolveEnvEditorDrop(layout, { x: 24, y: 240 }, draggedData, new Set(['inner']));
    expect(target).toMatchObject({ mode: 'between', parentId: null, index: 3, denied: false });
  });

  it('nests a mixed drag into a folder from the row center', () => {
    const target = resolveEnvEditorDrop(
      layout,
      { x: 80, y: 88 },
      { id: 'base', kind: 'variable', parentId: null, mixedIndex: 3 },
      collectDescendantIds([], 'base'),
    );
    expect(target?.mode).toBe('into');
    expect(target?.folderId).toBe('data');
  });
});
