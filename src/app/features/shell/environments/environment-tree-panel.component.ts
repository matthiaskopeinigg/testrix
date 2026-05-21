import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type {
  EnvironmentSidebarFilter,
  EnvironmentSidebarSortBy,
} from '@shared/config';
import {
  DEFAULT_ENVIRONMENT_SIDEBAR_FILTER,
  DEFAULT_ENVIRONMENT_SIDEBAR_SORT_BY,
} from '@shared/config';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { applyTreeDescriptionVisibility } from '@app/shared/components/tx-tree/tx-tree-description-visibility';
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
import { collectFolderAncestorIds } from '@app/features/shell/workspace/workspace-sidebar-selection';

import {
  buildEmptyEnvironmentScopeContextMenu,
  buildEnvironmentNodeContextMenu,
} from './environment-context-menu';
import {
  buildEnvironmentFilterMenuItems,
  buildEnvironmentSortMenuItems,
} from './environment-sidebar-menus';
import { getEnvironmentScopeNodes } from './environment-profile.utils';
import { collectEnvironmentFolderIds, findEnvironmentNode } from './environment-tree.mutations';
import { applyEnvironmentTreeView } from './environment-tree.view';
import type { EnvironmentTreeKind, EnvironmentTreeNode, EnvironmentTreeNodeMeta } from './environment-tree.types';

const SESSION_EXPAND_DEBOUNCE_MS = 300;
const ROW_CLICK_DELAY_MS = 250;

