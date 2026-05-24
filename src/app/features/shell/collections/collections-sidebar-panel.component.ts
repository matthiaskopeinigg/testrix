import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  coerceCollectionFolderClickBehavior,
  DEFAULT_COLLECTION_FOLDER_CLICK_BEHAVIOR,
  DEFAULT_COLLECTION_LIST_SIDEBAR_FILTER,
  DEFAULT_COLLECTION_LIST_SIDEBAR_SORT_BY,
  resolveCollectionFolderClickAction,
  type CollectionListSidebarFilter,
  type CollectionListSidebarSortBy,
  type HttpMethodId,
} from '@shared/config';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ImportExportDialogService } from '@app/core/import-export/import-export-dialog.service';
import { WorkspaceBundleService } from '@app/core/import-export/workspace-bundle.service';
import { filterBundle } from '@shared/import-export';
import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeDropContext,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';
import { WorkspacePanelToolbarActionsDirective } from '@app/features/shell/workspace/workspace-panel-toolbar-actions.directive';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import {
  collectFolderAncestorIds,
  collectionsSidebarSelectionIds,
} from '@app/features/shell/workspace/workspace-sidebar-selection';

import {
  buildCollectionNodeContextMenu,
  buildEmptyCollectionContextMenu,
} from './collection-context-menu';
import {
  buildCollectionListFilterMenuItems,
  buildCollectionListSortMenuItems,
  isCollectionListKindFilterAction,
} from './collection-list-sidebar-menus';
import { collectAllCollectionTreeTags } from './collection-tree.tags';
import { collectFolderIds, collectFolderIdsInSubtree } from './collection-tree.expand';
import { applyCollectionTreeView } from './collection-tree.view';
import {
  collectCollectionNodeIdsForDeletion,
  collectFolderIdsFromNodes,
  collectionFolderHasChildren,
  findCollectionNode,
} from './collection-tree.mutations';
import type { CollectionTreeKind, CollectionTreeNode, CollectionTreeNodeMeta } from './collection-tree.types';

const SESSION_EXPAND_DEBOUNCE_MS = 300;
const SEARCH_DEBOUNCE_MS = 100;
const LARGE_TREE_NODE_THRESHOLD = 40;

