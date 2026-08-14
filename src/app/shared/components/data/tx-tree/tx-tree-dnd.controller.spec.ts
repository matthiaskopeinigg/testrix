import { describe, expect, it, vi } from 'vitest';

import { mergeTxTreeConfig } from './tx-tree.config';
import { TxTreeDnDController } from './tx-tree-dnd.controller';
import { TxTreeModel } from './tx-tree.model';
import { TX_TREE_DRAG_ACTIVATION_DISTANCE_PX } from './tx-tree.types';

const SAMPLE = [
  { id: 'a', label: 'A', kind: 'leaf', order: 0 },
  { id: 'b', label: 'B', kind: 'leaf', order: 10 },
];

async function flushAnimationFrames(frames = 2): Promise<void> {
  for (let i = 0; i < frames; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

describe('TxTreeDnDController', () => {
  it('does not activate drag until pointer moves past activation distance', async () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);

    const onStateChange = vi.fn();
    const controller = new TxTreeDnDController(model, () => mergeTxTreeConfig(), {
      onStateChange,
      onDrop: vi.fn(),
      onDeny: vi.fn(),
      onExpandNode: vi.fn(),
    });

    const row = document.createElement('div');
    row.dataset['txTreeNodeId'] = 'a';
    row.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 32,
        right: 200,
        bottom: 32,
      }) as DOMRect;
    document.body.appendChild(row);
    controller.registerRow('a', row);

    const down = new PointerEvent('pointerdown', {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      bubbles: true,
    });
    Object.defineProperty(down, 'currentTarget', { value: row });

    controller.handlePointerDown(down, 'a', false);
    expect(onStateChange).not.toHaveBeenCalled();

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100 + TX_TREE_DRAG_ACTIVATION_DISTANCE_PX,
        clientY: 100,
        pointerId: 1,
        bubbles: true,
      }),
    );
    await flushAnimationFrames();

    expect(onStateChange).toHaveBeenCalled();
    expect(controller.getState().draggingId).toBe('a');

    document.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 110, clientY: 100, pointerId: 1, bubbles: true }),
    );

    row.remove();
    controller.destroy();
  });

  it('suppresses click after an activated drag gesture', async () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes(SAMPLE);

    const controller = new TxTreeDnDController(model, () => mergeTxTreeConfig(), {
      onStateChange: vi.fn(),
      onDrop: vi.fn(),
      onDeny: vi.fn(),
      onExpandNode: vi.fn(),
    });

    const row = document.createElement('div');
    row.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 32,
        right: 200,
        bottom: 32,
      }) as DOMRect;
    document.body.appendChild(row);
    controller.registerRow('a', row);

    const down = new PointerEvent('pointerdown', {
      clientX: 0,
      clientY: 0,
      pointerId: 2,
      bubbles: true,
    });
    Object.defineProperty(down, 'currentTarget', { value: row });
    controller.handlePointerDown(down, 'a', false);

    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 20, clientY: 0, pointerId: 2, bubbles: true }),
    );
    await flushAnimationFrames();
    document.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 20, clientY: 0, pointerId: 2, bubbles: true }),
    );

    expect(controller.consumeClickSuppression()).toBe(true);
    expect(controller.consumeClickSuppression()).toBe(false);

    row.remove();
    controller.destroy();
  });

  it('targets the trailing root row when the pointer is below the tree', async () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([
      { id: 'other', label: 'Other', kind: 'folder', order: 0, children: [] },
      {
        id: 'new-folder',
        label: 'New folder',
        kind: 'folder',
        order: 10,
        children: [
          { id: 'ws-events', label: 'WS /events', kind: 'leaf', order: 0 },
          { id: 'ws-notifications', label: 'WS /notifications', kind: 'leaf', order: 10 },
        ],
      },
    ]);
    model.expand('new-folder');

    const treeHost = document.createElement('div');
    treeHost.className = 'tx-tree';
    treeHost.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 400,
        right: 200,
        bottom: 400,
      }) as DOMRect;
    document.body.appendChild(treeHost);

    const onStateChange = vi.fn();
    const controller = new TxTreeDnDController(model, () => mergeTxTreeConfig(), {
      onStateChange,
      onDrop: vi.fn(),
      onDeny: vi.fn(),
      onExpandNode: vi.fn(),
      getTreeHost: () => treeHost,
    });

    const registerRow = (id: string, top: number): HTMLElement => {
      const row = document.createElement('div');
      row.className = 'tx-tree-row-host';
      row.dataset['txTreeNodeId'] = id;
      row.getBoundingClientRect = () =>
        ({
          left: 0,
          top,
          width: 200,
          height: 28,
          right: 200,
          bottom: top + 28,
        }) as DOMRect;
      document.body.appendChild(row);
      controller.registerRow(id, row, { hasChildren: id === 'new-folder' });
      return row;
    };

    const rows = [
      registerRow('other', 0),
      registerRow('new-folder', 28),
      registerRow('ws-events', 56),
      registerRow('ws-notifications', 84),
    ];

    const dragRow = rows[3];
    const down = new PointerEvent('pointerdown', {
      clientX: 100,
      clientY: 96,
      pointerId: 3,
      bubbles: true,
    });
    Object.defineProperty(down, 'currentTarget', { value: dragRow });
    controller.handlePointerDown(down, 'ws-notifications', false);

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100,
        clientY: 96 + TX_TREE_DRAG_ACTIVATION_DISTANCE_PX,
        pointerId: 3,
        bubbles: true,
      }),
    );
    await flushAnimationFrames();

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100,
        clientY: 200,
        pointerId: 3,
        bubbles: true,
      }),
    );
    await flushAnimationFrames();

    expect(controller.getState()).toMatchObject({
      draggingId: 'ws-notifications',
      dropTargetId: 'new-folder',
      dropPosition: 'after',
      denyTargetId: null,
      indicatorTargetId: null,
      indicatorPosition: null,
      indicatorIndentDepth: 0,
      indicatorFolderSeamTopPx: 84,
    });

    treeHost.remove();

    for (const row of rows) {
      row.remove();
    }
    controller.destroy();
  });

  it('does not treat the dragged last row position as below-tree', async () => {
    const model = new TxTreeModel(mergeTxTreeConfig());
    model.setNodes([
      {
        id: 'new-folder',
        label: 'New folder',
        kind: 'folder',
        order: 0,
        children: [
          { id: 'ws-events', label: 'WS /events', kind: 'leaf', order: 0 },
          { id: 'ws-notifications', label: 'WS /notifications', kind: 'leaf', order: 10 },
        ],
      },
    ]);
    model.expand('new-folder');

    const onStateChange = vi.fn();
    const controller = new TxTreeDnDController(model, () => mergeTxTreeConfig(), {
      onStateChange,
      onDrop: vi.fn(),
      onDeny: vi.fn(),
      onExpandNode: vi.fn(),
    });

    const registerRow = (id: string, top: number): HTMLElement => {
      const row = document.createElement('div');
      row.className = 'tx-tree-row-host';
      row.dataset['txTreeNodeId'] = id;
      row.getBoundingClientRect = () =>
        ({
          left: 0,
          top,
          width: 200,
          height: 28,
          right: 200,
          bottom: top + 28,
        }) as DOMRect;
      document.body.appendChild(row);
      controller.registerRow(id, row, { hasChildren: id === 'new-folder' });
      return row;
    };

    const rows = [
      registerRow('new-folder', 0),
      registerRow('ws-events', 28),
      registerRow('ws-notifications', 56),
    ];

    const dragRow = rows[2];
    const down = new PointerEvent('pointerdown', {
      clientX: 100,
      clientY: 68,
      pointerId: 4,
      bubbles: true,
    });
    Object.defineProperty(down, 'currentTarget', { value: dragRow });
    controller.handlePointerDown(down, 'ws-notifications', false);

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100,
        clientY: 68 + TX_TREE_DRAG_ACTIVATION_DISTANCE_PX,
        pointerId: 4,
        bubbles: true,
      }),
    );
    await flushAnimationFrames();

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100,
        clientY: 32,
        pointerId: 4,
        bubbles: true,
      }),
    );
    await flushAnimationFrames();

    expect(controller.getState()).toMatchObject({
      draggingId: 'ws-notifications',
      dropTargetId: 'ws-events',
      dropPosition: 'before',
    });
    expect(controller.getState().indicatorTargetId).toBe('ws-events');
    expect(controller.getState().indicatorPosition).toBe('before');
    expect(controller.getState().dropTargetId).not.toBe('new-folder');

    for (const row of rows) {
      row.remove();
    }
    controller.destroy();
  });
});
