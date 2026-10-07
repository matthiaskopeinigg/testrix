import type { CollectionNode, CollectionTree } from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildSlotTable,
  COLLECTIONS_ROOT_ID,
  flattenTree,
  resolveSlot,
  SLOT_STICKY_PX,
  TREE_GUTTER_PX,
  TREE_INDENT_PX,
  type DropSlotTable,
  type MeasuredRow,
  type TreeNodeInfo,
} from './collections-drop-model';

const ROW_HEIGHT = 30;
const ROW_PITCH = 32;
const CONTENT_BOTTOM = 400;
const ISO = '2026-01-01T00:00:00.000Z';

/**
 * folder-a      depth 0, index 0   top 0
 *   child-1     depth 1, index 0   top 32
 *   child-2     depth 1, index 1   top 64
 * item-1        depth 0, index 1   top 96
 * item-2        depth 0, index 2   top 128
 * item-3        depth 0, index 3   top 160
 */
function makeTree(): CollectionTree {
  return [
    {
      kind: 'folder',
      id: 'folder-a',
      name: 'Folder A',
      modifiedAt: ISO,
      children: [leaf('child-1'), leaf('child-2')],
    },
    leaf('item-1'),
    leaf('item-2'),
    leaf('item-3'),
  ];
}

function leaf(id: string): CollectionNode {
  return { kind: 'http', id, name: id, method: 'GET', status: 200, modifiedAt: ISO };
}

function layout(infos: readonly TreeNodeInfo[]): MeasuredRow[] {
  return infos.map((info, position) => ({
    ...info,
    top: position * ROW_PITCH,
    height: ROW_HEIGHT,
  }));
}

function tableFor(draggedId: string, expanded: readonly string[] = ['folder-a']): DropSlotTable {
  const rows = layout(flattenTree(makeTree(), (id) => expanded.includes(id)));
  const dragged = rows.find((row) => row.id === draggedId);
  return buildSlotTable(rows, {
    draggedId,
    draggedIsFolder: dragged?.kind === 'folder',
    contentTop: 0,
    contentBottom: CONTENT_BOTTOM,
  });
}

/** Indicator X for a given depth, i.e. straight under that level's rows. */
function xForDepth(depth: number): number {
  return TREE_GUTTER_PX + depth * TREE_INDENT_PX;
}

/**
 * Drags through a Y range and returns the slot keys in the order they were entered.
 *
 * A key appearing in two separate runs is exactly the flicker this model exists to
 * prevent, so tests assert the returned list has no duplicates.
 */
function sweep(table: DropSlotTable, x: number, from: number, to: number, step = 1): string[] {
  const visited: string[] = [];
  const direction = to >= from ? step : -step;
  let current: string | null = null;

  for (let y = from; direction > 0 ? y <= to : y >= to; y += direction) {
    const slot = resolveSlot(table, x, y, current);
    current = slot?.key ?? null;
    const label = current ?? '(none)';
    if (visited[visited.length - 1] !== label) {
      visited.push(label);
    }
  }

  return visited;
}

describe('flattenTree', () => {
  it('walks in visual order and only descends into expanded folders', () => {
    const expanded = flattenTree(makeTree(), () => true).map((row) => row.id);
    expect(expanded).toEqual(['folder-a', 'child-1', 'child-2', 'item-1', 'item-2', 'item-3']);

    const collapsed = flattenTree(makeTree(), () => false).map((row) => row.id);
    expect(collapsed).toEqual(['folder-a', 'item-1', 'item-2', 'item-3']);
  });

  it('records depth, sibling index, and the ancestor chain', () => {
    const rows = flattenTree(makeTree(), () => true);
    const child = rows.find((row) => row.id === 'child-2');

    expect(child).toMatchObject({
      parentId: 'folder-a',
      index: 1,
      depth: 1,
      ancestors: ['folder-a'],
    });
    expect(rows.find((row) => row.id === 'item-1')).toMatchObject({
      parentId: COLLECTIONS_ROOT_ID,
      index: 1,
      depth: 0,
      ancestors: [],
    });
  });
});

