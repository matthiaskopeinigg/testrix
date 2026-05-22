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

import { TEST_SUITE_MAX_FOLDER_DEPTH } from '@shared/testing';
import { testSuiteTabResourceId } from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import {
  collectFolderAncestorIds,
  testingSidebarSelectionIds,
} from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { applyTreeDescriptionVisibility } from '@app/shared/components/tx-tree/tx-tree-description-visibility';
import { applyTreeTagsVisibility } from '@app/shared/components/tx-tree/tx-tree-tags-visibility';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';

import {
  buildEmptyTestSuiteContextMenu,
  buildTestSuiteNodeContextMenu,
} from './test-suite-context-menu';
import {
  collectTestSuiteFolderIds,
  collectTestSuiteFolderIdsInSubtree,
  filterTestSuiteTree,
} from './test-suite-tree.filter';
import {
  collectTestSuiteFlowIdsForDeletion,
  findTestSuiteNode,
  testSuiteFolderHasChildren,
  wouldExceedTestSuiteFolderDepth,
} from './test-suite-tree.mutations';
import type { TestSuiteTreeKind, TestSuiteTreeNode, TestSuiteTreeNodeMeta } from './test-suite-tree.types';

const SESSION_EXPAND_DEBOUNCE_MS = 300;
const SEARCH_DEBOUNCE_MS = 100;

