import { describe, expect, it, vi } from 'vitest';

import { mergeTxTreeConfig, type TxTreeConfigPartial } from './tx-tree.config';
import { TxTreeDnDController, type TxTreeDnDCallbacks } from './tx-tree-dnd.controller';
import { TxTreeModel } from './tx-tree.model';
import { TX_TREE_DRAG_ACTIVATION_DISTANCE_PX, type TxTreeNode } from './tx-tree.types';

const ROW_HEIGHT = 28;

const FLAT_NODES: TxTreeNode[] = [
  { id: 'a', label: 'A', kind: 'leaf', order: 0 },
  { id: 'b', label: 'B', kind: 'leaf', order: 10 },
  { id: 'c', label: 'C', kind: 'leaf', order: 20 },
];

async function flushAnimationFrames(frames = 2): Promise<void> {
  for (let i = 0; i < frames; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function stubRect(element: HTMLElement, top: number, height: number): HTMLElement {
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top,
      width: 200,
      height,
      right: 200,
      bottom: top + height,
    }) as DOMRect;
  return element;
}

/** Scrollable viewport around the tree, mimicking the sidebar panel shell. */
function mountScrollParent(treeHost: HTMLElement, viewportHeight: number): HTMLElement {
  const parent = stubRect(document.createElement('div'), 0, viewportHeight);
  parent.style.overflowY = 'auto';
  Object.defineProperty(parent, 'clientHeight', { value: viewportHeight });
  Object.defineProperty(parent, 'scrollHeight', { value: viewportHeight * 4 });

  let scrollTop = 0;
  Object.defineProperty(parent, 'scrollTop', {
    get: () => scrollTop,
    set: (next: number) => {
      scrollTop = Math.max(0, Math.min(viewportHeight * 3, next));
    },
  });

  parent.appendChild(treeHost);
  document.body.appendChild(parent);
  return parent;
}

/** Mounts a tree host with one stubbed row box per visible row, in order. */
function mountHarness(
  nodes: readonly TxTreeNode[],
  options?: {
    readonly expand?: readonly string[];
    readonly config?: TxTreeConfigPartial;
    readonly callbacks?: Partial<TxTreeDnDCallbacks>;
    /** Wraps the tree in a scrollable viewport of this height. */
    readonly scrollViewportHeight?: number;
  },
) {
  const config = mergeTxTreeConfig(options?.config);
  const model = new TxTreeModel(config);
  model.setNodes(nodes);
  for (const id of options?.expand ?? []) {
    model.expand(id);
  }

  const treeHost = stubRect(document.createElement('div'), 0, 600);
  treeHost.className = 'tx-tree';
  const scrollParent =
    options?.scrollViewportHeight === undefined
      ? null
      : mountScrollParent(treeHost, options.scrollViewportHeight);
  if (!scrollParent) {
    document.body.appendChild(treeHost);
  }

  const callbacks: TxTreeDnDCallbacks = {
    onStateChange: vi.fn(),
    onDrop: vi.fn(),
    onExpandNode: vi.fn(),
    getTreeHost: () => treeHost,
    ...options?.callbacks,
  };

  const controller = new TxTreeDnDController(model, () => config, callbacks);

  const rowElements = new Map<string, HTMLElement>();
  model.getVisibleRows().forEach((row, index) => {
    const element = stubRect(document.createElement('div'), index * ROW_HEIGHT, ROW_HEIGHT);
    element.className = 'tx-tree-row-host';
    treeHost.appendChild(element);
    controller.registerRow(row.id, element);
    rowElements.set(row.id, element);
  });

  let pointerId = 100;

  /** Presses on a row, moves past the activation threshold, then to `clientY`/`clientX`. */
  async function drag(
    nodeId: string,
    to: { readonly clientY: number; readonly clientX?: number },
  ): Promise<void> {
    const element = rowElements.get(nodeId);
    const startY = (element?.getBoundingClientRect().top ?? 0) + ROW_HEIGHT / 2;
    const id = ++pointerId;

    const down = new PointerEvent('pointerdown', {
      clientX: 100,
      clientY: startY,
      pointerId: id,
      bubbles: true,
    });
    Object.defineProperty(down, 'currentTarget', { value: element });
    controller.handlePointerDown(down, nodeId, false);

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100,
        clientY: startY + TX_TREE_DRAG_ACTIVATION_DISTANCE_PX,
        pointerId: id,
        bubbles: true,
      }),
    );
    await flushAnimationFrames();

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: to.clientX ?? 100,
        clientY: to.clientY,
        pointerId: id,
        bubbles: true,
      }),
    );
    await flushAnimationFrames();

    return;
  }

  function release(): void {
    document.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 100, clientY: 0, pointerId, bubbles: true }),
    );
  }

  function teardown(): void {
    controller.destroy();
    treeHost.remove();
    scrollParent?.remove();
  }

  return {
    model,
    controller,
    callbacks,
    rowElements,
    scrollParent,
    drag,
    release,
    teardown,
  };
}

