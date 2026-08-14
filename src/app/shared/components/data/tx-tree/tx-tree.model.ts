import type {
  TxTreeConfig,
  TxTreeDnDDebugNodeRef,
  TxTreeDragContext,
  TxTreeDropContext,
  TxTreeDropPosition,
  TxTreeNode,
  TxTreeNodeDropEvent,
  TxTreeSortConfig,
  TxTreeVisibleRow,
} from './tx-tree.types';
import {
  TX_TREE_DROP_BOUNDARY_HYSTERESIS_PX,
  TX_TREE_DROP_HIT_AFTER_RATIO,
  TX_TREE_DROP_HIT_BEFORE_RATIO,
  TX_TREE_DROP_POSITION_HYSTERESIS_PX,
} from './tx-tree.types';

/** Mutable clone used while applying structural edits. */
type MutableTxTreeNode<TMeta> = {
  -readonly [K in keyof TxTreeNode<TMeta>]: TxTreeNode<TMeta>[K];
};

interface NodeLocation<TMeta> {
  readonly node: MutableTxTreeNode<TMeta>;
  readonly parent: MutableTxTreeNode<TMeta> | null;
  readonly siblings: MutableTxTreeNode<TMeta>[];
  readonly index: number;
}

/**
 * Headless tree state: flattening, expansion, selection helpers, and structural moves.
 */
export class TxTreeModel<TMeta = unknown> {
  private nodes: MutableTxTreeNode<TMeta>[] = [];
  private expandedIds = new Set<string>();
  private config: TxTreeConfig<TMeta>;

  constructor(config: TxTreeConfig<TMeta>) {
    this.config = config;
  }

  /** Replaces configuration used for policy checks. */
  setConfig(config: TxTreeConfig<TMeta>): void {
    this.config = config;
  }

  getConfig(): TxTreeConfig<TMeta> {
    return this.config;
  }

  /** Replaces the nested tree and optionally seeds expansion. */
  setNodes(nodes: readonly TxTreeNode<TMeta>[], options?: { resetExpansion?: boolean }): void {
    this.nodes = cloneNodes(nodes);
    if (options?.resetExpansion ?? false) {
      this.expandedIds = new Set();
      if (this.config.expansion.defaultExpanded) {
        this.collectExpandableIds(this.nodes, this.expandedIds);
      }
    }
  }

  getNodes(): TxTreeNode<TMeta>[] {
    return this.nodes as TxTreeNode<TMeta>[];
  }

  getExpandedIds(): ReadonlySet<string> {
    return this.expandedIds;
  }

  setExpandedIds(ids: ReadonlySet<string>): void {
    this.expandedIds = new Set(ids);
  }

  isExpanded(id: string): boolean {
    return this.expandedIds.has(id);
  }

