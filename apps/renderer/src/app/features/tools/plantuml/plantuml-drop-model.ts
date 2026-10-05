import type { PlantumlNode } from '@testrix/contracts';

import {
  COLLECTIONS_ROOT_ID,
  TREE_GUTTER_PX,
  buildSlotTable,
  resolveSlot,
  type DropSlot,
  type DropSlotTable,
  type MeasuredRow,
  type TreeNodeInfo,
} from '../../collections/collections-drop-model';

export { COLLECTIONS_ROOT_ID as PLANTUML_ROOT_ID, TREE_GUTTER_PX, resolveSlot };
export type { DropSlot, DropSlotTable, MeasuredRow };

/** Matches `8 + depth * 14` padding on PlantUML list rows. */
export const PLANTUML_INDENT_PX = 14;

/**
 * Walks a PlantUML tree in visual order, descending only into expanded folders.
 * Artifacts map to `http` so the collections slot table treats them as leaves.
 */
export function flattenPlantumlTreeRows(
  nodes: readonly PlantumlNode[],
  isExpanded: (id: string) => boolean,
): TreeNodeInfo[] {
  const rows: TreeNodeInfo[] = [];

  const walk = (
    list: readonly PlantumlNode[],
    parentId: string,
    depth: number,
    ancestors: readonly string[],
  ): void => {
    for (let index = 0; index < list.length; index += 1) {
      const node = list[index];
      const isFolder = node.kind === 'folder';
      rows.push({
        id: node.id,
        kind: isFolder ? 'folder' : 'http',
        parentId,
        index,
        depth,
        childCount: isFolder ? node.children.length : 0,
        ancestors,
      });
      if (isFolder && isExpanded(node.id))
        walk(node.children as PlantumlNode[], node.id, depth + 1, [node.id, ...ancestors]);
    }
  };

  walk(nodes, COLLECTIONS_ROOT_ID, 0, []);
  return rows;
}

export function buildPlantumlSlotTable(
  rows: readonly MeasuredRow[],
  options: {
    readonly draggedId: string;
    readonly draggedIsFolder: boolean;
    readonly draggedFolderIds?: readonly string[];
    readonly contentTop: number;
    readonly contentBottom: number;
  },
): DropSlotTable {
  return buildSlotTable(rows, {
    ...options,
    indent: PLANTUML_INDENT_PX,
    gutter: TREE_GUTTER_PX,
  });
}
