import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DATABASE_TYPE_LABELS,
  databaseErrorContext,
  findDatabaseConnection,
  formatDatabaseError,
  findSavedQuery,
  flattenDatabaseConnections,
  flattenSavedQueries,
  isDatabaseConnectionFolder,
  isSavedQueryFolder,
  sanitizeSelectionEntry,
  type DatabaseConnection,
  type DatabaseConnectionStatusMap,
  type DatabaseConnectionTreeItem,
  type DatabaseSidebarFilter,
  type DatabaseSortMode,
  type DatabaseType,
  type DatabasesFile,
  type QueriesFile,
  type SavedDatabaseQuery,
  type SavedQueryTreeItem,
  type SessionFile,
  type SessionSelectionEntry,
} from '@testrix/contracts';

import { DesktopApiService } from '../../core/desktop-api.service';
import { applyPointerSelect, emptySelection } from '../../core/range-select';
import {
  buildSchemaCatalogChildren,
  buildTableCatalogChildren,
  catalogTableKey,
  emptyCatalogCache,
  type ConnectionCatalogCache,
  type DatabaseNavNode,
  type DatabaseNavSection,
} from './database-nav';
import {
  DATABASE_CATALOG_PAGE_SIZE,
  filterCatalogSearch,
} from './database-catalog-page';
import { DATABASE_ROOT_ID, type DropSlot } from './database-drop-model';
import {
  allDatabaseTreeIds,
  allQueryTreeIds,
  cloneConnectionNode,
  cloneQueryNode,
  collectConnectionFolderIds,
  collectQueryFolderIds,
  createConnectionItem,
  createQueryItem,
  findConnectionParent,
  findQueryParent,
  insertConnectionNode,
  insertQueryNode,
  patchConnection,
  patchQuery,
  removeConnectionNode,
  removeQueryNode,
  renameConnectionNode,
  renameQueryNode,
  sortConnectionTree,
  sortQueryTree,
} from './database-tree';

const PREFS_KEY = 'testrix.database.prefs';

interface PendingConnection {
  readonly parentId: string | null;
  readonly connection: DatabaseConnection;
}

interface DatabaseSidebarPrefs {
  readonly connectionsOpen: boolean;
  readonly queriesOpen: boolean;
  readonly expandedIds: readonly string[];
  readonly filter: DatabaseSidebarFilter;
  readonly sortMode: DatabaseSortMode;
  readonly showSystemObjects: boolean;
}

const DEFAULT_PREFS: DatabaseSidebarPrefs = {
  connectionsOpen: true,
  queriesOpen: true,
  expandedIds: [],
  filter: 'all',
  sortMode: 'saved',
  showSystemObjects: false,
};

export interface DatabaseTableFocus {
  readonly seq: number;
  readonly connectionId: string;
  readonly schema: string;
  readonly table: string;
  readonly where: string;
  readonly column?: string;
}

export interface DatabaseTableViewState {
  readonly where: string;
  readonly order: string;
  readonly offset: number;
  readonly pageSize: number;
  readonly filter: string;
  readonly selectedRow: number;
  readonly selectedColumn?: string;
}

export type DatabaseErdPositions = Readonly<Record<string, { readonly x: number; readonly y: number }>>;