describe('TxTreeDnDController activation', () => {
  it('does not activate drag until the pointer moves past the activation distance', async () => {
    const harness = mountHarness(FLAT_NODES);
    const onStateChange = harness.callbacks.onStateChange as ReturnType<typeof vi.fn>;

    const element = harness.rowElements.get('a')!;
    const down = new PointerEvent('pointerdown', {
      clientX: 100,
      clientY: 14,
      pointerId: 1,
      bubbles: true,
    });
    Object.defineProperty(down, 'currentTarget', { value: element });
    harness.controller.handlePointerDown(down, 'a', false);
    expect(onStateChange).not.toHaveBeenCalled();

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100 + TX_TREE_DRAG_ACTIVATION_DISTANCE_PX,
        clientY: 14,
        pointerId: 1,
        bubbles: true,
      }),
    );
    await flushAnimationFrames();

    expect(harness.controller.getState().draggingId).toBe('a');
    harness.release();
    harness.teardown();
  });

  it('suppresses the click that follows an activated drag', async () => {
    const harness = mountHarness(FLAT_NODES);
    await harness.drag('a', { clientY: 70 });
    harness.release();

    expect(harness.controller.consumeClickSuppression()).toBe(true);
    expect(harness.controller.consumeClickSuppression()).toBe(false);
    harness.teardown();
  });
});

