import { describe, expect, it } from 'vitest';

import { mergeTxTreeConfig } from './tx-tree.config';
import { buildTxTreeDnDDebugInfo } from './tx-tree-dnd-debug';
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
        dropTargetId: 'target-folder',
        dropPosition: 'inside',
        denyTargetId: null,
        indicatorTargetId: 'target-folder',
        indicatorPosition: 'inside',
        indicatorIndentDepth: null,
        indicatorFolderSeamTopPx: null,
      },
      { x: 120, y: 48 },
    );

    expect(info.phase).toBe('dragging');
    expect(info.source?.label).toBe('Leaf');
    expect(info.target?.label).toBe('Target');
    expect(info.dropAllowed).toBe(true);
    expect(info.summary).toContain('into');
    expect(info.summary).toContain('allowed');
    expect(info.pointer).toEqual({ x: 120, y: 48 });
  });

  it('reports idle when there is no active drag', () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    const info = buildTxTreeDnDDebugInfo(model, TX_TREE_INITIAL_DND_STATE, null);

    expect(info.phase).toBe('idle');
    expect(info.summary).toBe('Idle');
    expect(info.source).toBeNull();
  });
});
