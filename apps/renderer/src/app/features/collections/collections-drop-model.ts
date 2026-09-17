import type { CollectionNodeKind, CollectionTree } from '@testrix/contracts';

/**
 * Pure drop model for the collections tree.
 *
 * Geometry is measured once at drag start and turned into a flat table of bands that
 * tile the list from top to bottom. Every Y maps to at most one band, and a band's
 * candidates differ only in depth, so the pointer picks between them with X. Two
 * visually distinct gaps that mean the same insertion ("after item-1" and "before
 * item-2") produce one slot with one key, which is what stops the indicator
 * oscillating when the pointer sits near a row boundary.
 *
 * Nothing here touches the DOM, so it is unit-testable end to end.
 */

/** Parent id used for the top level of the tree. */
export const COLLECTIONS_ROOT_ID = '__root__';

/** Horizontal step per tree level. Matches the row padding in the node styles. */
export const TREE_INDENT_PX = 14;

/** Left inset before the first indent level. */
export const TREE_GUTTER_PX = 8;

/** Travel required past a boundary before a different slot may take over. */
export const SLOT_STICKY_PX = 10;

/** Share of a folder row reserved at each end for sibling inserts. */
export const FOLDER_EDGE_RATIO = 0.28;

export type DropMode = 'between' | 'into';

/** A node's position in the flattened, expansion-aware view of the tree. */
export interface TreeNodeInfo {
  readonly id: string;
  readonly kind: CollectionNodeKind;
  readonly parentId: string;
  /** Index among siblings. */
  readonly index: number;
  readonly depth: number;
  /** Direct children, including ones hidden by a collapsed parent. */
  readonly childCount: number;
  /** Ancestor ids, nearest first. */
  readonly ancestors: readonly string[];
}

/** A flattened node with its measured position in scroll-content space. */
export interface MeasuredRow extends TreeNodeInfo {
  readonly top: number;
  readonly height: number;
}

/** One resolved place the dragged node can land. */
export interface DropSlot {
  /** Positional identity. Equivalent insertions share it and so cannot alternate. */
  readonly key: string;
  readonly mode: DropMode;
  readonly parentId: string;
  readonly index: number;
  /** Depth the dropped row would render at, for the indicator inset. */
  readonly depth: number;
  readonly denied: boolean;
  /** Folder to highlight, for `into` slots. */
  readonly folderId: string | null;
  /** Indicator position in scroll-content space. */
  readonly y: number;
}

/** A contiguous Y range whose candidates differ only in depth. */
export interface DropBand {
  readonly start: number;
  readonly end: number;
  /** Ordered shallow to deep. Never empty. */
  readonly candidates: readonly DropSlot[];
}

export interface DropSlotTable {
  /** Sorted by `start`. Non-overlapping. */
  readonly bands: readonly DropBand[];
  readonly indent: number;
  readonly gutter: number;
}

export interface BuildSlotTableOptions {
  readonly draggedId: string;
  readonly draggedIsFolder: boolean;
  /** Folder ids in the moving set; any drop into these (or their descendants) is denied. */
  readonly draggedFolderIds?: readonly string[];
  /** Top of the scrollable content, normally 0. */
  readonly contentTop: number;
  /** Bottom of the scrollable content, so the empty area below the last row still drops. */
  readonly contentBottom: number;
  readonly indent?: number;
  readonly gutter?: number;
}

export const EMPTY_SLOT_TABLE: DropSlotTable = {
  bands: [],
  indent: TREE_INDENT_PX,
  gutter: TREE_GUTTER_PX,
};

/**
 * Walks the tree in visual order, descending only into expanded folders.
 */
export function flattenTree(
  nodes: CollectionTree,
  isExpanded: (id: string) => boolean,
): TreeNodeInfo[] {
  const rows: TreeNodeInfo[] = [];

  const walk = (
    list: CollectionTree,
    parentId: string,
    depth: number,
    ancestors: readonly string[],
  ): void => {
    for (let index = 0; index < list.length; index += 1) {
      const node = list[index];
      const isFolder = node.kind === 'folder';
      rows.push({
        id: node.id,
        kind: node.kind,
        parentId,
        index,
        depth,
        childCount: isFolder ? node.children.length : 0,
        ancestors,
      });
      if (isFolder && isExpanded(node.id)) {
        walk(node.children, node.id, depth + 1, [node.id, ...ancestors]);
      }
    }
  };

  walk(nodes, COLLECTIONS_ROOT_ID, 0, []);
  return rows;
}

interface ParentStats {
  /** Folders among these siblings, excluding the dragged node. */
  readonly folderCount: number;
}

/**
 * Builds the band table for one drag.
 *
 * Rows of the dragged node's own subtree contribute no slots: dropping a folder inside
 * itself is meaningless, and leaving the region blank is steadier than painting it red.
 */
