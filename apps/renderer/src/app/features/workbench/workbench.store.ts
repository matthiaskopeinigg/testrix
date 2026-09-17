import { Injectable, computed, signal } from '@angular/core';
import {
  sanitizeSelectionEntry,
  type CollectionNode,
  type DatabaseConnection,
  type DatabaseDiagramTabTarget,
  type DatabaseTableTabTarget,
  type Environment,
  type HttpMethod,
  type SavedDatabaseQuery,
  type SessionFile,
  type SessionGroup,
  type ToolItem,
  databaseConnectionTabNodeId,
  databaseDiagramTabNodeId,
  databaseQueryTabNodeId,
  databaseTableTabNodeId,
} from '@testrix/contracts';

import {
  applyPointerSelect,
  emptySelection,
  shouldKeepPointerSelection,
} from '../../core/range-select';

/** Open workbench document backed by a collection leaf, environment, or tool. */
export interface WorkbenchTab {
  readonly id: string;
  readonly nodeId: string;
  readonly kind:
    | 'http'
    | 'websocket'
    | 'environment'
    | 'tool'
    | 'database-connection'
    | 'database-query'
    | 'database-table'
    | 'database-diagram';
  readonly title: string;
  readonly method?: HttpMethod;
  readonly url: string;
  readonly status: number | null;
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

let tabSeq = 0;
let groupSeq = 0;

function nextTabId(nodeId: string): string {
  tabSeq += 1;
  return `tab-${nodeId}-${tabSeq}`;
}

function nextGroupId(): string {
  groupSeq += 1;
  return `group-${groupSeq}`;
}

function mockUrlForNode(node: CollectionNode): string {
  const slug = node.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (node.kind === 'websocket') {
    return `wss://api.local/${slug || 'socket'}`;
  }
  return `https://api.local/${slug || 'request'}`;
}

function tabFromNode(node: CollectionNode): WorkbenchTab | null {
  if (node.kind === 'http') {
    return {
      id: nextTabId(node.id),
      nodeId: node.id,
      kind: 'http',
      title: node.name,
      method: node.method,
      url: mockUrlForNode(node),
      status: node.status,
    };
  }
  if (node.kind === 'websocket') {
    return {
      id: nextTabId(node.id),
      nodeId: node.id,
      kind: 'websocket',
      title: node.name,
      url: mockUrlForNode(node),
      status: null,
    };
  }
  return null;
}

function tabFromEnvironment(env: Environment): WorkbenchTab {
  return {
    id: nextTabId(env.id),
    nodeId: env.id,
    kind: 'environment',
    title: env.name,
    url: '',
    status: null,
  };
}

function tabFromTool(tool: ToolItem): WorkbenchTab {
  return {
    id: nextTabId(tool.id),
    nodeId: tool.id,
    kind: 'tool',
    title: tool.label,
    url: '',
    status: null,
  };
}

function tabFromDatabaseConnection(connection: DatabaseConnection): WorkbenchTab {
  return {
    id: nextTabId(connection.id),
    nodeId: databaseConnectionTabNodeId(connection.id),
    kind: 'database-connection',
    title: connection.name,
    url: '',
    status: null,
  };
}

function tabFromDatabaseQuery(query: SavedDatabaseQuery): WorkbenchTab {
  return {
    id: nextTabId(query.id),
    nodeId: databaseQueryTabNodeId(query.id),
    kind: 'database-query',
    title: query.name,
    url: '',
    status: null,
  };
}

function tabFromDatabaseTable(target: DatabaseTableTabTarget, title: string): WorkbenchTab {
  const nodeId = databaseTableTabNodeId(target);
  return {
    id: nextTabId(nodeId),
    nodeId,
    kind: 'database-table',
    title,
    url: '',
    status: null,
  };
}

function tabFromDatabaseDiagram(target: DatabaseDiagramTabTarget, title: string): WorkbenchTab {
  const nodeId = databaseDiagramTabNodeId(target);
  return {
    id: nextTabId(nodeId),
    nodeId,
    kind: 'database-diagram',
    title,
    url: '',
    status: null,
  };
}

function selectionForTabs(
  tabs: readonly WorkbenchTab[],
  ids: readonly string[],
  anchorId: string | null,
): Pick<WorkbenchGroup, 'selectedTabIds' | 'tabAnchorId'> {
  const cleaned = sanitizeSelectionEntry({ ids: [...ids], anchorId }, new Set(tabs.map((tab) => tab.id)));
  return { selectedTabIds: cleaned.ids, tabAnchorId: cleaned.anchorId };
}

function groupFromSession(group: SessionGroup): WorkbenchGroup {
  return {
    id: group.id,
    tabs: group.tabs.map((tab) => ({ ...tab })),
    activeTabId: group.activeTabId,
    ...selectionForTabs(group.tabs, group.selectedTabIds ?? [], group.tabAnchorId ?? null),
  };
}

/** Preview while dragging a tab onto a split drop zone. */
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
  readonly groups = signal<readonly WorkbenchGroup[]>([]);
  readonly focusedGroupId = signal<string | null>(null);
  readonly justOpenedId = signal<string | null>(null);
  /** Per-group panel animation epochs. */
  readonly panelEpochs = signal<Readonly<Record<string, number>>>({});
  /** Horizontal split sizes as fractions that sum to 1. */
  readonly splitSizes = signal<readonly number[]>([1]);
  /** Postman-style split zone while dragging a tab to the right edge. */
  readonly splitPreview = signal<WorkbenchSplitPreview | null>(null);
  /** Pointer-based tab insert caret while dragging. */
  readonly tabDropCue = signal<WorkbenchTabDropCue | null>(null);
  readonly dragTabIds = signal<readonly string[]>([]);

