import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import type {
  SplitLayoutNode,
  TabGroupState,
  WorkspaceEditorState,
  WorkspaceTab,
  WorkspaceTabKind,
} from '@shared/config';
import {
  DEFAULT_HTTP_METHOD_DISPLAY,
  WORKSPACE_EDITOR_MAIN_GROUP_ID,
  createDefaultWorkspaceEditor,
  httpMethodShowsInTab,
} from '@shared/config';
import {
  clampWorkspaceSplitRatio,
  collapseEmptyEditorPanes,
  collectLayoutGroupIds,
  createWorkspaceGroupId,
  createWorkspaceTabId,
  findTabByResourceId,
  normalizeWorkspaceEditorState,
  pruneEditorGroups,
  pushRecentResourceId,
  removeLayoutGroup,
  setLayoutRatioAtPath,
  sortTabsWithPinned,
  splitLayoutAtGroup,
  workspaceEditorHasAnyTabs,
} from '@shared/config';
import {
  mapSplitZoneToLayout,
  type WorkspaceEditorSplitZone,
} from '@app/core/workspace/workspace-tab-drag';

import { findCollectionNode } from '@app/features/shell/collections/collection-tree.mutations';
import { iconForWorkspaceTabKind } from './workspace-tab-icons';
import { findDesignSystemSection } from '@app/core/design-system/design-system.registry';
import { findDevelopmentTool } from '@app/core/development-tools/development-tool.registry';
import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { HistoryService } from '@app/core/history/history.service';
import { getEnvironmentDefinition } from '@app/features/shell/environments/environment-profile.utils';
import { findEnvironmentNode } from '@app/features/shell/environments/environment-tree.mutations';
import { toTreeNodes } from '@app/features/shell/environments/environment-tree.adapter';
import { findHistoryNode } from '@app/features/shell/history/history-tree.mutations';
import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { RegressionService } from '@app/core/testing/regression.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';

import { WorkspaceEditorMotionService } from './workspace-editor-motion.service';

const SESSION_EDITOR_DEBOUNCE_MS = 150;

export interface OpenWorkspaceResourceOptions {
  readonly resourceId: string;
  readonly kind: WorkspaceTabKind;
}

