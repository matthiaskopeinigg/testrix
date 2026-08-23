import { describe, expect, it } from 'vitest';

import {
  buildTxTreeDropSlots,
  dropIntentsEqual,
  resolveTxTreeDropIntent,
  resolveTxTreePointerDepth,
  type TxTreeDragSource,
  type TxTreeRowBox,
  type TxTreeSlotRow,
} from './tx-tree-drop-slots';
import type { TxTreeDropIntent } from './tx-tree.types';

const ROW_HEIGHT = 40;
const INDENT_PX = 16;

/** Builds contiguous 40px row boxes in the order given. */
function boxesFor(rows: readonly TxTreeSlotRow[]): Map<string, TxTreeRowBox> {
  const boxes = new Map<string, TxTreeRowBox>();
  rows.forEach((row, index) => {
    boxes.set(row.id, {
      topPx: index * ROW_HEIGHT,
      bottomPx: (index + 1) * ROW_HEIGHT,
    });
  });
  return boxes;
}

function row(
  id: string,
  depth: number,
  parentId: string | null,
  indexAmongSiblings: number,
  options?: { hasChildren?: boolean; expanded?: boolean },
): TxTreeSlotRow {
  return {
    id,
    parentId,
    depth,
    indexAmongSiblings,
    hasChildren: options?.hasChildren ?? false,
    expanded: options?.expanded ?? false,
  };
}

/** Root list: a, b, c. */
const FLAT_ROWS: TxTreeSlotRow[] = [
  row('a', 0, null, 0),
  row('b', 0, null, 1),
  row('c', 0, null, 2),
];

/** folder (expanded) > x, y; then sibling `next` at root. */
const NESTED_ROWS: TxTreeSlotRow[] = [
  row('folder', 0, null, 0, { hasChildren: true, expanded: true }),
  row('x', 1, 'folder', 0),
  row('y', 1, 'folder', 1),
  row('next', 0, null, 1),
];

const allow = (): boolean => true;

describe('buildTxTreeDropSlots', () => {
  it('creates a seam above the first row and below the last row', () => {
    const table = buildTxTreeDropSlots({
      rows: FLAT_ROWS,
      boxes: boxesFor(FLAT_ROWS),
      source: null,
      indentPx: INDENT_PX,
    });

    expect(table.seams.map((seam) => seam.topPx)).toEqual([0, 40, 80, 120]);
    expect(table.seams[0].slots).toEqual([
      { intent: { kind: 'reorder', parentId: null, index: 0, depth: 0 }, indicator: { topPx: 0, indentPx: 0 } },
    ]);
    expect(table.seams[3].slots[0].intent).toEqual({
      kind: 'reorder',
      parentId: null,
      index: 3,
      depth: 0,
    });
  });

  it('shifts indices down when the dragged node precedes the seam', () => {
    const source: TxTreeDragSource = { id: 'a', parentId: null, index: 0 };
    const table = buildTxTreeDropSlots({
      rows: FLAT_ROWS,
      boxes: boxesFor(FLAT_ROWS),
      source,
      indentPx: INDENT_PX,
    });

    // Seams above `a` keep their index; every later seam loses the extracted row.
    expect(table.seams.map((seam) => seam.slots[0].intent.index)).toEqual([0, 0, 1, 2]);
  });

  it('exposes one slot per reachable depth when leaving a folder', () => {
    const table = buildTxTreeDropSlots({
      rows: NESTED_ROWS,
      boxes: boxesFor(NESTED_ROWS),
      source: null,
      indentPx: INDENT_PX,
    });

    // Seam between `y` (last child) and `next` (root sibling).
    const exitSeam = table.seams.find((seam) => seam.topPx === 120);
    expect(exitSeam?.slots.map((slot) => slot.intent)).toEqual([
      { kind: 'reorder', parentId: null, index: 1, depth: 0 },
      { kind: 'reorder', parentId: 'folder', index: 2, depth: 1 },
    ]);
    expect(exitSeam?.slots.map((slot) => slot.indicator.indentPx)).toEqual([0, 16]);
  });

  it('nests as first child at the seam between a folder and its first child', () => {
    const table = buildTxTreeDropSlots({
      rows: NESTED_ROWS,
      boxes: boxesFor(NESTED_ROWS),
      source: null,
      indentPx: INDENT_PX,
    });

    const seam = table.seams.find((item) => item.topPx === 40);
    expect(seam?.slots.map((slot) => slot.intent)).toEqual([
      { kind: 'reorder', parentId: 'folder', index: 0, depth: 1 },
    ]);
  });

  it('reaches the first-child slot of an expanded empty folder', () => {
    const rows = [row('empty', 0, null, 0, { hasChildren: true, expanded: true })];
    const table = buildTxTreeDropSlots({
      rows,
      boxes: boxesFor(rows),
      source: null,
      indentPx: INDENT_PX,
    });

    const tail = table.seams.find((seam) => seam.topPx === 40);
    expect(tail?.slots.map((slot) => slot.intent)).toEqual([
      { kind: 'reorder', parentId: null, index: 1, depth: 0 },
      { kind: 'reorder', parentId: 'empty', index: 0, depth: 1 },
    ]);
  });

  it('does not offer nesting below a collapsed folder', () => {
    const rows = [
      row('folder', 0, null, 0, { hasChildren: true, expanded: false }),
      row('next', 0, null, 1),
    ];
    const table = buildTxTreeDropSlots({
      rows,
      boxes: boxesFor(rows),
      source: null,
      indentPx: INDENT_PX,
    });

    const seam = table.seams.find((item) => item.topPx === 40);
    expect(seam?.slots.map((slot) => slot.intent.depth)).toEqual([0]);
  });

  it('offers an inside candidate for the centre band of expandable rows only', () => {
    const table = buildTxTreeDropSlots({
      rows: NESTED_ROWS,
      boxes: boxesFor(NESTED_ROWS),
      source: null,
      indentPx: INDENT_PX,
    });

    expect(table.insides).toEqual([
      {
        intent: { kind: 'inside', parentId: 'folder' },
        bandTopPx: 10,
        bandBottomPx: 30,
        centerYPx: 20,
      },
    ]);
  });

  it('returns an empty table when there are no rows', () => {
    const table = buildTxTreeDropSlots({
      rows: [],
      boxes: new Map(),
      source: null,
      indentPx: INDENT_PX,
    });
    expect(table).toEqual({ seams: [], insides: [] });
  });
});