describe('TxTreeDnDController drop resolution', () => {
  it('resolves a downward drag to the seam nearest the pointer', async () => {
    const harness = mountHarness(FLAT_NODES);

    // Seams sit at 0, 28, 56, 84; the pointer at 82 resolves to the last one.
    await harness.drag('a', { clientY: 82 });

    expect(harness.controller.getState()).toMatchObject({
      draggingId: 'a',
      intent: { kind: 'reorder', parentId: null, index: 2, depth: 0 },
      indicator: { topPx: 84, indentPx: 0 },
      denyTargetId: null,
    });
    harness.release();
    harness.teardown();
  });

  it('nests into the folder under the pointer centre', async () => {
    const harness = mountHarness(
      [
        { id: 'folder', label: 'Folder', kind: 'folder', order: 0, children: [] },
        { id: 'leaf', label: 'Leaf', kind: 'leaf', order: 10 },
      ],
      { config: { drop: { reparentAllowed: true } } },
    );

    await harness.drag('leaf', { clientY: 14 });

    expect(harness.controller.getState()).toMatchObject({
      draggingId: 'leaf',
      intent: { kind: 'inside', parentId: 'folder' },
      indicator: null,
    });
    harness.release();
    harness.teardown();
  });

  it('uses pointer X to choose between leaving and staying in a folder', async () => {
    const harness = mountHarness(
      [
        { id: 'head', label: 'Head', kind: 'leaf', order: 0 },
        {
          id: 'folder',
          label: 'Folder',
          kind: 'folder',
          order: 10,
          children: [
            { id: 'x', label: 'X', kind: 'leaf', order: 0 },
            { id: 'y', label: 'Y', kind: 'leaf', order: 10 },
          ],
        },
      ],
      { expand: ['folder'], config: { drop: { reparentAllowed: true } } },
    );

    // The seam below `y` (112px) is the folder's last-child slot at depth 1 and the
    // root's tail slot at depth 0; only the pointer indent tells them apart.
    await harness.drag('head', { clientY: 112, clientX: 26 });
    expect(harness.controller.getState().intent).toEqual({
      kind: 'reorder',
      parentId: 'folder',
      index: 2,
      depth: 1,
    });

    await harness.drag('head', { clientY: 112, clientX: 2 });
    expect(harness.controller.getState().intent).toEqual({
      kind: 'reorder',
      parentId: null,
      index: 1,
      depth: 0,
    });

    harness.release();
    harness.teardown();
  });

  it('drops at the tree root when the pointer is below the last row', async () => {
    const harness = mountHarness(
      [
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
      ],
      { expand: ['new-folder'], config: { drop: { reparentAllowed: true } } },
    );

    // Well below the last row (bottom 112px) and hard left, so depth 0 wins.
    await harness.drag('ws-notifications', { clientY: 300, clientX: 0 });

    expect(harness.controller.getState()).toMatchObject({
      draggingId: 'ws-notifications',
      intent: { kind: 'reorder', parentId: null, index: 2, depth: 0 },
      indicator: { topPx: 112, indentPx: 0 },
    });
    harness.release();
    harness.teardown();
  });

  it('commits the resolved intent on pointer up', async () => {
    const onDrop = vi.fn();
    const harness = mountHarness(FLAT_NODES, { callbacks: { onDrop } });

    await harness.drag('a', { clientY: 82 });
    harness.release();

    expect(onDrop).toHaveBeenCalledTimes(1);
    const [event, nodes] = onDrop.mock.calls[0];
    expect(event).toMatchObject({ sourceId: 'a', targetId: 'c', position: 'after' });
    expect(nodes.map((node: TxTreeNode) => node.id)).toEqual(['b', 'c', 'a']);
    harness.teardown();
  });

  it('rests the indicator on the dragged row and commits nothing there', async () => {
    const onDrop = vi.fn();
    const harness = mountHarness(FLAT_NODES, { callbacks: { onDrop } });

    // `b` occupies 28–56; its own seams stay legal so the line does not jump to the list ends.
    await harness.drag('b', { clientY: 30 });
    expect(harness.controller.getState()).toMatchObject({
      intent: { kind: 'reorder', parentId: null, index: 1, depth: 0 },
      indicator: { topPx: 28, indentPx: 0 },
      denyTargetId: null,
    });

    harness.release();
    expect(onDrop).not.toHaveBeenCalled();
    harness.teardown();
  });

  it('shows nothing and commits nothing when the policy rejects every slot', async () => {
    const onDrop = vi.fn();
    const harness = mountHarness(FLAT_NODES, {
      config: { drop: { canDrop: () => false } },
      callbacks: { onDrop },
    });

    await harness.drag('a', { clientY: 42 });
    expect(harness.controller.getState()).toMatchObject({
      draggingId: 'a',
      intent: null,
      indicator: null,
      denyTargetId: 'b',
    });

    harness.release();
    expect(onDrop).not.toHaveBeenCalled();
    harness.teardown();
  });

  it('shows nothing while the pointer rests on a row whose own seams are illegal', async () => {
    // Only the seam above `a` is legal, so hovering `c` (56-84) has nothing within reach.
    const harness = mountHarness(FLAT_NODES, {
      config: {
        drop: {
          canDrop: (ctx) => ctx.targetId === 'a' && ctx.position === 'before',
        },
      },
    });

    await harness.drag('c', { clientY: 70 });
    expect(harness.controller.getState()).toMatchObject({
      draggingId: 'c',
      intent: null,
      indicator: null,
      denyTargetId: 'c',
    });

    // The same slot is offered once the pointer reaches it.
    await harness.drag('c', { clientY: 2 });
    expect(harness.controller.getState()).toMatchObject({
      intent: { kind: 'reorder', parentId: null, index: 0, depth: 0 },
      indicator: { topPx: 0, indentPx: 0 },
    });

    harness.release();
    harness.teardown();
  });

  it('still offers the tail slot from far below the last row', async () => {
    const harness = mountHarness(FLAT_NODES);

    // Clamping to the row span keeps drops into the empty space below the list working.
    await harness.drag('a', { clientY: 900 });
    expect(harness.controller.getState()).toMatchObject({
      intent: { kind: 'reorder', parentId: null, index: 2, depth: 0 },
      indicator: { topPx: 84, indentPx: 0 },
    });

    harness.release();
    harness.teardown();
  });
});

