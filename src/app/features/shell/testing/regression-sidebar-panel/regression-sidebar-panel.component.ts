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
import { ElectronService } from '@app/core/electron/electron.service';
import { ImportExportDialogService } from '@app/core/import-export/import-export-dialog.service';
import { WorkspaceBundleService } from '@app/core/import-export/workspace-bundle.service';
import { RegressionRunRequestService } from '@app/core/testing/regression-run-request.service';
import { RegressionService } from '@app/core/testing/regression.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { filterBundle } from '@shared/import-export';
import {
  buildEmptyRegressionContextMenu,
  buildRegressionNodeContextMenu,
} from '@app/features/shell/testing/regression-sidebar-panel/regression-context-menu';
import {
  buildRegressionFilterMenuItems,
  buildRegressionSortMenuItems,
  isRegressionKindFilterAction,
  isRegressionSortAction,
} from '@app/features/shell/testing/regression-sidebar-panel/regression-sidebar-menus';
import {
  collectRegressionFolderIds,
  collectRegressionFolderIdsInSubtree,
  partitionRegressionArchived,
} from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.filter';
import { applyRegressionTreeView } from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.view';
import {
  collectRegressionFolderIdsFromNodes,
  collectRegressionNodeIdsInSubtree,
  findRegressionNode,
  isRegressionArtifactNode,
  isRegressionFolderNode,
  regressionFolderHasChildren,
} from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.mutations';
import type {
  RegressionTreeKind,
  RegressionTreeNode,
  RegressionTreeNodeMeta,
} from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.types';
import {
  collectFolderAncestorIds,
  testingSidebarSelectionIds,
} from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { applyTreeDescriptionVisibility } from '@app/shared/components/tx-tree/tx-tree-description-visibility';
import { applyTreeTagsVisibility } from '@app/shared/components/tx-tree/tx-tree-tags-visibility';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeDropContext,
  TxTreeNode,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';
import {
  DEFAULT_REGRESSION_SIDEBAR_FILTER,
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
  type RegressionSidebarFilter,
  type RegressionSidebarSortBy,
} from '@shared/config';

const SESSION_PREF_DEBOUNCE_MS = 300;
const SEARCH_DEBOUNCE_MS = 100;

type RegressionDisplayNode = TxTreeNode<RegressionTreeNodeMeta>;

