/**
 * Drop-slot resolution for tree drag-and-drop.
 *
 * A drag gesture resolves to exactly one {@link TxTreeDropIntent}, which drives both the
 * insert indicator and the committed move. This module is pure: it takes flattened rows
 * plus measured geometry and returns candidate slots, so it is unit-testable without a DOM.
 */

import {
  TX_TREE_DROP_HIT_AFTER_RATIO,
  TX_TREE_DROP_HIT_BEFORE_RATIO,
  TX_TREE_DROP_HYSTERESIS_PX,
  type TxTreeDropIndicator,
  type TxTreeDropIntent,
  type TxTreeInsideIntent,
  type TxTreeReorderIntent,
} from './tx-tree.types';

/** Flattened row shape the slot table needs (structural subset of a visible row). */
export interface TxTreeSlotRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  /** Index among visible siblings in display order. */
  readonly indexAmongSiblings: number;
}

/** Measured row box relative to the tree content box. */
export interface TxTreeRowBox {
  readonly topPx: number;
  readonly bottomPx: number;
}

/** Position of the dragged node before it is extracted. */
export interface TxTreeDragSource {
  readonly id: string;
  readonly parentId: string | null;
  /** Index among visible siblings in display order. */
  readonly index: number;
}

/** One reorder candidate: an insert seam at a specific depth. */
export interface TxTreeDropSlot {
  readonly intent: TxTreeReorderIntent;
  readonly indicator: TxTreeDropIndicator;
}

/** Insert seam between two rows, holding one slot per reachable depth. */
export interface TxTreeDropSeam {
  readonly topPx: number;
  /** Slots at this seam, ascending by depth. */
  readonly slots: readonly TxTreeDropSlot[];
}

/** Nesting candidate activated by the centre band of an expandable row. */
export interface TxTreeInsideCandidate {
  readonly intent: TxTreeInsideIntent;
  readonly bandTopPx: number;
  readonly bandBottomPx: number;
  readonly centerYPx: number;
}

/** Every drop candidate for the current drag. */
export interface TxTreeDropSlotTable {
  readonly seams: readonly TxTreeDropSeam[];
  readonly insides: readonly TxTreeInsideCandidate[];
}

export const TX_TREE_EMPTY_DROP_SLOT_TABLE: TxTreeDropSlotTable = {
  seams: [],
  insides: [],
};

export interface BuildTxTreeDropSlotsParams {
  readonly rows: readonly TxTreeSlotRow[];
  /** Row boxes keyed by node id, relative to the tree content box. */
  readonly boxes: ReadonlyMap<string, TxTreeRowBox>;
  /** Dragged node, or `null` to build the table for every row. */
  readonly source: TxTreeDragSource | null;
  readonly indentPx: number;
}

/**
 * Builds every structurally reachable drop candidate.
 *
 * Seams sit at row boundaries. A seam exposes one slot per depth between the depth of the
 * row below it (shallowest reachable nesting) and the depth reachable from the row above
 * it, which is one level deeper when that row is an expanded parent. Pointer X later picks
 * the depth, which is what lets a drag escape a folder by moving left.
 *
 * @returns Candidates with `index` already converted to post-extraction coordinates.
 */
