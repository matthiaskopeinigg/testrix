import { describe, expect, it } from 'vitest';

import { mergeTxTreeConfig } from './tx-tree.config';
import { sortSiblings, TxTreeModel } from './tx-tree.model';
import type { TxTreeDropIntent, TxTreeNode } from './tx-tree.types';

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

function reorder(
  parentId: string | null,
  index: number,
  depth: number,
): TxTreeDropIntent {
  return { kind: 'reorder', parentId, index, depth };
}

describe('TxTreeModel', () => {
  it('flattens visible rows respecting expansion', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');
    expect(model.getVisibleRows().map((r) => r.id)).toEqual(['root', 'a', 'b', 'folder']);
    model.expand('folder');
    expect(model.getVisibleRows().map((r) => r.id)).toEqual(['root', 'a', 'b', 'folder', 'c']);
  });

  it('treats empty folders as expandable', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([{ id: 'empty', label: 'Empty', kind: 'folder', children: [] }]);
    const row = model.getVisibleRows()[0];
    expect(row?.hasChildren).toBe(true);
    expect(row?.expanded).toBe(false);
    model.expand('empty');
    expect(model.getVisibleRows().map((item) => item.id)).toEqual(['empty']);
    expect(model.getVisibleRows()[0]?.expanded).toBe(true);
  });

  it('hides expansion when expandable is false', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([{ id: 'conn', label: 'Primary', kind: 'connection', expandable: false }]);
    expect(model.getVisibleRows()[0]?.hasChildren).toBe(false);
  });

  it('lists display children for a parent and for the root', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    expect(model.getDisplayChildren(null).map((node) => node.id)).toEqual(['root']);
    expect(model.getDisplayChildren('root').map((node) => node.id)).toEqual([
      'a',
      'b',
      'folder',
    ]);
    expect(model.getDisplayChildren('a')).toEqual([]);
  });
});

