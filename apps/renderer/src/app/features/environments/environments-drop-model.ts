/** A row's measured box in scroll-content space. */
export interface EnvMeasuredRow {
  readonly id: string;
  readonly index: number;
  readonly top: number;
  readonly height: number;
}

/** Insertion point in a flat environment list. `index` is the slot before that item. */
export interface EnvDropSlot {
  readonly key: string;
  readonly index: number;
  readonly y: number;
}

/**
 * Builds one slot before each row and one after the last row.
 */
export function buildEnvSlots(rows: readonly EnvMeasuredRow[]): EnvDropSlot[] {
  if (rows.length === 0) {
    return [];
  }
  const slots = rows.map((row) => ({
    key: `i:${row.index}`,
    index: row.index,
    y: row.top,
  }));
  const last = rows[rows.length - 1];
  slots.push({
    key: `i:${rows.length}`,
    index: rows.length,
    y: last.top + last.height,
  });
  return slots;
}

/**
 * Picks the insertion slot for a Y in scroll-content space.
 * Each row's top half inserts before it; the bottom half inserts after.
 */
export function resolveEnvSlot(rows: readonly EnvMeasuredRow[], y: number): EnvDropSlot | null {
  if (rows.length === 0) {
    return null;
  }
  for (const row of rows) {
    if (y < row.top + row.height / 2) {
      return { key: `i:${row.index}`, index: row.index, y: row.top };
    }
  }
  const last = rows[rows.length - 1];
  return {
    key: `i:${rows.length}`,
    index: rows.length,
    y: last.top + last.height,
  };
}

/**
 * Moves `id` so it lands at `insertIndex` in the list as currently ordered.
 * `insertIndex` is the slot index including the dragged row (before-removal).
 * Returns null when the drop would not change order.
 */
export function moveByInsertIndex<T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
  insertIndex: number,
): T[] | null {
  const from = items.findIndex((item) => item.id === id);
  if (from < 0) {
    return null;
  }
  if (insertIndex === from || insertIndex === from + 1) {
    return null;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  const insert = from < insertIndex ? insertIndex - 1 : insertIndex;
  next.splice(Math.max(0, Math.min(insert, next.length)), 0, item);
  return next;
}

/**
 * Moves `ids` as a contiguous block to `insertIndex` (slot in the current list, including dragged rows).
 * Preserves the visual order of the moved items.
 */
export function moveManyByInsertIndex<T extends { readonly id: string }>(
  items: readonly T[],
  ids: readonly string[],
  insertIndex: number,
): T[] | null {
  const idSet = new Set(ids);
  const ordered = items.filter((item) => idSet.has(item.id));
  if (ordered.length === 0) {
    return null;
  }

  const first = items.findIndex((item) => item.id === ordered[0].id);
  const contiguous =
    first >= 0 && ordered.every((item, offset) => items[first + offset]?.id === item.id);
  if (contiguous && (insertIndex === first || insertIndex === first + ordered.length)) {
    return null;
  }

  const remaining = items.filter((item) => !idSet.has(item.id));
  const removedBefore = items.slice(0, insertIndex).filter((item) => idSet.has(item.id)).length;
  const insert = Math.max(0, Math.min(insertIndex - removedBefore, remaining.length));
  return [...remaining.slice(0, insert), ...ordered, ...remaining.slice(insert)];
}
