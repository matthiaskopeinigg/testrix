import { describe, expect, it } from 'vitest';

import { mergeTxTreeConfig } from '@app/shared/components/data/tx-tree/tx-tree.config';
import { TxTreeModel } from '@app/shared/components/data/tx-tree/tx-tree.model';
import {
  buildTxTreeDropSlots,
  filterTxTreeDropSlots,
  type TxTreeRowBox,
  type TxTreeSlotRow,
} from '@app/shared/components/data/tx-tree/tx-tree-drop-slots';
import type {
  TxTreeDropContext,
  TxTreeDropIntent,
} from '@app/shared/components/data/tx-tree/tx-tree.types';

import { connectionCatalogId } from './connection-catalog.ids';
import { connectionCanDrop, remapConnectionDropTarget } from './connection-tree.drop';
import type { ConnectionTreeNode, ConnectionTreeNodeMeta } from './connection-tree.types';

function dropContext(
  source: ConnectionTreeNode,
  target: ConnectionTreeNode,
  position: TxTreeDropContext<ConnectionTreeNodeMeta>['position'],
  targetParentId: string | null = null,
): TxTreeDropContext<ConnectionTreeNodeMeta> {
  return {
    sourceId: source.id,
    source,
    targetId: target.id,
    target,
    position,
    sourceParentId: null,
    targetParentId,
  };
}

const connectionA: ConnectionTreeNode = {
  id: 'c-a',
  label: 'Alpha',
  kind: 'connection',
  data: { kind: 'connection' },
};

const connectionB: ConnectionTreeNode = {
  id: 'c-b',
  label: 'Beta',
  kind: 'connection',
  data: { kind: 'connection' },
};

const folder: ConnectionTreeNode = {
  id: 'f1',
  label: 'Prod',
  kind: 'folder',
  data: { kind: 'folder' },
};

const schema: ConnectionTreeNode = {
  id: connectionCatalogId('c-b', 'schema', { schema: 'public' }),
  label: 'public',
  kind: 'schema',
  data: { kind: 'schema' },
};

describe('connection-tree.drop', () => {
  it('remaps inside a connection to before that connection so a later row can move up', () => {
    expect(remapConnectionDropTarget(dropContext(connectionA, connectionB, 'inside'))).toEqual({
      targetId: 'c-b',
      position: 'before',
    });
  });

  it('remaps catalog rows onto the owning connection', () => {
    expect(remapConnectionDropTarget(dropContext(connectionA, schema, 'before'))).toEqual({
      targetId: 'c-b',
      position: 'after',
    });
  });

  it('remaps before the schemas action row to before the connection', () => {
    const schemas: ConnectionTreeNode = {
      id: connectionCatalogId('c-b', 'schemas', { name: 'schemas' }),
      label: '1 Schemas selected',
      kind: 'schemas',
      data: { kind: 'schemas', connectionId: 'c-b' },
    };
    expect(remapConnectionDropTarget(dropContext(connectionA, schemas, 'before'))).toEqual({
      targetId: 'c-b',
      position: 'before',
    });
    expect(remapConnectionDropTarget(dropContext(connectionA, schemas, 'after'))).toEqual({
      targetId: 'c-b',
      position: 'after',
    });
  });

  it('does not remap before/after persistable rows', () => {
    expect(remapConnectionDropTarget(dropContext(connectionA, connectionB, 'after'))).toBeNull();
    expect(remapConnectionDropTarget(dropContext(connectionA, folder, 'inside'))).toBeNull();
  });

  it('allows reorder and connections inside folders, but not nested folders', () => {
    expect(connectionCanDrop(dropContext(connectionA, connectionB, 'after'))).toBe(true);
    expect(connectionCanDrop(dropContext(connectionA, folder, 'inside'))).toBe(true);
    expect(connectionCanDrop(dropContext(connectionA, connectionB, 'inside'))).toBe(false);
    expect(connectionCanDrop(dropContext(connectionA, schema, 'after'))).toBe(false);
    expect(connectionCanDrop(dropContext(folder, folder, 'inside'))).toBe(false);
    expect(connectionCanDrop(dropContext(folder, connectionA, 'after', 'f1'))).toBe(false);
    expect(connectionCanDrop(dropContext(folder, connectionA, 'after'))).toBe(true);
  });
});