describe('TxTreeModel intents', () => {
  it('applies a reorder intent by splicing at the post-extraction index', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');

    const result = model.applyIntent('b', reorder('root', 0, 1));
    expect(result).not.toBeNull();
    expect(result!.nodes[0].children!.map((n) => n.id)).toEqual(['b', 'a', 'folder']);
  });

  it('moves a node to the end of its sibling list', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');

    const result = model.applyIntent('a', reorder('root', 2, 1));
    expect(result!.nodes[0].children!.map((n) => n.id)).toEqual(['b', 'folder', 'a']);
  });

  it('renumbers order fields from the resulting sequence', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ sort: { siblingSort: 'order' } }));
    model.setNodes(SAMPLE);
    model.expand('root');

    const result = model.applyIntent('folder', reorder('root', 0, 1));
    expect(result!.nodes[0].children!.map((n) => [n.id, n.order])).toEqual([
      ['folder', 0],
      ['a', 10],
      ['b', 20],
    ]);
  });

  it('keeps the identity slot legal but treats applying it as a no-op', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');

    // `a` is already at index 0 of `root`, so the indicator may rest there.
    expect(model.isNoOpIntent('a', reorder('root', 0, 1))).toBe(true);
    expect(model.canDropIntent('a', reorder('root', 0, 1))).toBe(true);
    expect(model.applyIntent('a', reorder('root', 0, 1))).toBeNull();
    expect(model.canDrop('a', 'a', 'before')).toBe(false);

    expect(model.isNoOpIntent('a', reorder('root', 1, 1))).toBe(false);
    expect(model.applyIntent('a', reorder('root', 1, 1))).not.toBeNull();
  });

  it('denies dropping into its own subtree', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');
    model.expand('folder');

    expect(model.canDropIntent('folder', reorder('folder', 0, 2))).toBe(false);
    expect(model.canDropIntent('root', reorder('folder', 0, 2))).toBe(false);
  });

  it('reparents into a folder with an inside intent', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ drop: { reparentAllowed: true } }));
    model.setNodes(SAMPLE);
    model.expand('root');
    model.expand('folder');

    const result = model.applyIntent('a', { kind: 'inside', parentId: 'folder' });
    expect(result).not.toBeNull();
    const folder = result!.nodes[0].children!.find((n) => n.id === 'folder');
    expect(folder?.children?.map((n) => n.id)).toEqual(['c', 'a']);
  });

  it('treats re-appending the last child inside its own parent as a no-op', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');

    // `folder` is already the last child of `root`; `a` is not, so appending it is a move.
    expect(model.applyIntent('folder', { kind: 'inside', parentId: 'root' })).toBeNull();
    expect(model.applyIntent('a', { kind: 'inside', parentId: 'root' })).not.toBeNull();
  });

  it('moves the last folder child out to the tree root', () => {
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

    const intent = reorder(null, 2, 0);
    expect(model.canDropIntent('ws-notifications', intent)).toBe(true);

    const moved = model.applyIntent('ws-notifications', intent);
    expect(moved!.nodes.map((node) => node.id)).toEqual([
      'other',
      'new-folder',
      'ws-notifications',
    ]);
    expect(moved!.nodes[1].children?.map((node) => node.id)).toEqual(['ws-events']);
  });

  it('denies an intent when maxDepth is exceeded', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ drop: { maxDepth: 1 } }));
    model.setNodes(SAMPLE);
    model.expand('root');

    expect(model.canDropIntent('a', { kind: 'inside', parentId: 'folder' })).toBe(false);
    expect(model.canDropIntent('a', reorder('folder', 0, 2))).toBe(false);
    expect(model.canDropIntent('a', reorder(null, 0, 0))).toBe(true);
  });

  it('restricts intents to the source parent when scope is sameParent', () => {
    const model = new TxTreeModel(
      mergeTxTreeConfig({
        drag: { scope: 'sameParent' },
        drop: { positions: ['before', 'after'] },
      }),
    );
    model.setNodes(SAMPLE);
    model.expand('root');

    expect(model.canDropIntent('a', reorder('root', 2, 1))).toBe(true);
    expect(model.canDropIntent('a', reorder('folder', 0, 2))).toBe(false);
    expect(model.canDropIntent('a', { kind: 'inside', parentId: 'folder' })).toBe(false);
  });

  it('denies reparenting when reparentAllowed is false', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ drop: { reparentAllowed: false } }));
    model.setNodes(SAMPLE);
    model.expand('root');
    model.expand('folder');

    expect(model.canDropIntent('a', reorder('root', 2, 1))).toBe(true);
    expect(model.canDropIntent('a', reorder('folder', 0, 2))).toBe(false);
  });

  it('keeps sibling seams when the consumer blocks inside entirely', () => {
    // Flat step lists (flow steps) reject `inside` but must stay fully reorderable.
    const model = new TxTreeModel(
      mergeTxTreeConfig({
        drop: { canDrop: (ctx) => ctx.position !== 'inside' },
      }),
    );
    model.setNodes([
      { id: 's1', label: 'Step 1', kind: 'step', order: 0 },
      { id: 's2', label: 'Step 2', kind: 'step', order: 10 },
      { id: 's3', label: 'Step 3', kind: 'step', order: 20 },
    ]);

    expect(model.canDropIntent('s3', reorder(null, 0, 0))).toBe(true);
    expect(model.canDropIntent('s3', reorder(null, 1, 0))).toBe(true);
    expect(model.canDropIntent('s1', { kind: 'inside', parentId: 's2' })).toBe(false);
  });

  it('describes a reorder into an empty parent as inside it', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([
      { id: 'empty', label: 'Empty', kind: 'folder', order: 0, children: [] },
      { id: 'leaf', label: 'Leaf', kind: 'leaf', order: 10 },
    ]);
    model.expand('empty');

    // The seam inside an empty folder has no occupant to sit before, so the compat pair
    // has to be `inside`, and a consumer blocking `inside` blocks that seam too.
    expect(model.describeIntent('leaf', reorder('empty', 0, 1))).toEqual({
      targetId: 'empty',
      position: 'inside',
    });

    const blocked = new TxTreeModel(
      mergeTxTreeConfig({ drop: { canDrop: (ctx) => ctx.position !== 'inside' } }),
    );
    blocked.setNodes(model.getNodes());
    blocked.expand('empty');
    expect(blocked.canDropIntent('leaf', reorder('empty', 0, 1))).toBe(false);
  });

  it('denies intents the consumer canDrop rejects', () => {
    const model = new TxTreeModel(
      mergeTxTreeConfig({
        drop: { canDrop: (ctx) => ctx.position !== 'inside' },
      }),
    );
    model.setNodes(SAMPLE);
    model.expand('root');
    model.expand('folder');

    expect(model.canDropIntent('a', { kind: 'inside', parentId: 'folder' })).toBe(false);
    expect(model.canDropIntent('a', reorder('folder', 0, 2))).toBe(true);
  });

  it('rejects slots that remapDropTarget redirects elsewhere', () => {
    const model = new TxTreeModel(
      mergeTxTreeConfig({
        sort: { siblingSort: 'manual' },
        drop: {
          remapDropTarget: (ctx) =>
            ctx.targetId === 'schema' ? { targetId: 'b', position: 'after' } : null,
        },
      }),
    );
    model.setNodes([
      { id: 'a', label: 'A', kind: 'connection' },
      {
        id: 'b',
        label: 'B',
        kind: 'connection',
        children: [{ id: 'schema', label: 'public', kind: 'schema' }],
      },
    ]);
    model.expand('b');

    // The slot inside `b` is described by `before schema`, which the consumer redirects,
    // so it is not offered; the root-level slot after `b` is.
    expect(model.canDropIntent('a', reorder('b', 0, 1))).toBe(false);
    expect(model.canDropIntent('a', reorder(null, 2, 0))).toBe(true);
    expect(model.applyIntent('a', reorder(null, 2, 0))?.nodes.map((node) => node.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('describes reorder intents as before the occupant or after the last sibling', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');

    expect(model.describeIntent('folder', reorder('root', 0, 1))).toEqual({
      targetId: 'a',
      position: 'before',
    });
    expect(model.describeIntent('folder', reorder('root', 2, 1))).toEqual({
      targetId: 'b',
      position: 'after',
    });
    expect(model.describeIntent('a', { kind: 'inside', parentId: 'folder' })).toEqual({
      targetId: 'folder',
      position: 'inside',
    });
  });

  it('reports the drop event target and parents from the committed intent', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ drop: { reparentAllowed: true } }));
    model.setNodes(SAMPLE);
    model.expand('root');
    model.expand('folder');

    const result = model.applyIntent('a', reorder('folder', 0, 2));
    expect(result!.event).toEqual({
      sourceId: 'a',
      targetId: 'c',
      position: 'before',
      previousParentId: 'root',
      nextParentId: 'folder',
    });
  });

  it('converts a target/position pair into the equivalent intent', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');

    expect(model.intentFromDropTarget('folder', 'a', 'before')).toEqual(reorder('root', 0, 1));
    expect(model.intentFromDropTarget('folder', 'a', 'after')).toEqual(reorder('root', 1, 1));
    expect(model.intentFromDropTarget('a', 'folder', 'inside')).toEqual({
      kind: 'inside',
      parentId: 'folder',
    });
  });

  it('reorders siblings through the moveNode pair API', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);
    model.expand('root');

    const result = model.moveNode('b', 'a', 'before');
    expect(result!.nodes[0].children!.map((n) => n.id)).toEqual(['b', 'a', 'folder']);
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
});

