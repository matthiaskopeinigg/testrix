import type {
  TxTreeConfig,
  TxTreeDnDDebugNodeRef,
  TxTreeDragContext,
  TxTreeDropContext,
  TxTreeDropIntent,
  TxTreeDropPosition,
  TxTreeNode,
  TxTreeNodeDropEvent,
  TxTreeSortConfig,
  TxTreeVisibleRow,
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
  private inputNodes: readonly TxTreeNode<TMeta>[] | null = null;
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

  /**
   * Replaces the nested tree and optionally seeds expansion.
   *
   * @returns `false` when `nodes` is the same reference as the last input and
   * expansion was not reset, so callers can skip visible-row rebuilds.
   */
  setNodes(nodes: readonly TxTreeNode<TMeta>[], options?: { resetExpansion?: boolean }): boolean {
    const resetExpansion = options?.resetExpansion ?? false;
    if (nodes === this.inputNodes && !resetExpansion) {
      return false;
    }
    if (nodes !== this.inputNodes) {
      this.nodes = cloneNodesPreserving(nodes, this.inputNodes ?? undefined, this.nodes);
      this.inputNodes = nodes;
    }
    if (resetExpansion) {
      this.expandedIds = new Set();
      if (this.config.expansion.defaultExpanded) {
        this.collectExpandableIds(this.nodes, this.expandedIds);
      }
    }
    return true;
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

  /** Children of `parentId` in display order (`null` reads the tree root). */
  getDisplayChildren(parentId: string | null): TxTreeNode<TMeta>[] {
    if (parentId === null) {
      return sortSiblings([...this.nodes], this.config.sort);
    }

    const loc = findLocation(this.nodes, parentId);
    if (!loc?.node.children?.length) {
      return [];
    }

    return sortSiblings([...loc.node.children], this.config.sort);
  }

  /**
   * Describes a drop intent as the `(targetId, position)` pair that consumer policies and
   * {@link TxTreeNodeDropEvent} expect.
   *
   * @returns `null` when the destination has no sibling to describe (empty tree root).
   */
  describeIntent(
    sourceId: string,
    intent: TxTreeDropIntent,
  ): { readonly targetId: string; readonly position: TxTreeDropPosition } | null {
    if (intent.kind === 'inside') {
      return { targetId: intent.parentId, position: 'inside' };
    }

    const siblings = this.getDestinationSiblings(sourceId, intent.parentId);
    if (siblings.length === 0) {
      return intent.parentId === null
        ? null
        : { targetId: intent.parentId, position: 'inside' };
    }

    if (intent.index < siblings.length) {
      return { targetId: siblings[intent.index].id, position: 'before' };
    }

    return { targetId: siblings[siblings.length - 1].id, position: 'after' };
  }

  /** Converts a `(targetId, position)` pair into the equivalent intent. */
  intentFromDropTarget(
    sourceId: string,
    targetId: string,
    position: TxTreeDropPosition,
  ): TxTreeDropIntent | null {
    if (position === 'inside') {
      return { kind: 'inside', parentId: targetId };
    }

    const targetLoc = findLocation(this.nodes, targetId);
    if (!targetLoc) {
      return null;
    }

    const parentId = targetLoc.parent?.id ?? null;
    const siblings = this.getDestinationSiblings(sourceId, parentId);
    const targetIndex = siblings.findIndex((node) => node.id === targetId);
    if (targetIndex < 0) {
      return null;
    }

    return {
      kind: 'reorder',
      parentId,
      index: position === 'before' ? targetIndex : targetIndex + 1,
      depth: parentId === null ? 0 : depthOf(this.nodes, parentId) + 1,
    };
  }

  /**
   * Whether the dragged node may land on `intent`.
   *
   * Runs every policy in one place: structure, depth, scope, folders-first ordering, and the
   * consumer predicates. Slots that fail are simply not offered, so the indicator skips them
   * instead of showing a deny state over a plausible-looking gap.
   *
   * Slots that would leave the node where it already is stay legal, so the indicator can
   * rest at the dragged row's own position; {@link applyIntent} treats them as no-ops.
   */
  canDropIntent(sourceId: string, intent: TxTreeDropIntent): boolean {
    const drop = this.config.drop;
    if (!drop.enabled) {
      return false;
    }

    const sourceLoc = findLocation(this.nodes, sourceId);
    if (!sourceLoc) {
      return false;
    }

    const parentId = intent.parentId;
    if (parentId === sourceId) {
      return false;
    }

    const parentLoc = parentId === null ? null : findLocation(this.nodes, parentId);
    if (parentId !== null) {
      if (!parentLoc) {
        return false;
      }
      if (parentLoc.node.disabled || parentLoc.node.droppable === false) {
        return false;
      }
      if (!hasChildrenCapability(parentLoc.node)) {
        return false;
      }
      if (isDescendantOf(this.nodes, sourceId, parentId)) {
        return false;
      }
    }

    const sourceParentId = sourceLoc.parent?.id ?? null;
    if (!drop.reparentAllowed && parentId !== sourceParentId) {
      return false;
    }

    const described = this.describeIntent(sourceId, intent);
    const position: TxTreeDropPosition =
      intent.kind === 'inside' ? 'inside' : (described?.position ?? 'before');
    if (!drop.positions.includes(position)) {
      return false;
    }

    if (!this.isIntentDepthAllowed(sourceLoc, intent)) {
      return false;
    }

    if (!this.isIntentScopeAllowed(sourceLoc, intent)) {
      return false;
    }

    if (this.violatesFoldersFirst(sourceLoc, intent)) {
      return false;
    }

    if (!described) {
      return true;
    }

    const targetLoc = findLocation(this.nodes, described.targetId);
    if (!targetLoc) {
      return false;
    }
    if (targetLoc.node.disabled || targetLoc.node.droppable === false) {
      return false;
    }

    const ctx = this.toDropContext(sourceLoc, targetLoc, position);

    if (drop.remapDropTarget) {
      const remapped = drop.remapDropTarget(ctx);
      if (
        remapped &&
        (remapped.targetId !== described.targetId || remapped.position !== position)
      ) {
        return false;
      }
    }

    return drop.canDrop ? drop.canDrop(ctx) : true;
  }

  /**
   * Applies a drop intent, returning the new nested tree, or `null` when denied.
   *
   * Sibling lists are normalised to display order before the splice, so `intent.index`
   * means the same thing regardless of the configured sort, and `order` fields are then
   * renumbered from the resulting sequence.
   */
  applyIntent(
    sourceId: string,
    intent: TxTreeDropIntent,
  ): { nodes: TxTreeNode<TMeta>[]; event: TxTreeNodeDropEvent } | null {
    if (this.isNoOpIntent(sourceId, intent) || !this.canDropIntent(sourceId, intent)) {
      return null;
    }

    const described = this.describeIntent(sourceId, intent);
    const previousParentId = findLocation(this.nodes, sourceId)?.parent?.id ?? null;

    const working = sortAllSiblingLists(cloneNodes(this.nodes), this.config.sort);
    const extracted = extractNode(working, sourceId);
    if (!extracted) {
      return null;
    }

    if (!insertAtIntent(working, intent, extracted.node, this.config.sort)) {
      return null;
    }

    syncOrderFieldsFromSiblingOrder(working);

    return {
      nodes: working,
      event: {
        sourceId,
        targetId: described?.targetId ?? sourceId,
        position: described?.position ?? 'after',
        previousParentId,
        nextParentId: findLocation(working, sourceId)?.parent?.id ?? null,
      },
    };
  }

  /** True when the pair describes a legal move that would actually change the tree. */
  canDrop(sourceId: string, targetId: string, position: TxTreeDropPosition): boolean {
    if (sourceId === targetId) {
      return false;
    }
    const intent = this.intentFromDropTarget(sourceId, targetId, position);
    return (
      intent !== null &&
      !this.isNoOpIntent(sourceId, intent) &&
      this.canDropIntent(sourceId, intent)
    );
  }

  /** Applies a structural move expressed as a `(targetId, position)` pair. */
  moveNode(
    sourceId: string,
    targetId: string,
    position: TxTreeDropPosition,
  ): { nodes: TxTreeNode<TMeta>[]; event: TxTreeNodeDropEvent } | null {
    if (sourceId === targetId) {
      return null;
    }
    const intent = this.intentFromDropTarget(sourceId, targetId, position);
    return intent === null ? null : this.applyIntent(sourceId, intent);
  }

  /** Destination siblings in display order with the dragged node removed. */
  private getDestinationSiblings(
    sourceId: string,
    parentId: string | null,
  ): TxTreeNode<TMeta>[] {
    return this.getDisplayChildren(parentId).filter((node) => node.id !== sourceId);
  }

  /** True when applying the intent would leave the source exactly where it is. */
  isNoOpIntent(sourceId: string, intent: TxTreeDropIntent): boolean {
    const sourceParentId = findLocation(this.nodes, sourceId)?.parent?.id ?? null;
    if (intent.parentId !== sourceParentId) {
      return false;
    }

    const siblings = this.getDisplayChildren(sourceParentId);
    if (intent.kind === 'inside') {
      return siblings[siblings.length - 1]?.id === sourceId;
    }

    return intent.index === siblings.findIndex((node) => node.id === sourceId);
  }

  private isIntentDepthAllowed(
    sourceLoc: NodeLocation<TMeta>,
    intent: TxTreeDropIntent,
  ): boolean {
    const maxDepth = this.config.drop.maxDepth;
    if (maxDepth === null) {
      return true;
    }

    const landingDepth =
      intent.kind === 'inside'
        ? depthOf(this.nodes, intent.parentId) + 1
        : intent.depth;
    if (landingDepth < 0) {
      return false;
    }

    return landingDepth + subtreeDepth(sourceLoc.node) - 1 <= maxDepth;
  }

  private isIntentScopeAllowed(
    sourceLoc: NodeLocation<TMeta>,
    intent: TxTreeDropIntent,
  ): boolean {
    const scope = this.config.drag.scope;
    if (scope === 'anywhere') {
      return true;
    }
    if (scope === 'disabled') {
      return false;
    }

    const sourceParentId = sourceLoc.parent?.id ?? null;
    if (scope === 'sameParent') {
      return intent.kind === 'reorder' && intent.parentId === sourceParentId;
    }

    if (intent.parentId === sourceParentId) {
      return true;
    }

    const rootId = findSubtreeRootId(this.nodes, sourceLoc.node.id);
    if (!rootId || intent.parentId === null) {
      return false;
    }

    return intent.parentId === rootId || isDescendantOf(this.nodes, rootId, intent.parentId);
  }

  /** True when the intent would place a folder after a leaf among its new siblings. */
  private violatesFoldersFirst(
    sourceLoc: NodeLocation<TMeta>,
    intent: TxTreeDropIntent,
  ): boolean {
    const sort = this.config.sort;
    if (!sort.foldersFirst || !isFolderSortGroup(sourceLoc.node)) {
      return false;
    }

    const siblings = this.getDestinationSiblings(sourceLoc.node.id, intent.parentId);
    const index =
      intent.kind === 'inside'
        ? resolveInsideChildInsertIndex(siblings, sourceLoc.node.id, sourceLoc.node, sort)
        : intent.index;

    return violatesFoldersFirstOrder([
      ...siblings.slice(0, index),
      sourceLoc.node,
      ...siblings.slice(index),
    ]);
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

  private walkVisible(
    nodes: readonly TxTreeNode<TMeta>[],
    parentId: string | null,
    depth: number,
    out: TxTreeVisibleRow<TMeta>[],
  ): void {
    const sorted = sortSiblings([...nodes], this.config.sort);
    sorted.forEach((node, index) => {
      const hasChildren = hasChildrenCapability(node);
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
  if (node.expandable === false) {
    return false;
  }
  if (node.kind === 'request' || node.kind === 'websocket') {
    return false;
  }
  return (
    !!node.children?.length ||
    node.kind === 'folder' ||
    node.kind === 'collection' ||
    node.kind === 'connection' ||
    node.kind === 'schema' ||
    node.kind === 'group' ||
    node.kind === 'table' ||
    node.kind === 'view'
  );
}

function cloneNodes<TMeta>(nodes: readonly TxTreeNode<TMeta>[]): MutableTxTreeNode<TMeta>[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function mapNodesById<T extends { readonly id: string }>(
  nodes: readonly T[] | undefined,
): Map<string, T> {
  const map = new Map<string, T>();
  if (!nodes) {
    return map;
  }
  for (const node of nodes) {
    map.set(node.id, node);
  }
  return map;
}

/**
 * Deep-clones `nodes` while reusing previous clones for input nodes that kept
 * the same object identity (or whose `children` array did).
 */
function cloneNodesPreserving<TMeta>(
  nodes: readonly TxTreeNode<TMeta>[],
  prevInput: readonly TxTreeNode<TMeta>[] | undefined,
  prevClone: readonly MutableTxTreeNode<TMeta>[] | undefined,
): MutableTxTreeNode<TMeta>[] {
  const prevInById = mapNodesById(prevInput);
  const prevOutById = mapNodesById(prevClone);
  return nodes.map((node) => {
    const prevIn = prevInById.get(node.id);
    const prevOut = prevOutById.get(node.id);
    if (node === prevIn && prevOut) {
      return prevOut;
    }
    const children =
      node.children === prevIn?.children && prevOut?.children
        ? prevOut.children
        : node.children
          ? cloneNodesPreserving(node.children, prevIn?.children, prevOut?.children)
          : undefined;
    return { ...node, children };
  });
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

/**
 * Splices the extracted node into the slot described by `intent`.
 *
 * `nodes` must already be in display order so the intent index lines up with what the user
 * saw. Root inserts mutate `nodes` in place; nested inserts replace the parent's children.
 *
 * @returns `false` when the destination parent no longer exists.
 */
function insertAtIntent<TMeta>(
  nodes: MutableTxTreeNode<TMeta>[],
  intent: TxTreeDropIntent,
  node: MutableTxTreeNode<TMeta>,
  sort: TxTreeSortConfig,
): boolean {
  if (intent.kind === 'inside') {
    const parentLoc = findLocation(nodes, intent.parentId);
    if (!parentLoc) {
      return false;
    }
    const children = copyChildren(parentLoc);
    const index = resolveInsideChildInsertIndex(children, node.id, node, sort);
    children.splice(index, 0, node);
    parentLoc.node.children = children;
    return true;
  }

  if (intent.parentId === null) {
    nodes.splice(clampInsertIndex(intent.index, nodes.length), 0, node);
    return true;
  }

  const parentLoc = findLocation(nodes, intent.parentId);
  if (!parentLoc) {
    return false;
  }

  const children = copyChildren(parentLoc);
  children.splice(clampInsertIndex(intent.index, children.length), 0, node);
  parentLoc.node.children = children;
  return true;
}

function copyChildren<TMeta>(loc: NodeLocation<TMeta>): MutableTxTreeNode<TMeta>[] {
  return loc.node.children ? ([...loc.node.children] as MutableTxTreeNode<TMeta>[]) : [];
}

function clampInsertIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length);
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

/** Writes `order` from the current in-memory sibling sequence (post-drop). */
function syncOrderFieldsFromSiblingOrder<TMeta>(nodes: MutableTxTreeNode<TMeta>[]): void {
  nodes.forEach((node, index) => {
    node.order = index * 10;
    if (node.children?.length) {
      syncOrderFieldsFromSiblingOrder(node.children as MutableTxTreeNode<TMeta>[]);
    }
  });
}
