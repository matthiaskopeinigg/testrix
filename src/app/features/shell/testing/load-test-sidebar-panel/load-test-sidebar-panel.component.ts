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
import { LoadTestService } from '@app/core/testing/load-test.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import {
  buildEmptyLoadTestContextMenu,
  buildLoadTestNodeContextMenu,
} from '@app/features/shell/testing/load-test-sidebar-panel/load-test-context-menu';
import {
  collectLoadTestFolderIds,
  collectLoadTestFolderIdsInSubtree,
  filterLoadTestTree,
} from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.filter';
import {
  collectLoadTestArtifactIdsForDeletion,
  collectLoadTestFolderIdsFromNodes,
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
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeDropContext,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';

const SESSION_EXPAND_DEBOUNCE_MS = 300;
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
  ],
  templateUrl: './load-test-sidebar-panel.component.html',
  styleUrl: './load-test-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadTestSidebarPanelComponent {
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly loadTest = inject(LoadTestService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search load tests');

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(false);

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

  protected readonly nodes = computed(() => this.loadTest.nodes());

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<LoadTestTreeNodeMeta>({
      ariaLabel: 'Load tests',
      sort: { foldersFirst: true },
      drop: {
        maxDepth: 1,
        canDrop: (ctx) => loadTestCanDrop(ctx),
      },
    }),
  );

  protected readonly filteredNodes = computed(() =>
    filterLoadTestTree(this.nodes(), this.searchQueryDebounced()),
  );

  protected readonly treeSelectionIds = computed(() =>
    testingSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  protected readonly treeEmptyMessage = computed(() =>
    this.searchQueryDebounced().trim()
      ? 'No load tests match your search.'
      : 'No load tests yet. Add a folder or load test to get started.',
  );

  constructor() {
    effect(() => {
      void this.configService.sessionRevision();
      untracked(() => {
        const session = this.configService.session();
        if (!session) {
          return;
        }
        const saved = session.workspace.testing.loadTest.expandedIds ?? [];
        this.expandedIds.set([...saved]);
        this.tree()?.syncExpansionFromInput(saved);
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

  protected handleAddFolder(): void {
    this.handleCreate('folder', null);
  }

  protected handleAddArtifact(): void {
    const artifact = this.loadTest.addArtifact(null);
    this.openArtifact(artifact.id);
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
      this.schedulePersistExpandedIds(next);
    }
  }

  private syncAllExpandedState(): void {
    const allFolderIds = collectLoadTestFolderIds(this.nodes());
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
    const session = this.configService.session();
    const currentLoadTest = session?.workspace.testing.loadTest ?? {
      searchQuery: '',
      expandedIds: [],
      sortBy: 'saved' as const,
    };
    void this.configService.patchSession({
      workspace: {
        testing: {
          ...this.testingSession.navigationFields(),
          loadTest: {
            ...currentLoadTest,
            expandedIds: pruned,
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
      this.persistExpandedIds(pruned);
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
