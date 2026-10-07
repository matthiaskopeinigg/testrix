import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_COLLECTION_FILTERS,
  DEFAULT_COLLECTION_PREFS,
  DEFAULT_COLLECTIONS_FILE,
  collectionPrefsSchema,
  createTestingCollectionsFile,
  newEntityId,
  folderConfigOf,
  parseCollectionFolderConfig,
  parseCollectionRequestConfig,
  parseCollectionWebSocketConfig,
  requestConfigOf,
  websocketConfigOf,
  sanitizeSelectionEntry,
  type CollectionCookie,
  type CollectionFilters,
  type CollectionFolderConfig,
  type CollectionFolderNode,
  type CollectionHttpNode,
  type CollectionNode,
  type CollectionNodeKind,
  type CollectionRequestConfig,
  type CollectionWebSocketConfig,
  type CollectionWebSocketNode,
  type CollectionSortMode,
  type CollectionStatusFilter,
  type CollectionTree,
  type CollectionsFile,
  type HttpMethod,
  type SessionFile,
  type SessionSelectionEntry,
} from '@testrix/contracts';

import { DesktopApiService } from '../../core/desktop-api.service';
import { applyPointerSelect, emptySelection, type SelectionEntry } from '../../core/range-select';
import { uniquePasteName } from '../../core/unique-paste-name';
import { COLLECTIONS_ROOT_ID, flattenTree, type DropSlot } from './collections-drop-model';

export { COLLECTIONS_ROOT_ID } from './collections-drop-model';

const PREFS_KEY = 'testrix.collections.prefs';

/** Seeded mock hierarchy for the Collections sidebar (browser / empty desktop). */
export function createMockCollectionTree(): CollectionTree {
  return createTestingCollectionsFile().collections;
}

function prefsKey(workspaceId: string | null): string {
  return workspaceId ? `testrix.collections.prefs.${workspaceId}` : PREFS_KEY;
}

function readPrefs(workspaceId: string | null): typeof DEFAULT_COLLECTION_PREFS {
  try {
    const raw = localStorage.getItem(prefsKey(workspaceId)) ?? localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return { ...DEFAULT_COLLECTION_PREFS };
    }
    const parsed = collectionPrefsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { ...DEFAULT_COLLECTION_PREFS };
    }
    return parsed.data;
  } catch {
    return { ...DEFAULT_COLLECTION_PREFS };
  }
}

function cloneTree(nodes: CollectionTree): CollectionTree {
  return nodes.map((node) => {
    if (node.kind === 'folder') {
      return { ...node, children: cloneTree(node.children) };
    }
    return { ...node };
  });
}

function collectAllNodeIds(nodes: CollectionTree, out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.id);
    if (node.kind === 'folder') {
      collectAllNodeIds(node.children, out);
    }
  }
  return out;
}

function collectFolderIds(nodes: CollectionTree, out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind !== 'folder') {
      continue;
    }
    out.push(node.id);
    collectFolderIds(node.children, out);
  }
  return out;
}

function leafPasses(node: CollectionNode, filters: CollectionFilters, query: string): boolean {
  if (node.kind === 'folder') {
    return false;
  }

  const q = query.trim().toLowerCase();
  if (q && !node.name.toLowerCase().includes(q)) {
    return false;
  }

  if (filters.kinds.length > 0 && !filters.kinds.includes(node.kind)) {
    return false;
  }

  if (node.kind === 'http') {
    if (filters.methods.length > 0 && !filters.methods.includes(node.method)) {
      return false;
    }
    if (filters.statuses.length > 0) {
      const ok = filters.statuses.some((status) =>
        status === 'unset' ? node.status === null : node.status === status,
      );
      if (!ok) {
        return false;
      }
    }
    return true;
  }

  // WebSocket nodes are excluded when method/status filters are active.
  if (filters.methods.length > 0 || filters.statuses.length > 0) {
    return false;
  }
  return true;
}

function folderPasses(node: CollectionFolderNode, filters: CollectionFilters, query: string): boolean {
  if (filters.kinds.length > 0 && !filters.kinds.includes('folder'))
    return false;
  if (filters.methods.length > 0 || filters.statuses.length > 0)
    return false;
  const q = query.trim().toLowerCase();
  if (!q)
    return true;
  return node.name.toLowerCase().includes(q);
}

/**
 * Filters the collection tree for the sidebar. Empty folders stay visible when
 * there is no search query, so creating a folder is not a no-op.
 */
export function filterCollectionTree(
  nodes: CollectionTree,
  filters: CollectionFilters,
  query: string,
): CollectionTree {
  const result: CollectionNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const children = filterCollectionTree(node.children, filters, query);
      if (children.length > 0) {
        result.push({ ...node, children });
        continue;
      }
      if (folderPasses(node, filters, query))
        result.push({ ...node, children: [] });
      continue;
    }
    if (leafPasses(node, filters, query))
      result.push(node);
  }
  return result;
}