export interface WorkspaceTabViewModel {
  readonly id: string;
  readonly resourceId: string;
  readonly kind: WorkspaceTabKind;
  readonly pinned: boolean;
  readonly label: string;
  readonly icon: ReturnType<typeof iconForWorkspaceTabKind>;
  readonly method?: string;
  readonly active: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceEditorService {
  private readonly configService = inject(ConfigService);
  private readonly collectionsService = inject(CollectionsService);
  private readonly historyService = inject(HistoryService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly loadTest = inject(LoadTestService);
  private readonly regression = inject(RegressionService);
  private readonly mockServer = inject(MockServerService);
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly interceptor = inject(InterceptorWorkspaceStore);
  private readonly environmentsService = inject(EnvironmentsService);
  readonly motion = inject(WorkspaceEditorMotionService);

  private readonly editorState = signal<WorkspaceEditorState>(createDefaultWorkspaceEditor());
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly editor = this.editorState.asReadonly();

  readonly hasAnyTabs = computed(() => workspaceEditorHasAnyTabs(this.editorState()));

  readonly focusedGroupId = computed(() => this.editorState().focusedGroupId);

  readonly layout = computed(() => this.editorState().layout);

  readonly groups = computed(() => this.editorState().groups);

  readonly activeTab = computed((): WorkspaceTab | null => {
    const editor = this.editorState();
    const group = editor.groups[editor.focusedGroupId];
    if (!group?.activeTabId) {
      return null;
    }
    return group.tabs.find((t) => t.id === group.activeTabId) ?? null;
  });

  constructor() {
    effect(() => {
      void this.configService.sessionRevision();
      const session = untracked(() => this.configService.session());
      if (!session) {
        return;
      }
      this.editorState.set(
        normalizeWorkspaceEditorState(structuredClone(session.workspace.editor)),
      );
    });
  }

  /** Persists debounced editor session before profile switch. */
  async flushPendingSession(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.persist();
    }
  }

  /** Returns tab view models for a group (pinned first). */
  tabsForGroup(groupId: string): WorkspaceTabViewModel[] {
    const editor = this.editorState();
    const group = editor.groups[groupId];
    if (!group) {
      return [];
    }
    const sorted = sortTabsWithPinned(group.tabs);
    return sorted.map((tab) => this.toViewModel(tab, group.activeTabId === tab.id));
  }

  /** Resolves display label and method badge from collections tree. */
  resolveTabMeta(resourceId: string, kind: WorkspaceTabKind): { label: string; method?: string } {
    const collectionLoc = findCollectionNode(this.collectionsService.nodes(), resourceId);
    if (collectionLoc) {
      if (kind === 'request') {
        return {
          label: collectionLoc.node.label,
          method: collectionLoc.node.data?.method ?? 'GET',
        };
      }
      return { label: collectionLoc.node.label };
    }

    const historyLoc = findHistoryNode(this.historyService.nodes(), resourceId);
    if (historyLoc) {
      return {
        label: historyLoc.node.label,
        method: kind === 'history' ? (historyLoc.node.data?.method ?? 'GET') : undefined,
      };
    }

    if (kind === 'design-system') {
      const located = findDesignSystemSection(resourceId);
      if (located) {
        return { label: located.section.label };
      }
      return { label: 'Design system' };
    }

    if (kind === 'dev-tool') {
      const tool = findDevelopmentTool(resourceId);
      if (tool) {
        return { label: tool.label };
      }
      return { label: 'Development tool' };
    }

    if (kind === 'test-suite') {
      return { label: this.testSuite.labelForResource(resourceId) };
    }
    if (kind === 'load-test') {
      return { label: this.loadTest.labelForResource(resourceId) };
    }
    if (kind === 'regression') {
      return { label: this.regression.labelForResource(resourceId) };
    }
    if (kind === 'mock-server') {
      return { label: this.mockServer.labelForResource(resourceId) };
    }
    if (kind === 'capture') {
      return { label: this.capture.labelForResource(resourceId) };
    }
    if (kind === 'interceptor-rule') {
      return { label: this.interceptor.labelForResource(resourceId) };
    }

    if (kind === 'environment') {
      const environment = getEnvironmentDefinition(this.environmentsService.environments(), resourceId);
      if (environment) {
        const label = environment.name;
        return { label: label.length > 32 ? `${label.slice(0, 31)}…` : label };
      }

      for (const env of this.environmentsService.environments()) {
        const scope = toTreeNodes(env.nodes);
        const loc = findEnvironmentNode(scope, resourceId);
        if (loc?.node.data?.kind === 'variable') {
          const key = loc.node.data.key ?? loc.node.label;
          return { label: key.length > 32 ? `${key.slice(0, 31)}…` : key };
        }
      }
    }

    return { label: 'Missing item' };
  }

  openResource(options: OpenWorkspaceResourceOptions): void {
    const { resourceId, kind } = options;
    const editor = this.editorState();
    const existing = findTabByResourceId(editor.groups, resourceId);

    if (existing) {
      this.mutate((state) => ({
        ...state,
        focusedGroupId: existing.groupId,
        groups: {
          ...state.groups,
          [existing.groupId]: {
            ...state.groups[existing.groupId]!,
            activeTabId: existing.tab.id,
          },
        },
        recentResourceIds: pushRecentResourceId(state.recentResourceIds, resourceId),
      }));
      return;
    }

    const meta = this.resolveTabMeta(resourceId, kind);
    const tab: WorkspaceTab = {
      id: createWorkspaceTabId(),
      resourceId,
      kind,
      pinned: false,
      label: meta.label,
    };

    const groupId = editor.focusedGroupId;
    const group = editor.groups[groupId] ?? { tabs: [], activeTabId: null };

    this.mutate((state) => ({
      ...state,
      groups: {
        ...state.groups,
        [groupId]: {
          tabs: sortTabsWithPinned([...group.tabs, tab]),
          activeTabId: tab.id,
        },
      },
      recentResourceIds: pushRecentResourceId(state.recentResourceIds, resourceId),
    }));
  }

  focusGroup(groupId: string): void {
    if (!this.editorState().groups[groupId]) {
      return;
    }
    this.mutate((state) => ({ ...state, focusedGroupId: groupId }));
  }

  activateTab(groupId: string, tabId: string): void {
    const group = this.editorState().groups[groupId];
    if (!group?.tabs.some((t) => t.id === tabId)) {
      return;
    }
    this.mutate((state) => ({
      ...state,
      focusedGroupId: groupId,
      groups: {
        ...state.groups,
        [groupId]: { ...group, activeTabId: tabId },
      },
    }));
  }

  closeTab(groupId: string, tabId: string): void {
    this.mutate((state) => this.closeTabInState(state, groupId, tabId));
  }

  /**
   * Closes every tab whose `resourceId` matches one of the given ids (all editor groups).
   */
  closeTabsForResourceIds(resourceIds: readonly string[]): void {
    const idSet = new Set(resourceIds);
    if (idSet.size === 0) {
      return;
    }
    this.mutate((state) => {
      let next = state;
      for (const groupId of Object.keys(next.groups)) {
        const group = next.groups[groupId];
        if (!group) {
          continue;
        }
        for (const tab of group.tabs) {
          if (idSet.has(tab.resourceId)) {
            next = this.closeTabInState(next, groupId, tab.id);
          }
        }
      }
      return next;
    });
  }

  closeActiveTab(): void {
    const editor = this.editorState();
    const groupId = editor.focusedGroupId;
    const group = editor.groups[groupId];
    const tabId = group?.activeTabId;
    if (!tabId) {
      return;
    }
    this.closeTab(groupId, tabId);
  }

  closeOthers(groupId: string, tabId: string): void {
    const group = this.editorState().groups[groupId];
    if (!group) {
      return;
    }
    const keep = group.tabs.find((t) => t.id === tabId);
    if (!keep) {
      return;
    }
    const pinnedOthers = group.tabs.filter((t) => t.pinned && t.id !== tabId);
    this.mutate((state) => ({
      ...state,
      groups: {
        ...state.groups,
        [groupId]: {
          tabs: sortTabsWithPinned([...pinnedOthers, keep]),
          activeTabId: tabId,
        },
      },
    }));
  }

  closeAllInGroup(groupId: string): void {
    const group = this.editorState().groups[groupId];
    if (!group) {
      return;
    }
    const pinned = group.tabs.filter((t) => t.pinned);
    this.mutate((state) => ({
      ...state,
      groups: {
        ...state.groups,
        [groupId]: {
          tabs: pinned,
          activeTabId: pinned[0]?.id ?? null,
        },
      },
    }));
  }

  closeToRight(groupId: string, tabId: string): void {
    const group = this.editorState().groups[groupId];
    if (!group) {
      return;
    }
    const sorted = sortTabsWithPinned(group.tabs);
    const index = sorted.findIndex((t) => t.id === tabId);
    if (index < 0) {
      return;
    }
    const keep = sorted.slice(0, index + 1).filter((t) => !t.pinned || t.id === tabId || sorted.indexOf(t) <= index);
    const pinnedBefore = sorted.slice(0, index + 1).filter((t) => t.pinned);
    const toKeepIds = new Set([...pinnedBefore.map((t) => t.id), ...sorted.slice(0, index + 1).map((t) => t.id)]);
    const tabs = group.tabs.filter((t) => toKeepIds.has(t.id));
    this.mutate((state) => ({
      ...state,
      groups: {
        ...state.groups,
        [groupId]: {
          tabs: sortTabsWithPinned(tabs),
          activeTabId: tabId,
        },
      },
    }));
  }

  pinTab(groupId: string, tabId: string, pinned: boolean): void {
    const group = this.editorState().groups[groupId];
    if (!group) {
      return;
    }
    this.mutate((state) => ({
      ...state,
      groups: {
        ...state.groups,
        [groupId]: {
          ...group,
          tabs: sortTabsWithPinned(
            group.tabs.map((t) => (t.id === tabId ? { ...t, pinned } : t)),
          ),
        },
      },
    }));
  }

  reorderTabs(groupId: string, fromIndex: number, toIndex: number): void {
    const viewModels = this.tabsForGroup(groupId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= viewModels.length || toIndex >= viewModels.length) {
      return;
    }
    const group = this.editorState().groups[groupId];
    if (!group) {
      return;
    }
    const sorted = [...viewModels];
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved!);
    const orderIds = sorted.map((t) => t.id);
    const tabMap = new Map(group.tabs.map((t) => [t.id, t]));
    const tabs = orderIds.map((id) => tabMap.get(id)!).filter(Boolean);
    this.mutate((state) => ({
      ...state,
      groups: {
        ...state.groups,
        [groupId]: { ...group, tabs },
      },
    }));
  }