@Component({
  selector: 'app-regression-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
    TxIconComponent,
  ],
  templateUrl: './regression-sidebar-panel.component.html',
  styleUrl: './regression-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegressionSidebarPanelComponent {
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly regression = inject(RegressionService);
  private readonly runRequest = inject(RegressionRunRequestService);
  private readonly electron = inject(ElectronService);
  private readonly workspaceBundle = inject(WorkspaceBundleService);
  private readonly importExportDialog = inject(ImportExportDialogService);
  private readonly notifier = inject(TxNotificationService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);
  private readonly archiveTree = viewChild<TxTreeComponent>('archiveTree');

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search regressions');

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly archiveExpandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(false);
  protected readonly archiveSectionExpanded = signal(false);
  protected readonly kindFilter = signal<RegressionSidebarFilter>(DEFAULT_REGRESSION_SIDEBAR_FILTER);
  protected readonly sortBy = signal<RegressionSidebarSortBy>(DEFAULT_REGRESSION_SIDEBAR_SORT_BY);
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

  protected readonly nodes = computed(() => this.regression.nodes());

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<RegressionTreeNodeMeta>({
      ariaLabel: 'Regressions',
      sort: { foldersFirst: this.sortBy() === 'saved' },
      drop: {
        maxDepth: 1,
        canDrop: (ctx) => regressionCanDrop(ctx),
      },
    }),
  );

  protected readonly partitionedNodes = computed(() => partitionRegressionArchived(this.nodes()));

  private decorateNodes(list: readonly RegressionTreeNode[]): RegressionDisplayNode[] {
    const prefs = this.configService.session()?.workspace.testing.regression;
    const showDescriptions = prefs?.showDescriptions ?? false;
    const next = applyRegressionTreeView(list, {
      query: this.searchQueryDebounced(),
      kindFilter: this.kindFilter(),
      sortBy: this.sortBy(),
      tagFilter: this.tagFilter(),
    });
    const display = next as RegressionDisplayNode[];
    const withStatus = this.applyRunStatusIndicators(display);
    const withDescriptions = applyTreeDescriptionVisibility(withStatus, showDescriptions);
    return applyTreeTagsVisibility(withDescriptions, this.tagFilter().length > 0);
  }

  protected readonly filteredNodes = computed((): RegressionDisplayNode[] =>
    this.decorateNodes(this.partitionedNodes().active),
  );

  protected readonly archivedFilteredNodes = computed((): RegressionDisplayNode[] =>
    this.decorateNodes(this.partitionedNodes().archived),
  );

  protected readonly archivedCount = computed(() => this.partitionedNodes().archived.length);

  protected readonly filterMenuItems = computed(() =>
    buildRegressionFilterMenuItems(
      this.kindFilter(),
      this.tagFilter(),
      this.regression.allTags(),
    ),
  );

  protected readonly sortMenuItems = computed(() => buildRegressionSortMenuItems(this.sortBy()));

  protected readonly filterToolbarActive = computed(
    () => this.kindFilter() !== DEFAULT_REGRESSION_SIDEBAR_FILTER || this.tagFilter().length > 0,
  );

  protected readonly sortToolbarActive = computed(
    () => this.sortBy() !== DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
  );

  protected readonly emptyStateMessage = computed(() => this.resolveEmptyMessage('active'));

  protected readonly archiveEmptyMessage = computed(() => this.resolveEmptyMessage('archive'));

  private resolveEmptyMessage(section: 'active' | 'archive'): string {
    if (this.nodes().length === 0) {
      return 'No regressions yet.';
    }
    if (this.searchQueryDebounced().trim()) {
      return 'No regressions match your search.';
    }
    if (this.tagFilter().length > 0) {
      return 'No regressions match the selected tags.';
    }
    if (this.kindFilter() === 'folders') {
      return 'No folders match the current filter.';
    }
    if (this.kindFilter() === 'regressions') {
      return 'No regressions match the current filter.';
    }
    return section === 'archive' ? 'No archived regressions match.' : 'No active regressions.';
  }

  protected readonly treeSelectionIds = computed(() =>
    testingSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  constructor() {
    effect(() => {
      void this.configService.sessionRevision();
      untracked(() => {
        const session = this.configService.session();
        if (!session) {
          return;
        }
        const prefs = session.workspace.testing.regression;
        const savedExpanded = prefs.expandedIds ?? [];
        this.expandedIds.set([...savedExpanded]);
        this.tree()?.syncExpansionFromInput(savedExpanded);
        this.archiveSectionExpanded.set(prefs.archiveExpanded ?? prefs.showArchived ?? false);
        this.tagFilter.set([...(prefs.tagFilter ?? [])]);
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
        this.applyExpandedIds(
          collectRegressionFolderIdsInSubtree(this.filteredNodes() as RegressionTreeNode[]),
          { persist: false },
        );
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
      const ancestors = collectFolderAncestorIds(this.nodes(), resourceId, findRegressionNode);
      if (ancestors.length === 0) {
        return;
      }
      this.expandedIds.update((ids) => [...new Set([...ids, ...ancestors])]);
    });

    effect(() => {
      this.regression.nodes();
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
    const next = expanded ? collectRegressionFolderIds(this.nodes()) : [];
    this.applyExpandedIds(next, { persist: true });
  }

  protected handleNodesChange(next: readonly RegressionDisplayNode[]): void {
    this.regression.saveNodes(next as readonly RegressionTreeNode[]);
    this.syncAllExpandedState();
    this.pruneAndPersistExpandedIds(this.expandedIds());
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.applyExpandedIds([...ids], { persist: true });
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent<RegressionTreeNodeMeta>): void {
    if (this.renamingNodeId()) {
      return;
    }
    this.performNodeClick(event);
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent<RegressionTreeNodeMeta>): void {
    this.startInlineRename(event.nodeId);
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.regression.renameNode(event.nodeId, trimmed);
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
          const copy = this.regression.duplicateArtifact(nodeId);
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
      case 'run':
        if (nodeId) {
          this.runRegression(nodeId);
        }
        break;
      case 'archive':
        if (nodeId) {
          this.regression.archive(nodeId);
        }
        break;
      case 'restore':
        if (nodeId) {
          this.regression.restore(nodeId);
        }
        break;
      case 'expand':
        if (nodeId && regressionFolderHasChildren(this.nodes(), nodeId)) {
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
      const ids = new Set(collectRegressionNodeIdsInSubtree(this.nodes(), nodeId));
      const bundle = await this.workspaceBundle.buildFromAppState();
      const scoped = filterBundle(bundle, {
        sections: new Set(['regressions']),
        regressions: ids,
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

  protected handleSortToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    this.sortMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.sortMenuOpen.set(true);
  }

  protected handleSortMenuSelect(actionId: string): void {
    this.sortMenuOpen.set(false);
    if (!isRegressionSortAction(actionId) || actionId === this.sortBy()) {
      return;
    }
    this.sortBy.set(actionId);
    this.schedulePersistPrefs({ sortBy: actionId });
  }

  protected handleSortMenuClosed(): void {
    this.sortMenuOpen.set(false);
  }

  protected handleFilterMenuSelect(actionId: string): void {
    this.filterMenuOpen.set(false);

    if (isRegressionKindFilterAction(actionId)) {
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

  protected handleDeleteConfirmed(): void {
    const id = this.deleteNodeId();
    if (!id) {
      return;
    }
    const artifactIds = this.regression.deleteNode(id);
    const removedIds = artifactIds.map((artifactId) => this.regression.tabResourceId(artifactId));
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
      this.contextMenuItems.set(buildEmptyRegressionContextMenu());
    } else {
      const loc = findRegressionNode(this.nodes(), nodeId);
      const kind = (loc?.node.data?.kind ?? loc?.node.kind ?? 'folder') as RegressionTreeKind;
      const expanded = this.expandedIds().includes(nodeId);
      const hasChildren = regressionFolderHasChildren(this.nodes(), nodeId);
      const atRoot = !loc?.parent;
      const archived = this.regression.isArchived(nodeId);
      this.contextMenuItems.set(
        buildRegressionNodeContextMenu(kind, expanded, hasChildren, atRoot, archived),
      );
    }
    this.contextMenuPosition.set({ x, y });
    this.contextMenuOpen.set(true);
  }

  private handleCreate(kind: RegressionTreeKind, parentId: string | null): void {
    if (kind === 'folder') {
      this.regression.addFolder();
      return;
    }

    let resolvedParent: string | null = null;
    if (parentId) {
      const loc = findRegressionNode(this.nodes(), parentId);
      if (loc && isRegressionFolderNode(loc.node)) {
        resolvedParent = parentId;
      }
    }

    const artifact = this.regression.addArtifact(resolvedParent);
    if (resolvedParent) {
      this.setFolderExpanded(resolvedParent, true);
    }
    this.openArtifact(artifact.id);
  }

  private startInlineRename(nodeId: string): void {
    if (!findRegressionNode(this.nodes(), nodeId)) {
      return;
    }
    this.renamingNodeId.set(nodeId);
  }

  private performNodeClick(event: TxTreeNodeClickEvent<RegressionTreeNodeMeta>): void {
    const loc = findRegressionNode(this.nodes(), event.nodeId);
    if (!loc) {
      return;
    }

    if (isRegressionFolderNode(loc.node)) {
      this.toggleFolderExpanded(event.nodeId);
      return;
    }

    if (isRegressionArtifactNode(loc.node)) {
      this.openArtifact(event.nodeId);
    }
  }

  private openArtifact(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.regression.tabResourceId(id),
      kind: 'regression',
    });
  }

  private runRegression(nodeId: string): void {
    if (this.regression.isArchived(nodeId)) {
      return;
    }
    this.openArtifact(nodeId);
    this.runRequest.request({ regressionId: nodeId, openResults: true });
  }

  protected handleToggleArchiveSection(): void {
    const next = !this.archiveSectionExpanded();
    this.archiveSectionExpanded.set(next);
    this.schedulePersistPrefs({ archiveExpanded: next });
  }

  protected handleArchiveExpandedChange(ids: readonly string[]): void {
    this.archiveExpandedIds.set([...ids]);
  }

  private applyRunStatusIndicators(nodes: readonly RegressionDisplayNode[]): RegressionDisplayNode[] {
    return nodes.map((node) => {
      const status = node.data?.lastRunStatus;
      const children = node.children?.length
        ? this.applyRunStatusIndicators(node.children as RegressionDisplayNode[])
        : undefined;
      if (!status || node.data?.kind !== 'artifact') {
        return { ...node, children };
      }
      return {
        ...node,
        children,
        critical: status === 'failed' ? true : node.critical,
        tags: [...(node.tags ?? []), status === 'passed' ? '✓ passed' : status === 'failed' ? '✗ failed' : status],
      };
    });
  }

  private toggleFolderExpanded(folderId: string): void {
    if (!regressionFolderHasChildren(this.nodes(), folderId)) {
      return;
    }
    const expanded = this.expandedIds().includes(folderId);
    this.setFolderExpanded(folderId, !expanded);
  }

  private openDeleteDialog(nodeId: string): void {
    const loc = findRegressionNode(this.nodes(), nodeId);
    if (!loc) {
      return;
    }
    if (isRegressionFolderNode(loc.node)) {
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
      this.schedulePersistPrefs({ expandedIds: this.pruneExpandedIds(next) });
    }
  }

  private syncAllExpandedState(): void {
    const allFolderIds = collectRegressionFolderIds(this.nodes());
    const ids = this.expandedIds();
    this.allExpanded.set(
      allFolderIds.length > 0 && allFolderIds.every((id) => ids.includes(id)),
    );
  }

  private schedulePersistPrefs(
    patch: Partial<{
      searchQuery: string;
      expandedIds: readonly string[];
      archiveExpanded: boolean;
      kindFilter: RegressionSidebarFilter;
      sortBy: RegressionSidebarSortBy;
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
      archiveExpanded: boolean;
      kindFilter: RegressionSidebarFilter;
      sortBy: RegressionSidebarSortBy;
      tagFilter: readonly string[];
    }>,
  ): void {
    const session = this.configService.session();
    const currentRegression = session?.workspace.testing.regression ?? {
      searchQuery: '',
      expandedIds: [],
      sortBy: DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
      archiveExpanded: false,
      kindFilter: DEFAULT_REGRESSION_SIDEBAR_FILTER,
      tagFilter: [],
      showDescriptions: false,
    };
    void this.configService.patchSession({
      workspace: {
        testing: {
          ...this.testingSession.navigationFields(),
          regression: {
            ...currentRegression,
            ...patch,
            expandedIds: patch.expandedIds
              ? this.pruneExpandedIds(patch.expandedIds)
              : currentRegression.expandedIds,
            tagFilter: patch.tagFilter ? [...patch.tagFilter] : currentRegression.tagFilter,
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
    const valid = new Set(collectRegressionFolderIdsFromNodes(this.nodes()));
    return ids.filter((id) => valid.has(id));
  }
}

function regressionCanDrop(ctx: TxTreeDropContext<RegressionTreeNodeMeta>): boolean {
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