export function buildTxTreeDropSlots(
  params: BuildTxTreeDropSlotsParams,
): TxTreeDropSlotTable {
  const { rows, boxes, source, indentPx } = params;
  if (rows.length === 0) {
    return TX_TREE_EMPTY_DROP_SLOT_TABLE;
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const seams: TxTreeDropSeam[] = [];

  for (let gap = 0; gap <= rows.length; gap++) {
    const above = gap > 0 ? rows[gap - 1] : null;
    const below = gap < rows.length ? rows[gap] : null;
    const topPx = resolveSeamTopPx(above, below, boxes);
    if (topPx === null) {
      continue;
    }

    const minDepth = below ? below.depth : 0;
    const maxDepth = Math.max(minDepth, resolveSeamMaxDepth(above, below));
    const slots: TxTreeDropSlot[] = [];

    for (let depth = minDepth; depth <= maxDepth; depth++) {
      const anchor = resolveSeamAnchor(above, depth, rowsById);
      if (anchor === undefined) {
        continue;
      }

      const intent = toReorderIntent(anchor, depth, source);
      slots.push({
        intent,
        indicator: { topPx, indentPx: depth * indentPx },
      });
    }

    if (slots.length > 0) {
      seams.push({ topPx, slots });
    }
  }

  return { seams, insides: buildInsideCandidates(rows, boxes) };
}

/**
 * Seam anchor for a depth: the row directly above the seam, or its ancestor at that depth.
 *
 * `null` means the seam belongs to the top of the tree, `undefined` means the depth is not
 * reachable from this seam.
 */
function resolveSeamAnchor(
  above: TxTreeSlotRow | null,
  depth: number,
  rowsById: ReadonlyMap<string, TxTreeSlotRow>,
): TxTreeSlotRow | null | undefined {
  if (!above) {
    return null;
  }

  if (depth === above.depth + 1) {
    return above;
  }

  let current: TxTreeSlotRow | null = above;
  while (current && current.depth > depth) {
    current = current.parentId ? (rowsById.get(current.parentId) ?? null) : null;
  }

  return current?.depth === depth ? current : undefined;
}

/**
 * Converts a seam anchor into a reorder intent.
 *
 * The anchor either becomes the receiving parent (nesting one level deeper) or the sibling
 * the node lands after. Indices shift down by one when the dragged node was an earlier
 * sibling of the destination, because it is extracted before the insert.
 */
function toReorderIntent(
  anchor: TxTreeSlotRow | null,
  depth: number,
  source: TxTreeDragSource | null,
): TxTreeReorderIntent {
  if (!anchor) {
    return { kind: 'reorder', parentId: null, index: 0, depth };
  }

  const nestsIntoAnchor = depth === anchor.depth + 1;
  const parentId = nestsIntoAnchor ? anchor.id : anchor.parentId;
  const rawIndex = nestsIntoAnchor ? 0 : anchor.indexAmongSiblings + 1;
  const shifts =
    source !== null && source.parentId === parentId && source.index < rawIndex;

  return { kind: 'reorder', parentId, index: shifts ? rawIndex - 1 : rawIndex, depth };
}

/** Deepest nesting level reachable from the row above a seam. */
function resolveSeamMaxDepth(
  above: TxTreeSlotRow | null,
  below: TxTreeSlotRow | null,
): number {
  if (!above) {
    return below ? below.depth : 0;
  }
  return above.hasChildren && above.expanded ? above.depth + 1 : above.depth;
}

function resolveSeamTopPx(
  above: TxTreeSlotRow | null,
  below: TxTreeSlotRow | null,
  boxes: ReadonlyMap<string, TxTreeRowBox>,
): number | null {
  const aboveBox = above ? boxes.get(above.id) : undefined;
  const belowBox = below ? boxes.get(below.id) : undefined;

  if (aboveBox && belowBox) {
    return (aboveBox.bottomPx + belowBox.topPx) / 2;
  }
  if (belowBox) {
    return belowBox.topPx;
  }
  if (aboveBox) {
    return aboveBox.bottomPx;
  }
  return null;
}

function buildInsideCandidates(
  rows: readonly TxTreeSlotRow[],
  boxes: ReadonlyMap<string, TxTreeRowBox>,
): TxTreeInsideCandidate[] {
  const insides: TxTreeInsideCandidate[] = [];

  for (const row of rows) {
    if (!row.hasChildren) {
      continue;
    }

    const box = boxes.get(row.id);
    if (!box) {
      continue;
    }

    const height = box.bottomPx - box.topPx;
    insides.push({
      intent: { kind: 'inside', parentId: row.id },
      bandTopPx: box.topPx + height * TX_TREE_DROP_HIT_BEFORE_RATIO,
      bandBottomPx: box.bottomPx - height * TX_TREE_DROP_HIT_AFTER_RATIO,
      centerYPx: (box.topPx + box.bottomPx) / 2,
    });
  }

  return insides;
}

/**
 * Drops every candidate the policy rejects.
 *
 * Legality depends on the tree, not the pointer, so it is evaluated once per table rebuild
 * and pointer moves then only compare geometry.
 */
export function filterTxTreeDropSlots(
  table: TxTreeDropSlotTable,
  isAllowed: (intent: TxTreeDropIntent) => boolean,
): TxTreeDropSlotTable {
  const seams: TxTreeDropSeam[] = [];

  for (const seam of table.seams) {
    const slots = seam.slots.filter((slot) => isAllowed(slot.intent));
    if (slots.length > 0) {
      seams.push({ topPx: seam.topPx, slots });
    }
  }

  return {
    seams,
    insides: table.insides.filter((candidate) => isAllowed(candidate.intent)),
  };
}

/** Resolved drop for the current pointer position. */
export interface TxTreeResolvedDrop {
  readonly intent: TxTreeDropIntent;
  /** Insert-line geometry; `null` for `inside` intents, which highlight the row. */
  readonly indicator: TxTreeDropIndicator | null;
}

export interface ResolveTxTreeDropParams {
  readonly table: TxTreeDropSlotTable;
  /** Pointer Y relative to the tree content box, clamped to the row span. */
  readonly pointerYPx: number;
  /** Indent level the pointer X maps to (see {@link resolveTxTreePointerDepth}). */
  readonly pointerDepth: number;
  /** Last resolved intent, kept while the challenger is within the hysteresis band. */
  readonly previous: TxTreeDropIntent | null;
  /** Extra policy filter; omit when the table is already filtered. */
  readonly isAllowed?: (intent: TxTreeDropIntent) => boolean;
  readonly hysteresisPx?: number;
  /**
   * How far a candidate may sit from the pointer before it stops being offered.
   *
   * Pass the height of the row under the pointer so only that row's own seams can win.
   * Without a reach, the nearest legal slot wins however distant it is, which draws an
   * insert line somewhere the pointer is not.
   */
  readonly reachPx?: number;
}

/**
 * Picks the drop candidate nearest the pointer.
 *
 * Both candidate families are scored by distance to their anchor — a seam's insert line or
 * a row centre — so the nesting band and the surrounding seams meet at a stable boundary.
 * The previous intent wins ties, which stops the indicator flickering between two slots.
 *
 * @returns `null` when nothing legal is within reach, meaning the pointer rests somewhere
 * that cannot accept the drop and no indicator should be drawn.
 */
export function resolveTxTreeDropIntent(
  params: ResolveTxTreeDropParams,
): TxTreeResolvedDrop | null {
  const { table, pointerYPx, pointerDepth, previous } = params;
  const isAllowed = params.isAllowed ?? allowAnyIntent;
  const hysteresisPx = params.hysteresisPx ?? TX_TREE_DROP_HYSTERESIS_PX;
  const reachPx = params.reachPx ?? Number.POSITIVE_INFINITY;

  const seam = pickNearestSeamSlot(table.seams, pointerYPx, pointerDepth, isAllowed);
  const inside = pickInsideCandidate(table.insides, pointerYPx, isAllowed);

  const winner = nearerCandidate(seam, inside);
  if (!winner || winner.distance > reachPx) {
    return null;
  }

  const held = previous ? scoreIntent(table, previous, pointerYPx, isAllowed) : null;
  if (held && held.distance <= reachPx && held.distance - winner.distance <= hysteresisPx) {
    return held.drop;
  }

  return winner.drop;
}

type ScoredDrop = { readonly drop: TxTreeResolvedDrop; readonly distance: number };

function allowAnyIntent(): boolean {
  return true;
}

function nearerCandidate(
  a: ScoredDrop | null,
  b: ScoredDrop | null,
): ScoredDrop | null {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return b.distance < a.distance ? b : a;
}

/**
 * Scores an intent wherever it appears in the table, so hysteresis can hold a slot that is
 * no longer the nearest one. Returns `null` once the intent becomes unreachable or denied.
 */
function scoreIntent(
  table: TxTreeDropSlotTable,
  intent: TxTreeDropIntent,
  pointerYPx: number,
  isAllowed: (candidate: TxTreeDropIntent) => boolean,
): ScoredDrop | null {
  if (!isAllowed(intent)) {
    return null;
  }

  if (intent.kind === 'inside') {
    const candidate = table.insides.find((item) =>
      dropIntentsEqual(item.intent, intent),
    );
    if (!candidate) {
      return null;
    }
    if (pointerYPx < candidate.bandTopPx || pointerYPx > candidate.bandBottomPx) {
      return null;
    }
    return {
      drop: { intent: candidate.intent, indicator: null },
      distance: Math.abs(pointerYPx - candidate.centerYPx),
    };
  }

  for (const seam of table.seams) {
    const slot = seam.slots.find((item) => dropIntentsEqual(item.intent, intent));
    if (slot) {
      return {
        drop: { intent: slot.intent, indicator: slot.indicator },
        distance: Math.abs(pointerYPx - seam.topPx),
      };
    }
  }

  return null;
}

function pickNearestSeamSlot(
  seams: readonly TxTreeDropSeam[],
  pointerYPx: number,
  pointerDepth: number,
  isAllowed: (intent: TxTreeDropIntent) => boolean,
): ScoredDrop | null {
  let best: ScoredDrop | null = null;

  for (const seam of seams) {
    const slot = pickSeamSlotByDepth(seam, pointerDepth, isAllowed);
    if (!slot) {
      continue;
    }

    const distance = Math.abs(pointerYPx - seam.topPx);
    if (best === null || distance < best.distance) {
      best = { drop: { intent: slot.intent, indicator: slot.indicator }, distance };
    }
  }

  return best;
}

/** Allowed slot at a seam whose depth is closest to the pointer, preferring the shallower. */
function pickSeamSlotByDepth(
  seam: TxTreeDropSeam,
  pointerDepth: number,
  isAllowed: (intent: TxTreeDropIntent) => boolean,
): TxTreeDropSlot | null {
  let best: TxTreeDropSlot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const slot of seam.slots) {
    if (!isAllowed(slot.intent)) {
      continue;
    }
    const distance = Math.abs(slot.intent.depth - pointerDepth);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }

  return best;
}

