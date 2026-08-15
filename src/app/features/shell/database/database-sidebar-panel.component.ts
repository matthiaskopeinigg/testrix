import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { DATABASE_CONNECTION_MAX_FOLDER_DEPTH } from '@shared/config';
import {
  databaseConnectionTabResourceId,
  databaseTableTabResourceId,
  qualifySqlTableName,
  SAVED_QUERY_MAX_FOLDER_DEPTH,
  type DatabaseConnectionStatusMap,
} from '@shared/database';

import { ConfigService } from '@app/core/config/config.service';
import { DatabaseCatalogService } from '@app/core/database/database-catalog.service';
import { DatabaseConnectionsService } from '@app/core/database/database-connections.service';
import { DatabaseQueriesService } from '@app/core/database/database-queries.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { startEntranceStaggerAnimation } from '@app/core/ui/entrance-stagger';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { collectFolderAncestorIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspacePanelToolbarActionsDirective } from '@app/features/shell/workspace/workspace-panel-toolbar-actions.directive';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { mergeTxTreeConfig } from '@app/shared/components/data/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/data/tx-tree/tx-tree.component';
import type {
  TxTreeDropContext,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/data/tx-tree/tx-tree.types';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxConfirmDialogComponent } from '@app/shared/components/overlays/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxContextMenuComponent } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.types';
import { TxTooltipDirective } from '@app/shared/components/overlays/tx-tooltip/tx-tooltip.directive';

import {
  buildConnectionNodeContextMenu,
  buildEmptyConnectionContextMenu,
} from './connection-context-menu';
import { attachCatalogToConnectionTree } from './connection-catalog.attach';
import { parseConnectionCatalogId } from './connection-catalog.ids';
import { fromConnectionTreeNodesWithExisting, toConnectionTreeNodes } from './connection-tree.adapter';
import { connectionCanDrop, remapConnectionDropTarget } from './connection-tree.drop';
import {
  collectConnectionExpandableIds,
  collectConnectionFolderIdsFromNodes,
  collectConnectionIdsForDeletion,
  findConnectionNode,
  isConnectionFolderNode,
  isConnectionLeafNode,
} from './connection-tree.mutations';
import type { ConnectionTreeKind, ConnectionTreeNode, ConnectionTreeNodeMeta } from './connection-tree.types';
import { filterConnectionTree } from './connection-tree.view';
import {
  buildDatabaseNodeContextMenu,
  buildEmptyDatabaseContextMenu,
} from './database-context-menu';
import {
  buildDatabaseFilterMenuItems,
  buildDatabaseSortMenuItems,
  DEFAULT_DATABASE_SIDEBAR_FILTER,
  DEFAULT_DATABASE_SIDEBAR_SORT_BY,
  isDatabaseKindFilterAction,
  isDatabaseSortAction,
  type DatabaseSidebarFilter,
  type DatabaseSidebarSortBy,
} from './database-sidebar-menus';
import { fromDatabaseTreeNodesWithExisting, toDatabaseTreeNodes } from './database-tree.adapter';
import {
  collectDatabaseFolderIdsFromNodes,
  collectDatabaseQueryIdsForDeletion,
  databaseFolderHasChildren,
  findDatabaseNode,
  isDatabaseFolderNode,
  isDatabaseQueryNode,
} from './database-tree.mutations';
import type { DatabaseTreeKind, DatabaseTreeNode, DatabaseTreeNodeMeta } from './database-tree.types';
import { applyDatabaseTreeView } from './database-tree.view';

type SidebarMenuTarget = 'queries' | 'connections';