@Component({
  selector: 'app-test-suite-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
    TxIconComponent,
  ],
  templateUrl: './test-suite-sidebar-panel.component.html',
  styleUrl: './test-suite-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestSuiteSidebarPanelComponent {
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search test suite');

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(false);

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly import('@app/shared/components/tx-context-menu/tx-context-menu.types').TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);
  protected readonly renamingNodeId = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleteNodeId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  private readonly expandedSnapshotBeforeSearch = signal<string[] | null>(null);
  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly nodes = computed(() => this.testSuite.nodes());

  protected readonly treeConfig = computed(() => {
    const testSuite = this.configService.settings()?.testSuite;
    return mergeTxTreeConfig<TestSuiteTreeNodeMeta>({
      ariaLabel: 'Test suite',
      sort: { foldersFirst: testSuite?.foldersFirst ?? true },
      expansion: {
        expandOnClick: false,
        expandFolderOnDrag: testSuite?.expandFolderOnDrag ?? false,
        expandFolderOnDrop: true,
      },
      drop: { maxDepth: TEST_SUITE_MAX_FOLDER_DEPTH },
    });
  });

  protected readonly filteredNodes = computed(() => {
    const testSuite = this.configService.settings()?.testSuite;
    const showDescriptions = testSuite?.showDescriptions ?? true;
    const showTags = testSuite?.showTags ?? false;
    const filtered = filterTestSuiteTree(this.nodes(), this.searchQueryDebounced());
    const withDescriptions = applyTreeDescriptionVisibility(filtered, showDescriptions);
    return applyTreeTagsVisibility(withDescriptions, showTags);
  });

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
        const saved = session.workspace.testing.testSuite.expandedIds ?? [];
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
        this.applyExpandedIds(collectTestSuiteFolderIdsInSubtree(this.filteredNodes()), {
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
      const ancestors = collectFolderAncestorIds(this.nodes(), resourceId, findTestSuiteNode);
      if (ancestors.length === 0) {
        return;
      }
      untracked(() => {
        this.applyExpandedIds([...new Set([...this.expandedIds(), ...ancestors])], { persist: false });
      });
    });

    effect(() => {
      this.testSuite.flows();
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
    const next = expanded ? collectTestSuiteFolderIds(this.nodes()) : [];
    this.applyExpandedIds(next, { persist: true });
  }

  protected handleNodesChange(next: readonly TestSuiteTreeNode[]): void {
    this.testSuite.saveNodesFromTree([...next]);
    this.syncAllExpandedState();
    this.schedulePersistExpandedIds(this.expandedIds());
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.applyExpandedIds([...ids], { persist: true });
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent<TestSuiteTreeNodeMeta>): void {
    if (this.renamingNodeId()) {
      return;
    }
    const kind = event.node.data?.kind ?? (event.node.kind as TestSuiteTreeKind);
    if (kind === 'folder') {
      this.handleFolderClick(event.nodeId);
      return;
    }
    this.openTab('flow', event.nodeId);
  }

  /** Opens the folder overview tab; expands when collapsed (collapse only via chevron). */
  private handleFolderClick(folderId: string): void {
    if (
      testSuiteFolderHasChildren(this.nodes(), folderId) &&
      !this.expandedIds().includes(folderId)
    ) {
      this.applyExpandedIds([...this.expandedIds(), folderId], {
        persist: !this.searchQuery().trim(),
      });
    }
    this.openTab('folder', folderId);
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent<TestSuiteTreeNodeMeta>): void {
    this.renamingNodeId.set(event.nodeId);
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.testSuite.renameNode(event.nodeId, trimmed);
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
      case 'new-flow':
        this.handleCreate('flow', nodeId);
        break;
      case 'rename':
        if (nodeId) {
          this.renamingNodeId.set(nodeId);
        }
        break;
      case 'delete':
        if (nodeId) {
          this.openDeleteDialog(nodeId);
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
    const removedTabIds = collectTestSuiteFlowIdsForDeletion(this.nodes(), id).map((flowId) =>
      testSuiteTabResourceId('flow', flowId),
    );
    this.testSuite.deleteTreeItem(id);
    this.workspaceEditor.closeTabsForResourceIds(removedTabIds);
    this.deleteOpen.set(false);
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
  }

  protected handleAddFolder(): void {
    this.handleCreate('folder', null);
  }

  protected handleAddFlow(): void {
    this.handleCreate('flow', null);
  }

  private handleCreate(kind: TestSuiteTreeKind, parentId: string | null): void {
    if (kind === 'folder') {
      if (wouldExceedTestSuiteFolderDepth(this.nodes(), parentId)) {
        return;
      }
      this.testSuite.addFolder(undefined, parentId ?? undefined);
      this.cdr.markForCheck();
      return;
    }
    const flow = this.testSuite.addFlow(undefined, parentId ?? undefined);
    if (flow) {
      this.openTab('flow', flow.id);
    }
    this.cdr.markForCheck();
  }

  private openTab(kind: TestSuiteTreeKind, id: string): void {
    this.workspaceEditor.openResource({
      resourceId: testSuiteTabResourceId(kind, id),
      kind: 'test-suite',
    });
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    this.contextMenuPosition.set({ x, y });
    if (!nodeId) {
      this.contextMenuItems.set(buildEmptyTestSuiteContextMenu());
    } else {
      const loc = findTestSuiteNode(this.nodes(), nodeId);
      const kind = loc?.node.data?.kind ?? (loc?.node.kind as TestSuiteTreeKind) ?? 'flow';
      this.contextMenuItems.set(buildTestSuiteNodeContextMenu(kind));
    }
    this.contextMenuOpen.set(true);
  }

  private openDeleteDialog(nodeId: string): void {
    const loc = findTestSuiteNode(this.nodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = loc.node.data?.kind ?? loc.node.kind;
    this.deleteMessage.set(
      kind === 'folder'
        ? `Delete folder "${loc.node.label}" and everything inside it?`
        : `Delete flow "${loc.node.label}"?`,
    );
    this.deleteNodeId.set(nodeId);
    this.deleteOpen.set(true);
  }

  private applyExpandedIds(
    next: readonly string[],
    options: { readonly persist: boolean },
  ): void {
    this.expandedIds.set([...next]);
    this.tree()?.syncExpansionFromInput(next);
    this.syncAllExpandedState();
    this.cdr.markForCheck();
    if (options.persist) {
      this.schedulePersistExpandedIds(next);
    }
  }

  private syncAllExpandedState(): void {
    const allFolderIds = collectTestSuiteFolderIds(this.nodes());
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
      const current = this.configService.session()?.workspace.testing.testSuite;
      void this.configService.patchSession({
        workspace: {
          testing: {
            ...this.testingSession.navigationFields(),
            testSuite: {
              searchQuery: current?.searchQuery ?? '',
              sortBy: current?.sortBy ?? 'saved',
              expandedIds: [...ids],
            },
          },
        },
      });
    }, SESSION_EXPAND_DEBOUNCE_MS);
  }
}