describe('TxTreeDnDController auto-scroll', () => {
  it('scrolls the enclosing viewport while the pointer rests near its edge', async () => {
    const harness = mountHarness(FLAT_NODES, { scrollViewportHeight: 120 });
    expect(harness.scrollParent?.scrollTop).toBe(0);

    // 118px sits inside the bottom edge band of the 120px-tall viewport.
    await harness.drag('a', { clientY: 118 });
    await flushAnimationFrames(4);

    expect(harness.scrollParent!.scrollTop).toBeGreaterThan(0);

    harness.release();
    harness.teardown();
  });

  it('leaves the viewport alone when the pointer is away from the edges', async () => {
    const harness = mountHarness(FLAT_NODES, { scrollViewportHeight: 400 });

    await harness.drag('a', { clientY: 200 });
    await flushAnimationFrames(4);

    expect(harness.scrollParent!.scrollTop).toBe(0);

    harness.release();
    harness.teardown();
  });

  it('stops scrolling once the drag ends', async () => {
    const harness = mountHarness(FLAT_NODES, { scrollViewportHeight: 120 });

    await harness.drag('a', { clientY: 118 });
    await flushAnimationFrames(4);
    harness.release();

    const settled = harness.scrollParent!.scrollTop;
    await flushAnimationFrames(4);
    expect(harness.scrollParent!.scrollTop).toBe(settled);

    harness.teardown();
  });
});

describe('TxTreeDnDController lifecycle', () => {
  it('releases pointer capture and clears drag chrome on Escape', async () => {
    const harness = mountHarness(FLAT_NODES);
    const element = harness.rowElements.get('a')!;
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    element.setPointerCapture = setPointerCapture;
    element.releasePointerCapture = releasePointerCapture;
    element.hasPointerCapture = () => true;

    await harness.drag('a', { clientY: 70 });
    expect(harness.controller.getState().draggingId).toBe('a');
    expect(document.body.classList.contains('tx-tree-dnd-active')).toBe(true);
    expect(setPointerCapture).toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(harness.controller.getState().draggingId).toBeNull();
    expect(document.body.classList.contains('tx-tree-dnd-active')).toBe(false);
    expect(releasePointerCapture).toHaveBeenCalled();
    harness.teardown();
  });

  it('clears drag chrome when destroyed mid-drag', async () => {
    const harness = mountHarness(FLAT_NODES);
    await harness.drag('a', { clientY: 70 });
    expect(document.body.classList.contains('tx-tree-dnd-active')).toBe(true);

    harness.controller.destroy();
    expect(harness.controller.getState().draggingId).toBeNull();
    expect(document.body.classList.contains('tx-tree-dnd-active')).toBe(false);
    harness.teardown();
  });

  it('aborts the gesture when the dragging row unregisters', async () => {
    const harness = mountHarness(FLAT_NODES);
    await harness.drag('a', { clientY: 70 });
    expect(harness.controller.getState().draggingId).toBe('a');

    harness.controller.unregisterRow('a');
    expect(harness.controller.getState().draggingId).toBeNull();
    expect(document.body.classList.contains('tx-tree-dnd-active')).toBe(false);
    harness.teardown();
  });

  it('keeps the dragged row measurable so seams stay stable', async () => {
    const harness = mountHarness(FLAT_NODES);
    await harness.drag('b', { clientY: 42 });

    // Dragging `b` must not shift the seams above or below it.
    harness.controller.invalidateGeometry();
    await harness.drag('b', { clientY: 4 });
    expect(harness.controller.getState().indicator).toEqual({ topPx: 0, indentPx: 0 });

    harness.release();
    harness.teardown();
  });
});