const SESSION_PREF_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-database-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    WorkspacePanelToolbarActionsDirective,
    TxIconComponent,
    TxTooltipDirective,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './database-sidebar-panel.component.html',
  styleUrl: './database-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseSidebarPanelComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly queries = inject(DatabaseQueriesService);
  private readonly connections = inject(DatabaseConnectionsService);
  private readonly catalog = inject(DatabaseCatalogService);
  private readonly electron = inject(ElectronService);
  private readonly notifications = inject(TxNotificationService);
  private readonly config = inject(ConfigService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly uiPreferences = inject(UiPreferencesService);

  protected readonly entranceStaggerPlay = signal(false);
  protected readonly entranceStaggerSettled = signal(false);

  readonly searchPlaceholder = input('Search connections and queries…');
  readonly searchAriaLabel = input('Search database connections and queries');

  protected readonly navFilter = signal('');
  protected readonly kindFilter = signal<DatabaseSidebarFilter>(DEFAULT_DATABASE_SIDEBAR_FILTER);
  protected readonly sortBy = signal<DatabaseSidebarSortBy>(DEFAULT_DATABASE_SIDEBAR_SORT_BY);
  protected readonly connectionsExpanded = signal(true);
  protected readonly queriesExpanded = signal(true);
  protected readonly queryExpandedIds = signal<string[]>([]);
  protected readonly connectionExpandedIds = signal<string[]>([]);
  protected readonly showSystemObjects = signal(false);
  protected readonly connectionStatuses = signal<DatabaseConnectionStatusMap>({});
  protected readonly allExpanded = signal(false);
  protected readonly renamingNodeId = signal<string | null>(null);

  protected readonly filterMenuOpen = signal(false);
  protected readonly sortMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);
  protected readonly sidebarMenuTarget = signal<SidebarMenuTarget>('queries');

  protected readonly deleteOpen = signal(false);
  protected readonly deleteNodeId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');
  protected readonly deleteTarget = signal<SidebarMenuTarget | null>(null);

  private readonly queryTree = viewChild<TxTreeComponent>('queryTree');
  private readonly connectionTree = viewChild<TxTreeComponent>('connectionTree');

  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private skipNextSessionHydrate = false;

  protected readonly connectionCount = computed(() => this.connections.connections().length);
  protected readonly queryCount = computed(() => this.queries.queries().length);

  protected readonly treeNodes = computed(() => toDatabaseTreeNodes(this.queries.nodes()));

  protected readonly persistedConnectionNodes = computed(() =>
    toConnectionTreeNodes(this.connections.nodes()),
  );

  protected readonly connectionTreeNodes = computed(() => {
    void this.catalog.revision();
    return attachCatalogToConnectionTree(
      this.persistedConnectionNodes(),
      (id) => this.catalog.snapshot(id),
      this.connectionStatuses(),
      this.showSystemObjects(),
    );
  });

  protected readonly hasFolders = computed(
    () =>
      collectDatabaseFolderIdsFromNodes(this.treeNodes()).length > 0 ||
      collectConnectionFolderIdsFromNodes(this.connectionTreeNodes()).length > 0,
  );

  protected readonly filteredNodes = computed(() =>
    applyDatabaseTreeView(this.treeNodes(), {
      query: this.navFilter(),
      kindFilter: this.kindFilter(),
      sortBy: this.sortBy(),
    }),
  );

  protected readonly filteredConnectionNodes = computed(() =>
    filterConnectionTree(this.connectionTreeNodes(), this.navFilter()),
  );

  protected readonly filterMenuItems = computed(() =>
    buildDatabaseFilterMenuItems(this.kindFilter(), this.showSystemObjects()),
  );

  protected readonly sortMenuItems = computed(() => buildDatabaseSortMenuItems(this.sortBy()));

  protected readonly filterToolbarActive = computed(
    () => this.kindFilter() !== DEFAULT_DATABASE_SIDEBAR_FILTER || this.showSystemObjects(),
  );

  protected readonly sortToolbarActive = computed(
    () => this.sortBy() !== DEFAULT_DATABASE_SIDEBAR_SORT_BY,
  );

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<DatabaseTreeNodeMeta>({
      ariaLabel: 'Saved queries',
      sort: { siblingSort: 'manual' },
      drag: { enabled: this.isQueryTreePersistableView() },
      drop: {
        maxDepth: SAVED_QUERY_MAX_FOLDER_DEPTH,
        canDrop: (ctx) => databaseCanDrop(ctx),
      },
    }),
  );

  protected readonly connectionTreeConfig = computed(() =>
    mergeTxTreeConfig<ConnectionTreeNodeMeta>({
      ariaLabel: 'Database connections',
      sort: { siblingSort: 'manual' },
      drop: {
        maxDepth: DATABASE_CONNECTION_MAX_FOLDER_DEPTH,
        canDrop: (ctx) => connectionCanDrop(ctx),
        remapDropTarget: (ctx) => remapConnectionDropTarget(ctx),
      },
      drag: {
        enabled: this.navFilter().trim().length === 0,
        canDrag: (ctx) =>
          ctx.node.data?.kind === 'folder' ||
          ctx.node.data?.kind === 'connection' ||
          ctx.node.kind === 'folder' ||
          ctx.node.kind === 'connection',
      },
    }),
  );

  protected readonly treeSelectionIds = computed(() => {
    const tab = this.workspaceEditor.activeTab();
    if (tab?.kind !== 'database' || !tab.resourceId.startsWith('dbq:')) {
      return [];
    }
    return [tab.resourceId.slice(4)];
  });

  protected readonly connectionSelectionIds = computed(() => {
    const tab = this.workspaceEditor.activeTab();
    if (tab?.kind !== 'database' || !tab.resourceId.startsWith('dbc:')) {
      return [];
    }
    return [tab.resourceId.slice(4)];
  });

  protected readonly showConnectionList = computed(
    () => this.connectionsExpanded() || this.navFilter().trim().length > 0,
  );

  protected readonly showQueryList = computed(
    () => this.queriesExpanded() || this.navFilter().trim().length > 0,
  );

  protected readonly treeEmptyMessage = computed(() => {
    if (this.treeNodes().length === 0) {
      return 'No saved queries yet. Right-click to add a folder or query.';
    }
    if (this.navFilter().trim() || this.kindFilter() !== DEFAULT_DATABASE_SIDEBAR_FILTER) {
      return 'No queries match your search.';
    }
    return 'No queries.';
  });

  protected readonly connectionTreeEmptyMessage = computed(() => {
    if (this.connectionTreeNodes().length === 0) {
      return 'No connections yet. Right-click to add a folder or connection.';
    }
    if (this.navFilter().trim()) {
      return 'No connections match your search.';
    }
    return 'No connections.';
  });

  constructor() {
    void this.queries.hydrate();
    void this.refreshConnectionStatuses();
    effect(() => {
      void this.config.sessionRevision();
      untracked(() => this.hydrateDatabaseSessionPrefs());
    });
    effect(() => {
      void this.catalog.revision();
      const expanded = untracked(() => this.connectionExpandedIds());
      for (const id of expanded) {
        void this.ensureCatalogForExpanded(id);
      }
    });
    afterNextRender(() => {
      startEntranceStaggerAnimation(this.entranceStaggerPlay, this.entranceStaggerSettled, {
        enabled: () => this.uiPreferences.entranceStaggerEnabled(),
        destroyRef: this.destroyRef,
        childCount: () =>
          Math.max(1, this.filteredConnectionNodes().length + this.filteredNodes().length),
      });
    });
    this.destroyRef.onDestroy(() => {
      if (this.sessionSaveTimer !== null) {
        clearTimeout(this.sessionSaveTimer);
        this.sessionSaveTimer = null;
        this.persistDatabaseSessionPrefs();
      }
    });
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected handleExpandAll(expanded: boolean): void {
    this.allExpanded.set(expanded);
    this.applyQueryExpandedIds(
      expanded ? collectDatabaseFolderIdsFromNodes(this.treeNodes()) : [],
      { persist: true },
    );
    this.applyConnectionExpandedIds(
      expanded ? collectConnectionExpandableIds(this.connectionTreeNodes()) : [],
      { persist: true },
    );
  }

  protected handleQueryExpandedChange(ids: readonly string[]): void {
    this.applyQueryExpandedIds(ids, { persist: true });
  }

  protected handleConnectionExpandedChange(ids: readonly string[]): void {
    this.applyConnectionExpandedIds(ids, { persist: true });
  }

  protected handleNodesChange(nodes: readonly DatabaseTreeNode[]): void {
    if (!this.isQueryTreePersistableView()) {
      return;
    }
    this.queries.saveNodes(fromDatabaseTreeNodesWithExisting(nodes, this.queries.nodes()));
  }

  protected handleConnectionNodesChange(nodes: readonly ConnectionTreeNode[]): void {
    if (this.navFilter().trim().length > 0) {
      return;
    }
    void this.connections.saveNodes(
      fromConnectionTreeNodesWithExisting(nodes, this.connections.nodes()),
    );
  }

  protected handleToggleConnections(): void {
    this.connectionsExpanded.update((open) => !open);
    this.scheduleSessionSave();
  }

  protected handleToggleQueries(): void {
    this.queriesExpanded.update((open) => !open);
    this.scheduleSessionSave();
  }

  protected handleQueryNodeClick(event: TxTreeNodeClickEvent): void {
    const loc = findDatabaseNode(this.treeNodes(), event.nodeId);
    if (!loc) {
      return;
    }
    if (isDatabaseFolderNode(loc.node)) {
      this.toggleQueryFolderExpanded(event.nodeId);
      return;
    }
    if (isDatabaseQueryNode(loc.node)) {
      this.openQuery(event.nodeId);
    }
  }

  protected handleQueryNodeDblClick(event: TxTreeNodeClickEvent): void {
    const loc = findDatabaseNode(this.treeNodes(), event.nodeId);
    if (!loc) {
      return;
    }
    if (isDatabaseFolderNode(loc.node) || isDatabaseQueryNode(loc.node)) {
      this.startQueryInlineRename(event.nodeId);
    }
  }

  protected handleConnectionNodeClick(event: TxTreeNodeClickEvent): void {
    const loc = findConnectionNode(this.connectionTreeNodes(), event.nodeId);
    if (!loc) {
      return;
    }
    if (isConnectionFolderNode(loc.node)) {
      this.toggleConnectionFolderExpanded(event.nodeId);
      return;
    }
    if (isConnectionLeafNode(loc.node)) {
      this.openConnection(event.nodeId);
      return;
    }
    const kind = loc.node.data?.kind ?? loc.node.kind;
    if (kind === 'table' || kind === 'view' || kind === 'schema' || kind === 'group') {
      this.toggleConnectionFolderExpanded(event.nodeId);
    }
  }

  protected handleConnectionNodeDblClick(event: TxTreeNodeClickEvent): void {
    const loc = findConnectionNode(this.connectionTreeNodes(), event.nodeId);
    if (!loc) {
      return;
    }
    const kind = loc.node.data?.kind ?? loc.node.kind;
    if (kind === 'table' || kind === 'view') {
      this.openTableData(event.nodeId);
      return;
    }
    if (isConnectionFolderNode(loc.node) || isConnectionLeafNode(loc.node)) {
      this.startConnectionInlineRename(event.nodeId);
    }
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      if (findConnectionNode(this.connectionTreeNodes(), event.nodeId)) {
        void this.connections.renameNode(event.nodeId, trimmed);
      } else {
        this.queries.renameNode(event.nodeId, trimmed);
      }
    }
    this.renamingNodeId.set(null);
  }

  protected handleRenameCancel(): void {
    this.renamingNodeId.set(null);
  }

  protected handleQueryTreeAreaContextMenu(event: MouseEvent): void {
    if (this.isTreeRowTarget(event.target)) {
      return;
    }
    event.preventDefault();
    this.openQueryTreeContextMenu(event.clientX, event.clientY, null);
  }

  protected handleConnectionTreeAreaContextMenu(event: MouseEvent): void {
    if (this.isTreeRowTarget(event.target)) {
      return;
    }
    event.preventDefault();
    this.openConnectionTreeContextMenu(event.clientX, event.clientY, null);
  }

  protected handleQueryRowContextMenu(event: TxTreeRowContextMenuEvent): void {
    this.openQueryTreeContextMenu(event.clientX, event.clientY, event.nodeId);
  }

  protected handleConnectionRowContextMenu(event: TxTreeRowContextMenuEvent): void {
    this.openConnectionTreeContextMenu(event.clientX, event.clientY, event.nodeId);
  }

  protected handleContextMenuSelect(actionId: string): void {
    const nodeId = this.contextNodeId();
    const target = this.sidebarMenuTarget();
    this.contextMenuOpen.set(false);

    if (target === 'connections') {
      void this.handleConnectionMenuAction(actionId, nodeId);
    } else {
      this.handleQueryMenuAction(actionId, nodeId);
    }
    this.cdr.markForCheck();
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
  }

  protected handleFilterToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    this.sortMenuOpen.set(false);
    this.filterMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.filterMenuOpen.set(true);
  }

  protected handleSortToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    this.filterMenuOpen.set(false);
    this.sortMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.sortMenuOpen.set(true);
  }

  protected handleFilterMenuSelect(actionId: string): void {
    if (actionId === 'show-system-objects') {
      this.showSystemObjects.update((value) => !value);
      this.scheduleSessionSave();
    } else if (isDatabaseKindFilterAction(actionId)) {
      this.kindFilter.set(actionId);
    }
    this.filterMenuOpen.set(false);
    this.cdr.markForCheck();
  }

  protected handleSortMenuSelect(actionId: string): void {
    if (isDatabaseSortAction(actionId)) {
      this.sortBy.set(actionId);
    }
    this.sortMenuOpen.set(false);
    this.cdr.markForCheck();
  }

  protected handleFilterMenuClosed(): void {
    this.filterMenuOpen.set(false);
  }

  protected handleSortMenuClosed(): void {
    this.sortMenuOpen.set(false);
  }

  protected handleDeleteConfirmed(): void {
    const nodeId = this.deleteNodeId();
    const target = this.deleteTarget();
    this.closeAllMenus();
    this.deleteOpen.set(false);
    this.deleteNodeId.set(null);
    this.deleteTarget.set(null);
    if (!nodeId || !target) {
      return;
    }
    if (target === 'connections') {
      const connectionIds = collectConnectionIdsForDeletion(this.connectionTreeNodes(), nodeId);
      void this.connections.deleteNode(nodeId);
      this.catalog.clear(nodeId);
      this.workspaceEditor.closeTabsForResourceIds(
        connectionIds.map((id) => databaseConnectionTabResourceId(id)),
      );
      return;
    }
    const queryIds = collectDatabaseQueryIdsForDeletion(this.treeNodes(), nodeId);
    this.queries.deleteNode(nodeId);
    this.workspaceEditor.closeTabsForResourceIds(queryIds.map((id) => this.queries.tabResourceId(id)));
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
    this.deleteNodeId.set(null);
    this.deleteTarget.set(null);
  }

  private handleQueryMenuAction(actionId: string, nodeId: string | null): void {
    switch (actionId) {
      case 'new-folder': {
        this.queriesExpanded.set(true);
        const loc = nodeId ? findDatabaseNode(this.treeNodes(), nodeId) : null;
        const parent = loc && isDatabaseFolderNode(loc.node) ? nodeId : null;
        this.queries.createFolder('New folder', parent);
        if (parent) {
          this.setQueryFolderExpanded(parent, true);
        }
        this.scheduleSessionSave();
        break;
      }
      case 'new-query': {
        this.queriesExpanded.set(true);
        const loc = nodeId ? findDatabaseNode(this.treeNodes(), nodeId) : null;
        const parent = loc && isDatabaseFolderNode(loc.node) ? nodeId : null;
        const created = this.queries.createQuery('New query', '', parent);
        if (parent) {
          this.setQueryFolderExpanded(parent, true);
        }
        this.openQuery(created.id);
        this.scheduleSessionSave();
        break;
      }
      case 'rename':
        if (nodeId) {
          this.startQueryInlineRename(nodeId);
        }
        break;
      case 'duplicate':
        if (nodeId) {
          this.queriesExpanded.set(true);
          const copy = this.queries.duplicateQuery(nodeId);
          if (copy) {
            this.openQuery(copy.id);
          }
          this.scheduleSessionSave();
        }
        break;
      case 'delete':
        if (nodeId) {
          this.closeAllMenus();
          this.openQueryDeleteDialog(nodeId);
        }
        break;
      case 'open':
        if (nodeId) {
          this.openQuery(nodeId);
        }
        break;
      case 'expand':
        if (nodeId) {
          this.setQueryFolderExpanded(nodeId, true);
        }
        break;
    }
  }

  private async handleConnectionMenuAction(actionId: string, nodeId: string | null): Promise<void> {
    switch (actionId) {
      case 'new-folder': {
        this.connectionsExpanded.set(true);
        await this.connections.createFolder();
        this.scheduleSessionSave();
        break;
      }
      case 'new-connection': {
        this.connectionsExpanded.set(true);
        const loc = nodeId ? findConnectionNode(this.connectionTreeNodes(), nodeId) : null;
        const parent = loc && isConnectionFolderNode(loc.node) ? nodeId : null;
        const created = await this.connections.createConnection(parent);
        if (parent) {
          this.setConnectionFolderExpanded(parent, true);
        }
        this.openConnection(created.id);
        this.scheduleSessionSave();
        break;
      }
      case 'rename':
        if (nodeId) {
          this.startConnectionInlineRename(nodeId);
        }
        break;
      case 'duplicate':
        if (nodeId) {
          const copy = await this.connections.duplicateConnection(nodeId);
          if (copy) {
            this.openConnection(copy.id);
          }
        }
        break;
      case 'delete':
        if (nodeId) {
          this.closeAllMenus();
          this.openConnectionDeleteDialog(nodeId);
        }
        break;
      case 'open':
        if (nodeId) {
          this.setConnectionFolderExpanded(nodeId, true);
          void this.ensureCatalogForExpanded(nodeId);
        }
        break;
      case 'edit':
        if (nodeId) {
          this.openConnection(this.connectionIdForNode(nodeId));
        }
        break;
      case 'refresh':
        if (nodeId) {
          void this.refreshCatalog(nodeId);
        }
        break;
      case 'test':
        if (nodeId) {
          this.closeAllMenus();
          void this.testConnection(nodeId);
        }
        break;
      case 'new-query':
        if (nodeId) {
          this.createQueryForConnection(nodeId);
        }
        break;
      case 'jump-to-data':
      case 'open-data':
        if (nodeId) {
          this.openTableData(nodeId);
        }
        break;
      case 'copy-name':
        if (nodeId) {
          void this.copyCatalogName(nodeId);
        }
        break;
      case 'copy-qualified':
        if (nodeId) {
          void this.copyCatalogName(nodeId, { qualifiedColumn: true });
        }
        break;
      case 'show-ddl':
        if (nodeId) {
          void this.showTableDdl(nodeId);
        }
        break;
      case 'expand':
        if (nodeId) {
          this.setConnectionFolderExpanded(nodeId, true);
          void this.ensureCatalogForExpanded(nodeId);
        }
        break;
    }
  }

  private openQueryTreeContextMenu(x: number, y: number, nodeId: string | null): void {
    this.sidebarMenuTarget.set('queries');
    this.contextNodeId.set(nodeId);
    this.contextMenuPosition.set({ x, y });
    if (!nodeId) {
      this.contextMenuItems.set(buildEmptyDatabaseContextMenu());
      this.contextMenuOpen.set(true);
      return;
    }
    const loc = findDatabaseNode(this.treeNodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = (loc.node.data?.kind ?? loc.node.kind) as DatabaseTreeKind;
    this.contextMenuItems.set(
      buildDatabaseNodeContextMenu(
        kind,
        this.queryExpandedIds().includes(nodeId),
        databaseFolderHasChildren(this.treeNodes(), nodeId),
      ),
    );
    this.contextMenuOpen.set(true);
  }

  private openConnectionTreeContextMenu(x: number, y: number, nodeId: string | null): void {
    this.sidebarMenuTarget.set('connections');
    this.contextNodeId.set(nodeId);
    this.contextMenuPosition.set({ x, y });
    if (!nodeId) {
      this.contextMenuItems.set(buildEmptyConnectionContextMenu());
      this.contextMenuOpen.set(true);
      return;
    }
    const loc = findConnectionNode(this.connectionTreeNodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = (loc.node.data?.kind ?? loc.node.kind) as ConnectionTreeKind;
    this.contextMenuItems.set(
      buildConnectionNodeContextMenu(kind, this.connectionExpandedIds().includes(nodeId), true),
    );
    this.contextMenuOpen.set(true);
  }

  private closeAllMenus(): void {
    this.contextMenuOpen.set(false);
    this.filterMenuOpen.set(false);
    this.sortMenuOpen.set(false);
  }

  private openQuery(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.queries.tabResourceId(id),
      kind: 'database',
    });
  }

  private openConnection(id: string): void {
    this.connectionsExpanded.set(true);
    this.workspaceEditor.openResource({
      resourceId: databaseConnectionTabResourceId(id),
      kind: 'database',
    });
    this.scheduleSessionSave();
  }

  private startQueryInlineRename(nodeId: string): void {
    if (!findDatabaseNode(this.treeNodes(), nodeId)) {
      return;
    }
    this.queriesExpanded.set(true);
    this.renamingNodeId.set(nodeId);
    const ancestors = collectFolderAncestorIds(this.treeNodes(), nodeId, (list, id) => {
      const loc = findDatabaseNode(list, id);
      return loc ? { parent: loc.parent } : null;
    });
    this.queryExpandedIds.update((ids) => [...new Set([...ids, ...ancestors])]);
    this.syncAllExpandedFlag();
    this.scheduleSessionSave();
  }

  private startConnectionInlineRename(nodeId: string): void {
    if (parseConnectionCatalogId(nodeId) || !findConnectionNode(this.persistedConnectionNodes(), nodeId)) {
      return;
    }
    this.connectionsExpanded.set(true);
    this.renamingNodeId.set(nodeId);
    const ancestors = collectFolderAncestorIds(this.connectionTreeNodes(), nodeId, (list, id) => {
      const loc = findConnectionNode(list, id);
      return loc ? { parent: loc.parent } : null;
    });
    this.connectionExpandedIds.update((ids) => [...new Set([...ids, ...ancestors])]);
    this.syncAllExpandedFlag();
    this.scheduleSessionSave();
  }

  private openQueryDeleteDialog(nodeId: string): void {
    const loc = findDatabaseNode(this.treeNodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = loc.node.data?.kind ?? loc.node.kind;
    const queryCount = collectDatabaseQueryIdsForDeletion(this.treeNodes(), nodeId).length;
    this.deleteMessage.set(
      kind === 'folder'
        ? `Delete folder “${loc.node.label}” and ${queryCount} query(s) inside?`
        : `Delete query “${loc.node.label}”?`,
    );
    this.deleteNodeId.set(nodeId);
    this.deleteTarget.set('queries');
    this.deleteOpen.set(true);
  }

  private openConnectionDeleteDialog(nodeId: string): void {
    const loc = findConnectionNode(this.connectionTreeNodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = loc.node.data?.kind ?? loc.node.kind;
    const connectionCount = collectConnectionIdsForDeletion(this.connectionTreeNodes(), nodeId).length;
    this.deleteMessage.set(
      kind === 'folder'
        ? `Delete folder “${loc.node.label}” and ${connectionCount} connection(s) inside?`
        : `Delete connection “${loc.node.label}”?`,
    );
    this.deleteNodeId.set(nodeId);
    this.deleteTarget.set('connections');
    this.deleteOpen.set(true);
  }

  private toggleQueryFolderExpanded(folderId: string): void {
    const expanded = this.queryExpandedIds();
    this.applyQueryExpandedIds(
      expanded.includes(folderId) ? expanded.filter((id) => id !== folderId) : [...expanded, folderId],
      { persist: true },
    );
  }

  private toggleConnectionFolderExpanded(folderId: string): void {
    const expanded = this.connectionExpandedIds();
    this.applyConnectionExpandedIds(
      expanded.includes(folderId) ? expanded.filter((id) => id !== folderId) : [...expanded, folderId],
      { persist: true },
    );
  }

  private setQueryFolderExpanded(folderId: string, expanded: boolean): void {
    this.applyQueryExpandedIds(toggleId(this.queryExpandedIds(), folderId, expanded), { persist: true });
  }

  private setConnectionFolderExpanded(folderId: string, expanded: boolean): void {
    this.applyConnectionExpandedIds(toggleId(this.connectionExpandedIds(), folderId, expanded), {
      persist: true,
    });
  }

  private applyQueryExpandedIds(
    ids: readonly string[],
    options: { readonly persist: boolean },
  ): void {
    this.queryExpandedIds.set([...ids]);
    this.queryTree()?.syncExpansionFromInput(ids);
    this.syncAllExpandedFlag();
    this.cdr.markForCheck();
    if (options.persist) {
      this.scheduleSessionSave();
    }
  }

  private applyConnectionExpandedIds(
    ids: readonly string[],
    options: { readonly persist: boolean },
  ): void {
    const previous = this.connectionExpandedIds();
    this.connectionExpandedIds.set([...ids]);
    this.connectionTree()?.syncExpansionFromInput(ids);
    this.syncAllExpandedFlag();
    this.cdr.markForCheck();
    if (options.persist) {
      this.scheduleSessionSave();
    }
    const added = ids.filter((id) => !previous.includes(id));
    for (const id of added) {
      void this.ensureCatalogForExpanded(id);
    }
  }

  private pruneQueryExpandedIds(ids: readonly string[]): string[] {
    if (this.queries.nodes().length === 0) {
      return [...ids];
    }
    const valid = new Set(collectDatabaseFolderIdsFromNodes(this.treeNodes()));
    return ids.filter((id) => valid.has(id));
  }

  private pruneConnectionExpandedIds(ids: readonly string[]): string[] {
    if (this.connections.nodes().length === 0) {
      return [...ids];
    }
    const valid = new Set(collectConnectionExpandableIds(this.connectionTreeNodes()));
    return ids.filter((id) => valid.has(id) || Boolean(this.connections.find(id)));
  }

  private syncAllExpandedFlag(): void {
    const queryFolders = collectDatabaseFolderIdsFromNodes(this.treeNodes());
    const connectionFolders = collectConnectionFolderIdsFromNodes(this.connectionTreeNodes());
    if (queryFolders.length === 0 && connectionFolders.length === 0) {
      this.allExpanded.set(false);
      return;
    }
    const queryExpanded = this.queryExpandedIds();
    const connectionExpanded = this.connectionExpandedIds();
    this.allExpanded.set(
      queryFolders.every((id) => queryExpanded.includes(id)) &&
        connectionFolders.every((id) => connectionExpanded.includes(id)),
    );
  }

  private scheduleSessionSave(): void {
    if (this.sessionSaveTimer !== null) {
      clearTimeout(this.sessionSaveTimer);
    }
    this.sessionSaveTimer = setTimeout(() => {
      this.sessionSaveTimer = null;
      this.persistDatabaseSessionPrefs();
    }, SESSION_PREF_DEBOUNCE_MS);
  }

  private hydrateDatabaseSessionPrefs(): void {
    const prefs = this.config.session()?.workspace.database;
    if (!prefs) {
      return;
    }
    if (this.skipNextSessionHydrate || this.sessionSaveTimer !== null) {
      this.skipNextSessionHydrate = false;
      return;
    }
    if (this.connectionsExpanded() !== prefs.connectionsExpanded) {
      this.connectionsExpanded.set(prefs.connectionsExpanded);
    }
    if (this.queriesExpanded() !== prefs.queriesExpanded) {
      this.queriesExpanded.set(prefs.queriesExpanded);
    }
    if (!sameStringList(this.queryExpandedIds(), prefs.queryExpandedIds)) {
      this.applyQueryExpandedIds([...prefs.queryExpandedIds], { persist: false });
    }
    if (!sameStringList(this.connectionExpandedIds(), prefs.connectionExpandedIds)) {
      this.applyConnectionExpandedIds([...prefs.connectionExpandedIds], { persist: false });
    }
    if (this.showSystemObjects() !== prefs.showSystemObjects) {
      this.showSystemObjects.set(prefs.showSystemObjects);
    }
  }

  private persistDatabaseSessionPrefs(): void {
    this.skipNextSessionHydrate = true;
    void this.config.patchSession({
      workspace: {
        database: {
          connectionsExpanded: this.connectionsExpanded(),
          queriesExpanded: this.queriesExpanded(),
          queryExpandedIds: this.pruneQueryExpandedIds(this.queryExpandedIds()),
          connectionExpandedIds: this.pruneConnectionExpandedIds(this.connectionExpandedIds()),
          showSystemObjects: this.showSystemObjects(),
        },
      },
    });
  }

  private isTreeRowTarget(target: EventTarget | null): boolean {
    return Boolean(
      (target as HTMLElement | null)?.closest('.tx-tree-row-host, .tx-tree-row, .tx-tree__custom-row'),
    );
  }

  /** True when the query tree shows saved order with no search/kind filter (safe to persist DnD). */
  private isQueryTreePersistableView(): boolean {
    return (
      this.sortBy() === DEFAULT_DATABASE_SIDEBAR_SORT_BY &&
      this.kindFilter() === DEFAULT_DATABASE_SIDEBAR_FILTER &&
      this.navFilter().trim().length === 0
    );
  }

  private connectionIdForNode(nodeId: string): string {
    return parseConnectionCatalogId(nodeId)?.connectionId ?? nodeId;
  }

  private async refreshConnectionStatuses(): Promise<void> {
    const api = this.electron.bridge()?.database;
    if (!api?.getConnectionStatuses) {
      return;
    }
    try {
      this.connectionStatuses.set(await api.getConnectionStatuses());
    } catch {
      /* ignore */
    }
  }

  private async ensureCatalogForExpanded(nodeId: string): Promise<void> {
    const parsed = parseConnectionCatalogId(nodeId);
    if (!parsed) {
      const connection = this.connections.find(nodeId);
      if (connection) {
        await this.catalog.openConnection(connection);
      }
      return;
    }
    const connection = this.connections.find(parsed.connectionId);
    if (!connection) {
      return;
    }
    if (parsed.kind === 'schema') {
      await this.catalog.loadSchema(connection, parsed.schema);
      return;
    }
    if (parsed.kind === 'table' || parsed.kind === 'view') {
      await this.catalog.loadTable(connection, parsed.schema, parsed.table || parsed.name);
    }
  }

  private async refreshCatalog(nodeId: string): Promise<void> {
    const connection = this.connections.find(this.connectionIdForNode(nodeId));
    if (!connection) {
      return;
    }
    this.catalog.clear(connection.id);
    this.setConnectionFolderExpanded(connection.id, true);
    await this.catalog.refreshConnection(connection);
  }

  private async testConnection(nodeId: string): Promise<void> {
    const connection = this.connections.find(this.connectionIdForNode(nodeId));
    const api = this.electron.bridge()?.database;
    if (!connection || !api?.testConnection) {
      return;
    }
    try {
      await api.testConnection(connection);
      this.notifications.showSuccess('Connected');
    } catch {
      /* status toast comes from the handler */
    }
    await this.refreshConnectionStatuses();
  }

  private createQueryForConnection(nodeId: string): void {
    const connectionId = this.connectionIdForNode(nodeId);
    const created = this.queries.createQuery('New query', connectionId);
    this.openQuery(created.id);
  }

  private openTableData(nodeId: string): void {
    const parsed = parseConnectionCatalogId(nodeId);
    if (parsed && (parsed.kind === 'table' || parsed.kind === 'view')) {
      const table = parsed.table || parsed.name;
      this.workspaceEditor.openResource({
        resourceId: databaseTableTabResourceId(parsed.connectionId, parsed.schema, table),
        kind: 'database',
      });
      return;
    }
    const connectionId = this.connectionIdForNode(nodeId);
    const first = this.firstCatalogTable(connectionId);
    if (!first) {
      this.notifications.showInfo('No tables to open yet. Expand the catalog first.');
      return;
    }
    this.workspaceEditor.openResource({
      resourceId: databaseTableTabResourceId(connectionId, first.schema, first.table),
      kind: 'database',
    });
  }

  private firstCatalogTable(connectionId: string): { readonly schema: string; readonly table: string } | null {
    const catalog = this.catalog.snapshot(connectionId);
    if (!catalog) {
      return null;
    }
    for (const [schema, tables] of Object.entries(catalog.tablesBySchema)) {
      const table = tables.find((item) => item.kind === 'table');
      if (table) {
        return { schema: table.schema || schema, table: table.name };
      }
    }
    return null;
  }

  private async showTableDdl(nodeId: string): Promise<void> {
    const parsed = parseConnectionCatalogId(nodeId);
    const connection = parsed ? this.connections.find(parsed.connectionId) : null;
    if (!parsed || !connection) {
      return;
    }
    const table = parsed.table || parsed.name;
    const ddl = await this.catalog.loadDdl(connection, parsed.schema, table);
    const created = this.queries.createQuery(`${table} DDL`, connection.id, null, ddl, true);
    this.openQuery(created.id);
  }

  private async copyCatalogName(
    nodeId: string,
    options: { readonly qualifiedColumn?: boolean } = {},
  ): Promise<void> {
    const loc = findConnectionNode(this.connectionTreeNodes(), nodeId);
    const parsed = parseConnectionCatalogId(nodeId);
    const connection = parsed ? this.connections.find(parsed.connectionId) : null;
    let text = loc?.node.label ?? '';
    if (parsed && connection && (parsed.kind === 'table' || parsed.kind === 'view')) {
      text = qualifySqlTableName(parsed.schema, parsed.table || parsed.name, connection.type);
    }
    if (options.qualifiedColumn && parsed?.kind === 'column' && connection) {
      const table = parsed.table || parsed.name;
      text = `${qualifySqlTableName(parsed.schema, table, connection.type)}.${parsed.name}`;
    }
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.notifications.showSuccess('Copied');
    } catch {
      /* ignore */
    }
  }
}

function toggleId(ids: readonly string[], id: string, expanded: boolean): string[] {
  const has = ids.includes(id);
  if (expanded && !has) {
    return [...ids, id];
  }
  if (!expanded && has) {
    return ids.filter((item) => item !== id);
  }
  return [...ids];
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function databaseCanDrop(ctx: TxTreeDropContext<DatabaseTreeNodeMeta>): boolean {
  if (ctx.position === 'inside') {
    return ctx.target.data?.kind === 'folder' || ctx.target.kind === 'folder';
  }
  return true;
}
