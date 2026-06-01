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

import { ConfigService } from '@app/core/config/config.service';
import { ImportExportDialogService } from '@app/core/import-export/import-export-dialog.service';
import { WorkspaceBundleService } from '@app/core/import-export/workspace-bundle.service';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { filterBundle } from '@shared/import-export';
import {
  buildEmptyLoadTestContextMenu,
  buildLoadTestNodeContextMenu,
} from '@app/features/shell/testing/load-test-sidebar-panel/load-test-context-menu';
import {
  buildLoadTestFilterMenuItems,
  buildLoadTestSortMenuItems,
  isLoadTestKindFilterAction,
  isLoadTestSortAction,
} from '@app/features/shell/testing/load-test-sidebar-panel/load-test-sidebar-menus';
import {
  collectLoadTestFolderIds,
  collectLoadTestFolderIdsInSubtree,
} from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.filter';
import { applyLoadTestTreeView } from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.view';
import {
  collectLoadTestArtifactIdsForDeletion,
  collectLoadTestFolderIdsFromNodes,
  collectLoadTestNodeIdsInSubtree,
  findLoadTestNode,
  isLoadTestArtifactNode,
  isLoadTestFolderNode,
  loadTestFolderHasChildren,
} from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.mutations';
import type { LoadTestTreeKind, LoadTestTreeNode, LoadTestTreeNodeMeta } from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.types';
import {
  collectFolderAncestorIds,
  testingSidebarSelectionIds,
} from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTooltipDirective } from '@app/shared/components/tx-tooltip/tx-tooltip.directive';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { applyTreeTagsVisibility } from '@app/shared/components/tx-tree/tx-tree-tags-visibility';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeDropContext,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';
import {
  DEFAULT_LOAD_TEST_SIDEBAR_FILTER,
  DEFAULT_LOAD_TEST_SIDEBAR_SORT_BY,
  type LoadTestSidebarFilter,
  type LoadTestSidebarSortBy,
} from '@shared/config';

const SESSION_PREF_DEBOUNCE_MS = 300;
const SEARCH_DEBOUNCE_MS = 100;

