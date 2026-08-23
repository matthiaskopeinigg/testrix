import { describe, expect, it } from 'vitest';

import { mergeTxTreeConfig } from './tx-tree.config';
import { buildTxTreeDnDDebugInfo, formatTxTreeDropIntent } from './tx-tree-dnd-debug';
import { TxTreeModel } from './tx-tree.model';
import { TX_TREE_INITIAL_DND_STATE } from './tx-tree.types';

describe('buildTxTreeDnDDebugInfo', () => {
  it('builds an allowed inside drop summary while dragging', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(
      [
        {
          id: 'source-folder',
          label: 'Source',
          kind: 'folder',
          children: [{ id: 'leaf', label: 'Leaf', kind: 'leaf' }],
        },
        {
          id: 'target-folder',
          label: 'Target',
          kind: 'folder',
          children: [],
        },
      ],
      { resetExpansion: true },
    );
    model.expand('source-folder');
    model.expand('target-folder');

    const info = buildTxTreeDnDDebugInfo(
      model,
      {
        draggingId: 'leaf',
        intent: { kind: 'inside', parentId: 'target-folder' },
        indicator: null,
        denyTargetId: null,
      },
      { x: 120, y: 48 },
    );

    expect(info.phase).toBe('dragging');
    expect(info.source?.label).toBe('Leaf');
    expect(info.parent?.label).toBe('Target');
    expect(info.dropAllowed).toBe(true);
    expect(info.summary).toContain('into');
    expect(info.summary).toContain('allowed');
    expect(info.pointer).toEqual({ x: 120, y: 48 });
  });

  it('describes a root reorder intent without a parent node', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([
      { id: 'a', label: 'A', kind: 'leaf', order: 0 },
      { id: 'b', label: 'B', kind: 'leaf', order: 10 },
    ]);

    const info = buildTxTreeDnDDebugInfo(
      model,
      {
        draggingId: 'a',
        intent: { kind: 'reorder', parentId: null, index: 1, depth: 0 },
        indicator: { topPx: 56, indentPx: 0 },
        denyTargetId: null,
      },
      null,
    );

    expect(info.parent).toBeNull();
    expect(info.dropAllowed).toBe(true);
    expect(info.summary).toContain('the tree root');
    expect(info.summary).toContain('index 1');
  });

  it('reports idle when there is no active drag', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    const info = buildTxTreeDnDDebugInfo(model, TX_TREE_INITIAL_DND_STATE, null);

    expect(info.phase).toBe('idle');
    expect(info.summary).toBe('Idle');
    expect(info.source).toBeNull();
  });
});

describe('formatTxTreeDropIntent', () => {
  it('formats reorder and inside intents', () => {
    expect(
      formatTxTreeDropIntent({ kind: 'reorder', parentId: 'f', index: 2, depth: 1 }, 'Folder'),
    ).toBe('reorder → Folder[2] @depth 1');
    expect(
      formatTxTreeDropIntent({ kind: 'reorder', parentId: null, index: 0, depth: 0 }, null),
    ).toBe('reorder → root[0] @depth 0');
    expect(formatTxTreeDropIntent({ kind: 'inside', parentId: 'f' }, 'Folder')).toBe(
      'inside → Folder',
    );
    expect(formatTxTreeDropIntent(null, null)).toBe('—');
  });
});