@Component({
  selector: 'app-environment-tree-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    WorkspacePanelToolbarActionsDirective,
    TxIconComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './environment-tree-panel.component.html',
  styleUrl: './environment-tree-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentTreePanelComponent {
  private readonly configService = inject(ConfigService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly environmentId = input.required<string>();
  readonly selectedVariableId = input<string | null>(null);
  /** When false, defers session sync while the parent workspace tab is hidden. */
  readonly tabActive = input(true);

  readonly selectedVariableIdChange = output<string | null>();

  protected readonly searchQuery = signal('');
  protected readonly sidebarFilter = signal<EnvironmentSidebarFilter>(DEFAULT_ENVIRONMENT_SIDEBAR_FILTER);
  protected readonly sidebarSortBy = signal<EnvironmentSidebarSortBy>(DEFAULT_ENVIRONMENT_SIDEBAR_SORT_BY);

  protected readonly filterMenuOpen = signal(false);
  protected readonly sortMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });
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
  private rowClickTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly environments = computed(() => this.environmentsService.environments());

  protected readonly scopeNodes = computed(() =>
    getEnvironmentScopeNodes(this.environments(), this.environmentId()),
  );

  protected readonly treeConfig = computed(() => {
    const envSettings = this.configService.settings()?.environments;
    const reorderEnabled =
      this.sidebarFilter() === 'all' && this.sidebarSortBy() === 'order';
    return mergeTxTreeConfig<EnvironmentTreeNodeMeta>({
      ariaLabel: 'Environment variables',
      selection: {
        canSelect: (ctx) => resolveEnvironmentKind(ctx.node as EnvironmentTreeNode) === 'variable',
      },
      expansion: {
        expandFolderOnDrag: envSettings?.expandFolderOnDrag ?? false,
        expandFolderOnDrop: true,
        expandOnClick: false,
      },
      visual: {
        showDragHandle: false,
        animateMove: envSettings?.animateMove ?? true,
        animateExpand: envSettings?.animateExpand ?? true,
      },
      sort: {
        siblingSort: envSettings?.siblingSort ?? 'orderThenPriority',
        foldersFirst: envSettings?.foldersFirst ?? true,
      },
      drag: { enabled: reorderEnabled, handleOnly: false },
      drop: {
        canDrop: (ctx: TxTreeDropContext<EnvironmentTreeNodeMeta>) =>
          reorderEnabled && environmentsCanDrop(ctx),
      },
    });
  });

  protected readonly filterMenuItems = computed(() =>
    buildEnvironmentFilterMenuItems(this.sidebarFilter()),
  );

  protected readonly sortMenuItems = computed(() =>
    buildEnvironmentSortMenuItems(this.sidebarSortBy()),
  );

  protected readonly filterToolbarActive = computed(
    () => this.sidebarFilter() !== DEFAULT_ENVIRONMENT_SIDEBAR_FILTER,
  );

  protected readonly sortToolbarActive = computed(
    () => this.sidebarSortBy() !== DEFAULT_ENVIRONMENT_SIDEBAR_SORT_BY,
  );

  protected readonly displayNodes = computed(() => {
    const viewed = applyEnvironmentTreeView(this.scopeNodes(), {
      query: this.searchQuery(),
      filter: this.sidebarFilter(),
      sortBy: this.sidebarSortBy(),
    });
    const showDescriptions = this.configService.settings()?.environments.showDescriptions ?? true;
    return applyTreeDescriptionVisibility(viewed, showDescriptions);
  });

  protected readonly treeSelectionIds = computed(() => {
    const id = this.selectedVariableId();
    return id ? [id] : [];
  });

  protected readonly emptyStateMessage = computed(() => {
    const query = this.searchQuery().trim();
    if (query) {
      return `No variables match "${query}".`;
    }
    if (this.sidebarFilter() === 'folders') {
      return 'No folders to show.';
    }
    if (this.sidebarFilter() === 'variables') {
      return 'No variables to show.';
    }
    return 'No variables yet. Right-click to add one.';
  });

  constructor() {
    effect(() => {
      if (!this.tabActive()) {
        return;
      }
      void this.configService.sessionRevision();
      untracked(() => {
        const session = this.configService.session();
        if (!session) {
          return;
        }
        const envSession = session.workspace.environments;
        const saved = envSession.expandedFolderIds ?? [];
        this.expandedIds.set([...saved]);
        this.tree()?.syncExpansionFromInput(saved);
        this.sidebarFilter.set(envSession.sidebarFilter ?? DEFAULT_ENVIRONMENT_SIDEBAR_FILTER);
        this.sidebarSortBy.set(envSession.sidebarSortBy ?? DEFAULT_ENVIRONMENT_SIDEBAR_SORT_BY);
        this.syncAllExpandedState();
      });
    });

    effect(() => {
      if (!this.tabActive()) {
        return;
      }
      const query = this.searchQuery().trim();
      if (query) {
        if (this.expandedSnapshotBeforeSearch() === null) {
          this.expandedSnapshotBeforeSearch.set([...this.expandedIds()]);
        }
        this.applyExpandedIds(collectEnvironmentFolderIds(this.displayNodes()), { persist: false });
        return;
      }

      const snapshot = this.expandedSnapshotBeforeSearch();
      if (snapshot !== null) {
        this.expandedSnapshotBeforeSearch.set(null);
        this.applyExpandedIds(snapshot, { persist: false });
      }
    });

    effect(() => {
      if (!this.tabActive()) {
        return;
      }
      const resourceId = this.selectedVariableId();
      if (!resourceId || this.searchQuery().trim()) {
        return;
      }
      const ancestors = collectFolderAncestorIds(
        this.scopeNodes(),
        resourceId,
        findEnvironmentNode,
      );
      if (ancestors.length === 0) {
        return;
      }
      this.expandedIds.update((ids) => [...new Set([...ids, ...ancestors])]);
    });

    effect(() => {
      this.environmentId();
      this.renamingNodeId.set(null);
    });
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
  }

  protected handleExpandAll(expanded: boolean): void {
    this.allExpanded.set(expanded);
    const next = expanded ? collectEnvironmentFolderIds(this.scopeNodes()) : [];
    this.applyExpandedIds(next, { persist: !this.searchQuery().trim() });
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

  protected handleFilterToolbarClick(event: MouseEvent): void {
    this.sortMenuOpen.set(false);
    this.openToolbarMenu(event, this.filterMenuPosition, this.filterMenuOpen);
  }

  protected handleSortToolbarClick(event: MouseEvent): void {
    this.filterMenuOpen.set(false);
    this.openToolbarMenu(event, this.sortMenuPosition, this.sortMenuOpen);
  }

  protected handleFilterMenuSelect(actionId: string): void {
    this.filterMenuOpen.set(false);
    const next = actionId as EnvironmentSidebarFilter;
    if (next === this.sidebarFilter()) {
      return;
    }
    this.sidebarFilter.set(next);
    this.persistSidebarViewPrefs();
  }

  protected handleSortMenuSelect(actionId: string): void {
    this.sortMenuOpen.set(false);
    const next = actionId as EnvironmentSidebarSortBy;
    if (next === this.sidebarSortBy()) {
      return;
    }
    this.sidebarSortBy.set(next);
    this.persistSidebarViewPrefs();
  }

  protected handleFilterMenuClosed(): void {
    this.filterMenuOpen.set(false);
  }

  protected handleSortMenuClosed(): void {
    this.sortMenuOpen.set(false);
  }

  protected handleNodesChange(next: readonly EnvironmentTreeNode[]): void {
    if (!this.environmentsService.saveScopeNodes(this.environmentId(), next)) {
      return;
    }
    this.syncAllExpandedState();
    this.pruneAndPersistExpandedIds(this.expandedIds());
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.applyExpandedIds([...ids], { persist: !this.searchQuery().trim() });
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent<EnvironmentTreeNodeMeta>): void {
    if (this.renamingNodeId()) {
      return;
    }

    const loc = findEnvironmentNode(this.scopeNodes(), event.nodeId);
    if (!loc) {
      return;
    }

    const kind = resolveEnvironmentKind(loc.node);
    if (kind === 'folder') {
      if (this.rowClickTimer !== null) {
        clearTimeout(this.rowClickTimer);
        this.rowClickTimer = null;
      }
      const isExpanded = this.expandedIds().includes(event.nodeId);
      const next = isExpanded
        ? this.expandedIds().filter((id) => id !== event.nodeId)
        : [...this.expandedIds(), event.nodeId];
      this.applyExpandedIds(next, { persist: !this.searchQuery().trim() });
      return;
    }

    if (kind !== 'variable') {
      return;
    }

    if (this.rowClickTimer !== null) {
      clearTimeout(this.rowClickTimer);
    }

    const nodeId = event.nodeId;
    this.rowClickTimer = setTimeout(() => {
      this.rowClickTimer = null;
      this.selectedVariableIdChange.emit(nodeId);
    }, ROW_CLICK_DELAY_MS);
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent<EnvironmentTreeNodeMeta>): void {
    if (this.rowClickTimer !== null) {
      clearTimeout(this.rowClickTimer);
      this.rowClickTimer = null;
    }
    this.startInlineRename(event.nodeId);
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.environmentsService.renameNode(event.nodeId, trimmed);
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
      case 'new-folder': {
        const createdId = this.environmentsService.createScopeFolder(this.environmentId(), nodeId);
        if (createdId) {
          this.expandedIds.update((ids) => [...new Set([...ids, createdId])]);
        }
        break;
      }
      case 'new-variable': {
        const createdId = this.environmentsService.createScopeVariable(this.environmentId(), nodeId);
        if (createdId) {
          this.selectedVariableIdChange.emit(createdId);
        }
        break;
      }
      case 'add-variable-inside': {
        if (nodeId) {
          const createdId = this.environmentsService.createScopeVariable(this.environmentId(), nodeId);
          if (createdId) {
            this.selectedVariableIdChange.emit(createdId);
            this.expandedIds.update((ids) => [...new Set([...ids, nodeId])]);
          }
        }
        break;
      }
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
          const createdId = this.environmentsService.duplicateVariable(nodeId);
          if (createdId) {
            this.selectedVariableIdChange.emit(createdId);
          }
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
    this.environmentsService.deleteNode(id);
    if (this.selectedVariableId() === id) {
      this.selectedVariableIdChange.emit(null);
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
      this.contextMenuItems.set(buildEmptyEnvironmentScopeContextMenu());
    } else {
      const loc = findEnvironmentNode(this.scopeNodes(), nodeId);
      if (!loc) {
        return;
      }
      const kind = resolveEnvironmentKind(loc.node);
      this.contextMenuItems.set(buildEnvironmentNodeContextMenu(kind));
    }
    this.contextMenuPosition.set({ x, y });
    this.contextMenuOpen.set(true);
  }

  private startInlineRename(nodeId: string): void {
    if (!findEnvironmentNode(this.scopeNodes(), nodeId)) {
      return;
    }
    this.renamingNodeId.set(nodeId);
  }

  private openDeleteDialog(nodeId: string): void {
    const loc = findEnvironmentNode(this.scopeNodes(), nodeId);
    if (!loc) {
      return;
    }
    const name = loc.node.data?.key ?? loc.node.label;
    this.deleteMessage.set(`Delete "${name}"? This cannot be undone.`);
    this.deleteNodeId.set(nodeId);
    this.deleteOpen.set(true);
  }

  private syncAllExpandedState(): void {
    const allFolderIds = collectEnvironmentFolderIds(this.scopeNodes());
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
      workspace: {
        environments: {
          expandedFolderIds: pruned,
          sidebarFilter: this.sidebarFilter(),
          sidebarSortBy: this.sidebarSortBy(),
        },
      },
    });
  }

  private persistSidebarViewPrefs(): void {
    void this.configService.patchSession({
      workspace: {
        environments: {
          expandedFolderIds: this.pruneExpandedIds(this.expandedIds()),
          sidebarFilter: this.sidebarFilter(),
          sidebarSortBy: this.sidebarSortBy(),
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

  private pruneAndPersistExpandedIds(ids: readonly string[]): void {
    const pruned = this.pruneExpandedIds(ids);
    if (pruned.length !== ids.length) {
      this.expandedIds.set(pruned);
    }
    if (!this.searchQuery().trim()) {
      this.persistExpandedIds(pruned);
    }
  }

  private pruneExpandedIds(ids: readonly string[]): string[] {
    const valid = new Set(collectEnvironmentFolderIds(this.scopeNodes()));
    return ids.filter((id) => valid.has(id));
  }
}

function resolveEnvironmentKind(node: EnvironmentTreeNode): EnvironmentTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'variable') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'variable';
}

function environmentsCanDrop(ctx: TxTreeDropContext<EnvironmentTreeNodeMeta>): boolean {
  const targetKind = resolveEnvironmentKind(ctx.target);

  if (ctx.position === 'inside') {
    return targetKind === 'folder';
  }

  return true;
}
