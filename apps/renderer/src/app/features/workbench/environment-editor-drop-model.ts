import type { EnvironmentNode } from '@testrix/contracts';
import { isEnvironmentFolder } from '@testrix/contracts';

/** Share of a folder row reserved at each end for sibling inserts when nesting is allowed. */
export const ENV_FOLDER_EDGE_RATIO = 0.28;

export type EnvEditorDropMode = 'between' | 'into';
export type EnvEditorDropSurface = 'tree';

export interface EnvMeasuredNodeRow {
  readonly id: string;
  readonly kind: 'folder' | 'variable';
  readonly parentId: string | null;
  readonly mixedIndex: number;
  readonly folderIndex: number;
  readonly depth: number;
  readonly collapsed: boolean;
  readonly childCount: number;
  readonly top: number;
  readonly height: number;
  readonly left: number;
}

export interface EnvEditorDropLayout {
  readonly rows: readonly EnvMeasuredNodeRow[];
  readonly tree: EnvSurfaceBox;
}

export interface EnvSurfaceBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface EnvEditorDragItem {
  readonly id: string;
  readonly kind: 'folder' | 'variable';
  readonly parentId: string | null;
  readonly mixedIndex: number;
}

export interface EnvEditorDropTarget {
  readonly key: string;
  readonly mode: EnvEditorDropMode;
  readonly parentId: string | null;
  readonly index: number;
  readonly folderId: string | null;
  readonly surface: EnvEditorDropSurface;
  readonly y: number;
  readonly denied: boolean;
}

function contains(box: EnvSurfaceBox, x: number, y: number, slack = 0): boolean {
  return x >= box.left - slack && x <= box.right + slack && y >= box.top - slack && y <= box.bottom + slack;
}

function isDenied(
  dragged: EnvEditorDragItem,
  parentId: string | null,
  descendantIds: ReadonlySet<string>,
): boolean {
  if (!parentId) {
    return false;
  }
  return parentId === dragged.id || descendantIds.has(parentId);
}

function makeBetween(
  parentId: string | null,
  index: number,
  y: number,
  dragged: EnvEditorDragItem,
  descendantIds: ReadonlySet<string>,
): EnvEditorDropTarget {
  return {
    key: `between:${parentId ?? 'root'}:${index}`,
    mode: 'between',
    parentId,
    index,
    folderId: null,
    surface: 'tree',
    y,
    denied: isDenied(dragged, parentId, descendantIds),
  };
}

function makeInto(
  folderId: string,
  y: number,
  dragged: EnvEditorDragItem,
  descendantIds: ReadonlySet<string>,
  childCount: number,
): EnvEditorDropTarget {
  return {
    key: `into:${folderId}`,
    mode: 'into',
    parentId: folderId,
    index: childCount,
    folderId,
    surface: 'tree',
    y,
    denied: isDenied(dragged, folderId, descendantIds),
  };
}

export function isLastVisibleSibling(
  row: EnvMeasuredNodeRow,
  rows: readonly EnvMeasuredNodeRow[],
): boolean {
  return !rows.some(
    (item) =>
      item.parentId === row.parentId &&
      item.kind === row.kind &&
      (row.kind === 'folder' ? item.folderIndex > row.folderIndex : item.mixedIndex > row.mixedIndex),
  );
}

function folderCountOfParent(rows: readonly EnvMeasuredNodeRow[], parentId: string | null): number {
  let count = 0;
  for (const row of rows) {
    if (row.parentId === parentId && row.kind === 'folder') {
      count += 1;
    }
  }
  return count;
}

function hitFolder(
  row: EnvMeasuredNodeRow,
  point: { readonly x: number; readonly y: number },
  dragged: EnvEditorDragItem,
  descendantIds: ReadonlySet<string>,
  rows: readonly EnvMeasuredNodeRow[],
): EnvEditorDropTarget {
  const height = Math.max(row.height, 1);
  const lastSibling = isLastVisibleSibling(row, rows);
  const afterY = row.top + height;
  const nest = point.x >= row.left + 44;

  if (dragged.kind === 'folder') {
    if (nest) {
      const beforeEnd = row.top + height * ENV_FOLDER_EDGE_RATIO;
      const afterStart = row.top + height * (lastSibling ? 0.5 : 1 - ENV_FOLDER_EDGE_RATIO);
      if (point.y < beforeEnd) {
        return makeBetween(row.parentId, row.folderIndex, row.top, dragged, descendantIds);
      }
      if (point.y > afterStart) {
        return makeBetween(row.parentId, row.folderIndex + 1, afterY, dragged, descendantIds);
      }
      return makeInto(row.id, row.top + height / 2, dragged, descendantIds, row.childCount);
    }
    const mid = row.top + height * (lastSibling ? 0.4 : 0.5);
    if (point.y < mid) {
      return makeBetween(row.parentId, row.folderIndex, row.top, dragged, descendantIds);
    }
    return makeBetween(row.parentId, row.folderIndex + 1, afterY, dragged, descendantIds);
  }

  const beforeEnd = row.top + height * ENV_FOLDER_EDGE_RATIO;
  const afterStart = row.top + height * (lastSibling ? 0.5 : 1 - ENV_FOLDER_EDGE_RATIO);
  if (point.y < beforeEnd) {
    return makeBetween(row.parentId, row.mixedIndex, row.top, dragged, descendantIds);
  }
  if (point.y > afterStart) {
    return makeBetween(row.parentId, row.mixedIndex + 1, afterY, dragged, descendantIds);
  }
  return makeInto(row.id, row.top + height / 2, dragged, descendantIds, row.childCount);
}

