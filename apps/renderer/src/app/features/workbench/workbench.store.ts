import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  prependRequestRun,
  requestViewFromTab,
  tabChromeFromRequestView,
  DEFAULT_LISTENER_UI,
  DEFAULT_INTERCEPT_UI,
  type CollectionFolderNode,
  type CollectionNode,
  type DatabaseConnection,
  type DatabaseDiagramTabTarget,
  type DatabaseTableTabTarget,
  type Environment,
  type HttpMethod,
  type SavedDatabaseQuery,
  type SessionFile,
  type SessionListenerUi,
  type SessionInterceptUi,
  type SessionRequestView,
  type SessionResultsDock,
  type FolderTabSection,
  type FolderScriptPane,
  type FolderDocsMode,
  type RequestResponseTab,
  type RequestRunSnapshot,
  type RequestTabSection,
  type WebsocketTabSection,
  type HistoryEntry,
  type ServiceItem,
  type ToolItem,
  databaseConnectionTabNodeId,
  databaseDiagramTabNodeId,
  databaseQueryTabNodeId,
  databaseTableTabNodeId,
} from '@testrix/contracts';

import { DesktopApiService } from '../../core/desktop-api.service';
import { DirtyTabsRegistry } from '../../core/dirty-tabs.registry';
import { ShellStateService } from '../../core/shell-state.service';
import { HttpInflightRegistry } from '../../core/http-inflight.registry';
import {
  applyPointerSelect,
  emptySelection,
  shouldKeepPointerSelection,
} from '../../core/range-select';
import {
  bumpIdSequences,
  environmentFocusPatch,
  groupFromSession,
  interceptUiFromSession,
  listenerUiFromSession,
  nextGroupId,
  nextTabId,
  selectionForTabs,
  serviceSectionsFromSession,
  tabFromDatabaseConnection,
  tabFromDatabaseDiagram,
  tabFromDatabaseQuery,
  tabFromDatabaseTable,
  tabFromEmulatorDevice,
  tabFromEnvironment,
  tabFromFolder,
  tabFromNode,
  tabFromService,
  tabFromTool,
  viewsFromSession,
} from './workbench-tabs';

/** Open workbench document backed by a collection leaf, environment, or tool. */
export interface WorkbenchTab {
  readonly id: string;
  readonly nodeId: string;
  readonly kind:
    | 'http'
    | 'websocket'
    | 'collection-folder'
    | 'environment'
    | 'tool'
    | 'service'
    | 'flow'
    | 'flow-template'
    | 'load'
    | 'regression'
    | 'emulator'
    | 'mock-endpoint'
    | 'listener-session'
    | 'intercept-rule'
    | 'database-connection'
    | 'database-query'
    | 'database-table'
    | 'database-diagram'
    | 'history'
    | 'plantuml'
    | 'collab-review';
  readonly title: string;
  readonly method?: HttpMethod;
  readonly url: string;
  readonly status: number | null;
  readonly folderSection?: FolderTabSection;
  readonly folderScriptPane?: FolderScriptPane;
  readonly folderDocsMode?: FolderDocsMode;
  readonly requestSection?: RequestTabSection;
  readonly requestScriptPane?: FolderScriptPane;
  readonly requestDocsMode?: FolderDocsMode;
  readonly requestSplitRatio?: number;
  readonly requestResponseTab?: RequestResponseTab;
  readonly requestResponseHidden?: boolean;
  readonly requestSnippetLang?: 'curl' | 'fetch' | 'httpie';
  /** Load / Regression results dock collapsed (session-persisted). */
  readonly resultsDockHidden?: boolean;
  /** PlantUML editor: Grid, Source, or Build. */
  readonly plantumlView?: 'grid' | 'source' | 'build';
  readonly plantumlGridZoom?: number;
  readonly plantumlGridPanX?: number;
  readonly plantumlGridPanY?: number;
  readonly plantumlPreviewZoom?: number;
  readonly plantumlPreviewPanX?: number;
  readonly plantumlPreviewPanY?: number;
  readonly plantumlBuilderWidth?: number;
  readonly plantumlBuilderCollapsed?: boolean;
  readonly serviceSection?: string;
  /** Flow Design outline rail. */
  readonly flowOutlineOpen?: boolean;
  /** Selected graph node ids in the active flow scenario. */
  readonly flowSelectedNodeIds?: string[];
  /** Active scenario id for this flow tab. */
  readonly flowScenarioId?: string;
  readonly websocketSection?: WebsocketTabSection;
  readonly environmentFocusKey?: string;
  readonly environmentFocusNonce?: number;
  readonly readonly?: boolean;
  /** Prefill for Replay tabs opened from History (not persisted meaningfully). */
  readonly replaySeed?: {
    readonly headers: readonly { readonly key: string; readonly value: string }[];
    readonly body: string;
  };
}

/** One VS Code-style editor group with its own tab strip. */
export interface WorkbenchGroup {
  readonly id: string;
  readonly tabs: readonly WorkbenchTab[];
  readonly activeTabId: string | null;
  readonly selectedTabIds: readonly string[];
  readonly tabAnchorId: string | null;
}

/** Id of the right-edge drop list used to create a split pane. */
export const WORKBENCH_SPLIT_RIGHT_ID = 'workbench-split-right';

export interface WorkbenchSplitPreview {
  readonly side: 'right';
  readonly fromGroupId: string;
  readonly tabId: string;
  readonly tabIndex: number;
}