describe('buildSlotTable', () => {
  it('tiles the list with sorted, non-overlapping bands', () => {
    const { bands } = tableFor('item-3');

    expect(bands.length).toBeGreaterThan(0);
    expect(bands[0].start).toBe(0);
    expect(bands[bands.length - 1].end).toBe(CONTENT_BOTTOM);

    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index].start).toBeCloseTo(bands[index - 1].end, 5);
      expect(bands[index].end).toBeGreaterThan(bands[index].start);
    }
  });

  it('gives a folder row separate insert and into bands', () => {
    const { bands } = tableFor('item-3');
    const into = bands.find((band) => band.candidates[0].key === 'into:folder-a');

    expect(into).toBeDefined();
    expect(into?.start).toBeCloseTo(ROW_HEIGHT * 0.28, 5);
    expect(into?.end).toBeCloseTo(ROW_HEIGHT * 0.72, 5);
    expect(into?.candidates[0]).toMatchObject({ mode: 'into', parentId: 'folder-a', index: 2 });
  });

  it('marks slots that would break the folders-first rule', () => {
    const table = tableFor('item-3');
    const keyed = new Map(
      table.bands.flatMap((band) => band.candidates.map((slot) => [slot.key, slot] as const)),
    );

    // A request cannot sit above folder-a.
    expect(keyed.get(`between:${COLLECTIONS_ROOT_ID}:0`)?.denied).toBe(true);
    expect(keyed.get(`between:${COLLECTIONS_ROOT_ID}:1`)?.denied).toBe(false);
  });

  it('allows a request above a folder when the drop keeps manual order', () => {
    const rows = layout(flattenTree(makeTree(), (id) => id === 'folder-a'));
    const table = buildSlotTable(rows, {
      draggedId: 'item-3',
      draggedIsFolder: false,
      contentTop: 0,
      contentBottom: CONTENT_BOTTOM,
      manualOrder: true,
    });
    const slot = table.bands
      .flatMap((band) => band.candidates)
      .find((candidate) => candidate.key === `between:${COLLECTIONS_ROOT_ID}:0`);
    expect(slot?.denied).toBe(false);
  });

  it('allows a folder to shuffle past itself but not below a request', () => {
    const table = tableFor('folder-a');
    const keyed = new Map(
      table.bands.flatMap((band) => band.candidates.map((slot) => [slot.key, slot] as const)),
    );

    expect(keyed.get(`between:${COLLECTIONS_ROOT_ID}:0`)?.denied).toBe(false);
    expect(keyed.get(`between:${COLLECTIONS_ROOT_ID}:1`)?.denied).toBe(false);
    expect(keyed.get(`between:${COLLECTIONS_ROOT_ID}:2`)?.denied).toBe(true);
  });

  it('offers no target inside the dragged subtree', () => {
    const table = tableFor('folder-a');
    const keys = table.bands.flatMap((band) => band.candidates.map((slot) => slot.key));

    expect(keys).not.toContain('into:folder-a');
    expect(keys.some((key) => key.startsWith('between:folder-a:'))).toBe(false);

    // The rows are still on screen, so their span simply has no band.
    expect(resolveSlot(table, xForDepth(1), 50, null)).toBeNull();
  });
});

describe('slot identity', () => {
  it('treats "after item-1" and "before item-2" as one slot', () => {
    const table = tableFor('item-3');

    // Bottom half of item-1 and top half of item-2 sit in the same band.
    const afterItem1 = resolveSlot(table, xForDepth(0), 115, null);
    const beforeItem2 = resolveSlot(table, xForDepth(0), 140, null);

    expect(afterItem1?.key).toBe(`between:${COLLECTIONS_ROOT_ID}:2`);
    expect(beforeItem2?.key).toBe(afterItem1?.key);
  });

  it('never revisits a slot while dragging item-3 up past item-1', () => {
    const table = tableFor('item-3');
    const visited = sweep(table, xForDepth(0), 175, 96);

    expect(new Set(visited).size).toBe(visited.length);
    expect(visited).toEqual([
      `between:${COLLECTIONS_ROOT_ID}:3`,
      `between:${COLLECTIONS_ROOT_ID}:2`,
      `between:${COLLECTIONS_ROOT_ID}:1`,
    ]);
  });

  it('never revisits a slot on a full sweep of the list in either direction', () => {
    const table = tableFor('item-3');

    const down = sweep(table, xForDepth(0), 0, CONTENT_BOTTOM);
    const up = sweep(table, xForDepth(0), CONTENT_BOTTOM, 0);

    expect(new Set(down).size).toBe(down.length);
    expect(new Set(up).size).toBe(up.length);
  });
});

