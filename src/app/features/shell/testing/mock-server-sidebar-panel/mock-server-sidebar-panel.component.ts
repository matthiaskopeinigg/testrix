import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ConfigService } from '@app/core/config/config.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { WorkspaceSidebarPanelHeaderService } from '@app/core/workspace/workspace-sidebar-panel-header.service';
import { testingSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';
import {
  DEFAULT_MOCK_SERVER_SIDEBAR_FILTER,
  DEFAULT_MOCK_SERVER_SIDEBAR_SORT_BY,
  type MockServerSidebarFilter,
  type MockServerSidebarSortBy,
} from '@shared/config';
import { mockServerMismatchTabResourceId, mockServerTabResourceId } from '@shared/testing';

import {
  buildEmptyMockServerContextMenu,
  buildMockServerNodeContextMenu,
} from './mock-server-context-menu';
import {
  buildMockServerFilterMenuItems,
  buildMockServerSortMenuItems,
  isMockServerKindFilterAction,
  isMockServerSortAction,
} from './mock-server-sidebar-menus';
import { collectMockServerFolderIds } from './mock-server-tree.filter';
import {
  collectMockServerEndpointIdsForDeletion,
  findMockServerNode,
  isMockServerEndpointNode,
  isMockServerFolderNode,
  mockServerFolderHasChildren,
} from './mock-server-tree.mutations';
import { applyMockServerTreeView } from './mock-server-tree.view';
import type { MockServerTreeKind, MockServerTreeNode } from './mock-server-tree.types';

const SESSION_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-mock-server-sidebar-panel',
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
    TxToggleComponent,
    TxIconComponent,
  ],
  templateUrl: './mock-server-sidebar-panel.component.html',
  styleUrl: './mock-server-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockServerSidebarPanelComponent implements OnInit, OnDestroy {
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly mockServer = inject(MockServerService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly panelHeader = inject(WorkspaceSidebarPanelHeaderService);
  private readonly notifications = inject(TxNotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly searchPlaceholder = input('Search endpoints…');
  readonly searchAriaLabel = input('Search mock server');

  protected readonly running = this.mockServer.running;
  protected readonly options = this.mockServer.options;
  protected readonly mismatches = this.mockServer.mismatches;
  protected readonly unmatchedCount = this.mockServer.unmatchedCount;

  protected readonly searchQuery = signal('');
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(false);
  protected readonly kindFilter = signal<MockServerSidebarFilter>(DEFAULT_MOCK_SERVER_SIDEBAR_FILTER);
  protected readonly sortBy = signal<MockServerSidebarSortBy>(DEFAULT_MOCK_SERVER_SIDEBAR_SORT_BY);
  protected readonly tagFilter = signal<string[]>([]);
  protected readonly settingsExpanded = signal(false);
  protected readonly mismatchesPanelExpanded = signal(false);

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

  protected readonly treeConfig = signal(mergeTxTreeConfig({}));
  protected readonly treeEmptyMessage = computed(() =>
    this.searchQuery().trim() ? 'No matching endpoints.' : 'No mock endpoints yet.',
  );

  protected readonly filteredNodes = computed(() =>
    applyMockServerTreeView(this.mockServer.nodes(), {
      query: this.searchQuery(),
      kindFilter: this.kindFilter(),
      sortBy: this.sortBy(),
      tagFilter: this.tagFilter(),
    }),
  );

  protected readonly treeSelectionIds = computed(() =>
    testingSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  protected readonly activeMismatchId = computed(() => {
    const tab = this.workspaceEditor.activeTab();
    if (tab?.kind === 'mock-server' && tab.resourceId.startsWith('ms-mismatch:')) {
      return tab.resourceId.slice('ms-mismatch:'.length);
    }
    return null;
  });

  protected readonly portField = computed(() => {
    const port = this.options().port;
    return port === 'auto' ? 'auto' : String(port);
  });

  protected readonly listenAddress = computed(() => {
    const s = this.mockServer.status();
    const host = s?.host ?? this.options().host;
    const port = s?.resolvedPort ?? (typeof this.options().port === 'number' ? this.options().port : '…');
    return `${host}:${port}`;
  });

  /** Full URL copied when the user clicks the listen address. */
  protected readonly listenUrl = computed(() => `http://${this.listenAddress()}`);

  protected async handleCopyListenAddress(): Promise<void> {
    const url = this.listenUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        this.notifications.showSuccess('Listen address copied');
        return;
      }
    } catch {
      /* fall through */
    }
    this.notifications.showError('Could not copy to clipboard');
  }

  protected readonly filterToolbarActive = computed(
    () => this.kindFilter() !== 'all' || this.tagFilter().length > 0,
  );
  protected readonly sortToolbarActive = computed(() => this.sortBy() !== 'saved');

  protected readonly filterMenuItems = computed(() =>
    buildMockServerFilterMenuItems(this.kindFilter(), this.tagFilter(), this.mockServer.allTags()),
  );
  protected readonly sortMenuItems = computed(() => buildMockServerSortMenuItems(this.sortBy()));

  private sessionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.panelHeader.set({
        title: 'Mock Server',
        onBack: () => this.testingSession.backToTestingMenu(),
      });
    });
    effect(() => {
      void this.configService.sessionRevision();
      const prefs = this.configService.session()?.workspace.testing.mockServer;
      if (!prefs) {
        return;
      }
      this.searchQuery.set(prefs.searchQuery);
      this.expandedIds.set([...prefs.expandedIds]);
      this.kindFilter.set(prefs.kindFilter);
      this.sortBy.set(prefs.sortBy);
      this.tagFilter.set([...prefs.tagFilter]);
      const legacySettings = (prefs as { settingsAdvancedExpanded?: boolean }).settingsAdvancedExpanded;
      this.settingsExpanded.set(prefs.settingsExpanded ?? legacySettings ?? false);
      this.mismatchesPanelExpanded.set(prefs.mismatchesPanelExpanded);
    });
    effect(() => {
      this.mockServer.nodes();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    void this.mockServer.hydrate();
    this.testingSession.load();
  }

  ngOnDestroy(): void {
    this.panelHeader.clear();
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }
  }

  protected async handleToggleServer(): Promise<void> {
    if (this.running()) {
      await this.mockServer.stop();
    } else {
      await this.mockServer.start();
    }
    this.cdr.markForCheck();
  }

  protected handlePortChange(value: string): void {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'auto' || trimmed === '') {
      this.mockServer.updateOptions({ port: 'auto' });
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (Number.isFinite(n) && n > 0) {
      this.mockServer.updateOptions({ port: n });
    }
  }

  protected handleDelayChange(value: string | number): void {
    const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (Number.isFinite(n) && n >= 0) {
      this.mockServer.updateOptions({ delayMs: n });
    }
  }

  protected handleHostChange(value: string): void {
    this.mockServer.updateOptions({ host: value.trim() || '127.0.0.1' });
  }

  protected handleCorsEnabledChange(enabled: boolean): void {
    this.mockServer.updateOptions({ cors: { ...this.options().cors, enabled } });
  }

  protected handleCorsAllowOriginChange(value: string): void {
    this.mockServer.updateOptions({ cors: { ...this.options().cors, allowOrigin: value } });
  }

  protected handleCorsAllowMethodsChange(value: string): void {
    this.mockServer.updateOptions({ cors: { ...this.options().cors, allowMethods: value } });
  }

  protected handleCorsAllowHeadersChange(value: string): void {
    this.mockServer.updateOptions({ cors: { ...this.options().cors, allowHeaders: value } });
  }

  protected handleCaptureChange(enabled: boolean): void {
    this.mockServer.updateOptions({ captureToHistory: enabled });
  }

  protected handleCaptureMismatchesChange(enabled: boolean): void {
    this.mockServer.updateOptions({ captureMismatchesToHistory: enabled });
  }

  protected handleAutoStartChange(enabled: boolean): void {
    this.mockServer.updateOptions({ autoStartOnLaunch: enabled });
  }

  protected handleToggleSettings(): void {
    this.settingsExpanded.update((v) => !v);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleToggleMismatchesPanel(): void {
    this.mismatchesPanelExpanded.update((v) => !v);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected async handleClearMismatches(): Promise<void> {
    await this.mockServer.clearMismatches();
    this.cdr.markForCheck();
  }

  protected handleOpenMismatch(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: mockServerMismatchTabResourceId(id),
      kind: 'mock-server',
    });
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleExpandAll(expanded: boolean): void {
    this.allExpanded.set(expanded);
    this.expandedIds.set(expanded ? collectMockServerFolderIds(this.mockServer.nodes()) : []);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.expandedIds.set([...ids]);
    this.scheduleSessionSave();
  }

  protected handleNodesChange(nodes: readonly MockServerTreeNode[]): void {
    this.mockServer.saveNodes([...nodes]);
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent): void {
    const loc = findMockServerNode(this.mockServer.nodes(), event.nodeId);
    if (!loc) {
      return;
    }
    if (isMockServerFolderNode(loc.node)) {
      this.toggleFolderExpanded(event.nodeId);
      return;
    }
    if (isMockServerEndpointNode(loc.node)) {
      this.openEndpoint(event.nodeId);
    }
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent): void {
    if (isMockServerEndpointNode(event.node as MockServerTreeNode)) {
      this.openEndpoint(event.nodeId);
    }
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.mockServer.renameNode(event.nodeId, trimmed);
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
      case 'new-endpoint':
        this.handleCreate('endpoint', nodeId);
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
          this.openEndpoint(nodeId);
        }
        break;
      case 'expand':
        if (nodeId && mockServerFolderHasChildren(this.mockServer.nodes(), nodeId)) {
          this.setFolderExpanded(nodeId, true);
        }
        break;
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

  protected handleFilterMenuSelect(actionId: string): void {
    if (isMockServerKindFilterAction(actionId)) {
      this.kindFilter.set(actionId);
      this.scheduleSessionSave();
    } else if (actionId.startsWith('tag:')) {
      const tag = actionId.slice(4);
      this.tagFilter.update((tags) => {
        const lower = tag.toLowerCase();
        const has = tags.some((t) => t.toLowerCase() === lower);
        return has ? tags.filter((t) => t.toLowerCase() !== lower) : [...tags, tag];
      });
      this.scheduleSessionSave();
    }
    this.filterMenuOpen.set(false);
    this.cdr.markForCheck();
  }

  protected handleSortMenuSelect(actionId: string): void {
    if (isMockServerSortAction(actionId)) {
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

  protected handleDeleteConfirmed(): void {
    const id = this.deleteNodeId();
    if (!id) {
      return;
    }
    const removedTabIds = this.mockServer
      .deleteNode(id)
      .map((endpointId) => mockServerTabResourceId(endpointId));
    this.workspaceEditor.closeTabsForResourceIds(removedTabIds);
    this.expandedIds.update((ids) => ids.filter((folderId) => folderId !== id));
    this.scheduleSessionSave();
    this.deleteOpen.set(false);
    this.cdr.markForCheck();
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    if (nodeId === null) {
      this.contextMenuItems.set(buildEmptyMockServerContextMenu());
    } else {
      const loc = findMockServerNode(this.mockServer.nodes(), nodeId);
      const kind = (loc?.node.data?.kind ?? loc?.node.kind ?? 'folder') as MockServerTreeKind;
      const expanded = this.expandedIds().includes(nodeId);
      const hasChildren = mockServerFolderHasChildren(this.mockServer.nodes(), nodeId);
      const atRoot = !loc?.parent;
      this.contextMenuItems.set(
        buildMockServerNodeContextMenu(kind, expanded, hasChildren, atRoot),
      );
    }
    this.contextMenuPosition.set({ x, y });
    this.contextMenuOpen.set(true);
  }

  private handleCreate(kind: MockServerTreeKind, parentId: string | null): void {
    if (kind === 'folder') {
      this.mockServer.addFolder();
      this.cdr.markForCheck();
      return;
    }

    let resolvedParent: string | null = null;
    if (parentId) {
      const loc = findMockServerNode(this.mockServer.nodes(), parentId);
      if (loc && isMockServerFolderNode(loc.node)) {
        resolvedParent = parentId;
      }
    }

    const endpoint = this.mockServer.addEndpoint(resolvedParent);
    if (resolvedParent) {
      this.setFolderExpanded(resolvedParent, true);
    }
    this.openEndpoint(endpoint.id);
    this.cdr.markForCheck();
  }

  private startInlineRename(nodeId: string): void {
    if (!findMockServerNode(this.mockServer.nodes(), nodeId)) {
      return;
    }
    this.renamingNodeId.set(nodeId);
  }

  private openDeleteDialog(nodeId: string): void {
    const loc = findMockServerNode(this.mockServer.nodes(), nodeId);
    if (!loc) {
      return;
    }
    const endpointCount = collectMockServerEndpointIdsForDeletion(this.mockServer.nodes(), nodeId).length;
    const label = loc.node.label;
    this.deleteMessage.set(
      isMockServerFolderNode(loc.node)
        ? `Delete folder “${label}” and ${endpointCount} endpoint${endpointCount === 1 ? '' : 's'}?`
        : `Delete endpoint “${label}”?`,
    );
    this.deleteNodeId.set(nodeId);
    this.deleteOpen.set(true);
  }

  private openEndpoint(endpointId: string): void {
    this.workspaceEditor.openResource({
      resourceId: mockServerTabResourceId(endpointId),
      kind: 'mock-server',
    });
  }

  private toggleFolderExpanded(folderId: string): void {
    const expanded = this.expandedIds().includes(folderId);
    this.setFolderExpanded(folderId, !expanded);
  }

  private setFolderExpanded(folderId: string, expanded: boolean): void {
    this.expandedIds.update((ids) => {
      if (expanded) {
        return ids.includes(folderId) ? ids : [...ids, folderId];
      }
      return ids.filter((id) => id !== folderId);
    });
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  private scheduleSessionSave(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }
    this.sessionTimer = setTimeout(() => {
      this.sessionTimer = null;
      void this.configService.patchSession({
        workspace: {
          testing: {
            ...this.testingSession.navigationFields(),
            mockServer: {
              searchQuery: this.searchQuery(),
              expandedIds: this.expandedIds(),
              kindFilter: this.kindFilter(),
              sortBy: this.sortBy(),
              tagFilter: this.tagFilter(),
              settingsExpanded: this.settingsExpanded(),
              mismatchesPanelExpanded: this.mismatchesPanelExpanded(),
            },
          },
        },
      });
    }, SESSION_DEBOUNCE_MS);
  }
}
