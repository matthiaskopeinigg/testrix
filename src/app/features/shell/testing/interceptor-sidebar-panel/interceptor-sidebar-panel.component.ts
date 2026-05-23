import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  DEFAULT_INTERCEPTOR_SIDEBAR_FILTER,
  DEFAULT_INTERCEPTOR_SIDEBAR_SORT_BY,
  type InterceptorSidebarFilter,
  type InterceptorSidebarSortBy,
} from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import {
  collectFolderAncestorIds,
  testingSidebarSelectionIds,
} from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';

import { TestingProgrammaticSidebarPanelBase } from '../testing-programmatic-sidebar-panel.base';
import {
  buildEmptyInterceptorContextMenu,
  buildInterceptorNodeContextMenu,
} from './interceptor-context-menu';
import {
  buildInterceptorFilterMenuItems,
  buildInterceptorSortMenuItems,
  isInterceptorKindFilterAction,
  isInterceptorSortAction,
} from './interceptor-sidebar-menus';
import { applyInterceptorTreeView } from './interceptor-tree.view';
import {
  collectInterceptorFolderIdsFromNodes,
  collectInterceptorRuleIdsForDeletion,
  findInterceptorNode,
  interceptorFolderHasChildren,
  isInterceptorFolderNode,
  isInterceptorRuleNode,
} from './interceptor-tree.mutations';
import type {
  InterceptorTreeKind,
  InterceptorTreeNode,
  InterceptorTreeNodeMeta,
} from './interceptor-tree.types';