function typeRank(node: CollectionNode): number {
  if (node.kind === 'folder') {
    return 0;
  }
  if (node.kind === 'http') {
    return 1;
  }
  return 2;
}

function compareSiblings(a: CollectionNode, b: CollectionNode, sortMode: CollectionSortMode): number {
  // Same-depth rule: folders always above every other item.
  if (a.kind === 'folder' && b.kind !== 'folder') {
    return -1;
  }
  if (b.kind === 'folder' && a.kind !== 'folder') {
    return 1;
  }

  switch (sortMode) {
    case 'saved':
      return 0;
    case 'name-desc':
      return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
    case 'type': {
      const rank = typeRank(a) - typeRank(b);
      if (rank !== 0) {
        return rank;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    case 'modified-desc':
      return b.modifiedAt.localeCompare(a.modifiedAt);
    case 'name-asc':
    default:
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }
}

/**
 * Keeps folders ahead of leaves at every depth while preserving relative order in each group.
 */
export function ensureFoldersFirst(nodes: CollectionTree): CollectionTree {
  const folders: CollectionFolderNode[] = [];
  const leaves: CollectionNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      folders.push({ ...node, children: ensureFoldersFirst(node.children) });
    } else {
      leaves.push(node);
    }
  }
  return [...folders, ...leaves];
}

/** Orders siblings. `saved` leaves the stored order untouched. */
export function sortCollectionTree(nodes: CollectionTree, sortMode: CollectionSortMode): CollectionTree {
  return sortTree(nodes, sortMode);
}

function sortTree(nodes: CollectionTree, sortMode: CollectionSortMode): CollectionTree {
  if (sortMode === 'saved')
    return nodes;
  const sorted = [...nodes].sort((a, b) => compareSiblings(a, b, sortMode));
  return sorted.map((node) => {
    if (node.kind !== 'folder') {
      return node;
    }
    return { ...node, children: sortTree(node.children, sortMode) };
  });
}

function findNode(
  nodes: CollectionTree,
  id: string,
): { node: CollectionNode; parentId: string | null; index: number; siblings: CollectionNode[] } | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parentId: null, index, siblings: nodes };
    }
    if (node.kind === 'folder') {
      const nested = findNodeInFolder(node, id);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function findNodeInFolder(
  folder: CollectionFolderNode,
  id: string,
): { node: CollectionNode; parentId: string | null; index: number; siblings: CollectionNode[] } | null {
  for (let index = 0; index < folder.children.length; index += 1) {
    const child = folder.children[index];
    if (child.id === id) {
      return { node: child, parentId: folder.id, index, siblings: folder.children };
    }
    if (child.kind === 'folder') {
      const nested = findNodeInFolder(child, id);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

/** Maps every node id to its parent folder id, or null at the top level. */
function buildParentMap(nodes: CollectionTree): ReadonlyMap<string, string | null> {
  const parents = new Map<string, string | null>();
  const walk = (list: readonly CollectionNode[], parentId: string | null): void => {
    for (const node of list) {
      parents.set(node.id, parentId);
      if (node.kind === 'folder') {
        walk(node.children, node.id);
      }
    }
  };
  walk(nodes, null);
  return parents;
}

function isDescendant(
  parents: ReadonlyMap<string, string | null>,
  ancestorId: string,
  maybeChildId: string,
): boolean {
  const seen = new Set<string>();
  let current = parents.get(maybeChildId) ?? null;
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) {
      return true;
    }
    seen.add(current);
    current = parents.get(current) ?? null;
  }
  return false;
}

function removeNode(nodes: CollectionTree, id: string): { tree: CollectionTree; removed: CollectionNode | null } {
  const next: CollectionNode[] = [];
  let removed: CollectionNode | null = null;
  for (const node of nodes) {
    if (node.id === id) {
      removed = node;
      continue;
    }
    if (node.kind === 'folder') {
      const childResult = removeNode(node.children, id);
      if (childResult.removed) {
        removed = childResult.removed;
        next.push({ ...node, children: childResult.tree });
        continue;
      }
    }
    next.push(node);
  }
  return { tree: next, removed };
}

function nextCollectionId(_ids: readonly string[], _prefix: string): string {
  return newEntityId();
}

function defaultCollectionName(kind: CollectionNodeKind): string {
  if (kind === 'folder')
    return 'New folder';
  if (kind === 'websocket')
    return 'New WebSocket';
  return 'New request';
}

function createCollectionNode(
  kind: CollectionNodeKind,
  ids: readonly string[],
  modifiedAt: string,
): CollectionNode {
  if (kind === 'folder') {
    return {
      kind: 'folder',
      id: nextCollectionId(ids, 'folder'),
      name: defaultCollectionName(kind),
      modifiedAt,
      children: [],
    };
  }
  if (kind === 'websocket') {
    return {
      kind: 'websocket',
      id: nextCollectionId(ids, 'ws'),
      name: defaultCollectionName(kind),
      modifiedAt,
      config: parseCollectionWebSocketConfig({}),
    };
  }
  return {
    kind: 'http',
    id: nextCollectionId(ids, 'http'),
    name: defaultCollectionName(kind),
    modifiedAt,
    method: 'GET',
    status: null,
  };
}

function collectNames(nodes: CollectionTree, out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.name);
    if (node.kind === 'folder')
      collectNames(node.children, out);
  }
  return out;
}