export function buildSlotTable(
  rows: readonly MeasuredRow[],
  options: BuildSlotTableOptions,
): DropSlotTable {
  const indent = options.indent ?? TREE_INDENT_PX;
  const gutter = options.gutter ?? TREE_GUTTER_PX;
  const { draggedId, draggedIsFolder } = options;
  const draggedFolders = new Set(
    options.draggedFolderIds ?? (draggedIsFolder ? [draggedId] : []),
  );

  if (rows.length === 0) {
    const slot: DropSlot = {
      key: `between:${COLLECTIONS_ROOT_ID}:0`,
      mode: 'between',
      parentId: COLLECTIONS_ROOT_ID,
      index: 0,
      depth: 0,
      denied: false,
      folderId: null,
      y: options.contentTop,
    };
    return {
      bands: [{ start: options.contentTop, end: options.contentBottom, candidates: [slot] }],
      indent,
      gutter,
    };
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const depthOf = (parentId: string): number =>
    parentId === COLLECTIONS_ROOT_ID ? -1 : (byId.get(parentId)?.depth ?? -1);
  const inDraggedSubtree = (row: MeasuredRow): boolean =>
    row.id === draggedId ||
    draggedFolders.has(row.id) ||
    row.ancestors.includes(draggedId) ||
    row.ancestors.some((id) => draggedFolders.has(id));
  const parentInDraggedSubtree = (parentId: string): boolean => {
    if (parentId === draggedId || draggedFolders.has(parentId)) {
      return true;
    }
    const parent = byId.get(parentId);
    return parent
      ? parent.ancestors.includes(draggedId) || parent.ancestors.some((id) => draggedFolders.has(id))
      : false;
  };

  const stats = collectParentStats(rows, draggedFolders);
  const dragged = byId.get(draggedId) ?? null;

  const isDenied = (parentId: string, index: number): boolean => {
    const parent = stats.get(parentId) ?? { folderCount: 0 };
    // Mirror the removal that the move performs, so a no-op reorder never reads as invalid.
    const effective =
      dragged && dragged.parentId === parentId && dragged.index < index ? index - 1 : index;
    return draggedIsFolder ? effective > parent.folderCount : effective < parent.folderCount;
  };

  const makeBetween = (parentId: string, index: number, y: number): DropSlot => ({
    key: `between:${parentId}:${index}`,
    mode: 'between',
    parentId,
    index,
    depth: depthOf(parentId) + 1,
    denied: isDenied(parentId, index),
    folderId: null,
    y,
  });

  const edges = rows.map((row) => {
    const hasInto = row.kind === 'folder' && !inDraggedSubtree(row);
    const height = Math.max(row.height, 1);
    return {
      row,
      hasInto,
      beforeEnd: row.top + height * (hasInto ? FOLDER_EDGE_RATIO : 0.5),
      afterStart: row.top + height * (hasInto ? 1 - FOLDER_EDGE_RATIO : 0.5),
      bottom: row.top + height,
    };
  });

  const bands: DropBand[] = [];

  for (let gap = 0; gap <= rows.length; gap += 1) {
    const before = gap > 0 ? edges[gap - 1] : null;
    const after = gap < rows.length ? edges[gap] : null;

    const start = before ? before.afterStart : options.contentTop;
    const end = after ? after.beforeEnd : options.contentBottom;
    // A gap buried inside the dragged subtree leads nowhere.
    const buried = !!before && !!after && inDraggedSubtree(before.row) && inDraggedSubtree(after.row);

    if (end > start && !buried) {
      const y = resolveGapY(before?.bottom ?? null, after?.row.top ?? null, options.contentTop);
      const candidates = gapCandidates(before?.row ?? null, after?.row ?? null, byId)
        .filter((candidate) => !parentInDraggedSubtree(candidate.parentId))
        .map((candidate) => makeBetween(candidate.parentId, candidate.index, y));

      if (candidates.length > 0) {
        bands.push({ start, end, candidates });
      }
    }

    if (after?.hasInto) {
      const folder = after.row;
      bands.push({
        start: after.beforeEnd,
        end: after.afterStart,
        candidates: [
          {
            key: `into:${folder.id}`,
            mode: 'into',
            parentId: folder.id,
            index: folder.childCount,
            depth: folder.depth + 1,
            denied: false,
            folderId: folder.id,
            y: folder.top + folder.height / 2,
          },
        ],
      });
    }
  }

  return { bands, indent, gutter };
}

/**
 * Finds the insertion the pointer is over, preferring to stay put.
 *
 * Hysteresis is capped so the centre of every band stays reachable. Without the cap a
 * fat sticky zone can swallow a short band whole — a folder's "into" strip is only a
 * dozen pixels tall — and the target becomes impossible to hit from one side.
 */
export function resolveSlot(
  table: DropSlotTable,
  x: number,
  y: number,
  currentKey: string | null,
): DropSlot | null {
  const entered = findBand(table.bands, y);

  if (currentKey) {
    const held = findBandByKey(table, currentKey);
    if (held && holdsBand(held.band, entered, y)) {
      return holdsDepth(held.band, held.slot, x, table)
        ? held.slot
        : pickByDepth(held.band, x, table);
    }
  }

  return entered ? pickByDepth(entered, x, table) : null;
}

/** Looks up a slot by key across the whole table. */
export function findSlot(table: DropSlotTable, key: string): DropSlot | null {
  return findBandByKey(table, key)?.slot ?? null;
}

function resolveGapY(
  beforeBottom: number | null,
  afterTop: number | null,
  contentTop: number,
): number {
  if (beforeBottom !== null && afterTop !== null) {
    return (beforeBottom + afterTop) / 2;
  }
  if (afterTop !== null) {
    return afterTop;
  }
  if (beforeBottom !== null) {
    return beforeBottom;
  }
  return contentTop;
}

interface GapCandidate {
  readonly parentId: string;
  readonly index: number;
}

/**
 * Insertions reachable from one gap, ordered shallow to deep.
 *
 * A gap after a deeply nested row and before a shallower one is genuinely ambiguous:
 * it can close any number of levels. Each level becomes a candidate, and pointer X
 * picks between them the way file explorers do.
 */
function gapCandidates(
  before: MeasuredRow | null,
  after: MeasuredRow | null,
  byId: ReadonlyMap<string, MeasuredRow>,
): GapCandidate[] {
  if (!before) {
    return after
      ? [{ parentId: after.parentId, index: after.index }]
      : [{ parentId: COLLECTIONS_ROOT_ID, index: 0 }];
  }

  // Descending into an expanded folder leaves only its first child slot.
  if (after && after.depth > before.depth) {
    return [{ parentId: before.id, index: 0 }];
  }

  const floor = after ? after.depth : 0;
  const deepToShallow: GapCandidate[] = [{ parentId: before.parentId, index: before.index + 1 }];

  let current: MeasuredRow | undefined = before;
  while (current && current.depth > floor) {
    const parent: MeasuredRow | undefined = byId.get(current.parentId);
    if (!parent) {
      break;
    }
    deepToShallow.push({ parentId: parent.parentId, index: parent.index + 1 });
    current = parent;
  }

  return deepToShallow.reverse();
}

function collectParentStats(
  rows: readonly MeasuredRow[],
  draggedFolderIds: ReadonlySet<string>,
): Map<string, ParentStats> {
  const stats = new Map<string, { folderCount: number }>();
  const bump = (parentId: string): { folderCount: number } => {
    let entry = stats.get(parentId);
    if (!entry) {
      entry = { folderCount: 0 };
      stats.set(parentId, entry);
    }
    return entry;
  };

  bump(COLLECTIONS_ROOT_ID);
  for (const row of rows) {
    if (row.kind === 'folder') {
      bump(row.id);
      if (!draggedFolderIds.has(row.id)) {
        bump(row.parentId).folderCount += 1;
      }
      continue;
    }
    bump(row.parentId);
  }

  return stats;
}

function findBand(bands: readonly DropBand[], y: number): DropBand | null {
  let low = 0;
  let high = bands.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const band = bands[mid];
    if (y < band.start) {
      high = mid - 1;
    } else if (y > band.end) {
      low = mid + 1;
    } else {
      return band;
    }
  }
  return null;
}