describe('resolveSlot hysteresis', () => {
  it('holds the current slot until the pointer clears the boundary', () => {
    const table = tableFor('item-3');
    const held = `between:${COLLECTIONS_ROOT_ID}:2`;

    // Band [111, 143], and the next band [143, 175] is far taller than the sticky zone.
    expect(resolveSlot(table, xForDepth(0), 143 + SLOT_STICKY_PX - 1, held)?.key).toBe(held);
    expect(resolveSlot(table, xForDepth(0), 143 + SLOT_STICKY_PX + 1, held)?.key).toBe(
      `between:${COLLECTIONS_ROOT_ID}:3`,
    );
  });

  it('keeps the centre of every band reachable from either side', () => {
    const table = tableFor('item-3');

    for (const band of table.bands) {
      const centre = (band.start + band.end) / 2;
      const expected = band.candidates.map((slot) => slot.key);

      for (const approach of table.bands) {
        const incumbent = approach.candidates[0].key;
        const landed = resolveSlot(table, xForDepth(0), centre, incumbent);
        expect(expected).toContain(landed?.key);
      }
    }
  });

  it('reaches a folder into-band that is shorter than the sticky zone', () => {
    const table = tableFor('item-3');
    const intoBand = table.bands.find((band) => band.candidates[0].key === 'into:folder-a');
    const centre = ((intoBand?.start ?? 0) + (intoBand?.end ?? 0)) / 2;

    // The band is ~13px tall, narrower than twice SLOT_STICKY_PX.
    expect((intoBand?.end ?? 0) - (intoBand?.start ?? 0)).toBeLessThan(SLOT_STICKY_PX * 2);
    // Creeping down from the slot above must still hand it over.
    expect(resolveSlot(table, xForDepth(0), centre, `between:${COLLECTIONS_ROOT_ID}:0`)?.key).toBe(
      'into:folder-a',
    );
  });

  it('never changes target while the pointer is still', () => {
    const table = tableFor('item-3');
    let current: string | null = null;

    for (let tick = 0; tick < 20; tick += 1) {
      const slot = resolveSlot(table, xForDepth(0), 143, current);
      if (current !== null) {
        expect(slot?.key).toBe(current);
      }
      current = slot?.key ?? null;
    }

    expect(current).not.toBeNull();
  });

  it('forgets a slot that no longer exists after a remeasure', () => {
    const table = tableFor('item-3', []);
    const slot = resolveSlot(table, xForDepth(1), 50, 'between:folder-a:1');

    expect(slot?.key).not.toBe('between:folder-a:1');
    expect(slot).not.toBeNull();
  });
});

describe('depth disambiguation', () => {
  it('offers one candidate per level for the gap that closes a folder', () => {
    const table = tableFor('item-3');
    // Band [79, 111]: below child-2 (depth 1) and above item-1 (depth 0).
    const band = table.bands.find((entry) => entry.start === 79);

    expect(band?.candidates.map((slot) => slot.key)).toEqual([
      `between:${COLLECTIONS_ROOT_ID}:1`,
      'between:folder-a:2',
    ]);
    expect(band?.candidates.map((slot) => slot.depth)).toEqual([0, 1]);
  });

  it('picks the level the pointer is horizontally over', () => {
    const table = tableFor('item-3');

    expect(resolveSlot(table, xForDepth(0), 95, null)?.key).toBe(
      `between:${COLLECTIONS_ROOT_ID}:1`,
    );
    expect(resolveSlot(table, xForDepth(1), 95, null)?.key).toBe('between:folder-a:2');
    // Past the deepest level, the deepest candidate stays selected.
    expect(resolveSlot(table, xForDepth(4), 95, null)?.key).toBe('between:folder-a:2');
  });

  it('requires a full indent step before switching level', () => {
    const table = tableFor('item-3');
    const shallow = `between:${COLLECTIONS_ROOT_ID}:1`;

    expect(resolveSlot(table, xForDepth(1) - 1, 95, shallow)?.key).toBe(shallow);
    // Reaching the deeper level's own indent hands it over.
    expect(resolveSlot(table, xForDepth(1), 95, shallow)?.key).toBe('between:folder-a:2');
  });

  it('offers only the first-child slot when descending into a folder', () => {
    const table = tableFor('item-3');
    // Band [21.6, 47]: between the folder row and its first child.
    const band = table.bands.find((entry) => Math.abs(entry.start - ROW_HEIGHT * 0.72) < 0.001);

    expect(band?.candidates.map((slot) => slot.key)).toEqual(['between:folder-a:0']);
  });
});

describe('edge cases', () => {
  it('falls back to a single root slot for an empty tree', () => {
    const table = buildSlotTable([], {
      draggedId: 'item-1',
      draggedIsFolder: false,
      contentTop: 0,
      contentBottom: CONTENT_BOTTOM,
    });

    expect(resolveSlot(table, 0, 120, null)).toMatchObject({
      parentId: COLLECTIONS_ROOT_ID,
      index: 0,
      denied: false,
    });
  });

  it('appends below the last row for the empty space underneath', () => {
    const table = tableFor('item-1');

    expect(resolveSlot(table, xForDepth(0), 320, null)?.key).toBe(
      `between:${COLLECTIONS_ROOT_ID}:4`,
    );
  });
});
