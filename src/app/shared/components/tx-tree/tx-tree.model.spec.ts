import { describe, expect, it } from 'vitest';

import { mergeTxTreeConfig } from './tx-tree.config';
import {
  canonicalizeDropIndicator,
  isPointerInRowSeamZone,
  isSharedSiblingGapDrop,
  resolveDropIndicatorDisplay,
  resolveDropPositionWithHysteresis,
  resolveFolderExitIndicator,
  remapFolderExitToAfterBlockSeam,
  remapIndicatorOffDraggingRow,
  resolveTailRootRowId,
  sortSiblings,
  TxTreeModel,
} from './tx-tree.model';
import type { TxTreeNode } from './tx-tree.types';

const SAMPLE: TxTreeNode[] = [
  {
    id: 'root',
    label: 'Root',
    kind: 'folder',
    order: 0,
    children: [
      { id: 'a', label: 'A', kind: 'leaf', order: 0 },
      { id: 'b', label: 'B', kind: 'leaf', order: 10 },
      {
        id: 'folder',
        label: 'Folder',
        kind: 'folder',
        order: 20,
        children: [{ id: 'c', label: 'C', kind: 'leaf', order: 0 }],
      },
    ],
  },
];

describe('TxTreeModel', () => {
  it('flattens visible rows respecting expansion', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');
    expect(model.getVisibleRows().map((r) => r.id)).toEqual(['root', 'a', 'b', 'folder']);
    model.expand('folder');
    expect(model.getVisibleRows().map((r) => r.id)).toEqual(['root', 'a', 'b', 'folder', 'c']);
  });

  it('reorders siblings within the same parent', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');
    const result = model.moveNode('b', 'a', 'before');
    expect(result).not.toBeNull();
    const childIds = result!.nodes[0].children!.map((n) => n.id);
    expect(childIds).toEqual(['b', 'a', 'folder']);
  });

  it('moves the first sibling down when dropping before the next row', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');
    const logical = model.resolveLogicalDrop('a', 'b', 'before');
    expect(logical).toEqual({ targetId: 'b', position: 'after' });
    const result = model.moveNode('a', logical.targetId, logical.position);
    expect(result).not.toBeNull();
    const childIds = result!.nodes[0].children!.map((n) => n.id);
    expect(childIds).toEqual(['b', 'a', 'folder']);
  });

  it('reparents into a folder', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ drop: { reparentAllowed: true } }));
    model.setNodes(SAMPLE);
    model.expand('root');
    model.expand('folder');
    const result = model.moveNode('a', 'folder', 'inside');
    expect(result).not.toBeNull();
    const folder = result!.nodes[0].children!.find((n) => n.id === 'folder');
    expect(folder?.children?.map((n) => n.id)).toContain('a');
  });

  it('denies drop when maxDepth exceeded', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ drop: { maxDepth: 1 } }));
    model.setNodes(SAMPLE);
    model.expand('root');
    expect(model.canDrop('a', 'folder', 'inside')).toBe(false);
  });

  it('denies cross-parent drag when scope is sameParent', () => {
    const model = new TxTreeModel(
      mergeTxTreeConfig({
        drag: { scope: 'sameParent' },
        drop: { reparentAllowed: false, positions: ['before', 'after'] },
      }),
    );
    model.setNodes(SAMPLE);
    model.expand('root');
    expect(model.canDrop('a', 'folder', 'inside')).toBe(false);
    expect(model.canDrop('a', 'b', 'after')).toBe(true);
  });

  it('treats after on upper row and before on lower row as the same sibling gap', () => {
    const rows = [
      { id: 'a', parentId: 'root' },
      { id: 'b', parentId: 'root' },
      { id: 'c', parentId: 'root' },
    ];
    expect(isSharedSiblingGapDrop(rows, 'a', 'after', 'b', 'before')).toBe(true);
    expect(isSharedSiblingGapDrop(rows, 'a', 'after', 'c', 'before')).toBe(false);
    expect(isSharedSiblingGapDrop(rows, 'a', 'before', 'b', 'after')).toBe(false);
  });

  it('canonicalizes after on a row to before on the next sibling', () => {
    const rows = [
      { id: 'a', parentId: 'root' },
      { id: 'b', parentId: 'root' },
      { id: 'c', parentId: 'root' },
    ];
    expect(canonicalizeDropIndicator(rows, 'a', 'after')).toEqual({
      targetId: 'b',
      position: 'before',
    });
    expect(canonicalizeDropIndicator(rows, 'c', 'after')).toEqual({
      targetId: 'c',
      position: 'after',
    });
    expect(canonicalizeDropIndicator(rows, 'b', 'before')).toEqual({
      targetId: 'b',
      position: 'before',
    });
  });

  it('maps after on an expanded folder to after its last visible descendant', () => {
    const rows = [
      { id: 'folder', parentId: null, depth: 0, hasChildren: true, expanded: true },
      { id: 'a', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'b', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'next', parentId: null, depth: 0, hasChildren: false, expanded: false },
    ];

    expect(resolveFolderExitIndicator(rows, 'folder', 'after')).toEqual({
      targetId: 'b',
      position: 'after',
    });
    expect(resolveDropIndicatorDisplay(rows, 'folder', 'after')).toEqual({
      targetId: 'b',
      position: 'after',
      indentDepth: 0,
    });
  });

  it('keeps folder-exit indicator after the last child when that child is being dragged', () => {
    const rows = [
      { id: 'folder', parentId: null, depth: 0, hasChildren: true, expanded: true },
      { id: 'a', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'b', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'next', parentId: null, depth: 0, hasChildren: false, expanded: false },
    ];

    expect(resolveDropIndicatorDisplay(rows, 'folder', 'after')).toEqual({
      targetId: 'b',
      position: 'after',
      indentDepth: 0,
    });

    const rowsWithoutDraggedLast = rows.filter((row) => row.id !== 'b');
    expect(resolveDropIndicatorDisplay(rowsWithoutDraggedLast, 'folder', 'after')).toEqual({
      targetId: 'a',
      position: 'after',
      indentDepth: 0,
    });
  });

  it('detects pointer in the seam between two row rects', () => {
    const upper = new DOMRect(0, 0, 100, 40);
    const lower = new DOMRect(0, 40, 100, 40);
    expect(isPointerInRowSeamZone(40, upper, lower)).toBe(true);
    expect(isPointerInRowSeamZone(10, upper, lower)).toBe(false);
  });

  it('keeps drop band stable near zone edges (hysteresis)', () => {
    const rect = new DOMRect(0, 100, 200, 40);
    const allowed = ['before', 'after', 'inside'] as const;

    const first = resolveDropPositionWithHysteresis(108, rect, allowed, true, null);
    expect(first).toBe('before');

    const jitter = resolveDropPositionWithHysteresis(111, rect, allowed, true, 'before');
    expect(jitter).toBe('before');
  });

  it('denies drop that would leave the source in the same place', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');
    expect(model.canDrop('b', 'a', 'after')).toBe(false);
    expect(model.canDrop('a', 'b', 'before')).toBe(false);
  });

  it('remaps inside on parent folder to folder exit when source is the last child', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ sort: { foldersFirst: true } }));
    model.setNodes([
      {
        id: 'folder-realtime',
        label: 'Realtime',
        kind: 'folder',
        children: [
          {
            id: 'new-folder',
            label: 'New folder',
            kind: 'folder',
            order: 0,
            children: [],
          },
          { id: 'ws-events', label: 'WS /events', kind: 'websocket', order: 10 },
        ],
      },
      { id: 'req-users', label: 'GET /users', kind: 'request', order: 0 },
    ]);
    model.expand('folder-realtime');

    expect(model.canDrop('ws-events', 'folder-realtime', 'inside')).toBe(false);
    expect(model.resolveLogicalDrop('ws-events', 'folder-realtime', 'inside')).toEqual({
      targetId: 'folder-realtime',
      position: 'after',
    });
    expect(model.canDrop('ws-events', 'folder-realtime', 'after')).toBe(true);

    const moved = model.moveNode('ws-events', 'folder-realtime', 'after');
    expect(moved).not.toBeNull();
    expect(moved!.nodes.map((node) => node.id)).toEqual(['folder-realtime', 'ws-events', 'req-users']);
  });

  it('keeps self-hit after on last child as a no-op on the source row', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([
      {
        id: 'folder',
        label: 'Folder',
        kind: 'folder',
        children: [{ id: 'leaf', label: 'Leaf', kind: 'leaf', order: 0 }],
      },
    ]);
    model.expand('folder');

    expect(model.resolveLogicalDrop('leaf', 'leaf', 'after')).toEqual({
      targetId: 'leaf',
      position: 'after',
    });
    expect(model.canDrop('leaf', 'leaf', 'after')).toBe(false);
  });

  it('denies after on the previous sibling when source is already there', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([
      {
        id: 'folder',
        label: 'Folder',
        kind: 'folder',
        children: [
          { id: 'a', label: 'A', kind: 'leaf', order: 0 },
          { id: 'b', label: 'B', kind: 'leaf', order: 10 },
        ],
      },
    ]);
    model.expand('folder');

    expect(model.canDrop('b', 'a', 'after')).toBe(false);
    expect(model.resolveLogicalDrop('b', 'b', 'after')).toEqual({
      targetId: 'b',
      position: 'after',
    });
  });

  it('remaps folder-exit indicator off the dragging row onto the previous sibling', () => {
    const rows = [
      { id: 'folder', parentId: null, depth: 0, hasChildren: true, expanded: true },
      { id: 'a', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'b', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
    ];
    expect(
      remapIndicatorOffDraggingRow(rows, 'b', 'b', 'after', null),
    ).toEqual({ targetId: 'a', position: 'after', indentDepth: null });
    expect(
      remapIndicatorOffDraggingRow(rows, 'a', 'a', 'after', null),
    ).toEqual({ targetId: null, position: null, indentDepth: null });
  });

  it('remaps folder-exit on the dragging row to the seam after the folder block', () => {
    const rows = [
      { id: 'folder', parentId: null, depth: 0, hasChildren: true, expanded: true },
      { id: 'a', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'b', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'next', parentId: null, depth: 0, hasChildren: false, expanded: false },
    ];
    expect(
      remapFolderExitToAfterBlockSeam(rows, 'b', 'folder', 0),
    ).toEqual({ targetId: 'next', position: 'before', indentDepth: 0 });

    const tailRows = rows.filter((row) => row.id !== 'next');
    expect(
      remapFolderExitToAfterBlockSeam(tailRows, 'b', 'folder', 0),
    ).toEqual({ targetId: 'b', position: 'after', indentDepth: 0 });

    const onlyChildRows = [
      { id: 'folder', parentId: null, depth: 0, hasChildren: true, expanded: true },
      { id: 'only', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
    ];
    expect(
      remapFolderExitToAfterBlockSeam(onlyChildRows, 'only', 'folder', 0),
    ).toEqual({ targetId: 'only', position: 'after', indentDepth: 0 });

    const midDragRows = [
      { id: 'folder', parentId: null, depth: 0, hasChildren: true, expanded: true },
      { id: 'a', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'b', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'c', parentId: 'folder', depth: 1, hasChildren: false, expanded: false },
      { id: 'next', parentId: null, depth: 0, hasChildren: false, expanded: false },
    ];
    expect(
      remapFolderExitToAfterBlockSeam(midDragRows, 'b', 'folder', 0),
    ).toEqual({ targetId: 'next', position: 'before', indentDepth: 0 });
  });

  it('resolves the trailing root row for empty-space below-tree drops', () => {
    const rows = [
      { id: 'auth', parentId: null },
      { id: 'users', parentId: null },
      { id: 'new-folder', parentId: null },
      { id: 'ws-events', parentId: 'new-folder' },
      { id: 'get-users', parentId: 'new-folder' },
      { id: 'ws-notifications', parentId: 'new-folder' },
    ];

    expect(resolveTailRootRowId(rows)).toBe('new-folder');
    expect(resolveTailRootRowId(rows, 'ws-notifications')).toBe('new-folder');
    expect(resolveTailRootRowId(rows, 'new-folder')).toBe('users');
  });

  it('allows moving the last folder child to root via after on the parent folder', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([
      { id: 'other', label: 'Other', kind: 'folder', order: 0, children: [] },
      {
        id: 'new-folder',
        label: 'New folder',
        kind: 'folder',
        order: 10,
        children: [
          { id: 'ws-events', label: 'WS /events', kind: 'websocket', order: 0 },
          { id: 'ws-notifications', label: 'WS /notifications', kind: 'websocket', order: 10 },
        ],
      },
    ]);
    model.expand('new-folder');

    expect(model.canDrop('ws-notifications', 'new-folder', 'after')).toBe(true);

    const moved = model.moveNode('ws-notifications', 'new-folder', 'after');
    expect(moved).not.toBeNull();
    expect(moved!.nodes.map((node) => node.id)).toEqual(['other', 'new-folder', 'ws-notifications']);
    expect(moved!.nodes[1].children?.map((node) => node.id)).toEqual(['ws-events']);
  });

  it('denies dragging disabled nodes', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([
      {
        id: 'root',
        label: 'Root',
        kind: 'folder',
        children: [{ id: 'x', label: 'X', disabled: true }],
      },
    ]);
    expect(model.canDrag('x')).toBe(false);
  });

  it('sorts folders before requests when foldersFirst is enabled', () => {
    const nodes: TxTreeNode[] = [
      { id: 'req', label: 'Request', kind: 'request', order: 0 },
      { id: 'folder', label: 'Folder', kind: 'folder', order: 0, children: [] },
    ];
    const sorted = sortSiblings(nodes, { siblingSort: 'order', foldersFirst: true });
    expect(sorted.map((n) => n.id)).toEqual(['folder', 'req']);
  });

  it('denies dropping the last root folder below a root item when foldersFirst is enabled', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ sort: { foldersFirst: true } }));
    model.setNodes([
      { id: 'folder-auth', label: 'Auth', kind: 'folder', order: 0, children: [] },
      { id: 'folder-users', label: 'Users', kind: 'folder', order: 10, children: [] },
      { id: 'req-path', label: 'GET /path', kind: 'request', order: 20 },
    ]);

    expect(model.canDrop('folder-users', 'req-path', 'after')).toBe(false);
    expect(model.moveNode('folder-users', 'req-path', 'after')).toBeNull();
    expect(model.canDrop('folder-users', 'folder-auth', 'before')).toBe(true);
  });

  it('allows dropping a root folder below an item when foldersFirst is disabled', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ sort: { foldersFirst: false } }));
    model.setNodes([
      { id: 'folder-users', label: 'Users', kind: 'folder', order: 0, children: [] },
      { id: 'req-path', label: 'GET /path', kind: 'request', order: 10 },
    ]);

    expect(model.canDrop('folder-users', 'req-path', 'after')).toBe(true);
  });
});