  toggleExpanded(id: string): void {
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
    } else {
      this.expandedIds.add(id);
    }
  }

  expand(id: string): void {
    this.expandedIds.add(id);
  }

  collapse(id: string): void {
    this.expandedIds.delete(id);
  }

  /** Visible rows in display order (respects expansion). */
  getVisibleRows(): TxTreeVisibleRow<TMeta>[] {
    const rows: TxTreeVisibleRow<TMeta>[] = [];
    this.walkVisible(this.nodes, null, 0, rows);
    return rows;
  }

  /** Resolves a node id to a debug HUD reference (includes collapsed nodes). */
  getNodeDebugRef(nodeId: string): TxTreeDnDDebugNodeRef | null {
    const loc = findLocation(this.nodes, nodeId);
    if (!loc) {
      return null;
    }

    return {
      id: loc.node.id,
      label: loc.node.label,
      kind: loc.node.kind,
      depth: depthOf(this.nodes, nodeId),
      parentId: loc.parent?.id ?? null,
    };
  }

  canDrag(nodeId: string): boolean {
    const drag = this.config.drag;
    if (!drag.enabled || drag.scope === 'disabled') {
      return false;
    }

    const loc = findLocation(this.nodes, nodeId);
    if (!loc || loc.node.disabled || loc.node.draggable === false) {
      return false;
    }

    if (drag.canDrag) {
      return drag.canDrag(this.toDragContext(loc));
    }

    return true;
  }

  /**
   * Maps raw hit-test targets (including self-hits while dragging) to a valid drop target.
   * Remaps no-op "inside parent folder" drops to folder exit (`after` on the folder).
   */
  resolveLogicalDrop(
    sourceId: string,
    targetId: string,
    position: TxTreeDropPosition,
  ): { readonly targetId: string; readonly position: TxTreeDropPosition } {
    if (targetId === sourceId) {
      return this.resolveSelfHitDrop(sourceId, position);
    }

    if (
      position === 'inside' &&
      !this.canDrop(sourceId, targetId, position) &&
      this.isNoOpInsideAppend(sourceId, targetId) &&
      this.canDrop(sourceId, targetId, 'after')
    ) {
      return { targetId, position: 'after' };
    }

    const adjacentDown = remapAdjacentDownwardBeforeDrop(
      this.nodes,
      sourceId,
      targetId,
      position,
    );
    if (adjacentDown) {
      return adjacentDown;
    }

    return { targetId, position };
  }

  /** True when an `inside` drop on `folderId` would leave the source in the same slot. */
  isNoOpInsideAppend(sourceId: string, folderId: string): boolean {
    const sourceLoc = findLocation(this.nodes, sourceId);
    const targetLoc = findLocation(this.nodes, folderId);
    if (!sourceLoc || !targetLoc) {
      return false;
    }
    return isEquivalentMove(sourceLoc, targetLoc, 'inside');
  }

  private resolveSelfHitDrop(
    sourceId: string,
    position: TxTreeDropPosition,
  ): { readonly targetId: string; readonly position: TxTreeDropPosition } {
    const rows = this.getVisibleRows();
    const index = rows.findIndex((row) => row.id === sourceId);
    if (index < 0) {
      return { targetId: sourceId, position };
    }

    const row = rows[index];

    if (position === 'after') {
      const next = rows[index + 1];
      if (next && next.parentId === row.parentId) {
        return { targetId: next.id, position: 'after' };
      }
      return { targetId: sourceId, position: 'after' };
    }

    if (position === 'before') {
      const prev = rows[index - 1];
      if (prev && prev.parentId === row.parentId) {
        return { targetId: prev.id, position: 'after' };
      }
      if (row.parentId && this.canDrop(sourceId, row.parentId, 'before')) {
        return { targetId: row.parentId, position: 'before' };
      }
    }

    return { targetId: sourceId, position };
  }

  canDrop(sourceId: string, targetId: string, position: TxTreeDropPosition): boolean {
    const drop = this.config.drop;
    if (!drop.enabled || !drop.positions.includes(position)) {
      return false;
    }

    if (sourceId === targetId) {
      return false;
    }

    const sourceLoc = findLocation(this.nodes, sourceId);
    const targetLoc = findLocation(this.nodes, targetId);
    if (!sourceLoc || !targetLoc) {
      return false;
    }

    if (targetLoc.node.disabled || targetLoc.node.droppable === false) {
      return false;
    }

    if (isDescendantOf(this.nodes, sourceId, targetId)) {
      return false;
    }

    if (position === 'inside' && !hasChildrenCapability(targetLoc.node)) {
      return false;
    }

    if (!drop.reparentAllowed && position === 'inside') {
      return false;
    }

    const nextParentId = resolveNextParentId(targetLoc, position);
    if (!this.isScopeAllowed(sourceLoc, targetLoc, position, nextParentId)) {
      return false;
    }

    if (drop.maxDepth !== null) {
      const sourceSubtreeDepth = subtreeDepth(sourceLoc.node);
      const targetDepth = depthOf(this.nodes, targetLoc.node.id);
      const baseDepth = position === 'inside' ? targetDepth + 1 : targetLoc.parent ? depthOf(this.nodes, targetLoc.parent.id) + 1 : 0;
      if (baseDepth < 0) {
        return false;
      }
      if (baseDepth + sourceSubtreeDepth - 1 > drop.maxDepth) {
        return false;
      }
    }

    if (isEquivalentMove(sourceLoc, targetLoc, position)) {
      return false;
    }

    if (wouldViolateFoldersFirst(this.nodes, sourceLoc, targetLoc, position, this.config.sort)) {
      return false;
    }

    if (drop.canDrop) {
      return drop.canDrop(
        this.toDropContext(sourceLoc, targetLoc, position, nextParentId),
      );
    }

    return true;
  }

  /**
   * Applies a structural move and returns the new nested tree, or `null` when denied.
   */
  moveNode(
    sourceId: string,
    targetId: string,
    position: TxTreeDropPosition,
  ): { nodes: TxTreeNode<TMeta>[]; event: TxTreeNodeDropEvent } | null {
    if (!this.canDrop(sourceId, targetId, position)) {
      return null;
    }

    const sourceLoc = findLocation(this.nodes, sourceId);
    const targetLoc = findLocation(this.nodes, targetId);
    if (!sourceLoc || !targetLoc) {
      return null;
    }

    const previousParentId = sourceLoc.parent?.id ?? null;
    let working = cloneNodes(this.nodes);
    const extracted = extractNode(working, sourceId);
    if (!extracted) {
      return null;
    }

    working = extracted.tree;
    const targetAfterRemove = findLocation(working, targetId);
    if (!targetAfterRemove) {
      return null;
    }

    working = insertNode(working, targetAfterRemove, position, extracted.node, this.config.sort);
    if (this.config.sort.siblingSort === 'manual') {
      renumberSiblingOrders(working);
    } else {
      syncOrderFieldsFromSiblingOrder(working);
      working = sortAllSiblingLists(working, this.config.sort);
    }

    const nextParentId = findLocation(working, sourceId)?.parent?.id ?? null;

    return {
      nodes: working,
      event: {
        sourceId,
        targetId,
        position,
        previousParentId,
        nextParentId,
      },
    };
  }

  private toDragContext(loc: NodeLocation<TMeta>): TxTreeDragContext<TMeta> {
    return {
      nodeId: loc.node.id,
      node: loc.node,
      parentId: loc.parent?.id ?? null,
      depth: depthOf(this.nodes, loc.node.id),
    };
  }

  private toDropContext(
    sourceLoc: NodeLocation<TMeta>,
    targetLoc: NodeLocation<TMeta>,
    position: TxTreeDropPosition,
    nextParentId: string | null,
  ): TxTreeDropContext<TMeta> {
    return {
      sourceId: sourceLoc.node.id,
      source: sourceLoc.node,
      targetId: targetLoc.node.id,
      target: targetLoc.node,
      position,
      sourceParentId: sourceLoc.parent?.id ?? null,
      targetParentId: targetLoc.parent?.id ?? null,
    };
  }

  private isScopeAllowed(
    sourceLoc: NodeLocation<TMeta>,
    targetLoc: NodeLocation<TMeta>,
    position: TxTreeDropPosition,
    nextParentId: string | null,
  ): boolean {
    const scope = this.config.drag.scope;
    const sourceParentId = sourceLoc.parent?.id ?? null;

    if (scope === 'anywhere') {
      return true;
    }

    if (scope === 'sameParent') {
      if (position === 'inside') {
        return false;
      }
      return targetLoc.parent?.id === sourceParentId;
    }

    if (scope === 'subtree') {
      const rootId = findSubtreeRootId(this.nodes, sourceLoc.node.id);
      if (!rootId) {
        return false;
      }
      if (position === 'inside') {
        return isDescendantOf(this.nodes, rootId, targetLoc.node.id) || targetLoc.node.id === rootId;
      }
      const targetParentId = targetLoc.parent?.id ?? null;
      return (
        targetParentId === sourceParentId ||
        isDescendantOf(this.nodes, rootId, targetLoc.node.id) ||
        isDescendantOf(this.nodes, rootId, targetParentId ?? '')
      );
    }

    return false;
  }

  private walkVisible(
    nodes: readonly TxTreeNode<TMeta>[],
    parentId: string | null,
    depth: number,
    out: TxTreeVisibleRow<TMeta>[],
  ): void {
    const sorted = sortSiblings([...nodes], this.config.sort);
    sorted.forEach((node, index) => {
      const hasChildren = !!node.children?.length;
      const expanded = hasChildren && this.expandedIds.has(node.id);
      out.push({
        id: node.id,
        node,
        depth,
        parentId,
        hasChildren,
        expanded,
        indexAmongSiblings: index,
      });
      if (hasChildren && expanded && node.children) {
        this.walkVisible(node.children, node.id, depth + 1, out);
      }
    });
  }

  private collectExpandableIds(nodes: readonly TxTreeNode<TMeta>[], out: Set<string>): void {
    for (const node of nodes) {
      if (node.children?.length) {
        out.add(node.id);
        this.collectExpandableIds(node.children, out);
      }
    }
  }
}