function readPrefs(workspaceId: string | null): DatabaseSidebarPrefs {
  if (!workspaceId || typeof localStorage === 'undefined')
    return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(`${PREFS_KEY}.${workspaceId}`);
    if (!raw)
      return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<DatabaseSidebarPrefs>;
    return {
      connectionsOpen: parsed.connectionsOpen !== false,
      queriesOpen: parsed.queriesOpen !== false,
      expandedIds: Array.isArray(parsed.expandedIds) ? parsed.expandedIds.map(String) : [],
      filter: parsed.filter === 'folders' || parsed.filter === 'queries' ? parsed.filter : 'all',
      sortMode:
        parsed.sortMode === 'name-asc' ||
        parsed.sortMode === 'name-desc' ||
        parsed.sortMode === 'date-new' ||
        parsed.sortMode === 'date-old'
          ? parsed.sortMode
          : 'saved',
      showSystemObjects: parsed.showSystemObjects === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function isSystemSchema(name: string): boolean {
  const value = name.toLowerCase();
  return (
    value === 'pg_catalog' ||
    value === 'information_schema' ||
    value === 'pg_toast' ||
    value.startsWith('pg_temp') ||
    value === 'sys' ||
    value === 'mysql' ||
    value === 'performance_schema'
  );
}

@Injectable({ providedIn: 'root' })
export class DatabaseStore {
  private readonly desktop = inject(DesktopApiService);
  private workspaceId: string | null = null;
  private persistEnabled = false;
  private prefs = readPrefs(null);
  private statusTimer: ReturnType<typeof setInterval> | null = null;

  readonly connectionNodes = signal<readonly DatabaseConnectionTreeItem[]>([]);
  readonly queryNodes = signal<readonly SavedQueryTreeItem[]>([]);
  readonly searchQuery = signal('');
  readonly filter = signal<DatabaseSidebarFilter>(this.prefs.filter);
  readonly sortMode = signal<DatabaseSortMode>(this.prefs.sortMode);
  readonly showSystemObjects = signal(this.prefs.showSystemObjects);
  readonly connectionsOpen = signal(this.prefs.connectionsOpen);
  readonly queriesOpen = signal(this.prefs.queriesOpen);
  readonly expandedIds = signal<ReadonlySet<string>>(new Set(this.prefs.expandedIds));
  readonly catalogByConnection = signal<Readonly<Record<string, ConnectionCatalogCache>>>({});
  readonly statuses = signal<DatabaseConnectionStatusMap>({});
  readonly dragNode = signal<DatabaseNavNode | null>(null);
  readonly dropTarget = signal<DropSlot | null>(null);
  readonly lastMovedId = signal<string | null>(null);
  readonly dragIds = signal<readonly string[]>([]);
  readonly connectionSelectedIds = signal<readonly string[]>([]);
  readonly connectionAnchorId = signal<string | null>(null);
  readonly querySelectedIds = signal<readonly string[]>([]);
  readonly queryAnchorId = signal<string | null>(null);
  readonly pickerConnectionId = signal<string | null>(null);
  readonly tableFocus = signal<DatabaseTableFocus | null>(null);
  readonly tableViews = signal<Readonly<Record<string, DatabaseTableViewState>>>({});
  readonly erdPositions = signal<Readonly<Record<string, DatabaseErdPositions>>>({});
  readonly catalogLimitById = signal<Readonly<Record<string, number>>>({});
  readonly catalogQueryById = signal<Readonly<Record<string, string>>>({});
  readonly catalogBusyIds = signal<ReadonlySet<string>>(new Set());
  readonly catalogLoadError = signal<Readonly<Record<string, string>>>({});
  readonly dragSection = signal<DatabaseNavSection | null>(null);
  readonly pendingConnections = signal<readonly PendingConnection[]>([]);

  private moveAnimTimer: ReturnType<typeof setTimeout> | null = null;
  private tableFocusSeq = 0;

  readonly connections = computed(() => flattenDatabaseConnections(this.connectionNodes()));
  readonly queries = computed(() => flattenSavedQueries(this.queryNodes()));

  readonly visibleConnectionTree = computed(() =>
    filterCatalogSearch(
      this.attachCatalog(
        this.filterConnectionTree(this.sortConnectionNodes(this.connectionNodes()), this.searchQuery()),
      ),
      this.searchQuery(),
    ),
  );

  readonly visibleQueryTree = computed(() =>
    this.filterQueryTree(this.sortQueryNodes(this.queryNodes()), this.searchQuery()),
  );

  readonly connectionCount = computed(() => this.connections().length);
  readonly queryCount = computed(() => this.queries().length);

  readonly allFoldersExpanded = computed(() => {
    const ids = [
      ...collectConnectionFolderIds(this.connectionNodes()),
      ...collectQueryFolderIds(this.queryNodes()),
    ];
    if (ids.length === 0)
      return false;
    const expanded = this.expandedIds();
    return ids.every((id) => expanded.has(id));
  });

  readonly isFilterActive = computed(
    () => this.filter() !== 'all' || this.showSystemObjects() || this.searchQuery().trim().length > 0,
  );

  readonly canDrag = computed(
    () => this.sortMode() === 'saved' && this.filter() === 'all' && this.searchQuery().trim().length === 0,
  );

  hydrate(databases: DatabasesFile, queries: QueriesFile, workspaceId: string | null): void {
    this.persistEnabled = false;
    this.workspaceId = workspaceId;
    this.prefs = readPrefs(workspaceId);
    this.connectionNodes.set(databases.nodes ?? []);
    this.queryNodes.set(queries.nodes ?? []);
    this.filter.set(this.prefs.filter);
    this.sortMode.set(this.prefs.sortMode);
    this.showSystemObjects.set(this.prefs.showSystemObjects);
    this.connectionsOpen.set(this.prefs.connectionsOpen);
    this.queriesOpen.set(this.prefs.queriesOpen);
    this.expandedIds.set(new Set(this.prefs.expandedIds));
    this.catalogByConnection.set({});
    this.connectionSelectedIds.set([]);
    this.connectionAnchorId.set(null);
    this.querySelectedIds.set([]);
    this.queryAnchorId.set(null);
    this.pendingConnections.set([]);
    this.pickerConnectionId.set(null);
    this.catalogBusyIds.set(new Set());
    this.catalogLoadError.set({});
    this.persistEnabled = true;
    this.startStatusPoll();
    for (const connection of this.connections()) {
      if (this.expandedIds().has(connection.id))
        void this.loadCatalogIfNeeded(connection.id);
    }
  }

  restoreSelection(session: SessionFile): void {
    const connections = sanitizeSelectionEntry(
      session.selection.databaseConnections,
      new Set(allDatabaseTreeIds(this.connectionNodes())),
    );
    const queries = sanitizeSelectionEntry(
      session.selection.databaseQueries,
      new Set(allQueryTreeIds(this.queryNodes())),
    );
    this.connectionSelectedIds.set(connections.ids);
    this.connectionAnchorId.set(connections.anchorId);
    this.querySelectedIds.set(queries.ids);
    this.queryAnchorId.set(queries.anchorId);
  }

  connectionSelectionPatch(): SessionSelectionEntry {
    return { ids: [...this.connectionSelectedIds()], anchorId: this.connectionAnchorId() };
  }

  querySelectionPatch(): SessionSelectionEntry {
    return { ids: [...this.querySelectedIds()], anchorId: this.queryAnchorId() };
  }

  connectionById(id: string): DatabaseConnection | null {
    return (
      findDatabaseConnection(this.connectionNodes(), id) ??
      this.pendingConnections().find((item) => item.connection.id === id)?.connection ??
      null
    );
  }

  isPendingConnection(id: string): boolean {
    return this.pendingConnections().some((item) => item.connection.id === id);
  }

  queryById(id: string): SavedDatabaseQuery | null {
    return findSavedQuery(this.queryNodes(), id);
  }

  navNodeById(id: string): DatabaseNavNode | null {
    const found = this.findNav(this.visibleConnectionTree(), id) ?? this.findNav(this.visibleQueryTree(), id);
    return found;
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  isSelected(id: string, section: DatabaseNavSection): boolean {
    return section === 'connections'
      ? this.connectionSelectedIds().includes(id)
      : this.querySelectedIds().includes(id);
  }

  toggleSection(section: DatabaseNavSection): void {
    if (section === 'connections')
      this.connectionsOpen.update((value) => !value);
    else
      this.queriesOpen.update((value) => !value);
    this.writePrefs();
  }

  toggleExpanded(id: string): void {
    const next = new Set(this.expandedIds());
    if (next.has(id))
      next.delete(id);
    else
      next.add(id);
    this.expandedIds.set(next);
    this.writePrefs();
    if (next.has(id))
      void this.loadCatalogForNav(id);
  }

  ensureExpanded(id: string): void {
    if (this.expandedIds().has(id)) {
      void this.loadCatalogForNav(id);
      return;
    }
    const next = new Set(this.expandedIds());
    next.add(id);
    this.expandedIds.set(next);
    this.writePrefs();
    void this.loadCatalogForNav(id);
  }

  toggleExpandAll(): void {
    const ids = [
      ...collectConnectionFolderIds(this.connectionNodes()),
      ...collectQueryFolderIds(this.queryNodes()),
    ];
    if (this.allFoldersExpanded()) {
      const next = new Set(this.expandedIds());
      for (const id of ids)
        next.delete(id);
      this.expandedIds.set(next);
    } else {
      this.expandedIds.set(new Set([...this.expandedIds(), ...ids]));
    }
    this.writePrefs();
  }

  setSearchQuery(value: string): void {
    this.searchQuery.set(value);
    if (!value.trim())
      return;
    for (const connection of this.connections()) {
      const cache = this.catalogByConnection()[connection.id];
      if (!cache)
        continue;
      for (const schema of connection.selectedSchemas ?? []) {
        if (cache.tablesBySchema[schema] === undefined)
          void this.loadSchemaObjects(connection.id, schema);
      }
    }
  }

  catalogQuery(id: string): string {
    return this.catalogQueryById()[id] ?? '';
  }

  catalogLimit(id: string): number {
    return this.catalogLimitById()[id] ?? DATABASE_CATALOG_PAGE_SIZE;
  }

  setCatalogQuery(id: string, value: string): void {
    this.catalogQueryById.update((current) => ({ ...current, [id]: value }));
    this.catalogLimitById.update((current) => {
      if (current[id] == null)
        return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  loadMoreCatalog(id: string, total: number): void {
    const current = this.catalogLimit(id);
    this.catalogLimitById.update((map) => ({
      ...map,
      [id]: Math.min(total, current + DATABASE_CATALOG_PAGE_SIZE),
    }));
  }

  setFilter(filter: DatabaseSidebarFilter): void {
    this.filter.set(filter);
    this.writePrefs();
  }

  setSortMode(mode: DatabaseSortMode): void {
    this.sortMode.set(mode);
    this.writePrefs();
  }

  setShowSystemObjects(value: boolean): void {
    this.showSystemObjects.set(value);
    this.writePrefs();
  }

  clearSelection(section?: DatabaseNavSection): void {
    const empty = emptySelection();
    if (!section || section === 'connections') {
      this.connectionSelectedIds.set(empty.ids);
      this.connectionAnchorId.set(empty.anchorId);
    }
    if (!section || section === 'queries') {
      this.querySelectedIds.set(empty.ids);
      this.queryAnchorId.set(empty.anchorId);
    }
  }

  visibleIds(section: DatabaseNavSection): readonly string[] {
    const tree =
      section === 'connections' ? this.visibleConnectionTree() : this.visibleQueryTree();
    return this.flattenNav(tree).map((node) => node.id);
  }

  selectAllVisible(section: DatabaseNavSection): void {
    const ids = this.visibleIds(section);
    if (section === 'connections') {
      this.connectionSelectedIds.set(ids);
      this.connectionAnchorId.set(ids[0] ?? null);
      return;
    }
    this.querySelectedIds.set(ids);
    this.queryAnchorId.set(ids[0] ?? null);
  }

  applyPointerSelect(
    id: string,
    section: DatabaseNavSection,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): void {
    const visible =
      section === 'connections'
        ? this.flattenNav(this.visibleConnectionTree())
        : this.flattenNav(this.visibleQueryTree());
    const next = applyPointerSelect({
      event,
      visibleIds: visible.map((node) => node.id),
      selectedIds: section === 'connections' ? this.connectionSelectedIds() : this.querySelectedIds(),
      anchorId: section === 'connections' ? this.connectionAnchorId() : this.queryAnchorId(),
      targetId: id,
    });
    if (section === 'connections') {
      this.connectionSelectedIds.set(next.ids);
      this.connectionAnchorId.set(next.anchorId);
      return;
    }
    this.querySelectedIds.set(next.ids);
    this.queryAnchorId.set(next.anchorId);
  }

  createConnection(kind: 'folder' | 'connection', parentId: string | null, type: DatabaseType = 'postgresql'): DatabaseConnectionTreeItem {
    const used = new Set(allDatabaseTreeIds(this.connectionNodes()));
    const node = createConnectionItem(kind, type, used);
    const parent = this.connectionFolderParent(parentId);
    this.connectionNodes.set(insertConnectionNode(this.connectionNodes(), parent, Number.MAX_SAFE_INTEGER, [node]));
    this.persistConnections();
    if (kind === 'folder')
      this.ensureExpanded(node.id);
    return node;
  }

  createPendingConnection(parentId: string | null, type: DatabaseType = 'postgresql'): DatabaseConnection {
    const used = new Set([
      ...allDatabaseTreeIds(this.connectionNodes()),
      ...this.pendingConnections().map((item) => item.connection.id),
    ]);
    const node = createConnectionItem('connection', type, used);
    if (node.kind !== 'connection')
      throw new Error('Expected a connection.');
    const connection = { ...node, name: 'New connection' };
    this.pendingConnections.update((list) => [...list, { parentId, connection }]);
    return connection;
  }

  saveConnection(connection: DatabaseConnection): void {
    const pending = this.pendingConnections().find((item) => item.connection.id === connection.id);
    if (pending) {
      this.pendingConnections.set(
        this.pendingConnections().filter((item) => item.connection.id !== connection.id),
      );
      const parent = this.connectionFolderParent(pending.parentId);
      this.connectionNodes.set(
        insertConnectionNode(this.connectionNodes(), parent, Number.MAX_SAFE_INTEGER, [connection]),
      );
      if (pending.parentId)
        this.ensureExpanded(pending.parentId);
      this.persistConnections();
      return;
    }
    this.connectionNodes.set(patchConnection(this.connectionNodes(), connection.id, connection));
    this.persistConnections();
  }

  discardPendingConnection(id: string): void {
    this.pendingConnections.set(this.pendingConnections().filter((item) => item.connection.id !== id));
  }

  createQuery(kind: 'folder' | 'query', parentId: string | null, connectionId = ''): SavedQueryTreeItem {
    const used = new Set(allQueryTreeIds(this.queryNodes()));
    const node = createQueryItem(kind, connectionId, used);
    const parent = this.queryFolderParent(parentId);
    this.queryNodes.set(insertQueryNode(this.queryNodes(), parent, Number.MAX_SAFE_INTEGER, [node]));
    this.persistQueries();
    if (kind === 'folder')
      this.ensureExpanded(node.id);
    return node;
  }

  rename(id: string, name: string, section: DatabaseNavSection): void {
    const nextName = name.trim() || 'Untitled';
    if (section === 'connections') {
      if (this.patchPending(id, { name: nextName }))
        return;
      this.connectionNodes.set(renameConnectionNode(this.connectionNodes(), id, nextName));
      this.persistConnections();
      return;
    }
    this.queryNodes.set(renameQueryNode(this.queryNodes(), id, nextName));
    this.persistQueries();
  }

  duplicate(id: string, section: DatabaseNavSection): DatabaseNavNode | null {
    if (section === 'connections') {
      const found = findConnectionParent(this.connectionNodes(), id);
      if (!found)
        return null;
      const used = new Set(allDatabaseTreeIds(this.connectionNodes()));
      const clone = cloneConnectionNode(found.node, used);
      this.connectionNodes.set(
        insertConnectionNode(this.connectionNodes(), found.parentId, found.index + 1, [clone]),
      );
      this.persistConnections();
      return this.navFromConnectionItem(clone);
    }
    const found = findQueryParent(this.queryNodes(), id);
    if (!found)
      return null;
    const used = new Set(allQueryTreeIds(this.queryNodes()));
    const clone = cloneQueryNode(found.node, used);
    this.queryNodes.set(insertQueryNode(this.queryNodes(), found.parentId, found.index + 1, [clone]));
    this.persistQueries();
    return this.navFromQueryItem(clone);
  }

  remove(ids: readonly string[], section: DatabaseNavSection): string[] {
    const removed: string[] = [];
    if (section === 'connections') {
      let next = this.connectionNodes();
      for (const id of ids) {
        const result = removeConnectionNode(next, id);
        if (result.removed) {
          removed.push(...allDatabaseTreeIds([result.removed]));
          next = result.tree;
        }
      }
      this.connectionNodes.set(next);
      this.persistConnections();
    } else {
      let next = this.queryNodes();
      for (const id of ids) {
        const result = removeQueryNode(next, id);
        if (result.removed) {
          removed.push(...allQueryTreeIds([result.removed]));
          next = result.tree;
        }
      }
      this.queryNodes.set(next);
      this.persistQueries();
    }
    this.clearSelection(section);
    return removed;
  }

  updateConnection(id: string, patch: Partial<DatabaseConnection>): void {
    if (this.patchPending(id, patch))
      return;
    this.connectionNodes.set(patchConnection(this.connectionNodes(), id, patch));
    this.persistConnections();
  }

  updateQuery(id: string, patch: Partial<SavedDatabaseQuery>): void {
    this.queryNodes.set(patchQuery(this.queryNodes(), id, patch));
    this.persistQueries();
  }

  beginDrag(node: DatabaseNavNode, ids: readonly string[]): void {
    this.dragNode.set(node);
    this.dragIds.set(ids);
    this.dragSection.set(node.section);
  }

  dragIdsFor(id: string, section: DatabaseNavSection): readonly string[] {
    const selected = section === 'connections' ? this.connectionSelectedIds() : this.querySelectedIds();
    if (selected.includes(id) && selected.length > 1)
      return selected;
    return [id];
  }

  setDropTarget(slot: DropSlot | null): void {
    this.dropTarget.set(slot);
  }

  endDrag(): void {
    this.dragNode.set(null);
    this.dropTarget.set(null);
    this.dragIds.set([]);
    this.dragSection.set(null);
  }

  commitDrop(): string | null {
    const dragged = this.dragNode();
    const slot = this.dropTarget();
    const section = this.dragSection();
    this.endDrag();
    if (!dragged || !slot || slot.denied || !section || !this.canDrag())
      return null;
    const parentId = slot.parentId === DATABASE_ROOT_ID ? null : slot.parentId;
    const ids = this.dragIdsFor(dragged.id, section);
    this.moveNodes(ids, parentId, slot.index, section);
    this.markMoved(dragged.id);
    return dragged.id;
  }

  moveWithinParent(nodeId: string, direction: -1 | 1, section: DatabaseNavSection): string | null {
    const found =
      section === 'connections'
        ? findConnectionParent(this.connectionNodes(), nodeId)
        : findQueryParent(this.queryNodes(), nodeId);
    if (!found)
      return null;
    if (direction < 0 && found.index === 0 && found.parentId) {
      const parentFound =
        section === 'connections'
          ? findConnectionParent(this.connectionNodes(), found.parentId)
          : findQueryParent(this.queryNodes(), found.parentId);
      if (!parentFound)
        return null;
      this.moveNodes([nodeId], parentFound.parentId, parentFound.index + 1, section);
      this.markMoved(nodeId);
      return 'Moved out of folder';
    }
    const target = found.index + direction;
    if (target < 0)
      return null;
    this.moveNodes([nodeId], found.parentId, direction > 0 ? target + 1 : target, section);
    this.markMoved(nodeId);
    return direction > 0 ? 'Moved down' : 'Moved up';
  }

  moveNodes(
    ids: readonly string[],
    parentId: string | null,
    index: number,
    section: DatabaseNavSection,
  ): void {
    const unique = [...new Set(ids)];
    if (section === 'connections') {
      let next = this.connectionNodes();
      const moving: DatabaseConnectionTreeItem[] = [];
      for (const id of unique) {
        const result = removeConnectionNode(next, id);
        if (result.removed) {
          moving.push(result.removed);
          next = result.tree;
        }
      }
      this.connectionNodes.set(insertConnectionNode(next, parentId, index, moving));
      this.persistConnections();
      return;
    }
    let next = this.queryNodes();
    const moving: SavedQueryTreeItem[] = [];
    for (const id of unique) {
      const result = removeQueryNode(next, id);
      if (result.removed) {
        moving.push(result.removed);
        next = result.tree;
      }
    }
    this.queryNodes.set(insertQueryNode(next, parentId, index, moving));
    this.persistQueries();
  }

  openSchemaPicker(connectionId: string): void {
    this.pickerConnectionId.set(connectionId);
    void this.loadCatalogIfNeeded(connectionId, true);
  }

  closeSchemaPicker(): void {
    this.pickerConnectionId.set(null);
  }

  setSelectedSchemas(connectionId: string, schemas: readonly string[]): void {
    this.updateConnection(connectionId, { selectedSchemas: [...schemas] });
    this.ensureExpanded(connectionId);
    void this.loadTables(connectionId);
  }

  async refreshConnection(connectionId: string): Promise<void> {
    const cache = { ...this.catalogByConnection() };
    delete cache[connectionId];
    this.catalogByConnection.set(cache);
    await this.loadCatalogIfNeeded(connectionId, true);
  }

  async testConnection(connection: DatabaseConnection): Promise<string | null> {
    try {
      await this.desktop.api.database.test(connection);
      await this.refreshStatuses();
      return null;
    } catch (error) {
      return formatDatabaseError(error, databaseErrorContext(connection));
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    await this.desktop.api.database.disconnect(connectionId);
    await this.refreshStatuses();
  }

  private connectionFolderParent(parentId: string | null): string | null {
    if (!parentId)
      return null;
    const found = findConnectionParent(this.connectionNodes(), parentId);
    if (!found)
      return null;
    return isDatabaseConnectionFolder(found.node) ? found.node.id : found.parentId;
  }

  private queryFolderParent(parentId: string | null): string | null {
    if (!parentId)
      return null;
    const found = findQueryParent(this.queryNodes(), parentId);
    if (!found)
      return null;
    return isSavedQueryFolder(found.node) ? found.node.id : found.parentId;
  }

  private sortConnectionNodes(nodes: readonly DatabaseConnectionTreeItem[]): readonly DatabaseConnectionTreeItem[] {
    return this.sortMode() === 'saved' ? nodes : sortConnectionTree(nodes, this.sortMode());
  }

  private sortQueryNodes(nodes: readonly SavedQueryTreeItem[]): readonly SavedQueryTreeItem[] {
    return this.sortMode() === 'saved' ? nodes : sortQueryTree(nodes, this.sortMode());
  }

  private filterConnectionTree(
    nodes: readonly DatabaseConnectionTreeItem[],
    query: string,
  ): DatabaseNavNode[] {
    if (this.filter() === 'queries')
      return [];
    const needle = query.trim().toLowerCase();
    const map = (list: readonly DatabaseConnectionTreeItem[]): DatabaseNavNode[] => {
      const out: DatabaseNavNode[] = [];
      for (const node of list) {
        if (isDatabaseConnectionFolder(node)) {
          const children = map(node.children);
          const matches = !needle || node.name.toLowerCase().includes(needle) || children.length > 0;
          if (this.filter() === 'folders' && children.length === 0 && needle && !node.name.toLowerCase().includes(needle))
            continue;
          if (!matches)
            continue;
          out.push(this.navFromConnectionItem({ ...node, children: node.children }, children));
          continue;
        }
        if (this.filter() === 'folders')
          continue;
        out.push(this.navFromConnectionItem(node));
      }
      return out;
    };
    return map(nodes);
  }

  private filterQueryTree(nodes: readonly SavedQueryTreeItem[], query: string): DatabaseNavNode[] {
    if (this.filter() === 'folders' && !query.trim()) {
      const foldersOnly = (list: readonly SavedQueryTreeItem[]): DatabaseNavNode[] =>
        list
          .filter(isSavedQueryFolder)
          .map((node) => this.navFromQueryItem({ ...node, children: node.children }, foldersOnly(node.children)));
      return foldersOnly(nodes);
    }
    if (this.filter() === 'folders')
      return [];
    const needle = query.trim().toLowerCase();
    const map = (list: readonly SavedQueryTreeItem[]): DatabaseNavNode[] => {
      const out: DatabaseNavNode[] = [];
      for (const node of list) {
        if (isSavedQueryFolder(node)) {
          const children = map(node.children);
          if (needle && !node.name.toLowerCase().includes(needle) && children.length === 0)
            continue;
          out.push(this.navFromQueryItem(node, children));
          continue;
        }
        if (needle && !node.name.toLowerCase().includes(needle))
          continue;
        out.push(this.navFromQueryItem(node));
      }
      return out;
    };
    return map(nodes);
  }

  private attachCatalog(nodes: readonly DatabaseNavNode[]): DatabaseNavNode[] {
    return nodes.map((node) => {
      if (node.kind === 'folder')
        return { ...node, children: this.attachCatalog(node.children ?? []) };
      if (node.kind !== 'connection' || !node.connectionId)
        return node;
      if (!this.expandedIds().has(node.id) && !this.searchQuery().trim())
        return node;
      return { ...node, children: this.catalogChildren(node.connectionId) };
    });
  }

  private catalogChildren(connectionId: string): DatabaseNavNode[] {
    const connection = this.connectionById(connectionId);
    const cache = this.catalogByConnection()[connectionId];
    if (!connection)
      return [];
    const selected = connection.selectedSchemas ?? [];
    if (selected.length === 0) {
      return [
        {
          id: `picker:${connectionId}`,
          kind: 'picker',
          name: 'Choose schemas…',
          section: 'connections',
          connectionId,
        },
      ];
    }
    if (!cache) {
      const error = this.catalogLoadError()[connectionId];
      if (error)
        return [this.statusNav(connectionId, error)];
      return [];
    }
    const schemas = selected.filter((schema) => cache.schemas.includes(schema) || cache.schemas.length === 0);
    const visibleSchemas = this.showSystemObjects() ? schemas : schemas.filter((schema) => !isSystemSchema(schema));
    return visibleSchemas.map((schema) => {
      const tables = cache.tablesBySchema[schema];
      const children =
        tables === undefined
          ? []
          : buildSchemaCatalogChildren({
              connectionId,
              schema,
              tables,
              routines: cache.routinesBySchema[schema],
              triggers: cache.triggersBySchema[schema],
              sequences: cache.sequencesBySchema[schema],
              users: cache.usersBySchema[schema],
              tableNav: (item) => this.tableNav(connectionId, schema, item.name, item.kind === 'view', cache),
            });
      return {
        id: `schema:${connectionId}:${schema}`,
        kind: 'schema' as const,
        name: schema,
        section: 'connections' as const,
        connectionId,
        schema,
        children,
      };
    });
  }

  private statusNav(connectionId: string, name: string, schema?: string): DatabaseNavNode {
    return {
      id: schema ? `status:${connectionId}:${schema}` : `status:${connectionId}`,
      kind: 'group',
      name,
      section: 'connections',
      connectionId,
      schema,
    };
  }

  private tableNav(
    connectionId: string,
    schema: string,
    table: string,
    isView: boolean,
    cache: ConnectionCatalogCache,
  ): DatabaseNavNode {
    const key = catalogTableKey(schema, table);
    return {
      id: `table:${connectionId}:${key}`,
      kind: isView ? 'view' : 'table',
      name: table,
      section: 'connections',
      connectionId,
      schema,
      table,
      isView,
      children: buildTableCatalogChildren({
        connectionId,
        schema,
        table,
        columns: cache.columnsByTable[key] ?? [],
        indexes: cache.indexesByTable[key] ?? [],
        foreignKeys: cache.foreignKeysByTable[key] ?? [],
      }),
    };
  }

  private navFromConnectionItem(
    node: DatabaseConnectionTreeItem,
    children?: readonly DatabaseNavNode[],
  ): DatabaseNavNode {
    if (isDatabaseConnectionFolder(node)) {
      return {
        id: node.id,
        kind: 'folder',
        name: node.name,
        section: 'connections',
        children: children ?? node.children.map((child) => this.navFromConnectionItem(child)),
      };
    }
    return {
      id: node.id,
      kind: 'connection',
      name: node.name,
      section: 'connections',
      connectionId: node.id,
      engine: node.type,
      status: this.statuses()[node.id]?.state ?? 'unknown',
      detail: DATABASE_TYPE_LABELS[node.type],
    };
  }

  private navFromQueryItem(node: SavedQueryTreeItem, children?: readonly DatabaseNavNode[]): DatabaseNavNode {
    if (isSavedQueryFolder(node)) {
      return {
        id: node.id,
        kind: 'folder',
        name: node.name,
        section: 'queries',
        children: children ?? node.children.map((child) => this.navFromQueryItem(child)),
      };
    }
    return {
      id: node.id,
      kind: 'query',
      name: node.name,
      section: 'queries',
      queryId: node.id,
      connectionId: node.connectionId,
    };
  }

  private flattenNav(nodes: readonly DatabaseNavNode[]): DatabaseNavNode[] {
    const out: DatabaseNavNode[] = [];
    for (const node of nodes) {
      out.push(node);
      if (node.children && this.expandedIds().has(node.id))
        out.push(...this.flattenNav(node.children));
    }
    return out;
  }

  private findNav(nodes: readonly DatabaseNavNode[], id: string): DatabaseNavNode | null {
    for (const node of nodes) {
      if (node.id === id)
        return node;
      if (node.children) {
        const nested = this.findNav(node.children, id);
        if (nested)
          return nested;
      }
    }
    return null;
  }

  private async loadCatalogForNav(id: string): Promise<void> {
    if (this.connectionById(id)) {
      await this.loadCatalogIfNeeded(id);
      return;
    }
    const node = this.navNodeById(id);
    if (node?.kind === 'schema' && node.connectionId && node.schema) {
      await this.loadSchemaObjects(node.connectionId, node.schema);
      return;
    }
    if (node?.connectionId)
      await this.loadCatalogIfNeeded(node.connectionId);
  }

  private async loadCatalogIfNeeded(id: string, force = false): Promise<void> {
    const connection = this.connectionById(id);
    if (!connection)
      return;
    const cache = this.catalogByConnection()[id];
    if (!force && cache?.schemas.length) {
      if (this.catalogNeedsTables(id)) {
        this.setBusy(id, true);
        try {
          await this.loadTables(id);
        } finally {
          this.setBusy(id, false);
        }
      }
      return;
    }
    this.setBusy(id, true);
    this.catalogLoadError.update((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    try {
      const result = await this.desktop.api.database.introspect({ connection, level: 'schemas' });
      const schemas = [...(result.schemas ?? [])].map((schema) => schema.trim()).filter(Boolean);
      this.patchCatalog(id, { schemas });
      const selected = connection.selectedSchemas ?? [];
      if (selected.length > 0)
        await this.loadTables(id);
    } catch (error) {
      this.catalogLoadError.update((current) => ({
        ...current,
        [id]: formatDatabaseError(error, databaseErrorContext(connection)),
      }));
    } finally {
      this.setBusy(id, false);
    }
    await this.refreshStatuses();
  }

  private catalogNeedsTables(connectionId: string): boolean {
    const connection = this.connectionById(connectionId);
    const cache = this.catalogByConnection()[connectionId];
    if (!connection || !cache)
      return true;
    const selected = connection.selectedSchemas ?? [];
    if (selected.length === 0)
      return false;
    return selected.some((schema) => cache.tablesBySchema[schema] === undefined);
  }

  private async loadTables(connectionId: string): Promise<void> {
    const connection = this.connectionById(connectionId);
    if (!connection)
      return;
    const tablesBySchema: Record<string, ConnectionCatalogCache['tablesBySchema'][string]> = {
      ...(this.catalogByConnection()[connectionId]?.tablesBySchema ?? {}),
    };
    for (const schema of connection.selectedSchemas ?? []) {
      try {
        const result = await this.desktop.api.database.introspect({
          connection,
          level: 'tables',
          schema,
        });
        tablesBySchema[schema] = result.tables ?? [];
      } catch {
        tablesBySchema[schema] = tablesBySchema[schema] ?? [];
      }
    }
    this.patchCatalog(connectionId, { tablesBySchema });
  }

  isCatalogBusy(id: string): boolean {
    return this.catalogBusyIds().has(id);
  }

  schemaBusyKey(connectionId: string, schema: string): string {
    return `schema:${connectionId}:${schema}`;
  }

  tableBusyKey(connectionId: string, schema: string, table: string): string {
    return `table:${connectionId}:${catalogTableKey(schema, table)}`;
  }

  requestTableFocus(focus: Omit<DatabaseTableFocus, 'seq'>): void {
    this.tableFocusSeq += 1;
    this.tableFocus.set({ ...focus, seq: this.tableFocusSeq });
  }

  consumeTableFocus(seq: number): void {
    if (this.tableFocus()?.seq === seq)
      this.tableFocus.set(null);
  }

  readTableView(nodeId: string): DatabaseTableViewState | null {
    return this.tableViews()[nodeId] ?? null;
  }

  writeTableView(nodeId: string, view: DatabaseTableViewState): void {
    this.tableViews.update((current) => ({ ...current, [nodeId]: view }));
  }

  readErdPositions(diagramNodeId: string): DatabaseErdPositions {
    return this.erdPositions()[diagramNodeId] ?? {};
  }

  writeErdPositions(diagramNodeId: string, positions: DatabaseErdPositions): void {
    this.erdPositions.update((current) => ({ ...current, [diagramNodeId]: positions }));
  }

  loadCatalog(connectionId: string): void {
    void this.loadCatalogIfNeeded(connectionId);
  }

  async loadSchemaObjects(connectionId: string, schema: string): Promise<void> {
    const connection = this.connectionById(connectionId);
    if (!connection)
      return;
    const cache = this.catalogByConnection()[connectionId];
    if (cache?.tablesBySchema[schema] && cache.foreignKeysBySchema[schema])
      return;
    const busyKey = this.schemaBusyKey(connectionId, schema);
    this.setBusy(busyKey, true);
    try {
      const [tables, routines, triggers, sequences, users, foreignKeys] = await Promise.all([
        cache?.tablesBySchema[schema]
          ? Promise.resolve({ tables: cache.tablesBySchema[schema] })
          : this.desktop.api.database.introspect({ connection, level: 'tables', schema }),
        this.desktop.api.database.introspect({ connection, level: 'routines', schema }),
        this.desktop.api.database.introspect({ connection, level: 'triggers', schema }),
        this.desktop.api.database.introspect({ connection, level: 'sequences', schema }),
        this.desktop.api.database.introspect({ connection, level: 'users', schema }),
        this.desktop.api.database.introspect({ connection, level: 'foreignKeys', schema }),
      ]);
      this.patchCatalog(connectionId, {
        tablesBySchema: { [schema]: tables.tables ?? cache?.tablesBySchema[schema] ?? [] },
        routinesBySchema: { [schema]: routines.routines ?? [] },
        triggersBySchema: { [schema]: triggers.triggers ?? [] },
        sequencesBySchema: { [schema]: sequences.sequences ?? [] },
        usersBySchema: { [schema]: users.users ?? [] },
        foreignKeysBySchema: { [schema]: foreignKeys.foreignKeys ?? [] },
      });
    } catch {
      this.patchCatalog(connectionId, {
        tablesBySchema: { [schema]: cache?.tablesBySchema[schema] ?? [] },
        foreignKeysBySchema: { [schema]: cache?.foreignKeysBySchema[schema] ?? [] },
      });
    } finally {
      this.setBusy(busyKey, false);
    }
  }

  async loadTableDetails(connectionId: string, schema: string, table: string): Promise<void> {
    const connection = this.connectionById(connectionId);
    if (!connection)
      return;
    const key = catalogTableKey(schema, table);
    if (this.catalogByConnection()[connectionId]?.columnsByTable[key])
      return;
    const busyKey = this.tableBusyKey(connectionId, schema, table);
    this.setBusy(busyKey, true);
    try {
      const [columns, indexes, foreignKeys, ddl] = await Promise.all([
        this.desktop.api.database.introspect({ connection, level: 'columns', schema, table }),
        this.desktop.api.database.introspect({ connection, level: 'indexes', schema, table }),
        this.desktop.api.database.introspect({ connection, level: 'foreignKeys', schema, table }),
        this.desktop.api.database.introspect({ connection, level: 'ddl', schema, table }),
      ]);
      this.patchCatalog(connectionId, {
        columnsByTable: { [key]: columns.columns ?? [] },
        indexesByTable: { [key]: indexes.indexes ?? [] },
        foreignKeysByTable: { [key]: foreignKeys.foreignKeys ?? [] },
        ddlByTable: { [key]: ddl.ddl ?? '' },
      });
    } catch {
      /* ignore */
    } finally {
      this.setBusy(busyKey, false);
    }
  }

  ddlFor(connectionId: string, schema: string, table: string): string {
    return this.catalogByConnection()[connectionId]?.ddlByTable[catalogTableKey(schema, table)] ?? '';
  }

  tableInfoFor(connectionId: string, schema: string, table: string): string {
    const cache = this.catalogByConnection()[connectionId];
    const key = catalogTableKey(schema, table);
    const columns = cache?.columnsByTable[key] ?? [];
    const indexes = cache?.indexesByTable[key] ?? [];
    const foreignKeys = cache?.foreignKeysByTable[key] ?? [];
    const lines = [
      `-- ${schema ? `${schema}.` : ''}${table}`,
      `-- Columns`,
      ...columns.map(
        (column) =>
          `--   ${column.name} ${column.type ?? ''}${column.primaryKey ? ' PK' : ''}${column.nullable === false ? ' NOT NULL' : ''}`,
      ),
      `-- Indexes`,
      ...(indexes.length > 0
        ? indexes.map((index) => `--   ${index.name}${(index.columns ?? []).length ? ` (${index.columns?.join(', ')})` : ''}`)
        : ['--   (none)']),
      `-- Foreign keys`,
      ...(foreignKeys.length > 0
        ? foreignKeys.map(
            (fk) =>
              `--   ${fk.name}${(fk.columns ?? []).length ? ` (${fk.columns?.join(', ')})` : ''}${fk.referencedTable ? ` -> ${fk.referencedTable}` : ''}`,
          )
        : ['--   (none)']),
    ];
    return lines.join('\n');
  }

  private patchCatalog(connectionId: string, patch: Partial<ConnectionCatalogCache>): void {
    const current = this.catalogByConnection()[connectionId] ?? emptyCatalogCache();
    this.catalogByConnection.set({
      ...this.catalogByConnection(),
      [connectionId]: {
        schemas: patch.schemas ?? current.schemas,
        tablesBySchema: { ...current.tablesBySchema, ...patch.tablesBySchema },
        columnsByTable: { ...current.columnsByTable, ...patch.columnsByTable },
        indexesByTable: { ...current.indexesByTable, ...patch.indexesByTable },
        foreignKeysByTable: { ...current.foreignKeysByTable, ...patch.foreignKeysByTable },
        foreignKeysBySchema: { ...current.foreignKeysBySchema, ...patch.foreignKeysBySchema },
        routinesBySchema: { ...current.routinesBySchema, ...patch.routinesBySchema },
        triggersBySchema: { ...current.triggersBySchema, ...patch.triggersBySchema },
        sequencesBySchema: { ...current.sequencesBySchema, ...patch.sequencesBySchema },
        usersBySchema: { ...current.usersBySchema, ...patch.usersBySchema },
        ddlByTable: { ...current.ddlByTable, ...patch.ddlByTable },
      },
    });
  }

  private setBusy(id: string, busy: boolean): void {
    this.catalogBusyIds.update((current) => {
      const next = new Set(current);
      if (busy)
        next.add(id);
      else
        next.delete(id);
      return next;
    });
  }

  private persistConnections(): void {
    if (!this.persistEnabled)
      return;
    void this.desktop.saveDatabases({ nodes: [...this.connectionNodes()] });
  }

  private patchPending(id: string, patch: Partial<DatabaseConnection>): boolean {
    const list = this.pendingConnections();
    const index = list.findIndex((item) => item.connection.id === id);
    if (index < 0)
      return false;
    const next = [...list];
    const current = next[index];
    if (!current)
      return false;
    next[index] = { ...current, connection: { ...current.connection, ...patch } };
    this.pendingConnections.set(next);
    return true;
  }

  private persistQueries(): void {
    if (!this.persistEnabled)
      return;
    void this.desktop.saveQueries({ nodes: [...this.queryNodes()] });
  }

  private writePrefs(): void {
    if (!this.workspaceId || typeof localStorage === 'undefined')
      return;
    const prefs: DatabaseSidebarPrefs = {
      connectionsOpen: this.connectionsOpen(),
      queriesOpen: this.queriesOpen(),
      expandedIds: [...this.expandedIds()],
      filter: this.filter(),
      sortMode: this.sortMode(),
      showSystemObjects: this.showSystemObjects(),
    };
    localStorage.setItem(`${PREFS_KEY}.${this.workspaceId}`, JSON.stringify(prefs));
  }

  private startStatusPoll(): void {
    if (this.statusTimer)
      return;
    void this.refreshStatuses();
    this.statusTimer = setInterval(() => void this.refreshStatuses(), 4000);
  }

  private async refreshStatuses(): Promise<void> {
    try {
      this.statuses.set(await this.desktop.api.database.statuses());
    } catch {
      /* ignore */
    }
  }

  private markMoved(id: string): void {
    if (this.moveAnimTimer)
      clearTimeout(this.moveAnimTimer);
    this.lastMovedId.set(id);
    this.moveAnimTimer = setTimeout(() => {
      if (this.lastMovedId() === id)
        this.lastMovedId.set(null);
      this.moveAnimTimer = null;
    }, 400);
  }
}