describe('resolveTxTreeDropIntent', () => {
  const flatTable = buildTxTreeDropSlots({
    rows: FLAT_ROWS,
    boxes: boxesFor(FLAT_ROWS),
    source: null,
    indentPx: INDENT_PX,
  });

  it('resolves the seam nearest the pointer', () => {
    const resolved = resolveTxTreeDropIntent({
      table: flatTable,
      pointerYPx: 44,
      pointerDepth: 0,
      previous: null,
      isAllowed: allow,
    });

    expect(resolved?.intent).toEqual({ kind: 'reorder', parentId: null, index: 1, depth: 0 });
    expect(resolved?.indicator).toEqual({ topPx: 40, indentPx: 0 });
  });

  it('keeps the previous slot while the challenger is within the hysteresis band', () => {
    const previous: TxTreeDropIntent = {
      kind: 'reorder',
      parentId: null,
      index: 1,
      depth: 0,
    };

    // 62px is nearer the 80px seam, but only by 4px.
    const held = resolveTxTreeDropIntent({
      table: flatTable,
      pointerYPx: 62,
      pointerDepth: 0,
      previous,
      isAllowed: allow,
      hysteresisPx: 6,
    });
    expect(held?.intent).toEqual(previous);

    const flipped = resolveTxTreeDropIntent({
      table: flatTable,
      pointerYPx: 70,
      pointerDepth: 0,
      previous,
      isAllowed: allow,
      hysteresisPx: 6,
    });
    expect(flipped?.intent).toEqual({ kind: 'reorder', parentId: null, index: 2, depth: 0 });
  });

  it('picks the seam depth closest to the pointer indent', () => {
    const table = buildTxTreeDropSlots({
      rows: NESTED_ROWS,
      boxes: boxesFor(NESTED_ROWS),
      source: null,
      indentPx: INDENT_PX,
    });

    const stayInside = resolveTxTreeDropIntent({
      table,
      pointerYPx: 120,
      pointerDepth: 1,
      previous: null,
      isAllowed: allow,
    });
    expect(stayInside?.intent).toEqual({
      kind: 'reorder',
      parentId: 'folder',
      index: 2,
      depth: 1,
    });

    const popOut = resolveTxTreeDropIntent({
      table,
      pointerYPx: 120,
      pointerDepth: 0,
      previous: null,
      isAllowed: allow,
    });
    expect(popOut?.intent).toEqual({ kind: 'reorder', parentId: null, index: 1, depth: 0 });
  });

  it('resolves the centre band of a folder to an inside intent', () => {
    const table = buildTxTreeDropSlots({
      rows: NESTED_ROWS,
      boxes: boxesFor(NESTED_ROWS),
      source: null,
      indentPx: INDENT_PX,
    });

    const resolved = resolveTxTreeDropIntent({
      table,
      pointerYPx: 20,
      pointerDepth: 0,
      previous: null,
      isAllowed: allow,
    });

    expect(resolved?.intent).toEqual({ kind: 'inside', parentId: 'folder' });
    expect(resolved?.indicator).toBeNull();
  });

  it('falls back to the next legal slot when the nearest one is denied', () => {
    const denyFirstSeam = (intent: TxTreeDropIntent): boolean =>
      !(intent.kind === 'reorder' && intent.index === 1);

    const resolved = resolveTxTreeDropIntent({
      table: flatTable,
      pointerYPx: 44,
      pointerDepth: 0,
      previous: null,
      isAllowed: denyFirstSeam,
    });

    expect(resolved?.intent).toEqual({ kind: 'reorder', parentId: null, index: 2, depth: 0 });
  });

  it('returns null when nothing is allowed', () => {
    const resolved = resolveTxTreeDropIntent({
      table: flatTable,
      pointerYPx: 44,
      pointerDepth: 0,
      previous: null,
      isAllowed: () => false,
    });
    expect(resolved).toBeNull();
  });

  it('offers nothing when the only legal slot is out of reach', () => {
    const onlyFirstSeam = (intent: TxTreeDropIntent): boolean =>
      intent.kind === 'reorder' && intent.index === 0;

    // Row `b` spans 40-80, so from its middle the seam at 0 is 60px away.
    expect(
      resolveTxTreeDropIntent({
        table: flatTable,
        pointerYPx: 60,
        pointerDepth: 0,
        previous: null,
        isAllowed: onlyFirstSeam,
        reachPx: ROW_HEIGHT,
      }),
    ).toBeNull();

    expect(
      resolveTxTreeDropIntent({
        table: flatTable,
        pointerYPx: 20,
        pointerDepth: 0,
        previous: null,
        isAllowed: onlyFirstSeam,
        reachPx: ROW_HEIGHT,
      })?.intent,
    ).toEqual({ kind: 'reorder', parentId: null, index: 0, depth: 0 });
  });

  it('does not let hysteresis hold a slot that moved out of reach', () => {
    const previous: TxTreeDropIntent = { kind: 'reorder', parentId: null, index: 0, depth: 0 };

    const resolved = resolveTxTreeDropIntent({
      table: flatTable,
      pointerYPx: 120,
      pointerDepth: 0,
      previous,
      isAllowed: allow,
      reachPx: ROW_HEIGHT,
    });

    expect(resolved?.intent).toEqual({ kind: 'reorder', parentId: null, index: 3, depth: 0 });
  });
});

describe('resolveTxTreePointerDepth', () => {
  it('quantises pointer X to indent levels', () => {
    expect(resolveTxTreePointerDepth(6, 6, 16)).toBe(0);
    expect(resolveTxTreePointerDepth(20, 6, 16)).toBe(1);
    expect(resolveTxTreePointerDepth(40, 6, 16)).toBe(2);
  });

  it('never returns a negative depth', () => {
    expect(resolveTxTreePointerDepth(-40, 6, 16)).toBe(0);
  });
});

describe('dropIntentsEqual', () => {
  it('compares kind, parent, and index', () => {
    const base: TxTreeDropIntent = { kind: 'reorder', parentId: null, index: 1, depth: 0 };
    expect(dropIntentsEqual(base, { ...base })).toBe(true);
    expect(dropIntentsEqual(base, { ...base, index: 2 })).toBe(false);
    expect(dropIntentsEqual(base, { kind: 'inside', parentId: 'folder' })).toBe(false);
    expect(dropIntentsEqual(null, null)).toBe(true);
    expect(dropIntentsEqual(base, null)).toBe(false);
  });
});