  /**
   * Moves a tab into another pane, optionally splitting on an edge drop zone.
   */
  moveTabToSplitPane(
    tabId: string,
    fromGroupId: string,
    targetGroupId: string,
    zone: WorkspaceEditorSplitZone,
  ): void {
    const editor = this.editorState();
    const fromGroup = editor.groups[fromGroupId];
    if (!fromGroup) {
      return;
    }
    const tab = fromGroup.tabs.find((t) => t.id === tabId);
    if (!tab) {
      return;
    }
    if (!collectLayoutGroupIds(editor.layout).includes(targetGroupId)) {
      return;
    }

    const newGroupId = createWorkspaceGroupId();
    const { direction, placement } = mapSplitZoneToLayout(zone);

    this.motion.runSplitTransition([newGroupId], () => {
      this.mutate(
        (state) => {
          const layout = splitLayoutAtGroup(
            state.layout,
            targetGroupId,
            direction,
            newGroupId,
            0.5,
            placement,
          );

          const source = state.groups[fromGroupId];
          let groups = { ...state.groups };
          if (source) {
            const tabs = source.tabs.filter((t) => t.id !== tabId);
            let activeTabId = source.activeTabId;
            if (activeTabId === tabId) {
              const sorted = sortTabsWithPinned(tabs);
              activeTabId = sorted[sorted.length - 1]?.id ?? null;
            }
            groups = {
              ...groups,
              [fromGroupId]: { tabs: sortTabsWithPinned(tabs), activeTabId },
            };
          }

          groups = {
            ...groups,
            [newGroupId]: { tabs: [tab], activeTabId: tab.id },
          };

          return {
            ...state,
            layout,
            groups: pruneEditorGroups(layout, groups),
            focusedGroupId: newGroupId,
          };
        },
        { collapseEmpty: false },
      );
    });
  }