function pickInsideCandidate(
  insides: readonly TxTreeInsideCandidate[],
  pointerYPx: number,
  isAllowed: (intent: TxTreeDropIntent) => boolean,
): ScoredDrop | null {
  for (const candidate of insides) {
    if (pointerYPx < candidate.bandTopPx || pointerYPx > candidate.bandBottomPx) {
      continue;
    }
    if (!isAllowed(candidate.intent)) {
      continue;
    }
    return {
      drop: { intent: candidate.intent, indicator: null },
      distance: Math.abs(pointerYPx - candidate.centerYPx),
    };
  }

  return null;
}

/** Maps pointer X to an indent level so a drag can change depth by moving sideways. */
export function resolveTxTreePointerDepth(
  pointerXPx: number,
  contentLeftPx: number,
  indentPx: number,
): number {
  if (indentPx <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((pointerXPx - contentLeftPx) / indentPx));
}

export function dropIntentsEqual(
  a: TxTreeDropIntent | null,
  b: TxTreeDropIntent | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.kind === 'inside') {
    return b.kind === 'inside' && a.parentId === b.parentId;
  }
  return (
    b.kind === 'reorder' &&
    a.parentId === b.parentId &&
    a.index === b.index &&
    a.depth === b.depth
  );
}

export function dropIndicatorsEqual(
  a: TxTreeDropIndicator | null,
  b: TxTreeDropIndicator | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.topPx === b.topPx && a.indentPx === b.indentPx;
}