@Component({
  selector: 'app-load-test-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
    TxIconComponent,
    TxTooltipDirective,
  ],
  templateUrl: './load-test-sidebar-panel.component.html',
  styleUrl: './load-test-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadTestSidebarPanelComponent {
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly loadTest = inject(LoadTestService);
  private readonly workspaceBundle = inject(WorkspaceBundleService);
  private readonly importExportDialog = inject(ImportExportDialogService);
  private readonly notifier = inject(TxNotificationService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search load tests');

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(false);
  protected readonly kindFilter = signal<LoadTestSidebarFilter>(DEFAULT_LOAD_TEST_SIDEBAR_FILTER);
  protected readonly sortBy = signal<LoadTestSidebarSortBy>(DEFAULT_LOAD_TEST_SIDEBAR_SORT_BY);
  protected readonly tagFilter = signal<string[]>([]);

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);

  protected readonly filterMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuOpen = signal(false);
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });

  protected readonly renamingNodeId = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleteNodeId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  private readonly expandedSnapshotBeforeSearch = signal<string[] | null>(null);
  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly nodes = computed(() => this.loadTest.nodes());

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<LoadTestTreeNodeMeta>({
      ariaLabel: 'Load tests',
      sort: { foldersFirst: this.sortBy() === 'saved' },
      drop: {
        maxDepth: 1,
        canDrop: (ctx) => loadTestCanDrop(ctx),
      },
    }),
  );

  protected readonly filteredNodes = computed(() => {
    const filtered = applyLoadTestTreeView(this.nodes(), {
      query: this.searchQueryDebounced(),
      kindFilter: this.kindFilter(),
      sortBy: this.sortBy(),
      tagFilter: this.tagFilter(),
    });
    return applyTreeTagsVisibility(filtered, this.tagFilter().length > 0);
  });

  protected readonly filterMenuItems = computed(() =>
    buildLoadTestFilterMenuItems(
      this.kindFilter(),
      this.tagFilter(),
      this.loadTest.allTags(),
    ),
  );

  protected readonly sortMenuItems = computed(() => buildLoadTestSortMenuItems(this.sortBy()));

  protected readonly filterToolbarActive = computed(
    () => this.kindFilter() !== DEFAULT_LOAD_TEST_SIDEBAR_FILTER || this.tagFilter().length > 0,
  );

  protected readonly sortToolbarActive = computed(
    () => this.sortBy() !== DEFAULT_LOAD_TEST_SIDEBAR_SORT_BY,
  );

  protected readonly treeSelectionIds = computed(() =>
    testingSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  protected readonly treeEmptyMessage = computed(() => {
    if (this.nodes().length === 0) {
      return 'No load tests yet. Right-click to add a folder or load test.';
    }
    if (this.searchQueryDebounced().trim()) {
      return 'No load tests match your search.';
    }
    if (this.kindFilter() === 'folders') {
      return 'No folders match the current filter.';
    }
    if (this.tagFilter().length > 0) {
      return 'No load tests match the selected tags.';
    }
    if (this.kindFilter() === 'load-tests') {
      return 'No load tests match the current filter.';
    }
    return 'No load tests match the current filters.';
  });

  constructor() {
    effect(() => {
      void this.configService.sessionRevision();
      untracked(() => {
        const session = this.configService.session();
        if (!session) {
          return;
        }
        const prefs = session.workspace.testing.loadTest;
        const saved = prefs.expandedIds ?? [];
        this.expandedIds.set([...saved]);
        this.tree()?.syncExpansionFromInput(saved);
        this.kindFilter.set(prefs.kindFilter ?? DEFAULT_LOAD_TEST_SIDEBAR_FILTER);
        this.tagFilter.set([...(prefs.tagFilter ?? [])]);
        this.sortBy.set(prefs.sortBy ?? DEFAULT_LOAD_TEST_SIDEBAR_SORT_BY);
        const savedSearch = prefs.searchQuery ?? '';
        this.searchQuery.set(savedSearch);
        this.searchQueryDebounced.set(savedSearch);
        this.syncAllExpandedState();
      });
    });

    effect(() => {
      const query = this.searchQueryDebounced().trim();
      if (query) {
        if (this.expandedSnapshotBeforeSearch() === null) {
          this.expandedSnapshotBeforeSearch.set([...this.expandedIds()]);
        }
        this.applyExpandedIds(collectLoadTestFolderIdsInSubtree(this.filteredNodes()), {
          persist: false,
        });
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
      const ancestors = collectFolderAncestorIds(this.nodes(), resourceId, findLoadTestNode);
      if (ancestors.length === 0) {
        return;
      }
      this.expandedIds.update((ids) => [...new Set([...ids, ...ancestors])]);
    });

    effect(() => {
      this.loadTest.nodes();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
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
      this.schedulePersistPrefs({ searchQuery: query });
    }, SEARCH_DEBOUNCE_MS);
  }

  protected handleExpandAll(expanded: boolean): void {
    this.allExpanded.set(expanded);
    const next = expanded ? collectLoadTestFolderIds(this.nodes()) : [];
    this.applyExpandedIds(next, { persist: true });
  }

  protected handleNodesChange(next: readonly LoadTestTreeNode[]): void {
    this.loadTest.saveNodes(next);
    this.syncAllExpandedState();
    this.pruneAndPersistExpandedIds(this.expandedIds());
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.applyExpandedIds([...ids], { persist: true });
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent<LoadTestTreeNodeMeta>): void {
    if (this.renamingNodeId()) {
      return;
    }
    this.performNodeClick(event);
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent<LoadTestTreeNodeMeta>): void {
    this.startInlineRename(event.nodeId);
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.loadTest.renameNode(event.nodeId, trimmed);
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
        this.handleCreate('folder', null);
        break;
      case 'new-artifact':
        this.handleCreate('artifact', nodeId);
        break;
      case 'rename':
        if (nodeId) {
          this.startInlineRename(nodeId);
        }
        break;
      case 'delete':
        if (nodeId) {
          this.openDeleteDialog(nodeId);
        }
        break;
      case 'duplicate':
        if (nodeId) {
          const copy = this.loadTest.duplicateArtifact(nodeId);
          if (copy) {
            this.openArtifact(copy.id);
          }
        }
        break;
      case 'open':
        if (nodeId) {
          this.openArtifact(nodeId);
        }
        break;
      case 'expand':
        if (nodeId && loadTestFolderHasChildren(this.nodes(), nodeId)) {
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

  private async handleExportSelection(nodeId: string): Promise<void> {
    try {
      const ids = new Set(collectLoadTestNodeIdsInSubtree(this.nodes(), nodeId));
      const bundle = await this.workspaceBundle.buildFromAppState();
      const scoped = filterBundle(bundle, {
        sections: new Set(['loadTests']),
        loadTests: ids,
      });
      this.importExportDialog.openExport(scoped);
    } catch (e: unknown) {
      this.notifier.showError(e instanceof Error ? e.message : 'Export failed.');
    }
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
  }

  protected handleFilterToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    this.filterMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.filterMenuOpen.set(true);
  }

  protected handleFilterMenuSelect(actionId: string): void {
    this.filterMenuOpen.set(false);

    if (isLoadTestKindFilterAction(actionId)) {
      if (actionId === this.kindFilter()) {
        return;
      }
      this.kindFilter.set(actionId);
      this.schedulePersistPrefs({ kindFilter: actionId });
      return;
    }

    if (actionId.startsWith('tag:')) {
      const tag = actionId.slice('tag:'.length);
      this.tagFilter.update((current) => {
        const lower = tag.toLowerCase();
        const exists = current.some((active) => active.toLowerCase() === lower);
        const next = exists
          ? current.filter((active) => active.toLowerCase() !== lower)
          : [...current, tag];
        this.schedulePersistPrefs({ tagFilter: next });
        return next;
      });
    }
  }

  protected handleFilterMenuClosed(): void {
    this.filterMenuOpen.set(false);
  }

  protected handleSortToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    this.sortMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.sortMenuOpen.set(true);
  }

  protected handleSortMenuSelect(actionId: string): void {
    this.sortMenuOpen.set(false);
    if (!isLoadTestSortAction(actionId) || actionId === this.sortBy()) {
      return;
    }
    this.sortBy.set(actionId);
    this.schedulePersistPrefs({ sortBy: actionId });
  }

  protected handleSortMenuClosed(): void {
    this.sortMenuOpen.set(false);
  }

  protected handleDeleteConfirmed(): void {
    const id = this.deleteNodeId();
    if (!id) {
      return;
    }
    const removedIds = collectLoadTestArtifactIdsForDeletion(this.nodes(), id).map((artifactId) =>
      this.loadTest.tabResourceId(artifactId),
    );
    this.loadTest.deleteNode(id);
    this.workspaceEditor.closeTabsForResourceIds(removedIds);
    this.pruneAndPersistExpandedIds(this.expandedIds().filter((folderId) => folderId !== id));
    this.deleteOpen.set(false);
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    if (nodeId === null) {
      this.contextMenuItems.set(buildEmptyLoadTestContextMenu());
    } else {
      const loc = findLoadTestNode(this.nodes(), nodeId);
      const kind = (loc?.node.data?.kind ?? loc?.node.kind ?? 'folder') as LoadTestTreeKind;
      const expanded = this.expandedIds().includes(nodeId);
      const hasChildren = loadTestFolderHasChildren(this.nodes(), nodeId);
      const atRoot = !loc?.parent;
      this.contextMenuItems.set(
        buildLoadTestNodeContextMenu(kind, expanded, hasChildren, atRoot),
      );
    }
    this.contextMenuPosition.set({ x, y });
    this.contextMenuOpen.set(true);
  }

  private handleCreate(kind: LoadTestTreeKind, parentId: string | null): void {
    if (kind === 'folder') {
      this.loadTest.addFolder();
      return;
    }

    let resolvedParent: string | null = null;
    if (parentId) {
      const loc = findLoadTestNode(this.nodes(), parentId);
      if (loc && isLoadTestFolderNode(loc.node)) {
        resolvedParent = parentId;
      }
    }

    const artifact = this.loadTest.addArtifact(resolvedParent);
    if (resolvedParent) {
      this.setFolderExpanded(resolvedParent, true);
    }
    this.openArtifact(artifact.id);
  }

  private startInlineRename(nodeId: string): void {
    if (!findLoadTestNode(this.nodes(), nodeId)) {
      return;
    }
    this.renamingNodeId.set(nodeId);
  }

  private performNodeClick(event: TxTreeNodeClickEvent<LoadTestTreeNodeMeta>): void {
    const loc = findLoadTestNode(this.nodes(), event.nodeId);
    if (!loc) {
      return;
    }

    if (isLoadTestFolderNode(loc.node)) {
      this.toggleFolderExpanded(event.nodeId);
      return;
    }

    if (isLoadTestArtifactNode(loc.node)) {
      this.openArtifact(event.nodeId);
    }
  }

  private openArtifact(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.loadTest.tabResourceId(id),
      kind: 'load-test',
    });
  }

  private toggleFolderExpanded(folderId: string): void {
    if (!loadTestFolderHasChildren(this.nodes(), folderId)) {
      return;
    }
    const expanded = this.expandedIds().includes(folderId);
    this.setFolderExpanded(folderId, !expanded);
  }

  private openDeleteDialog(nodeId: string): void {
    const loc = findLoadTestNode(this.nodes(), nodeId);
    if (!loc) {
      return;
    }
    if (isLoadTestFolderNode(loc.node)) {
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
      this.schedulePersistPrefs({ expandedIds: next });
    }
  }

  private syncAllExpandedState(): void {
    const allFolderIds = collectLoadTestFolderIds(this.nodes());
    const ids = this.expandedIds();
    this.allExpanded.set(
      allFolderIds.length > 0 && allFolderIds.every((id) => ids.includes(id)),
    );
  }

  private schedulePersistPrefs(
    patch: Partial<{
      searchQuery: string;
      expandedIds: readonly string[];
      kindFilter: LoadTestSidebarFilter;
      sortBy: LoadTestSidebarSortBy;
      tagFilter: readonly string[];
    }>,
  ): void {
    if (this.sessionSaveTimer !== null) {
      clearTimeout(this.sessionSaveTimer);
    }
    this.sessionSaveTimer = setTimeout(() => {
      this.sessionSaveTimer = null;
      this.persistPrefs(patch);
    }, SESSION_PREF_DEBOUNCE_MS);
  }

  private persistPrefs(
    patch: Partial<{
      searchQuery: string;
      expandedIds: readonly string[];
      kindFilter: LoadTestSidebarFilter;
      sortBy: LoadTestSidebarSortBy;
      tagFilter: readonly string[];
    }>,
  ): void {
    const current = this.configService.session()?.workspace.testing.loadTest ?? {
      searchQuery: '',
      expandedIds: [],
      sortBy: DEFAULT_LOAD_TEST_SIDEBAR_SORT_BY,
      kindFilter: DEFAULT_LOAD_TEST_SIDEBAR_FILTER,
      tagFilter: [],
    };
    const expandedIds = patch.expandedIds
      ? this.pruneExpandedIds(patch.expandedIds)
      : current.expandedIds;
    void this.configService.patchSession({
      workspace: {
        testing: {
          ...this.testingSession.navigationFields(),
          loadTest: {
            ...current,
            ...patch,
            expandedIds,
            tagFilter: patch.tagFilter ? [...patch.tagFilter] : current.tagFilter,
          },
        },
      },
    });
  }

  private pruneAndPersistExpandedIds(ids: readonly string[]): void {
    const pruned = this.pruneExpandedIds(ids);
    if (pruned.length !== ids.length) {
      this.expandedIds.set(pruned);
      this.syncAllExpandedState();
    }
    if (!this.searchQuery().trim()) {
      this.schedulePersistPrefs({ expandedIds: pruned });
    }
  }

  private pruneExpandedIds(ids: readonly string[]): string[] {
    const valid = new Set(collectLoadTestFolderIdsFromNodes(this.nodes()));
    return ids.filter((id) => valid.has(id));
  }
}

function loadTestCanDrop(ctx: TxTreeDropContext<LoadTestTreeNodeMeta>): boolean {
  const sourceKind = ctx.source.data?.kind ?? ctx.source.kind;
  const targetKind = ctx.target.data?.kind ?? ctx.target.kind;

  if (ctx.position === 'inside') {
    if (targetKind !== 'folder') {
      return false;
    }
    if (sourceKind === 'folder') {
      return false;
    }
    return true;
  }

  return sourceKind !== undefined;
}