  private openAnimTimer: ReturnType<typeof setTimeout> | null = null;

  readonly hasTabs = computed(() => this.groups().some((group) => group.tabs.length > 0));

  restoreSession(session: SessionFile): void {
    this.groups.set(session.groups.map(groupFromSession));
    this.focusedGroupId.set(session.focusedGroupId);
    this.splitSizes.set(session.splitSizes.length > 0 ? session.splitSizes : [1]);
    this.bumpSeqFromSession(session.groups);
  }

  toSessionPatch(): Pick<SessionFile, 'groups' | 'focusedGroupId' | 'splitSizes'> {
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

  readonly openNodeIds = computed(() => {
    const ids = new Set<string>();
    for (const group of this.groups()) {
      for (const tab of group.tabs) {
        ids.add(tab.nodeId);
      }
    }
    return ids;
  });

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
    const draft = tabFromNode(node);
    if (!draft) {
      return;
    }

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
   * Opens a tab for an environment, or focuses an existing one.
   */
  openFromEnvironment(env: Environment): void {
    const groups = this.groups();
    for (const group of groups) {
      const existing = group.tabs.find(
        (tab) => tab.kind === 'environment' && tab.nodeId === env.id,
      );
      if (existing) {
        this.focusGroup(group.id);
        this.activate(group.id, existing.id);
        return;
      }
    }

    const draft = tabFromEnvironment(env);
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

    const nextTabs = group.tabs.filter((tab) => tab.id !== tabId);
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
    this.closeTabsByNodeIds(nodeIds, ['http', 'websocket']);
  }

  closeEnvironmentTabs(envIds: readonly string[]): void {
    this.closeTabsByNodeIds(envIds, ['environment']);
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

  private bumpSeqFromSession(groups: readonly SessionGroup[]): void {
    for (const group of groups) {
      const groupMatch = /^group-(\d+)$/.exec(group.id);
      if (groupMatch) {
        groupSeq = Math.max(groupSeq, Number(groupMatch[1]));
      }
      for (const tab of group.tabs) {
        const tabMatch = /-(\d+)$/.exec(tab.id);
        if (tabMatch) {
          tabSeq = Math.max(tabSeq, Number(tabMatch[1]));
        }
      }
    }
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
    this.openAnimTimer = setTimeout(() => {
      if (this.justOpenedId() === tabId) {
        this.justOpenedId.set(null);
      }
      this.openAnimTimer = null;
    }, 720);
  }
}