const ROW_HEIGHT = 28;
const INDENT_PX = 12;

/**
 * The connections tree mixes persisted rows with live catalog rows, and relies on
 * `remapDropTarget` to keep drops off the catalog. These tests drive the real slot table so
 * a policy change cannot silently start offering catalog slots again.
 */
function connectionTreeSlots(nodes: readonly ConnectionTreeNode[], sourceId: string) {
  const model = new TxTreeModel<ConnectionTreeNodeMeta>(
    mergeTxTreeConfig<ConnectionTreeNodeMeta>({
      sort: { siblingSort: 'manual' },
      drop: {
        canDrop: (ctx) => connectionCanDrop(ctx),
        remapDropTarget: (ctx) => remapConnectionDropTarget(ctx),
      },
      visual: { indentPx: INDENT_PX },
    }),
  );
  model.setNodes(nodes);
  for (const node of nodes) {
    model.expand(node.id);
    for (const child of node.children ?? []) {
      model.expand(child.id);
    }
  }

  const visible = model.getVisibleRows();
  const boxes = new Map<string, TxTreeRowBox>(
    visible.map((row, index) => [
      row.id,
      { topPx: index * ROW_HEIGHT, bottomPx: (index + 1) * ROW_HEIGHT },
    ]),
  );

  const rows: TxTreeSlotRow[] = visible.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    depth: row.depth,
    hasChildren: row.hasChildren,
    expanded: row.expanded,
    indexAmongSiblings: row.indexAmongSiblings,
  }));

  const sourceRow = rows.find((row) => row.id === sourceId);
  const table = buildTxTreeDropSlots({
    rows,
    boxes,
    source: sourceRow
      ? { id: sourceId, parentId: sourceRow.parentId, index: sourceRow.indexAmongSiblings }
      : null,
    indentPx: INDENT_PX,
  });

  const legal = filterTxTreeDropSlots(table, (intent) => model.canDropIntent(sourceId, intent));
  const intents: TxTreeDropIntent[] = [
    ...legal.seams.flatMap((seam) => seam.slots.map((slot) => slot.intent)),
    ...legal.insides.map((candidate) => candidate.intent),
  ];

  return { model, intents };
}

describe('connection-tree drop slots', () => {
  const nodes: ConnectionTreeNode[] = [
    {
      id: 'f1',
      label: 'Prod',
      kind: 'folder',
      data: { kind: 'folder' },
      children: [{ id: 'c-a', label: 'Alpha', kind: 'connection', data: { kind: 'connection' } }],
    },
    {
      id: 'c-b',
      label: 'Beta',
      kind: 'connection',
      data: { kind: 'connection' },
      children: [
        {
          id: connectionCatalogId('c-b', 'schemas', { name: 'schemas' }),
          label: '1 Schemas selected',
          kind: 'schemas',
          data: { kind: 'schemas', connectionId: 'c-b' },
        },
        {
          id: connectionCatalogId('c-b', 'schema', { schema: 'public' }),
          label: 'public',
          kind: 'schema',
          data: { kind: 'schema', connectionId: 'c-b', schema: 'public' },
        },
      ],
    },
  ];

  it('never offers a slot that would land inside a connection catalog', () => {
    const { intents } = connectionTreeSlots(nodes, 'c-a');
    expect(intents.every((intent) => intent.parentId !== 'c-b')).toBe(true);
  });

  it('offers root reorder and folder nesting for a connection', () => {
    const { intents, model } = connectionTreeSlots(nodes, 'c-a');

    expect(intents).toEqual(
      expect.arrayContaining([
        { kind: 'reorder', parentId: null, index: 0, depth: 0 },
        { kind: 'inside', parentId: 'f1' },
      ]),
    );

    const moved = model.applyIntent('c-a', { kind: 'reorder', parentId: null, index: 0, depth: 0 });
    expect(moved?.nodes.map((node) => node.id)).toEqual(['c-a', 'f1', 'c-b']);
  });

  it('keeps a dragged folder at the tree root', () => {
    const { intents } = connectionTreeSlots(nodes, 'f1');
    expect(intents.every((intent) => intent.parentId === null)).toBe(true);
  });
});