function hasChildrenCapability<TMeta>(node: TxTreeNode<TMeta>): boolean {
  if (node.kind === 'request' || node.kind === 'websocket') {
    return false;
  }
  return !!node.children?.length || node.kind === 'folder' || node.kind === 'collection';
}

/**
 * Returns true when the drop would leave the source in the same sibling slot.
 */
/**
 * When the source sits directly above the target, a `before` drop on the target is a no-op.
 * Remap to `after` on the target so dragging one row down onto the next row reorders.
 */
function remapAdjacentDownwardBeforeDrop<TMeta>(
  nodes: MutableTxTreeNode<TMeta>[],
  sourceId: string,
  targetId: string,
  position: TxTreeDropPosition,
): { readonly targetId: string; readonly position: TxTreeDropPosition } | null {
  if (position !== 'before') {
    return null;
  }

  const sourceLoc = findLocation(nodes, sourceId);
  const targetLoc = findLocation(nodes, targetId);
  if (!sourceLoc || !targetLoc) {
    return null;
  }

  if ((sourceLoc.parent?.id ?? null) !== (targetLoc.parent?.id ?? null)) {
    return null;
  }

  if (sourceLoc.index !== targetLoc.index - 1) {
    return null;
  }

  return { targetId, position: 'after' };
}