/** Insert caret while dragging a tab (CDK sorting stays disabled). */
export interface WorkbenchTabDropCue {
  readonly listId: string;
  readonly beforeTabId: string | null;
  readonly append: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkbenchStore {
  private readonly desktop = inject(DesktopApiService);
  private readonly httpInflight = inject(HttpInflightRegistry);
  private readonly dirtyTabs = inject(DirtyTabsRegistry);
  private readonly shell = inject(ShellStateService);
  readonly groups = signal<readonly WorkbenchGroup[]>([]);
  readonly focusedGroupId = signal<string | null>(null);
  readonly justOpenedId = signal<string | null>(null);
  /** Per-group panel animation epochs. */
  readonly panelEpochs = signal<Readonly<Record<string, number>>>({});
  /** Horizontal split sizes as fractions that sum to 1. */
  readonly splitSizes = signal<readonly number[]>([1]);
  readonly requestRunsById = signal<Readonly<Record<string, readonly RequestRunSnapshot[]>>>({});
  /** Results/response dock open state keyed by artifact node id (survives tab close). */
  readonly resultsDockByNodeId = signal<Readonly<Record<string, SessionResultsDock>>>({});
  /** Request and websocket editor chrome keyed by collection or history node id. */
  readonly requestViewsByNodeId = signal<Readonly<Record<string, SessionRequestView>>>({});
  /** Listener Network search/sort keyed by listener node id (survives tab close). */
  readonly listenerUiById = signal<Readonly<Record<string, SessionListenerUi>>>({});
  /** Interceptor Activity search/sort keyed by intercept node id (survives tab close). */
  readonly interceptUiById = signal<Readonly<Record<string, SessionInterceptUi>>>({});
  /** Last open section keyed by service artifact node id (survives tab close). */
  readonly serviceSectionByNodeId = signal<Readonly<Record<string, string>>>({});
  /** Postman-style split zone while dragging a tab to the right edge. */
  readonly splitPreview = signal<WorkbenchSplitPreview | null>(null);
  /** Pointer-based tab insert caret while dragging. */
  readonly tabDropCue = signal<WorkbenchTabDropCue | null>(null);
  readonly dragTabIds = signal<readonly string[]>([]);
  /** Start request consumed by the open emulator device tab. */
  readonly emulatorBoot = signal<{ readonly deviceId: string; readonly coldBoot: boolean } | null>(null);

  private openAnimTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly closedTabsStack = signal<
    readonly { readonly groupId: string; readonly tab: WorkbenchTab }[]
  >([]);

  readonly hasTabs = computed(() => this.groups().some((group) => group.tabs.length > 0));

  readonly lastClosedTab = computed(() => this.closedTabsStack()[0]?.tab ?? null);

  restoreSession(session: SessionFile): void {
    this.closedTabsStack.set([]);
    this.groups.set(session.groups.map(groupFromSession));
    this.focusedGroupId.set(session.focusedGroupId);
    this.splitSizes.set(session.splitSizes.length > 0 ? session.splitSizes : [1]);
    this.requestRunsById.set(session.requestRunsById ?? {});
    this.resultsDockByNodeId.set(session.resultsDockByNodeId ?? {});
    this.requestViewsByNodeId.set(viewsFromSession(session));
    this.listenerUiById.set(listenerUiFromSession(session));
    this.interceptUiById.set(interceptUiFromSession(session));
    this.serviceSectionByNodeId.set(serviceSectionsFromSession(session));
    bumpIdSequences(session.groups);
  }

  patchTab(tabId: string, patch: Partial<WorkbenchTab>): void {
    const viewPatch = requestViewFromTab(patch);
    if (Object.keys(viewPatch).length > 0) {
      const nodeId = this.nodeIdForTab(tabId);
      if (nodeId)
        this.requestViewsByNodeId.update((map) => ({
          ...map,
          [nodeId]: { ...map[nodeId], ...viewPatch },
        }));
    }
    if (typeof patch.serviceSection === 'string') {
      const nodeId = this.nodeIdForTab(tabId);
      if (nodeId)
        this.serviceSectionByNodeId.update((map) => ({
          ...map,
          [nodeId]: patch.serviceSection as string,
        }));
    }
    this.groups.update((groups) =>
      groups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
      })),
    );
  }

  isResultsDockHidden(nodeId: string): boolean {
    return this.resultsDockByNodeId()[nodeId]?.hidden === true;
  }

  setResultsDockHidden(nodeId: string, hidden: boolean): void {
    this.resultsDockByNodeId.update((map) => ({
      ...map,
      [nodeId]: { hidden },
    }));
  }

  listenerUi(nodeId: string): SessionListenerUi {
    return this.listenerUiById()[nodeId] ?? { ...DEFAULT_LISTENER_UI };
  }

  patchListenerUi(nodeId: string, patch: Partial<SessionListenerUi>): void {
    this.listenerUiById.update((map) => ({
      ...map,
      [nodeId]: {
        ...DEFAULT_LISTENER_UI,
        ...map[nodeId],
        ...patch,
      },
    }));
  }

  interceptUi(nodeId: string): SessionInterceptUi {
    return this.interceptUiById()[nodeId] ?? { ...DEFAULT_INTERCEPT_UI };
  }

  patchInterceptUi(nodeId: string, patch: Partial<SessionInterceptUi>): void {
    this.interceptUiById.update((map) => ({
      ...map,
      [nodeId]: {
        ...DEFAULT_INTERCEPT_UI,
        ...map[nodeId],
        ...patch,
      },
    }));
  }

  toSessionPatch(): Pick<
    SessionFile,
    | 'groups'
    | 'focusedGroupId'
    | 'splitSizes'
    | 'requestRunsById'
    | 'resultsDockByNodeId'
    | 'requestViewsByNodeId'
    | 'listenerUiById'
    | 'interceptUiById'
    | 'serviceSectionByNodeId'
  > {
    return {
      groups: this.groups().map((group) => ({
        id: group.id,
        activeTabId: group.activeTabId,
        selectedTabIds: [...group.selectedTabIds],
        tabAnchorId: group.tabAnchorId,
        tabs: group.tabs.map((tab) => ({ ...tab })),
      })),
      focusedGroupId: this.focusedGroupId(),
      splitSizes: [...this.splitSizes()],
      requestRunsById: Object.fromEntries(
        Object.entries(this.requestRunsById()).map(([id, runs]) => [id, [...runs]]),
      ),
      resultsDockByNodeId: { ...this.resultsDockByNodeId() },
      requestViewsByNodeId: { ...this.requestViewsByNodeId() },
      listenerUiById: { ...this.listenerUiById() },
      interceptUiById: { ...this.interceptUiById() },
      serviceSectionByNodeId: { ...this.serviceSectionByNodeId() },
    };
  }

  readonly focusedGroup = computed(() => {
    const id = this.focusedGroupId();
    const groups = this.groups();
    if (!id) {
      return groups[0] ?? null;
    }
    return groups.find((group) => group.id === id) ?? groups[0] ?? null;
  });

  readonly activeTab = computed(() => {
    const group = this.focusedGroup();
    if (!group?.activeTabId)
      return null;
    return group.tabs.find((tab) => tab.id === group.activeTabId) ?? null;
  });

  private readonly softRailEffect = effect(() => {
    const tab = this.activeTab();
    if (tab?.kind === 'history') {
      this.shell.setSoftRailHighlight('history');
      return;
    }
    if (tab?.kind === 'environment') {
      this.shell.setSoftRailHighlight('environments');
      return;
    }
    this.shell.setSoftRailHighlight(null);
  });

  readonly openNodeIds = computed(() => {
    const ids = new Set<string>();
    for (const group of this.groups()) {
      for (const tab of group.tabs) {
        ids.add(tab.nodeId);
      }
    }
    return ids;
  });

  readonly tabCount = computed(() =>
    this.groups().reduce((sum, group) => sum + group.tabs.length, 0),
  );

  /** Closes every tab that is not the active tab in its editor group. */
  closeInactiveTabs(): void {
    for (const group of this.groups()) {
      if (!group.activeTabId)
        continue;
      const inactive = group.tabs.filter((tab) => tab.id !== group.activeTabId).map((tab) => tab.id);
      this.closeMany(group.id, inactive);
    }
  }

  /** Closes all tabs in the focused group except the active one. */
  closeAllButCurrent(): void {
    const group = this.focusedGroup();
    if (!group?.activeTabId)
      return;
    this.closeOthers(group.id, group.activeTabId);
  }

  readonly activeNodeId = computed(() => {
    const group = this.focusedGroup();
    if (!group?.activeTabId) {
      return null;
    }
    return group.tabs.find((tab) => tab.id === group.activeTabId)?.nodeId ?? null;
  });

  isOpen(nodeId: string): boolean {
    return this.openNodeIds().has(nodeId);
  }

  isActive(nodeId: string): boolean {
    return this.activeNodeId() === nodeId;
  }

  groupTablistId(groupId: string): string {
    return `workbench-tabs-${groupId}`;
  }

  connectedTablistIds(groupId: string): string[] {
    const ids = this.groups()
      .filter((group) => group.id !== groupId)
      .map((group) => this.groupTablistId(group.id));
    if (this.canSplitFromDrag()) {
      ids.push(WORKBENCH_SPLIT_RIGHT_ID);
    }
    return ids;
  }

  /** True when dragging a tab can create a right split (single group, 2+ tabs). */
  canSplitFromDrag(): boolean {
    const groups = this.groups();
    if (groups.length !== 1) {
      return false;
    }
    const dragIds = this.dragTabIds();
    if (dragIds.length > 0 && dragIds.length >= groups[0].tabs.length) {
      return false;
    }
    return groups[0].tabs.length >= 2;
  }

  isTabSelected(groupId: string, tabId: string): boolean {
    const group = this.groups().find((item) => item.id === groupId);
    return group?.selectedTabIds.includes(tabId) ?? false;
  }

  applyTabPointerSelect(
    groupId: string,
    tabId: string,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): { readonly shouldActivate: boolean } {
    const group = this.groups().find((item) => item.id === groupId);
    if (!group?.tabs.some((tab) => tab.id === tabId)) {
      return { shouldActivate: false };
    }
    if (shouldKeepPointerSelection({ event, selectedIds: group.selectedTabIds, targetId: tabId })) {
      return { shouldActivate: false };
    }
    const next = applyPointerSelect({
      event,
      visibleIds: group.tabs.map((tab) => tab.id),
      selectedIds: group.selectedTabIds,
      anchorId: group.tabAnchorId,
      targetId: tabId,
    });
    this.patchGroup(groupId, {
      selectedTabIds: next.ids,
      tabAnchorId: next.anchorId,
    });
    this.focusGroup(groupId);
    return { shouldActivate: !event.shiftKey && !event.ctrlKey && !event.metaKey };
  }

  clearTabSelection(groupId: string): void {
    const next = emptySelection();
    this.patchGroup(groupId, { selectedTabIds: next.ids, tabAnchorId: next.anchorId });
  }

  beginTabDrag(groupId: string, tabId: string): readonly string[] {
    const ids = this.dragTabIdsFor(groupId, tabId);
    this.dragTabIds.set(ids);
    return ids;
  }

  endTabDrag(): void {
    this.dragTabIds.set([]);
  }

  private dragTabIdsFor(groupId: string, sourceId: string): readonly string[] {
    const group = this.groups().find((item) => item.id === groupId);
    if (!group) {
      return [sourceId];
    }
    if (group.selectedTabIds.includes(sourceId)) {
      return group.tabs.map((tab) => tab.id).filter((id) => group.selectedTabIds.includes(id));
    }
    this.patchGroup(groupId, { selectedTabIds: [sourceId], tabAnchorId: sourceId });
    return [sourceId];
  }

  private nodeIdForTab(tabId: string): string | null {
    for (const group of this.groups()) {
      const tab = group.tabs.find((item) => item.id === tabId);
      if (tab)
        return tab.nodeId;
    }
    return null;
  }

  private withSavedRequestView<T extends WorkbenchTab>(tab: T): T {
    return { ...tab, ...tabChromeFromRequestView(this.requestViewsByNodeId()[tab.nodeId]) };
  }

  private patchGroup(groupId: string, patch: Partial<WorkbenchGroup>): void {
    this.groups.update((list) =>
      list.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    );
  }

  private makeGroup(
    id: string,
    tabs: readonly WorkbenchTab[],
    activeTabId: string | null,
    selection?: Pick<WorkbenchGroup, 'selectedTabIds' | 'tabAnchorId'>,
  ): WorkbenchGroup {
    return {
      id,
      tabs,
      activeTabId,
      ...(selection ?? selectionForTabs(tabs, activeTabId ? [activeTabId] : [], activeTabId)),
    };
  }

  panelEpoch(groupId: string): number {
    return this.panelEpochs()[groupId] ?? 0;
  }

  /**
   * Opens a tab in the focused group, or focuses an existing tab for that node.
   */
  openFromNode(node: CollectionNode): void {
    const base = tabFromNode(node);
    if (!base) {
      return;
    }
    const viewed = this.withSavedRequestView(base);
    const draft: WorkbenchTab =
      viewed.kind === 'http' &&
      viewed.requestResponseHidden === undefined &&
      this.resultsDockByNodeId()[node.id]
        ? { ...viewed, requestResponseHidden: this.isResultsDockHidden(node.id) }
        : viewed;

    const groups = this.groups();
    for (const group of groups) {
      const existing = group.tabs.find((tab) => tab.nodeId === node.id);
      if (existing) {
        this.focusGroup(group.id);
        this.activate(group.id, existing.id);
        return;
      }
    }

    if (groups.length === 0) {
      const groupId = nextGroupId();
      this.groups.set([this.makeGroup(groupId, [draft], draft.id)]);
      this.focusedGroupId.set(groupId);
      this.splitSizes.set([1]);
      this.bumpPanel(groupId);
      this.markJustOpened(draft.id);
      return;
    }

    const focused = this.focusedGroup();
    if (!focused) {
      return;
    }

    this.groups.update((list) =>
      list.map((group) => {
        if (group.id !== focused.id) {
          return group;
        }
        return {
          ...group,
          tabs: [...group.tabs, draft],
          activeTabId: draft.id,
          selectedTabIds: [draft.id],
          tabAnchorId: draft.id,
        };
      }),
    );
    this.focusGroup(focused.id);
    this.bumpPanel(focused.id);
    this.markJustOpened(draft.id);
  }

  /**
   * Opens a folder settings tab from the collections context menu.
   */
  openFromCollectionFolder(node: CollectionFolderNode, section?: FolderTabSection): void {
    this.openOrFocusDatabaseTab('collection-folder', node.id, () => ({
      ...tabFromFolder(node),
      folderSection: section,
    }));
    if (!section)
      return;
    for (const group of this.groups()) {
      const existing = group.tabs.find(
        (tab) => tab.kind === 'collection-folder' && tab.nodeId === node.id,
      );
      if (existing)
        this.patchTab(existing.id, { folderSection: section });
    }
  }

  runsFor(requestId: string): readonly RequestRunSnapshot[] {
    return this.requestRunsById()[requestId] ?? [];
  }

  prependRun(requestId: string, snapshot: RequestRunSnapshot): void {
    this.requestRunsById.update((current) => ({
      ...current,
      [requestId]: prependRequestRun(current[requestId] ?? [], snapshot),
    }));
  }

  /**
   * Opens a read-only history snapshot tab.
   */
  openFromHistory(entry: HistoryEntry): void {
    this.openOrFocusDatabaseTab('history', entry.id, () =>
      this.withSavedRequestView({
        id: nextTabId(entry.id),
        nodeId: entry.id,
        kind: 'history',
        title: entry.requestName || entry.url || 'History',
        method: entry.method,
        url: entry.url,
        status: entry.status,
        readonly: true,
      }),
    );
  }

  /**
   * Opens a new editable HTTP tab prefilled from a history snapshot.
   */
  openEditableFromHistory(entry: HistoryEntry): void {
    const nodeId = `replay-${entry.id}-${Date.now()}`;
    this.appendTab({
      id: nextTabId(nodeId),
      nodeId,
      kind: 'http',
      title: entry.requestName ? `${entry.requestName} (replay)` : 'Replay',
      method: entry.method,
      url: entry.url,
      status: null,
      replaySeed: {
        headers: entry.requestHeaders.map((row) => ({ key: row.key, value: row.value })),
        body: entry.requestBody,
      },
    });
  }

  /**
   * Opens a tab for an environment, or focuses an existing one.
   * When `focusKey` is set, the editor selects that variable.
   */
  openFromEnvironment(env: Environment, focusKey?: string): void {
    const focus = environmentFocusPatch(focusKey);
    const groups = this.groups();
    for (const group of groups) {
      const existing = group.tabs.find(
        (tab) => tab.kind === 'environment' && tab.nodeId === env.id,
      );
      if (existing) {
        this.focusGroup(group.id);
        this.activate(group.id, existing.id);
        if (focus.environmentFocusKey)
          this.patchTab(existing.id, focus);
        return;
      }
    }

    const draft = { ...tabFromEnvironment(env), ...focus };
    if (groups.length === 0) {
      const groupId = nextGroupId();
      this.groups.set([this.makeGroup(groupId, [draft], draft.id)]);
      this.focusedGroupId.set(groupId);
      this.splitSizes.set([1]);
      this.bumpPanel(groupId);
      this.markJustOpened(draft.id);
      return;
    }

    const focused = this.focusedGroup();
    if (!focused) {
      return;
    }

    this.groups.update((list) =>
      list.map((group) => {
        if (group.id !== focused.id) {
          return group;
        }
        return {
          ...group,
          tabs: [...group.tabs, draft],
          activeTabId: draft.id,
          selectedTabIds: [draft.id],
          tabAnchorId: draft.id,
        };
      }),
    );
    this.focusGroup(focused.id);
    this.bumpPanel(focused.id);
    this.markJustOpened(draft.id);
  }

  /**
   * Opens a tab for a development tool, or focuses an existing one.
   */
  openFromTool(tool: ToolItem): void {
    const groups = this.groups();
    for (const group of groups) {
      const existing = group.tabs.find((tab) => tab.kind === 'tool' && tab.nodeId === tool.id);
      if (existing) {
        this.focusGroup(group.id);
        this.activate(group.id, existing.id);
        return;
      }
    }

    const draft = tabFromTool(tool);
    if (groups.length === 0) {
      const groupId = nextGroupId();
      this.groups.set([this.makeGroup(groupId, [draft], draft.id)]);
      this.focusedGroupId.set(groupId);
      this.splitSizes.set([1]);
      this.bumpPanel(groupId);
      this.markJustOpened(draft.id);
      return;
    }

    const focused = this.focusedGroup();
    if (!focused) {
      return;
    }

    this.groups.update((list) =>
      list.map((group) => {
        if (group.id !== focused.id) {
          return group;
        }
        return {
          ...group,
          tabs: [...group.tabs, draft],
          activeTabId: draft.id,
          selectedTabIds: [draft.id],
          tabAnchorId: draft.id,
        };
      }),
    );
    this.focusGroup(focused.id);
    this.bumpPanel(focused.id);
    this.markJustOpened(draft.id);
  }

  /**
   * Opens a service artifact tab, or focuses an existing one.
   */
  openFromServiceArtifact(
    kind: WorkbenchTab['kind'],
    nodeId: string,
    title: string,
    serviceSection?: string,
  ): void {
    const savedSection = this.serviceSectionByNodeId()[nodeId];
    this.openOrFocusDatabaseTab(kind, nodeId, () => ({
      id: nextTabId(nodeId),
      nodeId,
      kind,
      title,
      url: '',
      status: null,
      serviceSection: savedSection ?? serviceSection,
      resultsDockHidden: this.isResultsDockHidden(nodeId),
    }));
  }

  /** Opens a flow template editor tab, or focuses an existing one. */
  openFromFlowTemplate(templateId: string, title: string): void {
    this.openOrFocusDatabaseTab('flow-template', templateId, () => ({
      id: nextTabId(templateId),
      nodeId: templateId,
      kind: 'flow-template',
      title,
      url: '',
      status: null,
    }));
  }

  renameFlowTemplateTabs(templateId: string, title: string): void {
    this.groups.update((groups) =>
      groups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) =>
          tab.kind === 'flow-template' && tab.nodeId === templateId ? { ...tab, title } : tab,
        ),
      })),
    );
  }

  closeFlowTemplateTabs(templateIds: readonly string[]): void {
    this.closeTabsByNodeIds(templateIds, ['flow-template']);
  }

  /** Opens a saved PlantUML diagram tab, or focuses an existing one. */
  openFromPlantuml(diagramId: string, title: string): void {
    this.openOrFocusDatabaseTab('plantuml', diagramId, () => ({
      id: nextTabId(diagramId),
      nodeId: diagramId,
      kind: 'plantuml',
      title,
      url: '',
      status: null,
    }));
  }

  renamePlantumlTabs(diagramId: string, title: string): void {
    this.groups.update((groups) =>
      groups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) =>
          tab.kind === 'plantuml' && tab.nodeId === diagramId ? { ...tab, title } : tab,
        ),
      })),
    );
  }

  closePlantumlTabs(diagramIds: readonly string[]): void {
    this.closeTabsByNodeIds(diagramIds, ['plantuml']);
  }

  renameServiceTabs(nodeId: string, title: string): void {
    this.groups.update((groups) =>
      groups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) => (tab.nodeId === nodeId ? { ...tab, title } : tab)),
      })),
    );
  }

  closeServiceTabs(nodeIds: readonly string[]): void {
    this.closeTabsByNodeIds(nodeIds, [
      'flow',
      'load',
      'regression',
      'mock-endpoint',
      'listener-session',
      'intercept-rule',
    ]);
  }

  /**
   * Opens one Emulator console tab per device, or focuses the existing tab.
   */
  openFromEmulatorDevice(device: { readonly id: string; readonly name: string }): void {
    this.openOrFocusDatabaseTab('emulator', device.id, () => tabFromEmulatorDevice(device));
  }

  /** Opens the device tab and asks it to start, including first-time tool install. */
  requestEmulatorBoot(device: { readonly id: string; readonly name: string }, coldBoot = false): void {
    this.openFromEmulatorDevice(device);
    this.emulatorBoot.set({ deviceId: device.id, coldBoot });
  }

  clearEmulatorBoot(): void {
    this.emulatorBoot.set(null);
  }

  renameEmulatorDeviceTabs(deviceId: string, title: string): void {
    this.groups.update((list) =>
      list.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) =>
          tab.kind === 'emulator' && tab.nodeId === deviceId ? { ...tab, title } : tab,
        ),
      })),
    );
  }

  closeEmulatorDeviceTabs(deviceIds: readonly string[]): void {
    this.closeTabsByNodeIds(deviceIds, ['emulator']);
  }

  /**
   * Opens a mocked service preview tab, or focuses an existing one.
   */
  openFromService(service: ServiceItem): void {
    const groups = this.groups();
    for (const group of groups) {
      const existing = group.tabs.find((tab) => tab.kind === 'service' && tab.nodeId === service.id);
      if (existing) {
        this.focusGroup(group.id);
        this.activate(group.id, existing.id);
        return;
      }
    }

    const draft = tabFromService(service);
    if (groups.length === 0) {
      const groupId = nextGroupId();
      this.groups.set([this.makeGroup(groupId, [draft], draft.id)]);
      this.focusedGroupId.set(groupId);
      this.splitSizes.set([1]);
      this.bumpPanel(groupId);
      this.markJustOpened(draft.id);
      return;
    }

    const focused = this.focusedGroup();
    if (!focused)
      return;

    this.groups.update((list) =>
      list.map((group) => {
        if (group.id !== focused.id)
          return group;
        return {
          ...group,
          tabs: [...group.tabs, draft],
          activeTabId: draft.id,
          selectedTabIds: [draft.id],
          tabAnchorId: draft.id,
        };
      }),
    );
    this.focusGroup(focused.id);
    this.bumpPanel(focused.id);
    this.markJustOpened(draft.id);
  }

  /**
   * Opens a connection-settings tab, or focuses an existing one.
   */
  openFromDatabaseConnection(connection: DatabaseConnection): void {
    this.openOrFocusDatabaseTab(
      'database-connection',
      databaseConnectionTabNodeId(connection.id),
      () => tabFromDatabaseConnection(connection),
    );
  }

  /**
   * Opens a saved-query editor tab. Duplicate always creates a new tab.
   */
  openFromDatabaseQuery(query: SavedDatabaseQuery, options?: { readonly duplicate?: boolean }): void {
    if (!options?.duplicate) {
      this.openOrFocusDatabaseTab(
        'database-query',
        databaseQueryTabNodeId(query.id),
        () => tabFromDatabaseQuery(query),
      );
      return;
    }

    const draft = tabFromDatabaseQuery(query);
    this.appendTab(draft);
  }

  /**
   * Opens a table-data tab for a catalog table, or focuses an existing one.
   */
  openFromDatabaseTable(target: DatabaseTableTabTarget, title: string): void {
    this.openOrFocusDatabaseTab(
      'database-table',
      databaseTableTabNodeId(target),
      () => tabFromDatabaseTable(target, title),
    );
  }

  openFromDatabaseDiagram(target: DatabaseDiagramTabTarget, title: string): void {
    this.openOrFocusDatabaseTab(
      'database-diagram',
      databaseDiagramTabNodeId(target),
      () => tabFromDatabaseDiagram(target, title),
    );
  }

  renameDatabaseConnectionTabs(connectionId: string, name: string): void {
    const nodeId = databaseConnectionTabNodeId(connectionId);
    this.groups.update((list) =>
      list.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) =>
          tab.kind === 'database-connection' && tab.nodeId === nodeId ? { ...tab, title: name } : tab,
        ),
      })),
    );
  }

  renameDatabaseQueryTabs(queryId: string, name: string): void {
    const nodeId = databaseQueryTabNodeId(queryId);
    this.groups.update((list) =>
      list.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) =>
          tab.kind === 'database-query' && tab.nodeId === nodeId ? { ...tab, title: name } : tab,
        ),
      })),
    );
  }

  closeDatabaseTabs(nodeIds: ReadonlySet<string>): void {
    if (nodeIds.size === 0) {
      return;
    }
    for (const group of this.groups()) {
      for (const tab of group.tabs) {
        if (nodeIds.has(tab.nodeId)) {
          this.close(group.id, tab.id);
        }
      }
    }
  }

  renameEnvironmentTabs(envId: string, name: string): void {
    this.groups.update((list) =>
      list.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) =>
          tab.kind === 'environment' && tab.nodeId === envId ? { ...tab, title: name } : tab,
        ),
      })),
    );
  }

  renameCollectionTabs(nodeId: string, name: string): void {
    this.groups.update((list) =>
      list.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) => (tab.nodeId === nodeId ? { ...tab, title: name } : tab)),
      })),
    );
  }

  focusGroup(groupId: string): void {
    if (!this.groups().some((group) => group.id === groupId)) {
      return;
    }
    this.focusedGroupId.set(groupId);
  }

  activate(groupId: string, tabId: string): void {
    const group = this.groups().find((item) => item.id === groupId);
    if (!group?.tabs.some((tab) => tab.id === tabId)) {
      return;
    }
    this.focusGroup(groupId);
    if (group.activeTabId === tabId) {
      return;
    }
    this.patchGroup(groupId, { activeTabId: tabId });
  }

  /** Reopens the most recently closed tab, if any. */
  reopenLastClosed(): boolean {
    const record = this.closedTabsStack()[0];
    if (!record)
      return false;
    this.closedTabsStack.update((stack) => stack.slice(1));
    const draft: WorkbenchTab = { ...record.tab, id: nextTabId(record.tab.nodeId) };
    const groups = this.groups();
    const targetGroup = groups.find((group) => group.id === record.groupId);
    if (targetGroup) {
      this.groups.update((list) =>
        list.map((group) =>
          group.id === targetGroup.id
            ? {
                ...group,
                tabs: [...group.tabs, draft],
                activeTabId: draft.id,
                selectedTabIds: [draft.id],
                tabAnchorId: draft.id,
              }
            : group,
        ),
      );
      this.focusGroup(targetGroup.id);
      this.bumpPanel(targetGroup.id);
      this.markJustOpened(draft.id);
      return true;
    }
    if (groups.length === 0) {
      const groupId = nextGroupId();
      this.groups.set([this.makeGroup(groupId, [draft], draft.id)]);
      this.focusedGroupId.set(groupId);
      this.splitSizes.set([1]);
      this.bumpPanel(groupId);
      this.markJustOpened(draft.id);
      return true;
    }
    this.appendTab(draft);
    return true;
  }

  close(groupId: string, tabId: string): void {
    const groups = this.groups();
    const groupIndex = groups.findIndex((group) => group.id === groupId);
    if (groupIndex < 0) {
      return;
    }

    const group = groups[groupIndex];
    const tabIndex = group.tabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex < 0) {
      return;
    }

    const tab = group.tabs[tabIndex];
    this.closedTabsStack.update((stack) => [{ groupId, tab }, ...stack].slice(0, 16));
    this.disconnectSocket(tab);
    const inflight = this.httpInflight.abortIdFor(tabId);
    if (inflight)
      void this.desktop.api.http.abort(inflight);
    this.httpInflight.clear(tabId);
    this.dirtyTabs.clear(tabId);

    const nextTabs = group.tabs.filter((item) => item.id !== tabId);
    if (nextTabs.length === 0) {
      const nextGroups = groups.filter((item) => item.id !== groupId);
      if (nextGroups.length === 0) {
        this.groups.set([]);
        this.focusedGroupId.set(null);
        this.splitSizes.set([1]);
        this.justOpenedId.set(null);
        this.panelEpochs.set({});
        return;
      }

      this.groups.set(nextGroups);
      this.splitSizes.set(this.equalSizes(nextGroups.length));
      const focusId =
        this.focusedGroupId() === groupId
          ? nextGroups[Math.min(groupIndex, nextGroups.length - 1)].id
          : this.focusedGroupId();
      this.focusedGroupId.set(focusId ?? nextGroups[0].id);
      return;
    }

    const nextActive =
      group.activeTabId === tabId
        ? nextTabs[Math.min(tabIndex, nextTabs.length - 1)].id
        : group.activeTabId;

    this.groups.update((list) =>
      list.map((item) =>
        item.id === groupId
          ? {
              ...item,
              tabs: nextTabs,
              activeTabId: nextActive,
              ...selectionForTabs(nextTabs, item.selectedTabIds, item.tabAnchorId),
            }
          : item,
      ),
    );
  }

  closeOthers(groupId: string, keepId: string): void {
    const group = this.groups().find((item) => item.id === groupId);
    if (!group)
      return;
    this.closeMany(
      groupId,
      group.tabs.filter((tab) => tab.id !== keepId).map((tab) => tab.id),
    );
  }

  closeToTheRight(groupId: string, tabId: string): void {
    const group = this.groups().find((item) => item.id === groupId);
    if (!group)
      return;
    const index = group.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0)
      return;
    this.closeMany(
      groupId,
      group.tabs.slice(index + 1).map((tab) => tab.id),
    );
  }

  closeAllInGroup(groupId: string): void {
    const group = this.groups().find((item) => item.id === groupId);
    if (!group)
      return;
    this.closeMany(
      groupId,
      group.tabs.map((tab) => tab.id),
    );
  }

  private closeMany(groupId: string, tabIds: readonly string[]): void {
    const unique = [...new Set(tabIds)];
    if (unique.length === 0)
      return;
    const group = this.groups().find((item) => item.id === groupId);
    if (!group)
      return;
    for (const id of unique)
      this.close(groupId, id);
  }

  closeCollectionTabs(nodeIds: readonly string[]): void {
    this.closeTabsByNodeIds(nodeIds, ['http', 'websocket', 'collection-folder']);
  }

  closeEnvironmentTabs(envIds: readonly string[]): void {
    this.closeTabsByNodeIds(envIds, ['environment']);
  }

  closeHistoryTabs(entryIds: readonly string[]): void {
    this.closeTabsByNodeIds(entryIds, ['history']);
  }

  private closeTabsByNodeIds(
    nodeIds: readonly string[],
    kinds: readonly WorkbenchTab['kind'][] | null,
  ): void {
    const removing = new Set(nodeIds);
    if (removing.size === 0) {
      return;
    }
    const groups = this.groups();
    for (const group of groups) {
      for (const tab of group.tabs) {
        if (!removing.has(tab.nodeId))
          continue;
        if (kinds && !kinds.includes(tab.kind))
          continue;
        this.disconnectSocket(tab);
      }
    }
    const nextGroups: WorkbenchGroup[] = [];
    for (const group of groups) {
      const tabs = group.tabs.filter((tab) => {
        if (!removing.has(tab.nodeId))
          return true;
        if (!kinds)
          return false;
        return !kinds.includes(tab.kind);
      });
      if (tabs.length === 0)
        continue;
      const activeStill = tabs.some((tab) => tab.id === group.activeTabId);
      nextGroups.push({
        ...group,
        tabs,
        activeTabId: activeStill ? group.activeTabId : tabs[tabs.length - 1].id,
        ...selectionForTabs(tabs, group.selectedTabIds, group.tabAnchorId),
      });
    }
    if (nextGroups.length === 0) {
      this.groups.set([]);
      this.focusedGroupId.set(null);
      this.splitSizes.set([1]);
      this.justOpenedId.set(null);
      this.panelEpochs.set({});
      return;
    }
    this.groups.set(nextGroups);
    this.splitSizes.set(this.equalSizes(nextGroups.length));
    if (!nextGroups.some((group) => group.id === this.focusedGroupId())) {
      this.focusedGroupId.set(nextGroups[0].id);
    }
  }

  /** Reorders a tab inside a group. */
  reorderTab(groupId: string, previousIndex: number, currentIndex: number): void {
    const group = this.groups().find((item) => item.id === groupId);
    const dragged = group?.tabs[previousIndex];
    if (!group || !dragged) {
      return;
    }
    const ids = this.idsForDraggedTab(group, dragged.id);
    this.moveTabBlock(groupId, groupId, ids, currentIndex);
  }

  /** Moves a tab from one group to another at `currentIndex`. */
  moveTab(
    fromGroupId: string,
    toGroupId: string,
    previousIndex: number,
    currentIndex: number,
  ): void {
    if (fromGroupId === toGroupId) {
      this.reorderTab(fromGroupId, previousIndex, currentIndex);
      return;
    }

    const from = this.groups().find((group) => group.id === fromGroupId);
    const dragged = from?.tabs[previousIndex];
    if (!from || !dragged) {
      return;
    }
    this.moveTabBlock(fromGroupId, toGroupId, this.idsForDraggedTab(from, dragged.id), currentIndex);
  }

  /**
   * Moves a tab into a new group on the right (no duplicate).
   * Requires a single group with at least two tabs.
   */
  moveTabToSplitRight(fromGroupId: string, tabId: string): boolean {
    this.splitPreview.set(null);
    const groups = this.groups();
    if (groups.length !== 1) {
      return false;
    }

    const source = groups.find((group) => group.id === fromGroupId) ?? groups[0];
    const ids = this.idsForDraggedTab(source, tabId);
    if (ids.length === 0 || ids.length >= source.tabs.length) {
      return false;
    }

    const remaining = source.tabs.filter((tab) => !ids.includes(tab.id));
    const moved = source.tabs.filter((tab) => ids.includes(tab.id));
    if (remaining.length === 0 || moved.length === 0) {
      return false;
    }

    const firstMovedIndex = source.tabs.findIndex((tab) => tab.id === moved[0].id);
    const nextActive = ids.includes(source.activeTabId ?? '')
      ? remaining[Math.min(Math.max(firstMovedIndex, 0), remaining.length - 1)].id
      : (source.activeTabId ?? remaining[0].id);

    const newGroupId = nextGroupId();
    this.groups.set([
      {
        ...source,
        tabs: remaining,
        activeTabId: nextActive,
        ...selectionForTabs(remaining, source.selectedTabIds, source.tabAnchorId),
      },
      this.makeGroup(newGroupId, moved, moved[0].id, {
        selectedTabIds: moved.map((tab) => tab.id),
        tabAnchorId: moved[0].id,
      }),
    ]);
    this.splitSizes.set([0.5, 0.5]);
    this.focusGroup(newGroupId);
    this.bumpPanel(source.id);
    this.bumpPanel(newGroupId);
    this.markJustOpened(moved[0].id);
    return true;
  }

  private idsForDraggedTab(group: WorkbenchGroup, tabId: string): readonly string[] {
    const dragIds = this.dragTabIds();
    if (dragIds.length > 0 && dragIds.includes(tabId)) {
      return dragIds;
    }
    if (group.selectedTabIds.includes(tabId)) {
      return group.tabs.map((tab) => tab.id).filter((id) => group.selectedTabIds.includes(id));
    }
    return [tabId];
  }

  private moveTabBlock(
    fromGroupId: string,
    toGroupId: string,
    ids: readonly string[],
    insertIndex: number,
  ): void {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return;
    }
    const groups = this.groups();
    const from = groups.find((group) => group.id === fromGroupId);
    const to = groups.find((group) => group.id === toGroupId);
    if (!from || !to) {
      return;
    }

    const moving = from.tabs.filter((tab) => unique.includes(tab.id));
    if (moving.length === 0) {
      return;
    }

    if (fromGroupId === toGroupId) {
      const remaining = from.tabs.filter((tab) => !unique.includes(tab.id));
      // CDK currentIndex is moveItemInArray's toIndex: after removing the block, splice at that index.
      const insert = Math.max(0, Math.min(insertIndex, remaining.length));
      const nextTabs = [...remaining.slice(0, insert), ...moving, ...remaining.slice(insert)];
      if (nextTabs.every((tab, index) => tab.id === from.tabs[index]?.id)) {
        return;
      }
      this.patchGroup(fromGroupId, {
        tabs: nextTabs,
        ...selectionForTabs(nextTabs, unique, unique[0]),
      });
      return;
    }

    const tabsFrom = from.tabs.filter((tab) => !unique.includes(tab.id));
    const tabsTo = [...to.tabs];
    const insertAt = Math.max(0, Math.min(insertIndex, tabsTo.length));
    tabsTo.splice(insertAt, 0, ...moving);

    const fromActive = unique.includes(from.activeTabId ?? '')
      ? (tabsFrom[Math.min(
          from.tabs.findIndex((tab) => tab.id === moving[0].id),
          Math.max(tabsFrom.length - 1, 0),
        )]?.id ?? null)
      : from.activeTabId;

    let nextGroups = groups.map((group) => {
      if (group.id === fromGroupId) {
        return {
          ...group,
          tabs: tabsFrom,
          activeTabId: fromActive,
          ...selectionForTabs(tabsFrom, group.selectedTabIds, group.tabAnchorId),
        };
      }
      if (group.id === toGroupId) {
        return {
          ...group,
          tabs: tabsTo,
          activeTabId: moving[0].id,
          selectedTabIds: moving.map((tab) => tab.id),
          tabAnchorId: moving[0].id,
        };
      }
      return group;
    });

    if (tabsFrom.length === 0 && nextGroups.length > 1) {
      nextGroups = nextGroups.filter((group) => group.id !== fromGroupId);
      this.splitSizes.set(this.equalSizes(nextGroups.length));
    }

    this.groups.set(nextGroups);
    this.focusGroup(toGroupId);
    this.bumpPanel(toGroupId);
  }

  setSplitPreview(preview: WorkbenchSplitPreview | null): void {
    const current = this.splitPreview();
    if (
      current?.side === preview?.side &&
      current?.fromGroupId === preview?.fromGroupId &&
      current?.tabId === preview?.tabId
    ) {
      return;
    }
    this.splitPreview.set(preview);
    if (preview) {
      this.clearTabDropCue();
    }
  }

  clearSplitPreview(): void {
    if (this.splitPreview()) {
      this.splitPreview.set(null);
    }
  }

  setTabDropCue(cue: WorkbenchTabDropCue | null): void {
    const current = this.tabDropCue();
    if (
      current?.listId === cue?.listId &&
      current?.beforeTabId === cue?.beforeTabId &&
      current?.append === cue?.append
    ) {
      return;
    }
    this.tabDropCue.set(cue);
  }

  clearTabDropCue(): void {
    if (this.tabDropCue()) {
      this.tabDropCue.set(null);
    }
  }

  /** Commits an active drag-to-split preview, if any. */
  commitSplitPreview(): boolean {
    const preview = this.splitPreview();
    if (!preview || preview.side !== 'right') {
      this.clearSplitPreview();
      return false;
    }
    return this.moveTabToSplitRight(preview.fromGroupId, preview.tabId);
  }

  setSplitSizes(sizes: readonly number[]): void {
    if (sizes.length !== this.groups().length) {
      return;
    }
    const total = sizes.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      return;
    }
    this.splitSizes.set(sizes.map((value) => value / total));
  }

  private equalSizes(count: number): number[] {
    if (count <= 0) {
      return [1];
    }
    return Array.from({ length: count }, () => 1 / count);
  }

  openCollabReview(): void {
    this.openOrFocusDatabaseTab('collab-review', 'review', () => ({
      id: nextTabId('review'),
      nodeId: 'review',
      kind: 'collab-review',
      title: 'Review',
      url: '',
      status: null,
    }));
  }

  closeCollabReview(): void {
    const targets = this.groups().flatMap((group) =>
      group.tabs
        .filter((tab) => tab.kind === 'collab-review')
        .map((tab) => ({ groupId: group.id, tabId: tab.id })),
    );
    for (const target of targets)
      this.close(target.groupId, target.tabId);
  }

  private openOrFocusDatabaseTab(
    kind: WorkbenchTab['kind'],
    nodeId: string,
    create: () => WorkbenchTab,
  ): void {
    const groups = this.groups();
    for (const group of groups) {
      const existing = group.tabs.find((tab) => tab.kind === kind && tab.nodeId === nodeId);
      if (existing) {
        this.focusGroup(group.id);
        this.activate(group.id, existing.id);
        return;
      }
    }
    this.appendTab(create());
  }

  private appendTab(draft: WorkbenchTab): void {
    if (draft.serviceSection) {
      this.serviceSectionByNodeId.update((map) => ({
        ...map,
        [draft.nodeId]: draft.serviceSection as string,
      }));
    }
    const groups = this.groups();
    if (groups.length === 0) {
      const groupId = nextGroupId();
      this.groups.set([this.makeGroup(groupId, [draft], draft.id)]);
      this.focusedGroupId.set(groupId);
      this.splitSizes.set([1]);
      this.bumpPanel(groupId);
      this.markJustOpened(draft.id);
      return;
    }

    const focused = this.focusedGroup();
    if (!focused) {
      return;
    }

    this.groups.update((list) =>
      list.map((group) => {
        if (group.id !== focused.id) {
          return group;
        }
        return {
          ...group,
          tabs: [...group.tabs, draft],
          activeTabId: draft.id,
          selectedTabIds: [draft.id],
          tabAnchorId: draft.id,
        };
      }),
    );
    this.focusGroup(focused.id);
    this.bumpPanel(focused.id);
    this.markJustOpened(draft.id);
  }

  private bumpPanel(groupId: string): void {
    this.panelEpochs.update((epochs) => ({
      ...epochs,
      [groupId]: (epochs[groupId] ?? 0) + 1,
    }));
  }

  private markJustOpened(tabId: string): void {
    if (this.openAnimTimer) {
      clearTimeout(this.openAnimTimer);
      this.openAnimTimer = null;
    }
    this.justOpenedId.set(tabId);
    const tab = this.findTabById(tabId);
    if (tab?.kind === 'http' || tab?.kind === 'history') {
      this.shell.maybeCollapseSidebarForRequest(this.desktop.settings().focusWhileEditing);
    }
    this.openAnimTimer = setTimeout(() => {
      if (this.justOpenedId() === tabId) {
        this.justOpenedId.set(null);
      }
      this.openAnimTimer = null;
    }, 720);
  }

  private findTabById(tabId: string): WorkbenchTab | undefined {
    for (const group of this.groups()) {
      const tab = group.tabs.find((item) => item.id === tabId);
      if (tab)
        return tab;
    }
    return undefined;
  }

  private disconnectSocket(tab: WorkbenchTab | undefined): void {
    if (tab?.kind !== 'websocket')
      return;
    void this.desktop.api.websocket.disconnect(tab.id);
  }
}