function collectDescendantIds(node: CollectionNode, out: string[] = []): string[] {
  out.push(node.id);
  if (node.kind === 'folder') {
    for (const child of node.children)
      collectDescendantIds(child, out);
  }
  return out;
}

export interface CollectionRestoreEntry {
  readonly node: CollectionNode;
  readonly parentId: string | null;
  readonly index: number;
}

function cloneNodeDeep(node: CollectionNode): CollectionNode {
  if (node.kind === 'folder')
    return { ...node, children: cloneTree(node.children) };
  return { ...node };
}

function topLevelDeleteIds(tree: CollectionTree, ids: readonly string[]): readonly string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    let parentId = findNode(tree, id)?.parentId ?? null;
    while (parentId) {
      if (set.has(parentId))
        return false;
      parentId = findNode(tree, parentId)?.parentId ?? null;
    }
    return findNode(tree, id) !== null;
  });
}

function cloneCollectionNode(node: CollectionNode, used: Set<string>): CollectionNode {
  const prefix = node.kind === 'folder' ? 'folder' : node.kind === 'http' ? 'http' : 'ws';
  const id = nextCollectionId([...used], prefix);
  used.add(id);
  const modifiedAt = new Date().toISOString();
  if (node.kind === 'folder') {
    return {
      ...node,
      id,
      modifiedAt,
      children: node.children.map((child) => cloneCollectionNode(child, used)),
    };
  }
  return { ...node, id, modifiedAt };
}

function nextCopyName(name: string, existing: readonly string[]): string {
  const used = new Set(existing);
  const base = `${name.trim() || 'Item'} copy`;
  if (!used.has(base))
    return base;
  let n = 2;
  while (used.has(`${base} ${n}`))
    n += 1;
  return `${base} ${n}`;
}

function insertNode(
  nodes: CollectionTree,
  parentId: string | null,
  index: number,
  node: CollectionNode,
): CollectionTree {
  return insertNodes(nodes, parentId, index, [node]);
}

function insertNodes(
  nodes: CollectionTree,
  parentId: string | null,
  index: number,
  items: readonly CollectionNode[],
): CollectionTree {
  if (items.length === 0) {
    return nodes;
  }
  if (parentId === null || parentId === COLLECTIONS_ROOT_ID) {
    const copy = [...nodes];
    copy.splice(Math.max(0, Math.min(index, copy.length)), 0, ...items);
    return copy;
  }
  return nodes.map((current) => {
    if (current.kind !== 'folder') {
      return current;
    }
    if (current.id === parentId) {
      const children = [...current.children];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, ...items);
      return { ...current, children };
    }
    return { ...current, children: insertNodes(current.children, parentId, index, items) };
  });
}

/** Same-depth rule: folders occupy the leading sibling slots. */
export function canPlaceAtIndex(
  siblings: readonly CollectionNode[],
  dragged: CollectionNode,
  index: number,
): boolean {
  const folders = siblings.filter((node) => node.kind === 'folder' && node.id !== dragged.id).length;
  if (dragged.kind === 'folder') {
    return index <= folders;
  }
  return index >= folders;
}

@Injectable({ providedIn: 'root' })
export class CollectionsStore {
  private readonly desktop = inject(DesktopApiService);
  private workspaceId: string | null = null;
  private persistEnabled = false;
  private readonly prefs = readPrefs(null);

  readonly tree = signal<CollectionTree>([]);
  readonly searchQuery = signal('');
  readonly filters = signal<CollectionFilters>({ ...this.prefs.filters });
  readonly sortMode = signal<CollectionSortMode>(this.prefs.sortMode);
  readonly expandedIds = signal<ReadonlySet<string>>(new Set(this.prefs.expandedIds));
  /** Active drag payload for preview + drop-target highlighting. */
  readonly dragNode = signal<CollectionNode | null>(null);
  /** The one place the dragged node would land right now. Null means no valid target. */
  readonly dropTarget = signal<DropSlot | null>(null);
  /** Node id that just moved — drives drop settle animation. */
  readonly lastMovedId = signal<string | null>(null);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectionAnchorId = signal<string | null>(null);
  readonly dragIds = signal<readonly string[]>([]);

  private moveAnimTimer: ReturnType<typeof setTimeout> | null = null;
  private collectionsPersistTimer: ReturnType<typeof setTimeout> | null = null;
  private collectionsPersistInFlight: Promise<void> | null = null;
  private static readonly COLLECTIONS_PERSIST_DEBOUNCE_MS = 400;

  readonly visibleTree = computed(() => {
    const filtered = filterCollectionTree(this.tree(), this.filters(), this.searchQuery());
    return this.sortMode() === 'saved' ? filtered : ensureFoldersFirst(filtered);
  });