function countCollectionTreeNodes(nodes: readonly CollectionTreeNode[]): number {
  let total = 0;
  const walk = (list: readonly CollectionTreeNode[]): void => {
    for (const node of list) {
      total += 1;
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return total;
}

@Component({
  selector: 'app-collections-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    WorkspacePanelToolbarActionsDirective,
    TxIconComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './collections-sidebar-panel.component.html',
  styleUrl: './collections-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsSidebarPanelComponent {
  private readonly configService = inject(ConfigService);
  private readonly collectionsService = inject(CollectionsService);
  private readonly workspaceBundle = inject(WorkspaceBundleService);
  private readonly importExportDialog = inject(ImportExportDialogService);
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(TxNotificationService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search collections');

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  protected readonly listSidebarFilter = signal<CollectionListSidebarFilter>(
    DEFAULT_COLLECTION_LIST_SIDEBAR_FILTER,
  );
  protected readonly listSidebarSortBy = signal<CollectionListSidebarSortBy>(
    DEFAULT_COLLECTION_LIST_SIDEBAR_SORT_BY,
  );
  protected readonly tagFilter = signal<string[]>([]);
  protected readonly methodFilter = signal<HttpMethodId[]>([]);
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(false);

  protected readonly filterMenuOpen = signal(false);
  protected readonly sortMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);

  protected readonly renamingNodeId = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleteNodeId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  private readonly expandedSnapshotBeforeSearch = signal<string[] | null>(null);
  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly nodes = computed(() => this.collectionsService.nodes());

  protected readonly allCollectionTags = computed(() => collectAllCollectionTreeTags(this.nodes()));

  protected readonly filterMenuItems = computed(() =>
    buildCollectionListFilterMenuItems(
      this.listSidebarFilter(),
      this.tagFilter(),
      this.allCollectionTags(),
      this.methodFilter(),
    ),
  );

  protected readonly sortMenuItems = computed(() =>
    buildCollectionListSortMenuItems(this.listSidebarSortBy()),
  );

  protected readonly filterToolbarActive = computed(
    () =>
      this.listSidebarFilter() !== DEFAULT_COLLECTION_LIST_SIDEBAR_FILTER ||
      this.tagFilter().length > 0 ||
      this.methodFilter().length > 0,
  );

  protected readonly sortToolbarActive = computed(
    () => this.listSidebarSortBy() !== DEFAULT_COLLECTION_LIST_SIDEBAR_SORT_BY,
  );

  protected readonly treeConfig = computed(() => {
    const collections = this.configService.settings()?.collections;
    const largeTree =
      countCollectionTreeNodes(this.filteredNodes()) > LARGE_TREE_NODE_THRESHOLD;
    const nameSort = this.listSidebarSortBy() === 'name';
    return mergeTxTreeConfig<CollectionTreeNodeMeta>({
      ariaLabel: 'Collections',
      expansion: {
        expandFolderOnDrag: collections?.expandFolderOnDrag ?? false,
        expandFolderOnDrop: false,
        expandOnClick: false,
      },
      visual: {
        showDragHandle: false,
        animateMove: largeTree ? false : (collections?.animateMove ?? true),
        animateExpand: largeTree ? false : (collections?.animateExpand ?? true),
      },
      sort: {
        siblingSort: nameSort ? 'manual' : (collections?.siblingSort ?? 'orderThenPriority'),
        foldersFirst: collections?.foldersFirst ?? true,
      },
      drag: { handleOnly: false },
      drop: {
        canDrop: (ctx: TxTreeDropContext<CollectionTreeNodeMeta>) => collectionsCanDrop(ctx),
      },
    });
  });

  protected readonly filteredNodes = computed(() => {
    const collections = this.configService.settings()?.collections;
    return applyCollectionTreeView(this.nodes(), {
      query: this.searchQueryDebounced(),
      filter: this.listSidebarFilter(),
      sortBy: this.listSidebarSortBy(),
      tagFilter: this.tagFilter(),
      methodFilter: this.methodFilter(),
      showDescriptions: collections?.showDescriptions ?? true,
      showTags: (collections?.showTags ?? false) || this.tagFilter().length > 0,
      displayHttpMethod: collections?.displayHttpMethod ?? 'tree-and-tab',
    });
  });

  protected readonly treeSelectionIds = computed(() =>
    collectionsSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  protected readonly hasFolders = computed(() => collectFolderIds(this.nodes()).length > 0);

  protected readonly treeEmptyMessage = computed(() => {
    if (this.searchQueryDebounced().trim()) {
      return 'No items match your search.';
    }
    if (this.listSidebarFilter() === 'favourites') {
      return 'No favourites yet. Right-click an item and choose Add to favourites.';
    }
    if (this.listSidebarFilter() === 'folders') {
      return 'No folders in this collection.';
    }
    if (this.listSidebarFilter() === 'requests') {
      return 'No HTTP requests in this collection.';
    }
    if (this.listSidebarFilter() === 'websockets') {
      return 'No WebSockets in this collection.';
    }
    if (this.tagFilter().length > 0) {
      return 'No items match the selected tags.';
    }
    if (this.listSidebarFilter() === 'requests' && this.methodFilter().length > 0) {
      return 'No requests match the selected HTTP methods.';
    }
    return 'No collections yet. Right-click to create one.';
  });

  constructor() {
    effect(() => {
      void this.configService.sessionRevision();
      untracked(() => {
        const session = this.configService.session();
        if (!session) {
          return;
        }
        const collectionsSession = session.workspace.collections;
        const saved = collectionsSession.expandedFolderIds ?? [];
        this.expandedIds.set([...saved]);
        this.tree()?.syncExpansionFromInput(saved);
        this.syncAllExpandedState();
        this.listSidebarFilter.set(
          collectionsSession.listSidebarFilter ?? DEFAULT_COLLECTION_LIST_SIDEBAR_FILTER,
        );
        this.listSidebarSortBy.set(
          collectionsSession.listSidebarSortBy ?? DEFAULT_COLLECTION_LIST_SIDEBAR_SORT_BY,
        );
        this.tagFilter.set([...(collectionsSession.listSidebarTagFilter ?? [])]);
        this.methodFilter.set([...(collectionsSession.listSidebarMethodFilter ?? [])]);
      });
    });

    effect(() => {
      const query = this.searchQueryDebounced().trim();
      if (query) {
        if (this.expandedSnapshotBeforeSearch() === null) {
          this.expandedSnapshotBeforeSearch.set([...this.expandedIds()]);
        }
        this.applyExpandedIds(collectFolderIdsInSubtree(this.filteredNodes()), { persist: false });
        return;
      }

      const snapshot = this.expandedSnapshotBeforeSearch();
      if (snapshot !== null) {
        this.expandedSnapshotBeforeSearch.set(null);
        this.applyExpandedIds(snapshot, { persist: false });
      }
    });

    effect(() => {
      const resourceId = this.treeSelectionIds()[0];
      if (!resourceId || this.searchQuery().trim()) {
        return;
      }
      const ancestors = collectFolderAncestorIds(this.nodes(), resourceId, findCollectionNode);
      if (ancestors.length === 0) {
        return;
      }
      this.expandedIds.update((ids) => [...new Set([...ids, ...ancestors])]);
    });
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.searchQueryDebounced.set(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected handleFilterToolbarClick(event: MouseEvent): void {
    this.sortMenuOpen.set(false);
    this.openToolbarMenu(event, this.filterMenuPosition, this.filterMenuOpen);
  }

  protected handleSortToolbarClick(event: MouseEvent): void {
    this.filterMenuOpen.set(false);
    this.openToolbarMenu(event, this.sortMenuPosition, this.sortMenuOpen);
  }

  protected handleFilterMenuSelect(actionId: string): void {
    if (actionId.startsWith('tag:')) {
      const tag = actionId.slice('tag:'.length);
      this.tagFilter.update((current) => {
        const lower = tag.toLowerCase();
        const exists = current.some((active) => active.toLowerCase() === lower);
        const next = exists
          ? current.filter((active) => active.toLowerCase() !== lower)
          : [...current, tag];
        this.persistListSidebarViewPrefs({ tagFilter: next });
        return next;
      });
      return;
    }

    if (actionId.startsWith('method:')) {
      const method = actionId.slice('method:'.length) as HttpMethodId;
      this.methodFilter.update((current) => {
        const exists = current.includes(method);
        const next = exists ? current.filter((entry) => entry !== method) : [...current, method];
        this.persistListSidebarViewPrefs({ methodFilter: next });
        return next;
      });
      return;
    }

    if (!isCollectionListKindFilterAction(actionId)) {
      return;
    }

    this.filterMenuOpen.set(false);
    if (actionId === this.listSidebarFilter()) {
      return;
    }
    this.listSidebarFilter.set(actionId);
    if (actionId !== 'requests') {
      this.methodFilter.set([]);
    }
    this.persistListSidebarViewPrefs(
      actionId !== 'requests' ? { listSidebarFilter: actionId, methodFilter: [] } : { listSidebarFilter: actionId },
    );
  }

  protected handleSortMenuSelect(actionId: string): void {
    this.sortMenuOpen.set(false);
    const next = actionId as CollectionListSidebarSortBy;
    if (next === this.listSidebarSortBy()) {
      return;
    }
    this.listSidebarSortBy.set(next);
    this.persistListSidebarViewPrefs();
  }

  protected handleFilterMenuClosed(): void {
    this.filterMenuOpen.set(false);
  }

  protected handleSortMenuClosed(): void {
    this.sortMenuOpen.set(false);
  }

  protected handleExpandAll(expanded: boolean): void {
    this.allExpanded.set(expanded);
    const next = expanded ? collectFolderIds(this.nodes()) : [];
    this.applyExpandedIds(next, { persist: true });
  }

  protected handleNodesChange(next: readonly CollectionTreeNode[]): void {
    this.collectionsService.saveNodes(next);
    this.syncAllExpandedState();
    this.pruneAndPersistExpandedIds(this.expandedIds());
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.applyExpandedIds([...ids], { persist: true });
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent<CollectionTreeNodeMeta>): void {
    if (this.renamingNodeId()) {
      return;
    }
    this.performNodeClick(event);
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent<CollectionTreeNodeMeta>): void {
    this.startInlineRename(event.nodeId);
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.collectionsService.renameNode(event.nodeId, trimmed);
    }
    this.renamingNodeId.set(null);
  }

  protected handleRenameCancel(): void {
    this.renamingNodeId.set(null);
  }

  protected handleTreeAreaContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.tx-tree-row-host, .tx-tree-row, .tx-tree__custom-row')) {
      return;
    }
    event.preventDefault();
    this.openContextMenu(event.clientX, event.clientY, null);
  }

  protected handleRowContextMenu(event: TxTreeRowContextMenuEvent): void {
    this.openContextMenu(event.clientX, event.clientY, event.nodeId);
  }

  protected handleContextMenuSelect(actionId: string): void {
    const nodeId = this.contextNodeId();
    this.contextMenuOpen.set(false);

    switch (actionId) {
      case 'new-folder':
        this.handleCreate('folder', nodeId);
        break;
      case 'new-request':
        this.handleCreate('request', nodeId);
        break;
      case 'new-websocket':
        this.handleCreate('websocket', nodeId);
        break;
      case 'rename':
        if (nodeId) {
          this.startInlineRename(nodeId);
        }
        break;
      case 'edit-description':
        if (nodeId) {
          this.workspaceEditor.openResource({ resourceId: nodeId, kind: 'folder' });
        }
        break;
      case 'delete':
        if (nodeId) {
          this.openDeleteDialog(nodeId);
        }
        break;
      case 'duplicate':
        if (nodeId) {
          this.collectionsService.duplicateNode(nodeId);
        }
        break;
      case 'open':
        if (nodeId) {
          this.openCollectionItem(nodeId);
        }
        break;
      case 'toggle-favourite':
        if (nodeId) {
          this.collectionsService.toggleFavourite(nodeId);
        }
        break;
      case 'expand':
        if (nodeId && collectionFolderHasChildren(this.nodes(), nodeId)) {
          this.setFolderExpanded(nodeId, true);
        }
        break;
      case 'export-selection':
        if (nodeId) {
          void this.handleExportSelection(nodeId);
        }
        break;
    }
  }

  private async handleExportSelection(nodeId: string | undefined): Promise<void> {
    if (!nodeId) {
      return;
    }
    try {
      const ids = new Set(collectCollectionNodeIdsForDeletion(this.nodes(), nodeId));
      const bundle = await this.workspaceBundle.buildFromAppState();
      const scoped = filterBundle(bundle, {
        sections: new Set(['collections']),
        collectionItems: ids,
      });
      this.importExportDialog.openExport(scoped);
    } catch (e: unknown) {
      this.notifier.showError(e instanceof Error ? e.message : 'Export failed.');
    }
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
  }

  protected handleDeleteConfirmed(): void {
    const id = this.deleteNodeId();
    if (!id) {
      return;
    }
    const removedIds = collectCollectionNodeIdsForDeletion(this.nodes(), id);
    if (this.collectionsService.deleteNode(id)) {
      this.workspaceEditor.closeTabsForResourceIds(removedIds);
    }
    this.pruneAndPersistExpandedIds(this.expandedIds().filter((folderId) => folderId !== id));
    this.deleteOpen.set(false);
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    if (nodeId === null) {
      this.contextMenuItems.set(buildEmptyCollectionContextMenu());
    } else {
      const loc = findCollectionNode(this.nodes(), nodeId);
      const kind = (loc?.node.data?.kind ?? loc?.node.kind ?? 'folder') as CollectionTreeKind;
      const expanded = this.expandedIds().includes(nodeId);
      const hasChildren = collectionFolderHasChildren(this.nodes(), nodeId);
      const favourite = loc?.node.favourite === true;
      this.contextMenuItems.set(
        buildCollectionNodeContextMenu(kind, expanded, hasChildren, favourite),
      );
    }
    this.contextMenuPosition.set({ x, y });
    this.contextMenuOpen.set(true);
  }

  private handleCreate(kind: CollectionTreeKind, parentId: string | null): void {
    const resolvedParent = parentId;
    let createdId: string | null = null;

    if (kind === 'folder') {
      createdId = this.collectionsService.createFolder(resolvedParent);
    } else if (kind === 'request') {
      createdId = this.collectionsService.createRequest(resolvedParent);
    } else {
      createdId = this.collectionsService.createWebsocket(resolvedParent);
    }

    if (resolvedParent && createdId) {
      this.setFolderExpanded(resolvedParent, true);
    }
  }

  private startInlineRename(nodeId: string): void {
    if (!findCollectionNode(this.nodes(), nodeId)) {
      return;
    }
    this.renamingNodeId.set(nodeId);
  }

  private performNodeClick(event: TxTreeNodeClickEvent<CollectionTreeNodeMeta>): void {
    this.openCollectionItem(event.nodeId, { respectFolderClickBehavior: true });
  }

  /** Opens a collection item in the workspace editor (context menu always opens the tab). */
  private openCollectionItem(
    nodeId: string,
    options: { readonly respectFolderClickBehavior?: boolean } = {},
  ): void {
    const loc = findCollectionNode(this.nodes(), nodeId);
    const kind = (loc?.node.data?.kind ?? loc?.node.kind) as CollectionTreeKind | undefined;

    if (kind === 'request') {
      this.workspaceEditor.openResource({ resourceId: nodeId, kind: 'request' });
      return;
    }

    if (kind === 'websocket') {
      this.workspaceEditor.openResource({ resourceId: nodeId, kind: 'websocket' });
      return;
    }

    if (kind === 'folder') {
      if (options.respectFolderClickBehavior) {
        this.handleFolderClick(nodeId);
        return;
      }
      this.workspaceEditor.openResource({ resourceId: nodeId, kind: 'folder' });
    }
  }

  private handleFolderClick(nodeId: string): void {
    const behavior = coerceCollectionFolderClickBehavior(
      this.configService.settings()?.collections.folderClickBehavior ??
        DEFAULT_COLLECTION_FOLDER_CLICK_BEHAVIOR,
    );
    const action = resolveCollectionFolderClickAction(
      behavior,
      this.expandedIds().includes(nodeId),
    );

    if (action.openTab) {
      this.workspaceEditor.openResource({ resourceId: nodeId, kind: 'folder' });
    }
    if (
      action.setExpanded !== undefined &&
      collectionFolderHasChildren(this.nodes(), nodeId)
    ) {
      this.setFolderExpanded(nodeId, action.setExpanded);
    }
  }

  private openDeleteDialog(nodeId: string): void {
    const loc = findCollectionNode(this.nodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = loc.node.data?.kind ?? loc.node.kind;
    if (kind === 'folder') {
      this.deleteMessage.set(
        `Delete folder "${loc.node.label}" and everything inside it? This cannot be undone.`,
      );
    } else {
      this.deleteMessage.set(`Delete "${loc.node.label}"? This cannot be undone.`);
    }
    this.deleteNodeId.set(nodeId);
    this.deleteOpen.set(true);
  }

  private setFolderExpanded(folderId: string, expanded: boolean): void {
    const current = new Set(this.expandedIds());
    if (expanded) {
      current.add(folderId);
    } else {
      current.delete(folderId);
    }
    this.applyExpandedIds([...current], { persist: !this.searchQuery().trim() });
  }

  private applyExpandedIds(next: readonly string[], options: { readonly persist: boolean }): void {
    this.expandedIds.set([...next]);
    this.tree()?.syncExpansionFromInput(next);
    this.syncAllExpandedState();
    this.cdr.markForCheck();
    if (options.persist) {
      this.schedulePersistExpandedIds(next);
    }
  }

  private syncAllExpandedState(): void {
    const allFolderIds = collectFolderIds(this.nodes());
    const ids = this.expandedIds();
    this.allExpanded.set(
      allFolderIds.length > 0 && allFolderIds.every((id) => ids.includes(id)),
    );
  }

  private schedulePersistExpandedIds(ids: readonly string[]): void {
    if (this.sessionSaveTimer !== null) {
      clearTimeout(this.sessionSaveTimer);
    }
    this.sessionSaveTimer = setTimeout(() => {
      this.sessionSaveTimer = null;
      this.persistExpandedIds(ids);
    }, SESSION_EXPAND_DEBOUNCE_MS);
  }

  private persistExpandedIds(ids: readonly string[]): void {
    const pruned = this.pruneExpandedIds(ids);
    void this.configService.patchSession({
      workspace: { collections: { expandedFolderIds: pruned } },
    });
  }

  private pruneAndPersistExpandedIds(ids: readonly string[]): void {
    const pruned = this.pruneExpandedIds(ids);
    if (pruned.length !== ids.length) {
      this.expandedIds.set(pruned);
      this.syncAllExpandedState();
    }
    if (!this.searchQuery().trim()) {
      this.persistExpandedIds(pruned);
    }
  }

  private pruneExpandedIds(ids: readonly string[]): string[] {
    const valid = new Set(collectFolderIdsFromNodes(this.nodes()));
    return ids.filter((id) => valid.has(id));
  }

  private persistListSidebarViewPrefs(
    patch: Partial<{
      listSidebarFilter: CollectionListSidebarFilter;
      listSidebarSortBy: CollectionListSidebarSortBy;
      tagFilter: string[];
      methodFilter: HttpMethodId[];
    }> = {},
  ): void {
    void this.configService.patchSession({
      workspace: {
        collections: {
          listSidebarFilter: patch.listSidebarFilter ?? this.listSidebarFilter(),
          listSidebarSortBy: patch.listSidebarSortBy ?? this.listSidebarSortBy(),
          listSidebarTagFilter: patch.tagFilter ?? this.tagFilter(),
          listSidebarMethodFilter: patch.methodFilter ?? this.methodFilter(),
        },
      },
    });
  }

  private openToolbarMenu(
    event: MouseEvent,
    positionSignal: { set(value: { x: number; y: number }): void },
    openSignal: { set(value: boolean): void },
  ): void {
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    if (rect) {
      positionSignal.set({ x: rect.left, y: rect.bottom + 4 });
    } else {
      positionSignal.set({ x: event.clientX, y: event.clientY });
    }
    openSignal.set(true);
  }
}

function collectionTreeKind(
  node: TxTreeDropContext<CollectionTreeNodeMeta>['target'],
): CollectionTreeKind | undefined {
  const kind = node.data?.kind ?? node.kind;
  if (kind === 'folder' || kind === 'request' || kind === 'websocket') {
    return kind;
  }
  return undefined;
}

function collectionsCanDrop(ctx: TxTreeDropContext<CollectionTreeNodeMeta>): boolean {
  if (ctx.position === 'inside') {
    return collectionTreeKind(ctx.target) === 'folder';
  }
  return collectionTreeKind(ctx.source) !== undefined;
}
