import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';
import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
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
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';

import {
  DEFAULT_CAPTURE_SIDEBAR_FILTER,
  DEFAULT_CAPTURE_SIDEBAR_SORT_BY,
  type CaptureSidebarFilter,
  type CaptureSidebarSortBy,
} from '@shared/config';

import { TestingProgrammaticSidebarPanelBase } from '../testing-programmatic-sidebar-panel.base';
import {
  buildCaptureNodeContextMenu,
  buildEmptyCaptureContextMenu,
} from './capture-context-menu';
import {
  buildCaptureFilterMenuItems,
  buildCaptureSortMenuItems,
  isCaptureKindFilterAction,
  isCaptureSortAction,
} from './capture-sidebar-menus';
import { applyCaptureTreeView } from './capture-tree.view';
import {
  captureFolderHasChildren,
  collectCaptureFolderIdsFromNodes,
  collectCaptureSessionIdsForDeletion,
  findCaptureNode,
  isCaptureFolderNode,
  isCaptureSessionNode,
} from './capture-tree.mutations';
import type { CaptureTreeKind, CaptureTreeNode, CaptureTreeNodeMeta } from './capture-tree.types';

const SESSION_PREF_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-capture-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
    TxIconComponent,
    TxTooltipDirective,
  ],
  templateUrl: './capture-sidebar-panel.component.html',
  styleUrl: './capture-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureSidebarPanelComponent extends TestingProgrammaticSidebarPanelBase {
  private readonly configService = inject(ConfigService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  protected override panelTitle = 'Capture';

  protected readonly searchQuery = signal('');
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(false);
  protected readonly kindFilter = signal<CaptureSidebarFilter>(DEFAULT_CAPTURE_SIDEBAR_FILTER);
  protected readonly sortBy = signal<CaptureSidebarSortBy>(DEFAULT_CAPTURE_SIDEBAR_SORT_BY);

  protected readonly filterMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuOpen = signal(false);
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);

  protected readonly renamingNodeId = signal<string | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteNodeId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly nodes = computed(() => this.capture.nodes());

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<CaptureTreeNodeMeta>({
      ariaLabel: 'Capture sessions',
      drop: { maxDepth: 15 },
    }),
  );

  protected readonly filteredNodes = computed(() =>
    applyCaptureTreeView(this.nodes(), {
      query: this.searchQuery(),
      kindFilter: this.kindFilter(),
      sortBy: this.sortBy(),
    }),
  );

  protected readonly filterMenuItems = computed(() =>
    buildCaptureFilterMenuItems(this.kindFilter()),
  );

  protected readonly sortMenuItems = computed(() => buildCaptureSortMenuItems(this.sortBy()));

  protected readonly filterToolbarActive = computed(
    () => this.kindFilter() !== DEFAULT_CAPTURE_SIDEBAR_FILTER,
  );

  protected readonly sortToolbarActive = computed(
    () => this.sortBy() !== DEFAULT_CAPTURE_SIDEBAR_SORT_BY,
  );

  protected readonly treeSelectionIds = computed(() =>
    testingSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  protected readonly treeEmptyMessage = computed(() => {
    if (this.nodes().length === 0) {
      return 'No capture sessions yet. Right-click to add a folder or session.';
    }
    if (this.searchQuery().trim()) {
      return 'No capture sessions match your search.';
    }
    return 'No capture sessions.';
  });

  constructor() {
    super();
    effect(() => {
      void this.configService.sessionRevision();
      const prefs = this.configService.session()?.workspace.testing.capture;
      if (!prefs) {
        return;
      }
      this.searchQuery.set(prefs.searchQuery);
      this.expandedIds.set([...prefs.expandedIds]);
      this.kindFilter.set(prefs.kindFilter);
      this.sortBy.set(prefs.sortBy);
    });
    effect(() => {
      this.capture.nodes();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleExpandAll(expanded: boolean): void {
    this.allExpanded.set(expanded);
    this.expandedIds.set(expanded ? collectCaptureFolderIdsFromNodes(this.nodes()) : []);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.expandedIds.set([...ids]);
    this.scheduleSessionSave();
  }

  protected handleNodesChange(nodes: readonly CaptureTreeNode[]): void {
    this.capture.saveNodes([...nodes]);
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent): void {
    const loc = findCaptureNode(this.nodes(), event.nodeId);
    if (!loc) {
      return;
    }
    if (isCaptureFolderNode(loc.node)) {
      this.toggleFolderExpanded(event.nodeId);
      return;
    }
    if (isCaptureSessionNode(loc.node)) {
      this.openSession(event.nodeId);
    }
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent): void {
    if (isCaptureSessionNode(event.node as CaptureTreeNode)) {
      this.openSession(event.nodeId);
    }
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.capture.renameNode(event.nodeId, trimmed);
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
      case 'new-session':
        this.handleCreate('session', nodeId);
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
          this.openSession(nodeId);
        }
        break;
      case 'expand':
        if (nodeId && captureFolderHasChildren(this.nodes(), nodeId)) {
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
    const sessionIds = this.capture.deleteNode(nodeId);
    this.workspaceEditor.closeTabsForResourceIds(
      sessionIds.map((id) => this.capture.tabResourceId(id)),
    );
    this.cdr.markForCheck();
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
    this.deleteNodeId.set(null);
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
    if (isCaptureKindFilterAction(actionId)) {
      this.kindFilter.set(actionId);
      this.scheduleSessionSave();
    }
    this.filterMenuOpen.set(false);
    this.cdr.markForCheck();
  }

  protected handleSortMenuSelect(actionId: string): void {
    if (isCaptureSortAction(actionId)) {
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

  private handleCreate(kind: CaptureTreeKind, parentId: string | null): void {
    if (kind === 'folder') {
      this.capture.addFolder();
      return;
    }
    const loc = parentId ? findCaptureNode(this.nodes(), parentId) : null;
    const parent = loc && isCaptureFolderNode(loc.node) ? parentId : null;
    const item = this.capture.addItem(parent);
    this.openSession(item.id);
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    this.contextMenuPosition.set({ x, y });
    if (!nodeId) {
      this.contextMenuItems.set(buildEmptyCaptureContextMenu());
      this.contextMenuOpen.set(true);
      return;
    }
    const loc = findCaptureNode(this.nodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = (loc.node.data?.kind ?? loc.node.kind) as CaptureTreeKind;
    const expanded = this.expandedIds().includes(nodeId);
    const atRoot = !loc.parent;
    this.contextMenuItems.set(
      buildCaptureNodeContextMenu(
        kind,
        expanded,
        captureFolderHasChildren(this.nodes(), nodeId),
        atRoot,
      ),
    );
    this.contextMenuOpen.set(true);
  }

  private openSession(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.capture.tabResourceId(id),
      kind: 'capture',
    });
  }

  private startInlineRename(nodeId: string): void {
    if (!findCaptureNode(this.nodes(), nodeId)) {
      return;
    }
    this.renamingNodeId.set(nodeId);
    const ancestors = collectFolderAncestorIds(this.nodes(), nodeId, (list, id) => {
      const loc = findCaptureNode(list, id);
      return loc ? { parent: loc.parent } : null;
    });
    this.expandedIds.update((ids) => [...new Set([...ids, ...ancestors])]);
  }

  private openDeleteDialog(nodeId: string): void {
    const loc = findCaptureNode(this.nodes(), nodeId);
    if (!loc) {
      return;
    }
    const kind = loc.node.data?.kind ?? loc.node.kind;
    const sessionCount = collectCaptureSessionIdsForDeletion(this.nodes(), nodeId).length;
    const message =
      kind === 'folder'
        ? `Delete folder “${loc.node.label}” and ${sessionCount} session(s) inside?`
        : `Delete capture session “${loc.node.label}”?`;
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
      const capturePrefs = testing.capture;
      void this.configService.patchSession({
        workspace: {
          testing: {
            capture: {
              ...capturePrefs,
              searchQuery: this.searchQuery(),
              expandedIds: [...this.expandedIds()],
              kindFilter: this.kindFilter(),
              sortBy: this.sortBy(),
            },
          },
        },
      });
    }, SESSION_PREF_DEBOUNCE_MS);
  }
}