function hitVariable(
  row: EnvMeasuredNodeRow,
  point: { readonly x: number; readonly y: number },
  dragged: EnvEditorDragItem,
  descendantIds: ReadonlySet<string>,
  rows: readonly EnvMeasuredNodeRow[],
): EnvEditorDropTarget {
  const height = Math.max(row.height, 1);
  const afterY = row.top + height;
  if (dragged.kind === 'folder') {
    return makeBetween(
      row.parentId,
      folderCountOfParent(rows, row.parentId),
      point.y < row.top + height / 2 ? row.top : afterY,
      dragged,
      descendantIds,
    );
  }
  if (point.y < row.top + height / 2) {
    return makeBetween(row.parentId, row.mixedIndex, row.top, dragged, descendantIds);
  }
  return makeBetween(row.parentId, row.mixedIndex + 1, afterY, dragged, descendantIds);
}

/**
 * Maps a pointer in viewport space onto one drop target in the environment tree.
 */
export function resolveEnvEditorDrop(
  layout: EnvEditorDropLayout,
  point: { readonly x: number; readonly y: number },
  dragged: EnvEditorDragItem,
  descendantIds: ReadonlySet<string>,
): EnvEditorDropTarget | null {
  if (!contains(layout.tree, point.x, point.y, 24)) {
    return null;
  }

  for (const row of layout.rows) {
    if (point.y < row.top || point.y > row.top + row.height) {
      continue;
    }
    if (row.kind === 'folder') {
      return hitFolder(row, point, dragged, descendantIds, layout.rows);
    }
    return hitVariable(row, point, dragged, descendantIds, layout.rows);
  }

  const last = layout.rows[layout.rows.length - 1];
  if (last && point.y > last.top + last.height) {
    if (dragged.kind === 'folder') {
      return makeBetween(
        last.parentId,
        last.kind === 'folder' ? last.folderIndex + 1 : folderCountOfParent(layout.rows, last.parentId),
        last.top + last.height,
        dragged,
        descendantIds,
      );
    }
    return makeBetween(
      last.parentId,
      last.kind === 'variable' ? last.mixedIndex + 1 : last.mixedIndex + 1,
      last.top + last.height,
      dragged,
      descendantIds,
    );
  }

  return makeBetween(null, 0, layout.tree.top, dragged, descendantIds);
}

export function collectDescendantIds(nodes: readonly EnvironmentNode[], id: string): Set<string> {
  const ids = new Set<string>();
  const walk = (list: readonly EnvironmentNode[]): void => {
    for (const node of list) {
      ids.add(node.id);
      if (isEnvironmentFolder(node)) {
        walk(node.children);
      }
    }
  };
  const visit = (list: readonly EnvironmentNode[]): boolean => {
    for (const node of list) {
      if (node.id === id) {
        if (isEnvironmentFolder(node)) {
          walk(node.children);
        }
        return true;
      }
      if (isEnvironmentFolder(node) && visit(node.children)) {
        return true;
      }
    }
    return false;
  };
  visit(nodes);
  return ids;
}

export function childCountOf(nodes: readonly EnvironmentNode[], folderId: string | null): number {
  if (!folderId) {
    return nodes.length;
  }
  const found = findChildCount(nodes, folderId);
  return found ?? 0;
}

function findChildCount(nodes: readonly EnvironmentNode[], folderId: string): number | null {
  for (const node of nodes) {
    if (!isEnvironmentFolder(node)) {
      continue;
    }
    if (node.id === folderId) {
      return node.children.length;
    }
    const nested = findChildCount(node.children, folderId);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}