const SESSION_PREF_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-interceptor-sidebar-panel',
  standalone: true,
  imports: [
    FormsModule,
    WorkspaceSidebarPanelShellComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxIconComponent,
  ],
  templateUrl: './interceptor-sidebar-panel.component.html',
  styleUrl: './interceptor-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InterceptorSidebarPanelComponent extends TestingProgrammaticSidebarPanelBase {
  private readonly configService = inject(ConfigService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly interceptor = inject(InterceptorWorkspaceStore);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  protected override panelTitle = 'Interceptor';

  protected readonly running = this.interceptor.running;
  protected readonly startUrl = this.interceptor.startUrl;

  protected readonly searchQuery = signal('');
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(false);
  protected readonly kindFilter = signal<InterceptorSidebarFilter>(DEFAULT_INTERCEPTOR_SIDEBAR_FILTER);
  protected readonly sortBy = signal<InterceptorSidebarSortBy>(DEFAULT_INTERCEPTOR_SIDEBAR_SORT_BY);
  protected readonly settingsExpanded = signal(false);

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);

  protected readonly filterMenuOpen = signal(false);
  protected readonly sortMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });

  protected readonly renamingNodeId = signal<string | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteNodeId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly nodes = computed(() => this.interceptor.nodes());

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<InterceptorTreeNodeMeta>({
      ariaLabel: 'Interceptor rules',
      drop: { maxDepth: 15 },
    }),
  );

  protected readonly filteredNodes = computed(() =>
    applyInterceptorTreeView(this.nodes(), {
      query: this.searchQuery(),
      kindFilter: this.kindFilter(),
      sortBy: this.sortBy(),
    }),
  );

  protected readonly filterToolbarActive = computed(
    () => this.kindFilter() !== DEFAULT_INTERCEPTOR_SIDEBAR_FILTER,
  );

  protected readonly sortToolbarActive = computed(
    () => this.sortBy() !== DEFAULT_INTERCEPTOR_SIDEBAR_SORT_BY,
  );

  protected readonly filterMenuItems = computed(() =>
    buildInterceptorFilterMenuItems(this.kindFilter()),
  );

  protected readonly sortMenuItems = computed(() => buildInterceptorSortMenuItems(this.sortBy()));

  protected readonly treeSelectionIds = computed(() =>
    testingSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  protected readonly treeEmptyMessage = computed(() => {
    if (this.nodes().length === 0) {
      return 'No interceptor rules yet. Right-click to add a folder or rule.';
    }
    if (this.searchQuery().trim() || this.kindFilter() !== 'all') {
      return 'No rules match your filters.';
    }
    return 'No interceptor rules.';
  });

  constructor() {
    super();
    effect(() => {
      void this.configService.sessionRevision();
      const prefs = this.configService.session()?.workspace.testing.interceptor;
      if (!prefs) {
        return;
      }
      this.searchQuery.set(prefs.searchQuery);
      this.expandedIds.set([...prefs.expandedIds]);
      this.kindFilter.set(prefs.kindFilter);
      this.sortBy.set(prefs.sortBy);
      this.settingsExpanded.set(prefs.settingsExpanded);
      const legacy = prefs as { allFoldersExpanded?: boolean };
      if (legacy.allFoldersExpanded && prefs.expandedIds.length === 0 && this.nodes().length > 0) {
        this.allExpanded.set(true);
        this.expandedIds.set(collectInterceptorFolderIdsFromNodes(this.nodes()));
      }
    });
    effect(() => {
      this.interceptor.nodes();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
  }

  protected handleStartUrlChange(value: string): void {
    this.interceptor.patchStartUrl(value);
    this.cdr.markForCheck();
  }

  protected handleToggleSettings(): void {
    this.settingsExpanded.update((v) => !v);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleExpandAll(expanded: boolean): void {
    this.allExpanded.set(expanded);
    this.expandedIds.set(expanded ? collectInterceptorFolderIdsFromNodes(this.nodes()) : []);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.expandedIds.set([...ids]);
    this.scheduleSessionSave();
  }

  protected handleNodesChange(nodes: readonly InterceptorTreeNode[]): void {
    this.interceptor.saveNodes([...nodes]);
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

  protected handleFilterMenuSelect(actionId: string): void {
    if (isInterceptorKindFilterAction(actionId)) {
      this.kindFilter.set(actionId);
      this.scheduleSessionSave();
    }
    this.filterMenuOpen.set(false);
    this.cdr.markForCheck();
  }

  protected handleSortMenuSelect(actionId: string): void {
    if (isInterceptorSortAction(actionId)) {
      this.sortBy.set(actionId);
      this.scheduleSessionSave();
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

  protected handleNodeClick(event: TxTreeNodeClickEvent): void {
    const loc = findInterceptorNode(this.nodes(), event.nodeId);
    if (!loc) {
      return;
    }
    if (isInterceptorFolderNode(loc.node)) {
      this.toggleFolderExpanded(event.nodeId);
      return;
    }
    if (isInterceptorRuleNode(loc.node)) {
      this.openRule(event.nodeId);
    }
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent): void {
    if (isInterceptorRuleNode(event.node as InterceptorTreeNode)) {
      this.openRule(event.nodeId);
    }
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.interceptor.renameNode(event.nodeId, trimmed);
    }
    this.renamingNodeId.set(null);
    this.cdr.markForCheck();
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
      case 'new-rule':
        this.handleCreate('rule', nodeId);
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
      case 'open':
        if (nodeId) {
          this.openRule(nodeId);
        }
        break;
      case 'expand':
        if (nodeId && interceptorFolderHasChildren(this.nodes(), nodeId)) {
          this.setFolderExpanded(nodeId, true);
        }
        break;
    }
    this.cdr.markForCheck();
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
  }

  protected handleDeleteConfirmed(): void {
    const nodeId = this.deleteNodeId();
    this.deleteOpen.set(false);
    this.deleteNodeId.set(null);
    if (!nodeId) {
      return;
    }
    const ruleIds = this.interceptor.deleteNode(nodeId);
    this.workspaceEditor.closeTabsForResourceIds(
      ruleIds.map((id) => this.interceptor.tabResourceId(id)),
    );
    this.cdr.markForCheck();
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
    this.deleteNodeId.set(null);
  }

  protected async handleToggle(): Promise<void> {
    if (this.interceptor.running()) {
      await this.interceptor.stop();
    } else {
      await this.interceptor.start();
    }
    this.cdr.markForCheck();
  }

  private handleCreate(kind: InterceptorTreeKind, parentId: string | null): void {
    if (kind === 'folder') {
      this.interceptor.addFolder();
      return;
    }
    const loc = parentId ? findInterceptorNode(this.nodes(), parentId) : null;
    const parent = loc && isInterceptorFolderNode(loc.node) ? parentId : null;
    const rule = this.interceptor.addRule(parent);
    this.openRule(rule.id);
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    this.contextMenuPosition.set({ x, y });
    if (!nodeId) {
      this.contextMenuItems.set(buildEmptyInterceptorContextMenu());
      this.contextMenuOpen.set(true);
      return;
    }
    const loc = findInterceptorNode(this.nodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = (loc.node.data?.kind ?? loc.node.kind) as InterceptorTreeKind;
    const expanded = this.expandedIds().includes(nodeId);
    const atRoot = !loc.parent;
    this.contextMenuItems.set(
      buildInterceptorNodeContextMenu(
        kind,
        expanded,
        interceptorFolderHasChildren(this.nodes(), nodeId),
        atRoot,
      ),
    );
    this.contextMenuOpen.set(true);
  }

  private openRule(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.interceptor.tabResourceId(id),
      kind: 'interceptor-rule',
    });
  }

  private startInlineRename(nodeId: string): void {
    if (!findInterceptorNode(this.nodes(), nodeId)) {
      return;
    }
    this.renamingNodeId.set(nodeId);
    const ancestors = collectFolderAncestorIds(this.nodes(), nodeId, (list, id) => {
      const loc = findInterceptorNode(list, id);
      return loc ? { parent: loc.parent } : null;
    });
    this.expandedIds.update((ids) => [...new Set([...ids, ...ancestors])]);
  }

  private openDeleteDialog(nodeId: string): void {
    const loc = findInterceptorNode(this.nodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = loc.node.data?.kind ?? loc.node.kind;
    const ruleCount = collectInterceptorRuleIdsForDeletion(this.nodes(), nodeId).length;
    const message =
      kind === 'folder'
        ? `Delete folder “${loc.node.label}” and ${ruleCount} rule(s) inside?`
        : `Delete rule “${loc.node.label}”?`;
    this.deleteMessage.set(message);
    this.deleteNodeId.set(nodeId);
    this.deleteOpen.set(true);
  }

  private toggleFolderExpanded(folderId: string): void {
    const expanded = this.expandedIds();
    this.expandedIds.set(
      expanded.includes(folderId)
        ? expanded.filter((id) => id !== folderId)
        : [...expanded, folderId],
    );
    this.scheduleSessionSave();
  }

  private setFolderExpanded(folderId: string, expanded: boolean): void {
    const ids = this.expandedIds();
    if (expanded && !ids.includes(folderId)) {
      this.expandedIds.set([...ids, folderId]);
      this.scheduleSessionSave();
    }
  }

  private scheduleSessionSave(): void {
    if (this.sessionSaveTimer !== null) {
      clearTimeout(this.sessionSaveTimer);
    }
    this.sessionSaveTimer = setTimeout(() => {
      this.sessionSaveTimer = null;
      const testing = this.configService.session()?.workspace.testing;
      if (!testing) {
        return;
      }
      const interceptorPrefs = testing.interceptor;
      void this.configService.patchSession({
        workspace: {
          testing: {
            interceptor: {
              ...interceptorPrefs,
              searchQuery: this.searchQuery(),
              expandedIds: [...this.expandedIds()],
              kindFilter: this.kindFilter(),
              sortBy: this.sortBy(),
              settingsExpanded: this.settingsExpanded(),
            },
          },
        },
      });
    }, SESSION_PREF_DEBOUNCE_MS);
  }
}
