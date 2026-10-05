/** Click, shift-range, and modifier selection shared by the diagram grids. */

export interface SelectionRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Next selection after a click.
 * Shift selects the span from the anchor to `id`. Ctrl or Cmd toggles `id`.
 */
export function selectionFromClick(
  current: readonly string[],
  id: string,
  toggle: boolean,
  range: boolean,
  order: readonly string[],
): readonly string[] {
  if (range) {
    const anchor = current.at(-1);
    const start = anchor ? order.indexOf(anchor) : -1;
    const end = order.indexOf(id);
    if (start < 0 || end < 0)
      return [id];
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    return order.slice(from, to + 1);
  }
  if (toggle)
    return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  return [id];
}

/** True when the key should be left to a text field. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/** Pixel nudge for an arrow key. Shift moves a larger step. */
export function arrowStep(key: string, shift: boolean): { dx: number; dy: number } | null {
  const step = shift ? 32 : 8;
  if (key === 'ArrowLeft')
    return { dx: -step, dy: 0 };
  if (key === 'ArrowRight')
    return { dx: step, dy: 0 };
  if (key === 'ArrowUp')
    return { dx: 0, dy: -step };
  if (key === 'ArrowDown')
    return { dx: 0, dy: step };
  return null;
}

/** Axis-aligned box from two corners. */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): SelectionRect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/** True when the item box overlaps the marquee. */
export function rectHits(
  item: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  rect: SelectionRect,
): boolean {
  return item.x < rect.x + rect.w
    && item.x + item.width > rect.x
    && item.y < rect.y + rect.h
    && item.y + item.height > rect.y;
}

/**
 * Ids inside a marquee.
 * `base` stays selected when the drag adds to the current selection.
 */
export function idsInside(
  items: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[],
  rect: SelectionRect,
  base: readonly string[],
): readonly string[] {
  const hit = items.filter((item) => rectHits(item, rect)).map((item) => item.id);
  if (!base.length)
    return hit;
  return [...new Set([...base, ...hit])];
}