function isEquivalentMove<TMeta>(
  sourceLoc: NodeLocation<TMeta>,
  targetLoc: NodeLocation<TMeta>,
  position: TxTreeDropPosition,
): boolean {
  const sourceParentId = sourceLoc.parent?.id ?? null;
  const sourceIndex = sourceLoc.index;

  if (position === 'inside') {
    if (sourceParentId !== targetLoc.node.id) {
      return false;
    }
    const siblings = sourceLoc.parent?.children;
    if (!siblings?.length) {
      return false;
    }
    return sourceIndex === siblings.length - 1;
  }

  const targetParentId = targetLoc.parent?.id ?? null;
  if (sourceParentId !== targetParentId) {
    return false;
  }

  let insertIndex = position === 'before' ? targetLoc.index : targetLoc.index + 1;
  if (sourceIndex < insertIndex) {
    insertIndex -= 1;
  }

  return sourceIndex === insertIndex;
}

function resolveNextParentId<TMeta>(
  targetLoc: NodeLocation<TMeta>,
  position: TxTreeDropPosition,
): string | null {
  if (position === 'inside') {
    return targetLoc.node.id;
  }
  return targetLoc.parent?.id ?? null;
}

function cloneNodes<TMeta>(nodes: readonly TxTreeNode<TMeta>[]): MutableTxTreeNode<TMeta>[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function findLocation<TMeta>(
  nodes: MutableTxTreeNode<TMeta>[],
  id: string,
  parent: MutableTxTreeNode<TMeta> | null = null,
): NodeLocation<TMeta> | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: nodes, index };
    }
    if (node.children?.length) {
      const found = findLocation(node.children as MutableTxTreeNode<TMeta>[], id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function depthOf<TMeta>(nodes: MutableTxTreeNode<TMeta>[], id: string, current = 0): number {
  for (const node of nodes) {
    if (node.id === id) {
      return current;
    }
    if (node.children?.length) {
      const d = depthOf(node.children as MutableTxTreeNode<TMeta>[], id, current + 1);
      if (d >= 0) {
        return d;
      }
    }
  }
  return -1;
}

function subtreeDepth<TMeta>(node: TxTreeNode<TMeta>): number {
  if (!node.children?.length) {
    return 1;
  }
  return 1 + Math.max(...node.children.map((child) => subtreeDepth(child)));
}

function isDescendantOf<TMeta>(
  nodes: MutableTxTreeNode<TMeta>[],
  ancestorId: string,
  candidateId: string,
): boolean {
  const ancestor = findLocation(nodes, ancestorId);
  if (!ancestor?.node.children?.length) {
    return false;
  }
  return containsId(ancestor.node.children, candidateId);
}

function containsId<TMeta>(nodes: readonly TxTreeNode<TMeta>[], id: string): boolean {
  for (const node of nodes) {
    if (node.id === id) {
      return true;
    }
    if (node.children?.length && containsId(node.children, id)) {
      return true;
    }
  }
  return false;
}

function findSubtreeRootId<TMeta>(nodes: MutableTxTreeNode<TMeta>[], nodeId: string): string | null {
  const loc = findLocation(nodes, nodeId);
  if (!loc) {
    return null;
  }
  let current: NodeLocation<TMeta> = loc;
  while (current.parent) {
    const parentLoc = findLocation(nodes, current.parent.id);
    if (!parentLoc) {
      break;
    }
    current = parentLoc;
  }
  return current.node.id;
}

function extractNode<TMeta>(
  nodes: MutableTxTreeNode<TMeta>[],
  id: string,
): { tree: MutableTxTreeNode<TMeta>[]; node: MutableTxTreeNode<TMeta> } | null {
  const loc = findLocation(nodes, id);
  if (!loc) {
    return null;
  }
  const node = loc.siblings.splice(loc.index, 1)[0];
  return { tree: nodes, node };
}

function insertNode<TMeta>(
  nodes: MutableTxTreeNode<TMeta>[],
  targetLoc: NodeLocation<TMeta>,
  position: TxTreeDropPosition,
  node: MutableTxTreeNode<TMeta>,
  sort: TxTreeSortConfig,
): MutableTxTreeNode<TMeta>[] {
  if (position === 'inside') {
    const children = targetLoc.node.children ? [...targetLoc.node.children] : [];
    const insertIndex = resolveInsideChildInsertIndex(children, node.id, node, sort);
    children.splice(insertIndex, 0, node);
    targetLoc.node.children = children;
    return nodes;
  }

  const siblings = targetLoc.parent ? targetLoc.parent.children : nodes;
  if (!siblings) {
    return nodes;
  }

  const list = siblings as MutableTxTreeNode<TMeta>[];
  const insertIndex = position === 'before' ? targetLoc.index : targetLoc.index + 1;
  list.splice(insertIndex, 0, node);
  return nodes;
}

export function sortSiblings<TMeta>(
  siblings: TxTreeNode<TMeta>[],
  sort: TxTreeSortConfig,
): TxTreeNode<TMeta>[] {
  if (sort.siblingSort === 'manual') {
    return siblings;
  }

  return [...siblings].sort((a, b) => compareSiblings(a, b, sort));
}

function isFolderSortGroup<TMeta>(node: TxTreeNode<TMeta>): boolean {
  if (node.kind === 'request' || node.kind === 'websocket') {
    return false;
  }
  return node.kind === 'folder' || node.kind === 'collection' || hasChildrenCapability(node);
}

/**
 * Returns true when the drop would place a folder after a non-folder among siblings.
 */
export function wouldViolateFoldersFirst<TMeta>(
  nodes: readonly TxTreeNode<TMeta>[],
  sourceLoc: NodeLocation<TMeta>,
  targetLoc: NodeLocation<TMeta>,
  position: TxTreeDropPosition,
  sort: TxTreeSortConfig,
): boolean {
  if (!sort.foldersFirst || !isFolderSortGroup(sourceLoc.node)) {
    return false;
  }

  const withoutSource = getDestinationSiblingsWithoutSource(
    nodes as MutableTxTreeNode<TMeta>[],
    sourceLoc,
    targetLoc,
    position,
  );
  const insertIndex = computeSiblingInsertIndex(sourceLoc, targetLoc, position, sort);
  const hypothetical = [
    ...withoutSource.slice(0, insertIndex),
    sourceLoc.node,
    ...withoutSource.slice(insertIndex),
  ];

  return violatesFoldersFirstOrder(hypothetical);
}

function violatesFoldersFirstOrder<TMeta>(siblings: readonly TxTreeNode<TMeta>[]): boolean {
  let seenNonFolder = false;
  for (const node of siblings) {
    if (isFolderSortGroup(node)) {
      if (seenNonFolder) {
        return true;
      }
    } else {
      seenNonFolder = true;
    }
  }
  return false;
}

function getDestinationSiblingsWithoutSource<TMeta>(
  nodes: MutableTxTreeNode<TMeta>[],
  sourceLoc: NodeLocation<TMeta>,
  targetLoc: NodeLocation<TMeta>,
  position: TxTreeDropPosition,
): MutableTxTreeNode<TMeta>[] {
  if (position === 'inside') {
    return (targetLoc.node.children ?? []).filter(
      (child) => child.id !== sourceLoc.node.id,
    ) as MutableTxTreeNode<TMeta>[];
  }

  const nextParentId = resolveNextParentId(targetLoc, position);
  const siblings =
    nextParentId === null
      ? nodes
      : ((findLocation(nodes, nextParentId)?.node.children ?? []) as MutableTxTreeNode<TMeta>[]);

  const sourceParentId = sourceLoc.parent?.id ?? null;
  if (sourceParentId === nextParentId) {
    return siblings.filter((node) => node.id !== sourceLoc.node.id);
  }

  return siblings;
}

/**
 * Index for nesting `source` inside `target` while honoring folders-first ordering.
 */
function resolveInsideChildInsertIndex<TMeta>(
  children: readonly TxTreeNode<TMeta>[],
  sourceId: string,
  sourceNode: TxTreeNode<TMeta>,
  sort: TxTreeSortConfig,
): number {
  const withoutSource = children.filter((child) => child.id !== sourceId);
  if (!sort.foldersFirst || !isFolderSortGroup(sourceNode)) {
    return withoutSource.length;
  }

  const firstNonFolder = withoutSource.findIndex((child) => !isFolderSortGroup(child));
  return firstNonFolder === -1 ? withoutSource.length : firstNonFolder;
}

function computeSiblingInsertIndex<TMeta>(
  sourceLoc: NodeLocation<TMeta>,
  targetLoc: NodeLocation<TMeta>,
  position: TxTreeDropPosition,
  sort?: TxTreeSortConfig,
): number {
  if (position === 'inside') {
    const children = targetLoc.node.children ?? [];
    return resolveInsideChildInsertIndex(
      children,
      sourceLoc.node.id,
      sourceLoc.node,
      sort ?? { siblingSort: 'manual', foldersFirst: false },
    );
  }

  let insertIndex = position === 'before' ? targetLoc.index : targetLoc.index + 1;
  const sameParent = (sourceLoc.parent?.id ?? null) === (targetLoc.parent?.id ?? null);
  if (sameParent && sourceLoc.index < insertIndex) {
    insertIndex -= 1;
  }
  return insertIndex;
}

function compareSiblings<TMeta>(
  a: TxTreeNode<TMeta>,
  b: TxTreeNode<TMeta>,
  sort: TxTreeSortConfig,
): number {
  if (sort.foldersFirst) {
    const folderA = isFolderSortGroup(a);
    const folderB = isFolderSortGroup(b);
    if (folderA !== folderB) {
      return folderA ? -1 : 1;
    }
  }

  const mode = sort.siblingSort;
  const orderA = a.order ?? 0;
  const orderB = b.order ?? 0;
  const priorityA = a.priority ?? 0;
  const priorityB = b.priority ?? 0;

  if (mode === 'order') {
    return orderA - orderB || a.label.localeCompare(b.label);
  }
  if (mode === 'priority') {
    return priorityA - priorityB || a.label.localeCompare(b.label);
  }
  return orderA - orderB || priorityA - priorityB || a.label.localeCompare(b.label);
}

function sortAllSiblingLists<TMeta>(
  nodes: MutableTxTreeNode<TMeta>[],
  sort: TxTreeSortConfig,
): MutableTxTreeNode<TMeta>[] {
  for (const node of nodes) {
    if (node.children?.length) {
      node.children = sortAllSiblingLists([...node.children], sort);
    }
  }
  return sortSiblings(nodes, sort);
}

/**
 * Returns true when `after` on the upper row and `before` on the lower row target the same
 * sibling insert index (consecutive visible rows with the same parent).
 */
export function isSharedSiblingGapDrop(
  rows: readonly Pick<TxTreeVisibleRow<unknown>, 'id' | 'parentId'>[],
  upperTargetId: string,
  upperPosition: TxTreeDropPosition,
  lowerTargetId: string,
  lowerPosition: TxTreeDropPosition,
): boolean {
  if (upperPosition !== 'after' || lowerPosition !== 'before') {
    return false;
  }

  const upperIdx = rows.findIndex((row) => row.id === upperTargetId);
  const lowerIdx = rows.findIndex((row) => row.id === lowerTargetId);
  if (upperIdx < 0 || lowerIdx !== upperIdx + 1) {
    return false;
  }

  return rows[upperIdx].parentId === rows[lowerIdx].parentId;
}

/**
 * Returns the last root-level row id for tail drop targets (empty space below the tree).
 * Skips `excludeId` when it is the trailing root row (e.g. while dragging that root node).
 */
export function resolveTailRootRowId(
  rows: readonly Pick<TxTreeVisibleRow<unknown>, 'id' | 'parentId'>[],
  excludeId?: string | null,
): string | null {
  const rootRows = rows.filter((row) => row.parentId === null);
  if (rootRows.length === 0) {
    return rows.length > 0 ? rows[rows.length - 1].id : null;
  }

  for (let i = rootRows.length - 1; i >= 0; i--) {
    if (rootRows[i].id !== excludeId) {
      return rootRows[i].id;
    }
  }

  return rootRows[rootRows.length - 1]?.id ?? null;
}

/**
 * Maps `after` on an expanded folder row to `after` on its last visible descendant so
 * the insert line appears at the bottom of the folder contents (exit-folder drop).
 */
export function resolveFolderExitIndicator(
  rows: readonly Pick<TxTreeVisibleRow<unknown>, 'id' | 'depth' | 'hasChildren' | 'expanded'>[],
  targetId: string,
  position: TxTreeDropPosition,
): { readonly targetId: string; readonly position: TxTreeDropPosition } {
  if (position !== 'after') {
    return { targetId, position };
  }

  const index = rows.findIndex((row) => row.id === targetId);
  if (index < 0) {
    return { targetId, position };
  }

  const folder = rows[index];
  if (!folder.hasChildren || !folder.expanded) {
    return { targetId, position };
  }

  let lastDescendantIndex = index;
  for (let j = index + 1; j < rows.length; j++) {
    if (rows[j].depth <= folder.depth) {
      break;
    }
    lastDescendantIndex = j;
  }

  if (lastDescendantIndex === index) {
    return { targetId, position };
  }

  return { targetId: rows[lastDescendantIndex].id, position: 'after' };
}

/**
 * Resolves insert-line target/position for display (folder exit + sibling seam rules).
 */
export function resolveDropIndicatorDisplay(
  rows: readonly Pick<TxTreeVisibleRow<unknown>, 'id' | 'parentId' | 'depth' | 'hasChildren' | 'expanded'>[],
  dropTargetId: string,
  dropPosition: TxTreeDropPosition,
): {
  readonly targetId: string;
  readonly position: TxTreeDropPosition;
  readonly indentDepth: number | null;
} {
  const folderExit = resolveFolderExitIndicator(rows, dropTargetId, dropPosition);
  const canonical = canonicalizeDropIndicator(rows, folderExit.targetId, folderExit.position);

  let indentDepth: number | null = null;
  if (dropPosition === 'after' && folderExit.targetId !== dropTargetId) {
    const folder = rows.find((row) => row.id === dropTargetId);
    if (folder) {
      indentDepth = folder.depth;
    }
  }

  return { ...canonical, indentDepth };
}

/**
 * When folder-exit targets the dragging row, attach the insert line to the seam after the
 * folder block (`before` on the next outer row). Falls back to the last non-dragging child
 * or the dragging row when the folder is the tree tail.
 */
export function remapFolderExitToAfterBlockSeam(
  rows: readonly Pick<TxTreeVisibleRow<unknown>, 'id' | 'depth' | 'hasChildren' | 'expanded'>[],
  draggingId: string,
  folderId: string,
  indentDepth: number,
): {
  readonly targetId: string | null;
  readonly position: TxTreeDropPosition | null;
  readonly indentDepth: number | null;
} {
  const folderIndex = rows.findIndex((row) => row.id === folderId);
  if (folderIndex < 0) {
    return { targetId: draggingId, position: 'after', indentDepth };
  }

  const folderDepth = rows[folderIndex].depth;
  let blockEndIndex = folderIndex;
  const folderRow = rows[folderIndex];
  if (folderRow.hasChildren && folderRow.expanded) {
    for (let j = folderIndex + 1; j < rows.length; j++) {
      if (rows[j].depth <= folderDepth) {
        break;
      }
      blockEndIndex = j;
    }
  }

  for (let j = blockEndIndex + 1; j < rows.length; j++) {
    if (rows[j].depth <= folderDepth) {
      return { targetId: rows[j].id, position: 'before', indentDepth };
    }
  }

  if (rows[blockEndIndex]?.id === draggingId) {
    return { targetId: draggingId, position: 'after', indentDepth };
  }

  for (let j = blockEndIndex; j > folderIndex; j--) {
    if (rows[j].id !== draggingId) {
      return { targetId: rows[j].id, position: 'after', indentDepth };
    }
  }

  return { targetId: draggingId, position: 'after', indentDepth };
}

/**
 * When a non-exit self-hit maps the insert line onto the dragging row, attach it to the
 * previous visible sibling in the same folder instead.
 */
export function remapIndicatorOffDraggingRow(
  rows: readonly Pick<TxTreeVisibleRow<unknown>, 'id' | 'parentId' | 'depth'>[],
  draggingId: string,
  indicatorTargetId: string,
  indicatorPosition: TxTreeDropPosition,
  indentDepth: number | null,
): {
  readonly targetId: string | null;
  readonly position: TxTreeDropPosition | null;
  readonly indentDepth: number | null;
} {
  if (indicatorTargetId !== draggingId) {
    return { targetId: indicatorTargetId, position: indicatorPosition, indentDepth };
  }

  if (indicatorPosition !== 'before' && indicatorPosition !== 'after') {
    return { targetId: indicatorTargetId, position: indicatorPosition, indentDepth };
  }

  const dragIndex = rows.findIndex((row) => row.id === draggingId);
  if (dragIndex < 0) {
    return { targetId: null, position: null, indentDepth: null };
  }

  const dragRow = rows[dragIndex];
  for (let i = dragIndex - 1; i >= 0; i--) {
    const candidate = rows[i];
    if (candidate.parentId === dragRow.parentId) {
      return { targetId: candidate.id, position: 'after', indentDepth };
    }
    if (candidate.depth < dragRow.depth) {
      break;
    }
  }

  return { targetId: null, position: null, indentDepth: null };
}

/**
 * Maps `after` on a row to `before` on the next visible sibling when they share the same
 * insert slot, so the insert indicator is rendered on a single row.
 */
export function canonicalizeDropIndicator(
  rows: readonly Pick<TxTreeVisibleRow<unknown>, 'id' | 'parentId'>[],
  targetId: string,
  position: TxTreeDropPosition,
): { readonly targetId: string; readonly position: TxTreeDropPosition } {
  if (position !== 'after') {
    return { targetId, position };
  }

  const index = rows.findIndex((row) => row.id === targetId);
  if (index < 0 || index >= rows.length - 1) {
    return { targetId, position };
  }

  const upper = rows[index];
  const lower = rows[index + 1];
  if (upper.parentId !== lower.parentId) {
    return { targetId, position };
  }

  return { targetId: lower.id, position: 'before' };
}

/** True when the pointer is in the shared seam between two stacked row rects. */
export function isPointerInRowSeamZone(
  clientY: number,
  upperRect: DOMRect,
  lowerRect: DOMRect,
  hysteresisPx: number = TX_TREE_DROP_BOUNDARY_HYSTERESIS_PX,
): boolean {
  const seam = (upperRect.bottom + lowerRect.top) / 2;
  const gap = Math.max(0, lowerRect.top - upperRect.bottom);
  const band = Math.max(hysteresisPx, gap / 2 + 4);
  return Math.abs(clientY - seam) <= band;
}

/** Resolves pointer Y position within a row to a drop band. */
export function resolveDropPositionFromPointer(
  clientY: number,
  rect: DOMRect,
  allowed: readonly TxTreeDropPosition[],
  targetHasChildren: boolean,
): TxTreeDropPosition | null {
  const height = rect.height || 1;
  const offset = clientY - rect.top;
  const ratio = offset / height;

  const canBefore = allowed.includes('before');
  const canAfter = allowed.includes('after');
  const canInside = allowed.includes('inside') && targetHasChildren;

  if (ratio < TX_TREE_DROP_HIT_BEFORE_RATIO && canBefore) {
    return 'before';
  }
  if (ratio > 1 - TX_TREE_DROP_HIT_AFTER_RATIO && canAfter) {
    return 'after';
  }
  if (canInside) {
    return 'inside';
  }
  if (canAfter) {
    return 'after';
  }
  if (canBefore) {
    return 'before';
  }
  return null;
}

/**
 * Resolves drop band with hysteresis so the indicator does not flip at zone edges.
 *
 * @param previous - Last committed position for the current target row.
 */
export function resolveDropPositionWithHysteresis(
  clientY: number,
  rect: DOMRect,
  allowed: readonly TxTreeDropPosition[],
  targetHasChildren: boolean,
  previous: TxTreeDropPosition | null,
  hysteresisPx: number = TX_TREE_DROP_POSITION_HYSTERESIS_PX,
): TxTreeDropPosition | null {
  const next = resolveDropPositionFromPointer(clientY, rect, allowed, targetHasChildren);
  if (!next || !previous || previous === next) {
    return next;
  }

  const height = rect.height || 1;
  const offset = clientY - rect.top;
  const beforeEdge = height * TX_TREE_DROP_HIT_BEFORE_RATIO;
  const afterEdge = height * (1 - TX_TREE_DROP_HIT_AFTER_RATIO);

  if (previous === 'before' && next !== 'before' && offset < beforeEdge + hysteresisPx) {
    return 'before';
  }
  if (previous === 'after' && next !== 'after' && offset > afterEdge - hysteresisPx) {
    return 'after';
  }
  if (previous === 'inside' && next === 'before' && offset < beforeEdge + hysteresisPx) {
    return 'inside';
  }
  if (previous === 'inside' && next === 'after' && offset > afterEdge - hysteresisPx) {
    return 'inside';
  }
  if (previous === 'before' && next === 'inside' && offset < beforeEdge + hysteresisPx) {
    return 'before';
  }
  if (previous === 'after' && next === 'inside' && offset > afterEdge - hysteresisPx) {
    return 'after';
  }

  return next;
}

function renumberSiblingOrders<TMeta>(nodes: MutableTxTreeNode<TMeta>[]): void {
  syncOrderFieldsFromSiblingOrder(nodes);
}

/** Writes `order` from the current in-memory sibling sequence (post-drop). */
function syncOrderFieldsFromSiblingOrder<TMeta>(nodes: MutableTxTreeNode<TMeta>[]): void {
  nodes.forEach((node, index) => {
    node.order = index * 10;
    if (node.children?.length) {
      syncOrderFieldsFromSiblingOrder(node.children as MutableTxTreeNode<TMeta>[]);
    }
  });
}