function findBandByKey(
  table: DropSlotTable,
  key: string,
): { band: DropBand; slot: DropSlot } | null {
  for (const band of table.bands) {
    const slot = band.candidates.find((candidate) => candidate.key === key);
    if (slot) {
      return { band, slot };
    }
  }
  return null;
}

function pickByDepth(band: DropBand, x: number, table: DropSlotTable): DropSlot {
  const desired = (x - table.gutter) / table.indent;
  let best = band.candidates[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of band.candidates) {
    const distance = Math.abs(candidate.depth - desired);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * True while the pointer has not reached the middle of the band it moved into.
 *
 * @param entered Band under the pointer right now, or null when it sits in a gap
 *   that offers nothing, such as the dragged node's own subtree.
 */
function holdsBand(current: DropBand, entered: DropBand | null, y: number): boolean {
  if (entered === current) {
    return true;
  }
  const reach = entered
    ? Math.min(SLOT_STICKY_PX, (entered.end - entered.start) / 2)
    : SLOT_STICKY_PX;
  return y > current.start - reach && y < current.end + reach;
}

/**
 * True while the pointer has not travelled far enough in X to change depth.
 * Capped the same way as {@link holdsBand}: reaching a level's own indent wins it.
 */
function holdsDepth(band: DropBand, slot: DropSlot, x: number, table: DropSlotTable): boolean {
  if (band.candidates.length < 2) {
    return true;
  }

  const depths = band.candidates.map((candidate) => candidate.depth);
  const center = table.gutter + slot.depth * table.indent;
  const reach = table.indent / 2 + Math.min(SLOT_STICKY_PX, table.indent / 2);

  const lowerOpen = slot.depth === Math.min(...depths);
  const upperOpen = slot.depth === Math.max(...depths);

  return (lowerOpen || x > center - reach) && (upperOpen || x < center + reach);
}