describe('TxTreeModel foldersFirst', () => {
  it('sorts folders before requests when foldersFirst is enabled', () => {
    const nodes: TxTreeNode[] = [
      { id: 'req', label: 'Request', kind: 'request', order: 0 },
      { id: 'folder', label: 'Folder', kind: 'folder', order: 0, children: [] },
    ];
    const sorted = sortSiblings(nodes, { siblingSort: 'order', foldersFirst: true });
    expect(sorted.map((n) => n.id)).toEqual(['folder', 'req']);
  });

  it('never offers a slot that would put a folder after a leaf', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ sort: { foldersFirst: true } }));
    model.setNodes([
      { id: 'folder-auth', label: 'Auth', kind: 'folder', order: 0, children: [] },
      { id: 'folder-users', label: 'Users', kind: 'folder', order: 10, children: [] },
      { id: 'req-path', label: 'GET /path', kind: 'request', order: 20 },
    ]);

    expect(model.canDropIntent('folder-users', reorder(null, 2, 0))).toBe(false);
    expect(model.applyIntent('folder-users', reorder(null, 2, 0))).toBeNull();
    expect(model.canDropIntent('folder-users', reorder(null, 0, 0))).toBe(true);
  });

  it('allows a folder after a leaf when foldersFirst is disabled', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ sort: { foldersFirst: false } }));
    model.setNodes([
      { id: 'folder-users', label: 'Users', kind: 'folder', order: 0, children: [] },
      { id: 'req-path', label: 'GET /path', kind: 'request', order: 10 },
    ]);

    expect(model.canDropIntent('folder-users', reorder(null, 1, 0))).toBe(true);
  });

  it('nests a folder ahead of existing requests when foldersFirst is enabled', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ sort: { foldersFirst: true } }));
    model.setNodes([
      {
        id: 'parent',
        label: 'Parent',
        kind: 'folder',
        order: 0,
        children: [{ id: 'req', label: 'GET /x', kind: 'request', order: 0 }],
      },
      { id: 'nested', label: 'Nested', kind: 'folder', order: 10, children: [] },
    ]);
    model.expand('parent');

    const intent: TxTreeDropIntent = { kind: 'inside', parentId: 'parent' };
    expect(model.canDropIntent('nested', intent)).toBe(true);
    const result = model.applyIntent('nested', intent);
    const parent = result!.nodes.find((n) => n.id === 'parent');
    expect(parent?.children?.map((n) => n.id)).toEqual(['nested', 'req']);
  });

  it('moves the last folder child to root ahead of an existing request', () => {
    const model = new TxTreeModel(mergeTxTreeConfig({ sort: { foldersFirst: true } }));
    model.setNodes([
      {
        id: 'folder-realtime',
        label: 'Realtime',
        kind: 'folder',
        children: [
          { id: 'new-folder', label: 'New folder', kind: 'folder', order: 0, children: [] },
          { id: 'ws-events', label: 'WS /events', kind: 'websocket', order: 10 },
        ],
      },
      { id: 'req-users', label: 'GET /users', kind: 'request', order: 0 },
    ]);
    model.expand('folder-realtime');

    const intent = reorder(null, 1, 0);
    expect(model.canDropIntent('ws-events', intent)).toBe(true);

    const moved = model.applyIntent('ws-events', intent);
    expect(moved!.nodes.map((node) => node.id)).toEqual([
      'folder-realtime',
      'ws-events',
      'req-users',
    ]);
  });
});

describe('TxTreeModel node identity', () => {
  it('skips cloning when setNodes receives the same root reference', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    expect(model.setNodes(SAMPLE)).toBe(true);
    model.expand('root');
    const firstClone = model.getNodes();
    expect(model.setNodes(SAMPLE)).toBe(false);
    expect(model.getNodes()).toBe(firstClone);
    expect(model.isExpanded('root')).toBe(true);
  });

  it('reuses cloned subtrees when input node identity is unchanged', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    const child: TxTreeNode = { id: 'a', label: 'A', kind: 'leaf' };
    const first: TxTreeNode[] = [{ id: 'root', label: 'Root', kind: 'folder', children: [child] }];
    model.setNodes(first);
    const clonedChild = model.getNodes()[0]?.children?.[0];
    const second: TxTreeNode[] = [
      { id: 'root', label: 'Root 2', kind: 'folder', children: [child] },
    ];
    expect(model.setNodes(second)).toBe(true);
    expect(model.getNodes()[0]?.label).toBe('Root 2');
    expect(model.getNodes()[0]?.children?.[0]).toBe(clonedChild);
  });
});
