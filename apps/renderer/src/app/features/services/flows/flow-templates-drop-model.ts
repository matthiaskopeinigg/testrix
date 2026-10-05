import {
  FLOW_TEMPLATE_UNTAGGED,
  flowTemplateGroupNodeId,
  parseFlowTemplateGroupNodeId,
  type FlowGraphTemplate,
} from '@testrix/contracts';

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

export { COLLECTIONS_ROOT_ID as FLOW_TEMPLATES_ROOT_ID, TREE_GUTTER_PX, resolveSlot };
export type { DropSlot, DropSlotTable, MeasuredRow };

export const FLOW_TEMPLATES_INDENT_PX = 12;

export interface FlowTemplateTreeLeaf {
  readonly kind: 'template';
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  readonly template: FlowGraphTemplate;
}

export interface FlowTemplateTreeGroup {
  readonly kind: 'group';
  readonly id: string;
  readonly tag: string;
  readonly name: string;
  readonly children: readonly FlowTemplateTreeLeaf[];
}

export type FlowTemplateTreeNode = FlowTemplateTreeGroup | FlowTemplateTreeLeaf;

export interface FlowTemplateTree {
  /** Named groups — always rendered above ungrouped templates. */
  readonly groups: readonly FlowTemplateTreeGroup[];
  /** Templates with no primary tag — root leaves at the bottom. */
  readonly ungrouped: readonly FlowTemplateTreeLeaf[];
}

function toLeaf(template: FlowGraphTemplate): FlowTemplateTreeLeaf {
  return {
    kind: 'template',
    id: template.id,
    name: template.name,
    hint: template.hint,
    template,
  };
}

export function buildFlowTemplateTree(
  groups: readonly { readonly tag: string; readonly items: readonly FlowGraphTemplate[] }[],
): FlowTemplateTree {
  const named: FlowTemplateTreeGroup[] = [];
  let ungrouped: FlowTemplateTreeLeaf[] = [];
  for (const group of groups) {
    if (group.tag === FLOW_TEMPLATE_UNTAGGED) {
      ungrouped = group.items.map(toLeaf);
      continue;
    }
    named.push({
      kind: 'group',
      id: flowTemplateGroupNodeId(group.tag),
      tag: group.tag,
      name: group.tag,
      children: group.items.map(toLeaf),
    });
  }
  return { groups: named, ungrouped };
}

/**
 * Walks the tree in visual order: groups (folders) first, then ungrouped leaves.
 */
export function flattenFlowTemplateTreeRows(
  tree: FlowTemplateTree,
  isExpanded: (id: string) => boolean,
): TreeNodeInfo[] {
  const rows: TreeNodeInfo[] = [];
  for (let index = 0; index < tree.groups.length; index += 1) {
    const group = tree.groups[index]!;
    rows.push({
      id: group.id,
      kind: 'folder',
      parentId: COLLECTIONS_ROOT_ID,
      index,
      depth: 0,
      childCount: group.children.length,
      ancestors: [],
    });
    if (!isExpanded(group.id))
      continue;
    for (let childIndex = 0; childIndex < group.children.length; childIndex += 1) {
      const child = group.children[childIndex]!;
      rows.push({
        id: child.id,
        kind: 'http',
        parentId: group.id,
        index: childIndex,
        depth: 1,
        childCount: 0,
        ancestors: [group.id],
      });
    }
  }

  const leafBase = tree.groups.length;
  for (let index = 0; index < tree.ungrouped.length; index += 1) {
    const leaf = tree.ungrouped[index]!;
    rows.push({
      id: leaf.id,
      kind: 'http',
      parentId: COLLECTIONS_ROOT_ID,
      index: leafBase + index,
      depth: 0,
      childCount: 0,
      ancestors: [],
    });
  }
  return rows;
}

export function buildFlowTemplateSlotTable(
  rows: readonly MeasuredRow[],
  options: {
    readonly draggedId: string;
    readonly draggedIsFolder: boolean;
    /** All group ids in the drag set — drops into any of them are denied. */
    readonly draggedFolderIds?: readonly string[];
    /** Mixed group + template selection: every slot is denied. */
    readonly denyAll?: boolean;
    readonly contentTop: number;
    readonly contentBottom: number;
  },
): DropSlotTable {
  const draggedFolderIds =
    options.draggedFolderIds ?? (options.draggedIsFolder ? [options.draggedId] : []);
  const table = buildSlotTable(rows, {
    ...options,
    draggedFolderIds,
    indent: FLOW_TEMPLATES_INDENT_PX,
    gutter: TREE_GUTTER_PX,
  });

  if (options.denyAll) {
    return {
      ...table,
      bands: table.bands.map((band) => ({
        ...band,
        candidates: band.candidates.map((slot) => ({ ...slot, denied: true })),
      })),
    };
  }

  // Folders-first denial marks many root gaps as denied for leaves; strip them so
  // depth-picking can still land on "last child in group" instead of a red root slot.
  return {
    ...table,
    bands: table.bands
      .map((band) => ({
        ...band,
        candidates: band.candidates.filter((slot) => !slot.denied),
      }))
      .filter((band) => band.candidates.length > 0),
  };
}

export function groupTagFromParentId(parentId: string): string | null {
  if (parentId === COLLECTIONS_ROOT_ID)
    return null;
  return parseFlowTemplateGroupNodeId(parentId);
}

/** Maps a root insert index to an ungrouped leaf index (after all groups). */
export function ungroupedIndexFromRootSlot(slotIndex: number, groupCount: number): number {
  return Math.max(0, slotIndex - groupCount);
}