  moveTabToGroup(tabId: string, fromGroupId: string, toGroupId: string, toIndex?: number): void {
    const editor = this.editorState();
    const fromGroup = editor.groups[fromGroupId];
    const toGroup = editor.groups[toGroupId];
    if (!fromGroup || !toGroup) {
      return;
    }
    const tab = fromGroup.tabs.find((t) => t.id === tabId);
    if (!tab) {
      return;
    }

    let state = this.closeTabInState(editor, fromGroupId, tabId);
    const target = state.groups[toGroupId] ?? { tabs: [], activeTabId: null };
    const sorted = sortTabsWithPinned(target.tabs);
    const insertAt = toIndex ?? sorted.length;
    const nextTabs = [...sorted];
    nextTabs.splice(insertAt, 0, tab);

    state = {
      ...state,
      focusedGroupId: toGroupId,
      groups: {
        ...state.groups,
        [toGroupId]: {
          tabs: nextTabs,
          activeTabId: tab.id,
        },
      },
    };
    this.editorState.set(normalizeWorkspaceEditorState(state));
    this.schedulePersist();
  }

  splitFocusedPane(zone: WorkspaceEditorSplitZone): void {
    const { direction, placement } = mapSplitZoneToLayout(zone);
    const editor = this.editorState();
    const groupId = editor.focusedGroupId;
    const newGroupId = createWorkspaceGroupId();
    const activeTab = editor.groups[groupId]?.activeTabId
      ? editor.groups[groupId]!.tabs.find((t) => t.id === editor.groups[groupId]!.activeTabId)
      : null;

    const newGroupTabs: WorkspaceTab[] = activeTab
      ? [
          {
            ...activeTab,
            id: createWorkspaceTabId(),
          },
        ]
      : [];

    const openedTabId = newGroupTabs[0]?.id;
    this.motion.runSplitTransition([newGroupId], () => {
      this.mutate((state) => {
        const layout = splitLayoutAtGroup(
          state.layout,
          groupId,
          direction,
          newGroupId,
          0.5,
          placement,
        );
        const groups = {
          ...state.groups,
          [newGroupId]: {
            tabs: newGroupTabs,
            activeTabId: newGroupTabs[0]?.id ?? null,
          },
        };
        return {
          ...state,
          layout,
          groups: pruneEditorGroups(layout, groups),
          focusedGroupId: newGroupId,
        };
      });
    });
  }

  readonly paneCount = computed(() => collectLayoutGroupIds(this.editorState().layout).length);

  readonly hasMultiplePanes = computed(() => this.paneCount() > 1);

  /**
   * Merges every pane into one and moves all tabs into the main group.
   */
  mergeToSinglePane(): void {
    const editor = this.editorState();
    if (collectLayoutGroupIds(editor.layout).length <= 1) {
      return;
    }

    const tabs: WorkspaceTab[] = [];
    let activeTabId: string | null = null;

    for (const groupId of collectLayoutGroupIds(editor.layout)) {
      const group = editor.groups[groupId];
      if (!group) {
        continue;
      }
      tabs.push(...sortTabsWithPinned(group.tabs));
      if (groupId === editor.focusedGroupId && group.activeTabId) {
        activeTabId = group.activeTabId;
      }
    }

    if (activeTabId && !tabs.some((t) => t.id === activeTabId)) {
      activeTabId = tabs[0]?.id ?? null;
    }
    if (!activeTabId) {
      activeTabId = tabs[0]?.id ?? null;
    }

    this.motion.runMergeTransition(() => {
      this.mutate((state) => ({
        ...state,
        focusedGroupId: WORKSPACE_EDITOR_MAIN_GROUP_ID,
        layout: { type: 'leaf', groupId: WORKSPACE_EDITOR_MAIN_GROUP_ID },
        groups: {
          [WORKSPACE_EDITOR_MAIN_GROUP_ID]: {
            tabs,
            activeTabId,
          },
        },
      }));
    });
  }