  readonly hasVisibleNodes = computed(() => this.visibleTree().length > 0);

  readonly isTreeEmpty = computed(() => this.tree().length === 0);

  private readonly parentIndex = computed(() => buildParentMap(this.tree()));

  visibleIds(): readonly string[] {
    return flattenTree(this.visibleTree(), (id) => this.isExpanded(id)).map((row) => row.id);
  }

  allNodeIds(): ReadonlySet<string> {
    return new Set(collectAllNodeIds(this.tree()));
  }

  hydrate(file: CollectionsFile, workspaceId: string | null): void {
    this.persistEnabled = false;
    this.workspaceId = workspaceId;
    const prefs = readPrefs(workspaceId);
    this.filters.set({ ...prefs.filters });
    this.sortMode.set(prefs.sortMode);
    this.expandedIds.set(new Set(prefs.expandedIds));
    const seeded =
      file.collections.length === 0 && !this.desktop.hasDesktop
        ? createMockCollectionTree()
        : file.collections;
    this.tree.set(sortTree(seeded, prefs.sortMode));
    this.persistEnabled = true;
    if (file.collections.length === 0 && !this.desktop.hasDesktop) {
      this.persist();
    }
  }

  restoreSelection(session: SessionFile): void {
    const next = sanitizeSelectionEntry(
      session.selection.collections,
      new Set(collectAllNodeIds(this.tree())),
    );
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  toSessionPatch(): SessionSelectionEntry {
    return { ids: [...this.selectedIds()], anchorId: this.selectionAnchorId() };
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  applyPointerSelect(
    targetId: string,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): SelectionEntry {
    const next = applyPointerSelect({
      event,
      visibleIds: this.visibleIds(),
      selectedIds: this.selectedIds(),
      anchorId: this.selectionAnchorId(),
      targetId,
    });
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
    return next;
  }

  clearSelection(): void {
    const next = emptySelection();
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  dragIdsFor(sourceId: string): readonly string[] {
    const selected = this.selectedIds();
    if (selected.includes(sourceId)) {
      return flattenTree(this.tree(), () => true)
        .map((row) => row.id)
        .filter((id) => selected.includes(id));
    }
    this.selectedIds.set([sourceId]);
    this.selectionAnchorId.set(sourceId);
    return [sourceId];
  }

  private pruneSelection(): void {
    const next = sanitizeSelectionEntry(
      { ids: [...this.selectedIds()], anchorId: this.selectionAnchorId() },
      new Set(collectAllNodeIds(this.tree())),
    );
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  readonly isFilterActive = computed(() => {
    const filters = this.filters();
    return filters.kinds.length > 0 || filters.methods.length > 0 || filters.statuses.length > 0;
  });

  /** True when every folder in the tree is expanded. */
  readonly allFoldersExpanded = computed(() => {
    const folderIds = collectFolderIds(this.tree());
    if (folderIds.length === 0) {
      return false;
    }
    const expanded = this.expandedIds();
    return folderIds.every((id) => expanded.has(id));
  });

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  setSortMode(mode: CollectionSortMode): void {
    this.sortMode.set(mode);
    if (mode !== 'saved')
      this.tree.update((nodes) => sortTree(nodes, mode));
    this.persistPrefs();
    if (mode !== 'saved')
      this.persist();
  }

  setFilters(filters: CollectionFilters): void {
    this.filters.set({
      kinds: [...filters.kinds],
      methods: [...filters.methods],
      statuses: [...filters.statuses],
    });
    this.persistPrefs();
  }

  toggleKindFilter(kind: CollectionNodeKind): void {
    const current = this.filters();
    const kinds = current.kinds.includes(kind)
      ? current.kinds.filter((value) => value !== kind)
      : [...current.kinds, kind];
    this.setFilters({ ...current, kinds });
  }

  toggleMethodFilter(method: HttpMethod): void {
    const current = this.filters();
    const methods = current.methods.includes(method)
      ? current.methods.filter((value) => value !== method)
      : [...current.methods, method];
    this.setFilters({ ...current, methods });
  }

  toggleStatusFilter(status: CollectionStatusFilter): void {
    const current = this.filters();
    const statuses = current.statuses.includes(status)
      ? current.statuses.filter((value) => value !== status)
      : [...current.statuses, status];
    this.setFilters({ ...current, statuses });
  }

  clearFilters(): void {
    this.setFilters({ ...DEFAULT_COLLECTION_FILTERS });
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpanded(id: string): void {
    const next = new Set(this.expandedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedIds.set(next);
    this.persistPrefs();
  }

  /** Expands a folder if it is currently collapsed. */
  ensureExpanded(id: string): void {
    if (this.expandedIds().has(id)) {
      return;
    }
    const next = new Set(this.expandedIds());
    next.add(id);
    this.expandedIds.set(next);
    this.persistPrefs();
  }

  expandAll(): void {
    this.expandedIds.set(new Set(collectFolderIds(this.tree())));
    this.persistPrefs();
  }

  collapseAll(): void {
    this.expandedIds.set(new Set());
    this.persistPrefs();
  }

  /** Expands all when any folder is collapsed; otherwise collapses all. */
  toggleExpandAll(): void {
    if (this.allFoldersExpanded()) {
      this.collapseAll();
      return;
    }
    this.expandAll();
  }

  /**
   * Moves a node under `targetParentId` (null/root = top level) at `targetIndex`.
   * Rejects dropping a folder into itself or a descendant.
   */
  moveNode(nodeId: string, targetParentId: string | null, targetIndex: number): void {
    const parentId =
      targetParentId === null || targetParentId === COLLECTIONS_ROOT_ID ? null : targetParentId;

    if (parentId === nodeId) {
      return;
    }
    if (parentId && isDescendant(this.parentIndex(), nodeId, parentId)) {
      return;
    }

    const current = findNode(this.tree(), nodeId);
    if (!current) {
      return;
    }

    let insertIndex = targetIndex;
    if (current.parentId === parentId && current.index < targetIndex) {
      insertIndex = targetIndex - 1;
    }

    const removed = removeNode(cloneTree(this.tree()), nodeId);
    if (!removed.removed) {
      return;
    }

    if (parentId !== null) {
      const folder = findNode(removed.tree, parentId);
      if (!folder || folder.node.kind !== 'folder') {
        return;
      }
    }

    this.useSavedOrder();
    const next = insertNode(removed.tree, parentId, insertIndex, removed.removed);
    this.commitTree(next);
    this.markMoved(nodeId);
    this.pruneSelection();

    if (parentId) {
      const expanded = new Set(this.expandedIds());
      expanded.add(parentId);
      this.expandedIds.set(expanded);
      this.persistPrefs();
    }
  }

  /**
   * Moves `ids` under `targetParentId` at `targetIndex` as one block.
   * Selected descendants of other selected folders are skipped.
   */
  moveNodes(ids: readonly string[], targetParentId: string | null, targetIndex: number): boolean {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return false;
    }
    if (unique.length === 1) {
      this.moveNode(unique[0], targetParentId, targetIndex);
      return true;
    }

    const parentId =
      targetParentId === null || targetParentId === COLLECTIONS_ROOT_ID ? null : targetParentId;
    const tree = this.tree();
    const parents = this.parentIndex();
    const ordered = flattenTree(tree, () => true)
      .map((row) => row.id)
      .filter((id) => unique.includes(id));
    const movingIds = ordered.filter(
      (id) => !unique.some((other) => other !== id && isDescendant(parents, other, id)),
    );
    if (movingIds.length === 0) {
      return false;
    }

    for (const id of movingIds) {
      if (parentId === id || (parentId && isDescendant(parents, id, parentId))) {
        return false;
      }
    }

    let insertIndex = targetIndex;
    const removedBefore = movingIds.filter((id) => {
      const current = findNode(tree, id);
      return current?.parentId === parentId && current.index < targetIndex;
    }).length;
    insertIndex = Math.max(0, targetIndex - removedBefore);

    let next = cloneTree(tree);
    const extracted: CollectionNode[] = [];
    for (const id of movingIds) {
      const removed = removeNode(next, id);
      if (!removed.removed) {
        continue;
      }
      extracted.push(removed.removed);
      next = removed.tree;
    }
    if (extracted.length === 0) {
      return false;
    }

    next = insertNodes(next, parentId, insertIndex, extracted);
    this.useSavedOrder();
    this.commitTree(next);
    this.markMoved(extracted[0].id);
    this.pruneSelection();
    if (parentId) {
      const expanded = new Set(this.expandedIds());
      expanded.add(parentId);
      this.expandedIds.set(expanded);
      this.persistPrefs();
    }
    return true;
  }

  /**
   * Moves a node one slot up or down among its siblings, for keyboard reordering.
   *
   * @returns A sentence describing the result, or null when the move is not allowed.
   */
  moveWithinParent(nodeId: string, direction: -1 | 1): string | null {
    const found = findNode(this.tree(), nodeId);
    if (!found) {
      return null;
    }

    // `target` is the index after removal, which is what the folders-first rule checks.
    const target = found.index + direction;
    if (target < 0 || target >= found.siblings.length) {
      return null;
    }

    this.moveNode(nodeId, found.parentId, direction > 0 ? target + 1 : target);
    return `${found.node.name} moved to position ${target + 1} of ${found.siblings.length}`;
  }

  /** Appends a node into a folder (and expands it). */
  moveIntoFolder(nodeId: string, folderId: string): void {
    if (nodeId === folderId || isDescendant(this.parentIndex(), nodeId, folderId)) {
      return;
    }
    const folder = findNode(this.tree(), folderId);
    if (!folder || folder.node.kind !== 'folder') {
      return;
    }
    this.moveNode(nodeId, folderId, folder.node.children.length);
  }

  private markMoved(nodeId: string): void {
    if (this.moveAnimTimer) {
      clearTimeout(this.moveAnimTimer);
      this.moveAnimTimer = null;
    }
    this.lastMovedId.set(null);
    // Double rAF so the class is removed and re-added on either side of a paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.lastMovedId.set(nodeId);
        this.moveAnimTimer = setTimeout(() => {
          if (this.lastMovedId() === nodeId) {
            this.lastMovedId.set(null);
          }
          this.moveAnimTimer = null;
        }, 300);
      });
    });
  }

  beginDrag(node: CollectionNode, ids: readonly string[] = [node.id]): void {
    this.dragNode.set(node);
    this.dragIds.set(ids.length > 0 ? ids : [node.id]);
    this.dropTarget.set(null);
  }

  /** Replaces the current drop intent. Null hides every drop cue. */
  setDropTarget(target: DropSlot | null): void {
    this.dropTarget.set(target);
  }

  endDrag(): void {
    this.dragNode.set(null);
    this.dragIds.set([]);
    this.dropTarget.set(null);
  }

  /**
   * Applies the current drop target, then clears drag state.
   *
   * The engine fires one release per drag, so no guard against repeat calls is needed.
   *
   * @returns Moved node id when a move was applied; otherwise null.
   */
  commitDrop(): string | null {
    const dragged = this.dragNode();
    const target = this.dropTarget();
    const ids = this.dragIds().length > 0 ? this.dragIds() : dragged ? [dragged.id] : [];
    this.endDrag();

    if (!dragged || !target || target.denied || ids.length === 0) {
      return null;
    }

    if (target.mode === 'into') {
      if (ids.some((id) => id === target.parentId || isDescendant(this.parentIndex(), id, target.parentId))) {
        return null;
      }
      const folder = findNode(this.tree(), target.parentId);
      const index = folder?.node.kind === 'folder' ? folder.node.children.length : 0;
      this.moveNodes(ids, target.parentId, index);
      return dragged.id;
    }

    const parentId = target.parentId === COLLECTIONS_ROOT_ID ? null : target.parentId;
    if (
      parentId &&
      ids.some((id) => parentId === id || isDescendant(this.parentIndex(), id, parentId))
    ) {
      return null;
    }

    if (ids.length === 1) {
      const current = findNode(this.tree(), dragged.id);
      if (!current) {
        return null;
      }
      const samePlace =
        current.parentId === parentId &&
        (target.index === current.index || target.index === current.index + 1);
      if (samePlace) {
        return null;
      }
    }

    this.moveNodes(ids, parentId, target.index);
    return dragged.id;
  }

  nodeById(id: string): CollectionNode | null {
    return findNode(this.tree(), id)?.node ?? null;
  }

  folderById(id: string): CollectionFolderNode | null {
    const node = this.nodeById(id);
    return node?.kind === 'folder' ? node : null;
  }

  /**
   * Patches persisted folder settings. Missing config is filled with defaults.
   */
  updateFolderConfig(id: string, patch: Partial<CollectionFolderConfig>): void {
    const found = findNode(this.tree(), id);
    if (!found || found.node.kind !== 'folder')
      return;
    const current = folderConfigOf(found.node);
    const config = parseCollectionFolderConfig({ ...current, ...patch });
    const now = new Date().toISOString();
    const apply = (node: CollectionNode): CollectionNode => {
      if (node.id === id && node.kind === 'folder')
        return { ...node, config, modifiedAt: now };
      if (node.kind === 'folder')
        return { ...node, children: node.children.map(apply) };
      return node;
    };
    this.commitTree(this.tree().map(apply));
  }

  /**
   * Patches persisted HTTP request config. Missing fields are filled with defaults.
   */
  updateHttpConfig(id: string, patch: Partial<CollectionRequestConfig>): void {
    const found = findNode(this.tree(), id);
    if (!found || found.node.kind !== 'http')
      return;
    const current = requestConfigOf(found.node);
    const config = parseCollectionRequestConfig({ ...current, ...patch });
    const now = new Date().toISOString();
    const apply = (node: CollectionNode): CollectionNode => {
      if (node.id === id && node.kind === 'http')
        return { ...node, config, modifiedAt: now };
      if (node.kind === 'folder')
        return { ...node, children: node.children.map(apply) };
      return node;
    };
    this.commitTree(this.tree().map(apply));
  }

  websocketById(id: string): CollectionWebSocketNode | null {
    const node = this.nodeById(id);
    return node?.kind === 'websocket' ? node : null;
  }

  /**
   * Patches persisted WebSocket config. Missing fields are filled with defaults.
   */
  updateWebsocketConfig(id: string, patch: Partial<CollectionWebSocketConfig>): void {
    const found = findNode(this.tree(), id);
    if (!found || found.node.kind !== 'websocket')
      return;
    const current = websocketConfigOf(found.node);
    const config = parseCollectionWebSocketConfig({ ...current, ...patch });
    const now = new Date().toISOString();
    const apply = (node: CollectionNode): CollectionNode => {
      if (node.id === id && node.kind === 'websocket')
        return { ...node, config, modifiedAt: now };
      if (node.kind === 'folder')
        return { ...node, children: node.children.map(apply) };
      return node;
    };
    this.commitTree(this.tree().map(apply));
  }

  httpById(id: string): CollectionHttpNode | null {
    const node = this.nodeById(id);
    return node?.kind === 'http' ? node : null;
  }

  updateHttpMeta(id: string, patch: { readonly method?: HttpMethod; readonly status?: number | null }): void {
    const found = findNode(this.tree(), id);
    if (!found || found.node.kind !== 'http')
      return;
    const now = new Date().toISOString();
    const apply = (node: CollectionNode): CollectionNode => {
      if (node.id === id && node.kind === 'http')
        return {
          ...node,
          method: patch.method ?? node.method,
          status: patch.status !== undefined ? patch.status : node.status,
          modifiedAt: now,
        };
      if (node.kind === 'folder')
        return { ...node, children: node.children.map(apply) };
      return node;
    };
    this.commitTree(this.tree().map(apply));
  }

  /** Writes Set-Cookie values into a folder jar, replacing same name/domain/path. */
  mergeFolderCookies(id: string, cookies: readonly CollectionCookie[]): void {
    if (cookies.length === 0)
      return;
    const folder = this.folderById(id);
    if (!folder)
      return;
    const current = folderConfigOf(folder);
    const next = new Map<string, CollectionCookie>();
    for (const cookie of current.settings.cookies)
      next.set(`${cookie.name}\0${cookie.domain}\0${cookie.path}`, cookie);
    for (const cookie of cookies)
      next.set(`${cookie.name}\0${cookie.domain}\0${cookie.path}`, cookie);
    this.updateFolderConfig(id, {
      settings: { ...current.settings, cookies: [...next.values()] },
    });
  }

  parentIdOf(id: string): string | null {
    return findNode(this.tree(), id)?.parentId ?? null;
  }

  /**
   * Inserts a node at the end of `parentId` (null = tree root) and selects it.
   */
  create(kind: CollectionNodeKind, parentId: string | null): CollectionNode {
    const now = new Date().toISOString();
    const ids = collectAllNodeIds(this.tree());
    const parent = parentId && parentId !== COLLECTIONS_ROOT_ID ? parentId : null;
    const folder = parent ? findNode(this.tree(), parent) : null;
    const insertParent = folder?.node.kind === 'folder' ? parent : null;
    const siblings = insertParent && folder?.node.kind === 'folder' ? folder.node.children : this.tree();
    const node = createCollectionNode(kind, ids, now);
    this.commitTree(sortTree(insertNode(this.tree(), insertParent, siblings.length, node), this.sortMode()));
    if (insertParent)
      this.ensureExpanded(insertParent);
    this.selectedIds.set([node.id]);
    this.selectionAnchorId.set(node.id);
    return node;
  }

  rename(id: string, name: string): void {
    const found = findNode(this.tree(), id);
    if (!found)
      return;
    const nextName = name.trim() || defaultCollectionName(found.node.kind);
    const patch = (node: CollectionNode): CollectionNode => {
      if (node.id === id)
        return { ...node, name: nextName, modifiedAt: new Date().toISOString() };
      if (node.kind === 'folder')
        return { ...node, children: node.children.map(patch) };
      return node;
    };
    this.commitTree(sortTree(this.tree().map(patch), this.sortMode()));
  }

  /** Top-level selected nodes, ready to paste into this or another workspace. */
  copySelection(): CollectionNode[] {
    const ids = topLevelDeleteIds(this.tree(), this.selectedIds());
    const nodes: CollectionNode[] = [];
    for (const id of ids) {
      const found = findNode(this.tree(), id);
      if (found)
        nodes.push(cloneNodeDeep(found.node));
    }
    return nodes;
  }

  /** Inserts copied nodes at the root with new ids. Keeps a name when it is free. */
  pasteCopied(nodes: readonly CollectionNode[]): readonly string[] {
    if (nodes.length === 0)
      return [];
    const used = new Set(collectAllNodeIds(this.tree()));
    const names = this.tree().map((node) => node.name);
    const clones = nodes.map((node) => {
      const clone = cloneCollectionNode(node, used);
      const name = uniquePasteName(node.name, names, defaultCollectionName(node.kind));
      names.push(name);
      return { ...clone, name } as CollectionNode;
    });
    this.commitTree(sortTree(insertNodes(this.tree(), null, this.tree().length, clones), this.sortMode()));
    const ids = clones.map((node) => node.id);
    this.selectedIds.set(ids);
    this.selectionAnchorId.set(ids[0] ?? null);
    return ids;
  }

  duplicate(id: string): CollectionNode | null {
    const found = findNode(this.tree(), id);
    if (!found)
      return null;
    const used = new Set(collectAllNodeIds(this.tree()));
    const names = collectNames(this.tree());
    const clone = cloneCollectionNode(found.node, used);
    const named = { ...clone, name: nextCopyName(found.node.name, names) } as CollectionNode;
    this.commitTree(sortTree(insertNode(this.tree(), found.parentId, found.index + 1, named), this.sortMode()));
    this.selectedIds.set([named.id]);
    this.selectionAnchorId.set(named.id);
    if (found.parentId)
      this.ensureExpanded(found.parentId);
    return named;
  }

  /**
   * Removes nodes and their descendants. Returns every id that left the tree.
   */
  remove(ids: readonly string[], options?: { readonly persist?: boolean }): readonly string[] {
    const tree = this.tree();
    const collected: string[] = [];
    for (const id of ids) {
      const found = findNode(tree, id);
      if (found)
        collectDescendantIds(found.node, collected);
    }
    const unique = [...new Set(collected)];
    if (unique.length === 0)
      return [];
    let next = tree;
    for (const id of ids) {
      next = removeNode(next, id).tree;
    }
    this.commitTree(next, { persist: options?.persist !== false });
    this.pruneSelection();
    const expanded = new Set(this.expandedIds());
    for (const id of unique)
      expanded.delete(id);
    this.expandedIds.set(expanded);
    this.persistPrefs();
    return unique;
  }

  /**
   * Soft-delete with undo: updates the tree immediately but delays disk persist until commit().
   */
  removeDeferred(ids: readonly string[]): {
    readonly removedIds: readonly string[];
    readonly restore: () => void;
    readonly commit: () => Promise<void>;
  } | null {
    const tree = this.tree();
    const topLevel = topLevelDeleteIds(tree, ids);
    if (topLevel.length === 0)
      return null;

    const entries: CollectionRestoreEntry[] = [];
    for (const id of topLevel) {
      const found = findNode(tree, id);
      if (!found)
        continue;
      entries.push({
        node: cloneNodeDeep(found.node),
        parentId: found.parentId,
        index: found.index,
      });
    }
    if (entries.length === 0)
      return null;

    const removedIds = this.remove(topLevel, { persist: false });
    if (removedIds.length === 0)
      return null;

    return {
      removedIds,
      restore: () => this.restoreEntries(entries),
      commit: () => this.flushCollectionsPersist(),
    };
  }

  restoreEntries(entries: readonly CollectionRestoreEntry[]): void {
    if (entries.length === 0)
      return;
    const sorted = [...entries].sort((a, b) => {
      const parentA = a.parentId ?? '';
      const parentB = b.parentId ?? '';
      if (parentA !== parentB)
        return parentA.localeCompare(parentB);
      return b.index - a.index;
    });
    let next = this.tree();
    for (const entry of sorted)
      next = insertNode(next, entry.parentId, entry.index, entry.node);
    this.commitTree(sortTree(next, this.sortMode()));
    const expanded = new Set(this.expandedIds());
    for (const entry of entries) {
      if (entry.node.kind === 'folder')
        expanded.add(entry.node.id);
      if (entry.parentId)
        expanded.add(entry.parentId);
    }
    this.expandedIds.set(expanded);
    this.persistPrefs();
  }

  /** A drag or keyboard move keeps the new sibling order instead of snapping back to a sort. */
  private useSavedOrder(): void {
    if (this.sortMode() === 'saved')
      return;
    this.sortMode.set('saved');
    this.persistPrefs();
  }

  private commitTree(next: CollectionTree, options?: { readonly persist?: boolean }): void {
    this.tree.set(next);
    if (options?.persist !== false)
      this.persist();
  }

  private persist(): void {
    if (!this.persistEnabled) {
      return;
    }
    if (this.collectionsPersistTimer) {
      clearTimeout(this.collectionsPersistTimer);
    }
    this.collectionsPersistTimer = setTimeout(() => {
      this.collectionsPersistTimer = null;
      void this.flushCollectionsPersist();
    }, CollectionsStore.COLLECTIONS_PERSIST_DEBOUNCE_MS);
  }

  /** Writes the current collection tree immediately (cancels any pending debounced save). */
  flushCollectionsPersist(): Promise<void> {
    if (this.collectionsPersistTimer) {
      clearTimeout(this.collectionsPersistTimer);
      this.collectionsPersistTimer = null;
    }
    if (!this.persistEnabled) {
      return Promise.resolve();
    }
    if (this.collectionsPersistInFlight) {
      return this.collectionsPersistInFlight;
    }
    const payload: CollectionsFile = {
      ...DEFAULT_COLLECTIONS_FILE,
      collections: this.tree(),
    };
    this.collectionsPersistInFlight = this.desktop.saveCollections(payload).finally(() => {
      this.collectionsPersistInFlight = null;
    });
    return this.collectionsPersistInFlight;
  }

  private persistPrefs(): void {
    try {
      const payload = collectionPrefsSchema.parse({
        expandedIds: [...this.expandedIds()],
        sortMode: this.sortMode(),
        filters: this.filters(),
      });
      localStorage.setItem(prefsKey(this.workspaceId), JSON.stringify(payload));
    } catch {
      // Ignore quota / private mode failures.
    }
  }
}