  closePane(groupId: string): void {
    const editor = this.editorState();
    if (groupId === WORKSPACE_EDITOR_MAIN_GROUP_ID && collectLayoutGroupIds(editor.layout).length <= 1) {
      return;
    }

    const nextLayout = removeLayoutGroup(editor.layout, groupId);
    if (!nextLayout) {
      return;
    }

    const groups = { ...editor.groups };
    delete groups[groupId];

    let focusedGroupId = editor.focusedGroupId;
    if (focusedGroupId === groupId) {
      const remaining = collectLayoutGroupIds(nextLayout);
      focusedGroupId = remaining[0] ?? WORKSPACE_EDITOR_MAIN_GROUP_ID;
    }

    this.mutate((state) => ({
      ...state,
      layout: nextLayout,
      groups: pruneEditorGroups(nextLayout, groups),
      focusedGroupId,
    }));
  }

  setSplitRatio(path: readonly number[], ratio: number): void {
    const clamped = clampWorkspaceSplitRatio(ratio);
    this.mutate((state) => ({
      ...state,
      layout: setLayoutRatioAtPath(state.layout, path, clamped),
    }));
  }

  cycleTabInFocusedGroup(reverse = false): void {
    const editor = this.editorState();
    const groupId = editor.focusedGroupId;
    const group = editor.groups[groupId];
    if (!group || group.tabs.length === 0) {
      return;
    }
    const sorted = sortTabsWithPinned(group.tabs);
    const currentIndex = sorted.findIndex((t) => t.id === group.activeTabId);
    const nextIndex = reverse
      ? (currentIndex <= 0 ? sorted.length - 1 : currentIndex - 1)
      : (currentIndex < 0 || currentIndex >= sorted.length - 1 ? 0 : currentIndex + 1);
    const nextTab = sorted[nextIndex];
    if (nextTab) {
      this.activateTab(groupId, nextTab.id);
    }
  }

  private closeTabInState(
    state: WorkspaceEditorState,
    groupId: string,
    tabId: string,
  ): WorkspaceEditorState {
    const group = state.groups[groupId];
    if (!group) {
      return state;
    }
    const tabs = group.tabs.filter((t) => t.id !== tabId);
    let activeTabId = group.activeTabId;
    if (activeTabId === tabId) {
      const sorted = sortTabsWithPinned(tabs);
      activeTabId = sorted[sorted.length - 1]?.id ?? null;
    }
    const groups = {
      ...state.groups,
      [groupId]: { tabs: sortTabsWithPinned(tabs), activeTabId },
    };
    return { ...state, groups };
  }

  private toViewModel(tab: WorkspaceTab, active: boolean): WorkspaceTabViewModel {
    const meta = this.resolveTabMeta(tab.resourceId, tab.kind);
    const showMethodInTab = this.httpMethodVisibleInTab();
    return {
      id: tab.id,
      resourceId: tab.resourceId,
      kind: tab.kind,
      pinned: tab.pinned,
      label: meta.label || tab.label || 'Untitled',
      icon: iconForWorkspaceTabKind(tab.kind),
      method:
        showMethodInTab && tab.kind === 'request' ? meta.method : undefined,
      active,
    };
  }

  private httpMethodVisibleInTab(): boolean {
    const mode =
      this.configService.settings()?.collections.displayHttpMethod ??
      DEFAULT_HTTP_METHOD_DISPLAY;
    return httpMethodShowsInTab(mode);
  }

  private mutate(
    updater: (state: WorkspaceEditorState) => WorkspaceEditorState,
    options?: { readonly collapseEmpty?: boolean },
  ): void {
    let next = updater(this.editorState());
    if (options?.collapseEmpty !== false) {
      next = collapseEmptyEditorPanes(next);
    }
    next = normalizeWorkspaceEditorState(next);
    this.editorState.set(next);
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist();
    }, SESSION_EDITOR_DEBOUNCE_MS);
  }

  private async persist(): Promise<void> {
    const editor = this.editorState();
    await this.configService.patchSession({
      workspace: {
        editor: structuredClone(editor),
      },
    });
  }
}
