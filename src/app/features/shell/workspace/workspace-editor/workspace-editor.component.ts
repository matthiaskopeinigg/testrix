import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  TemplateRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import type { WorkspaceTab, WorkspaceTabKind } from '@shared/config';

import type { TxSplitPaneLeafContext } from '@app/shared/components/tx-split-pane/tx-split-pane.component';
import { TxSplitPaneComponent } from '@app/shared/components/tx-split-pane/tx-split-pane.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxTabBarComponent } from '@app/shared/components/tx-tab-bar/tx-tab-bar.component';
import type { TxTabBarCrossDropEvent } from '@app/shared/components/tx-tab-bar/tx-tab-bar.component';
import type { TxTabBarItem } from '@app/shared/components/tx-tab/tx-tab.types';
import { TxWorkspaceTabSkeletonComponent } from '@app/shared/components/tx-workspace-tab-skeleton/tx-workspace-tab-skeleton.component';
import type { TxWorkspaceTabSkeletonVariant } from '@app/shared/components/tx-workspace-tab-skeleton/tx-workspace-tab-skeleton.component';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';

import { WorkspaceEditorPaneDropComponent } from '../workspace-editor-pane-drop/workspace-editor-pane-drop.component';
import { RequestWorkspaceTabComponent } from '../request-workspace-tab/request-workspace-tab.component';
import {
  loadWorkspaceTabComponent,
  peekWorkspaceTabComponent,
  preloadWorkspaceTabKinds,
  seedWorkspaceTabComponent,
  type WorkspaceTabComponentType,
} from './workspace-editor-tab-loader';
import { WorkspaceEditorEmptyComponent } from './workspace-editor-empty.component';
import { WorkspaceEditorTabPanelComponent } from './workspace-editor-tab-panel.component';
import {
  addMountedTab,
  createEmptyMountedTabs,
  isTabMounted,
  pruneMountedTabsForGroup,
  removeMountedGroup,
  removeMountedTabs,
  skeletonVariantForTabKind,
  type MountedTabsByGroup,
} from './workspace-editor-mount.cache';
import {
  buildWorkspaceEmptyPaneContextMenu,
  buildWorkspaceTabBarContextMenu,
  buildWorkspaceTabContextMenu,
  parseSplitContextMenuAction,
} from './workspace-editor-tab-context-menu';

/** Inactive tabs kept in the DOM for instant re-activation (bounded LRU). */
const MAX_WARM_TABS = 3;

/** Skips workbench shortcuts while typing in inputs (e.g. code editor). */
function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return !!target.closest('textarea, input, select, [contenteditable="true"]');
}

type TabContextTarget = { readonly type: 'tab'; readonly groupId: string; readonly tabId: string };
type BarContextTarget = { readonly type: 'bar'; readonly groupId: string };
type EmptyContextTarget = { readonly type: 'empty'; readonly groupId: string };

@Component({
  selector: 'app-workspace-editor',
  standalone: true,
  imports: [
    NgComponentOutlet,
    TxSplitPaneComponent,
    TxTabBarComponent,
    TxContextMenuComponent,
    TxWorkspaceTabSkeletonComponent,
    WorkspaceEditorTabPanelComponent,
    WorkspaceEditorEmptyComponent,
    WorkspaceEditorPaneDropComponent,
  ],
  templateUrl: './workspace-editor.component.html',
  styleUrl: './workspace-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceEditorComponent {
  protected readonly editor = inject(WorkspaceEditorService);

  protected readonly leafTemplate =
    viewChild.required<TemplateRef<{ $implicit: TxSplitPaneLeafContext }>>('paneLeaf');

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);

  private contextTarget: TabContextTarget | BarContextTarget | EmptyContextTarget | null = null;

  protected readonly hasMultiplePanes = this.editor.hasMultiplePanes;

  private readonly mountedTabs = signal<MountedTabsByGroup>(createEmptyMountedTabs());
  private readonly mountingTabIds = signal<ReadonlySet<string>>(new Set());
  /** Tabs that finished at least one mount (skip entrance stagger on revisit). */
  private readonly cachedTabIds = signal<ReadonlySet<string>>(new Set());
  /** Recently active tabs kept mounted off-screen (MRU, capped). */
  private readonly warmTabOrder = signal<readonly string[]>([]);
  private readonly tabActivateStartedAt = new Map<string, number>();
  private readonly lastActiveTabByGroup = new Map<string, string>();
  private readonly tabComponentsByKind = signal<
    Partial<Record<WorkspaceTabKind, WorkspaceTabComponentType>>
  >({});

  constructor() {
    seedWorkspaceTabComponent('request', RequestWorkspaceTabComponent);
    this.tabComponentsByKind.set({ request: RequestWorkspaceTabComponent });
    preloadWorkspaceTabKinds('folder');

    effect(() => {
      const mounted = this.mountedTabs();
      const groups = untracked(() => this.editor.groups());
      const kinds = new Set<WorkspaceTabKind>();

      for (const [groupId, tabIds] of Object.entries(mounted)) {
        const group = groups[groupId];
        if (!group) {
          continue;
        }
        for (const tabId of tabIds) {
          const tab = group.tabs.find((t) => t.id === tabId);
          if (tab) {
            kinds.add(tab.kind);
          }
        }
      }

      for (const kind of kinds) {
        const peeked = peekWorkspaceTabComponent(kind);
        if (peeked) {
          this.tabComponentsByKind.update((current) =>
            current[kind] === peeked ? current : { ...current, [kind]: peeked },
          );
          continue;
        }
        void loadWorkspaceTabComponent(kind).then((cmp) => {
          this.tabComponentsByKind.update((current) => ({ ...current, [kind]: cmp }));
        });
      }
    });

    effect(() => {
      const groups = this.editor.groups();
      let mounted = this.mountedTabs();

      for (const [groupId, group] of Object.entries(groups)) {
        if (!group) {
          continue;
        }
        const openIds = group.tabs.map((t) => t.id);
        mounted = pruneMountedTabsForGroup(mounted, groupId, openIds);
        for (const warmTabId of this.warmTabOrder()) {
          if (!openIds.includes(warmTabId)) {
            continue;
          }
          mounted = addMountedTab(mounted, groupId, warmTabId).next;
        }
        if (group.activeTabId) {
          const previousActiveId = this.lastActiveTabByGroup.get(groupId);
          if (previousActiveId && previousActiveId !== group.activeTabId) {
            this.rememberWarmTab(previousActiveId);
            this.tabActivateStartedAt.set(group.activeTabId, performance.now());
          }
          this.promoteWarmTab(group.activeTabId);
          this.lastActiveTabByGroup.set(groupId, group.activeTabId);

          const result = addMountedTab(mounted, groupId, group.activeTabId);
          mounted = result.next;
          if (result.firstVisit) {
            const tab = group.tabs.find((t) => t.id === group.activeTabId);
            if (tab) {
              this.beginTabMount(group.activeTabId, tab.kind);
              this.tabActivateStartedAt.set(group.activeTabId, performance.now());
            }
          }
        }
      }

      const openGroupIds = new Set(Object.keys(groups));
      for (const groupId of Object.keys(mounted)) {
        if (!openGroupIds.has(groupId)) {
          mounted = removeMountedGroup(mounted, groupId);
        }
      }

      this.mountedTabs.set(mounted);
    });
  }

  protected layout() {
    return this.editor.layout();
  }

  protected tabItems(groupId: string): TxTabBarItem[] {
    return this.editor.tabsForGroup(groupId).map((tab) => ({
      id: tab.id,
      label: tab.label,
      icon: tab.icon,
      method: tab.method,
      active: tab.active,
      pinned: tab.pinned,
    }));
  }

  protected tabsForPane(groupId: string): readonly WorkspaceTab[] {
    return this.editor.tabsForGroup(groupId);
  }

  protected isTabMounted(groupId: string, tabId: string): boolean {
    return isTabMounted(this.mountedTabs(), groupId, tabId);
  }

  protected isTabActive(groupId: string, tabId: string): boolean {
    const group = this.editor.groups()[groupId];
    return group?.activeTabId === tabId;
  }

  /** Only the active tab stays in the DOM — warm cache keeps mount state, not hidden instances (they broke Win32 hit-testing). */
  protected isTabRendered(groupId: string, tabId: string): boolean {
    if (!this.isTabMounted(groupId, tabId)) {
      return false;
    }
    return this.isTabActive(groupId, tabId);
  }

  protected isWarmTab(tabId: string): boolean {
    return this.warmTabOrder().includes(tabId);
  }

  protected isTabMounting(tabId: string): boolean {
    return this.mountingTabIds().has(tabId);
  }

  /** Skeleton for the active tab until its component class is ready and first paint completes. */
  protected isTabLoading(groupId: string, tab: WorkspaceTab): boolean {
    if (!this.isTabActive(groupId, tab.id)) {
      return false;
    }
    return this.isTabMounting(tab.id) || !this.tabComponent(tab.kind);
  }

  protected isTabCached(_groupId: string, tabId: string): boolean {
    return this.cachedTabIds().has(tabId);
  }

  protected skeletonVariant(kind: WorkspaceTabKind): TxWorkspaceTabSkeletonVariant {
    return skeletonVariantForTabKind(kind);
  }

  protected tabComponent(kind: WorkspaceTabKind): WorkspaceTabComponentType | null {
    return this.tabComponentsByKind()[kind] ?? peekWorkspaceTabComponent(kind);
  }

  protected tabInputs(
    tab: WorkspaceTab,
    groupId: string,
  ): Record<string, unknown> {
    const active = this.isTabActive(groupId, tab.id);
    const cached = this.isTabCached(groupId, tab.id);
    const base = { resourceId: tab.resourceId, active };
    if (tab.kind === 'request' || tab.kind === 'folder') {
      return { ...base, cached };
    }
    return base;
  }

  protected handleTabPanelReady(tabId: string, groupId: string): void {
    this.tabActivateStartedAt.delete(tabId);
    this.clearTabMounting(tabId);
    this.cachedTabIds.update((ids) => {
      if (ids.has(tabId)) {
        return ids;
      }
      return new Set([...ids, tabId]);
    });
    if (!this.isTabActive(groupId, tabId)) {
      this.rememberWarmTab(tabId);
    }
  }

  protected handlePaneFocus(groupId: string): void {
    this.editor.focusGroup(groupId);
  }

  protected handleTabActivate(groupId: string, tabId: string): void {
    if (this.cachedTabIds().has(tabId)) {
      this.rememberWarmTab(tabId);
    }
    this.tabActivateStartedAt.set(tabId, performance.now());
    this.editor.activateTab(groupId, tabId);
  }

  protected handleTabClose(groupId: string, tabId: string): void {
    this.evictTabMount(groupId, tabId);
    this.editor.closeTab(groupId, tabId);
  }

  protected handleTabPinToggle(groupId: string, tabId: string): void {
    const tab = this.editor.groups()[groupId]?.tabs.find((t) => t.id === tabId);
    this.editor.pinTab(groupId, tabId, !(tab?.pinned ?? false));
  }

  protected handleTabReorder(
    groupId: string,
    event: { tabId: string; fromIndex: number; toIndex: number },
  ): void {
    this.editor.reorderTabs(groupId, event.fromIndex, event.toIndex);
  }

  protected handleTabCrossDrop(toGroupId: string, event: TxTabBarCrossDropEvent): void {
    this.editor.moveTabToGroup(event.tabId, event.fromGroupId, toGroupId, event.toIndex);
  }

  protected handleRatioChange(event: { path: readonly number[]; ratio: number }): void {
    this.editor.setSplitRatio(event.path, event.ratio);
  }

  protected paneLayoutOptions() {
    const hasMultiplePanes = this.editor.hasMultiplePanes();
    return {
      canClosePane: hasMultiplePanes,
      hasMultiplePanes,
    };
  }

  protected handleTabContextMenu(
    groupId: string,
    payload: { tabId: string; event: MouseEvent },
  ): void {
    this.editor.focusGroup(groupId);

    const tabs = this.editor.tabsForGroup(groupId);
    const tab = tabs.find((t) => t.id === payload.tabId);
    const tabIndex = tabs.findIndex((t) => t.id === payload.tabId);

    this.contextTarget = { type: 'tab', groupId, tabId: payload.tabId };
    this.contextMenuItems.set(
      buildWorkspaceTabContextMenu({
        pinned: tab?.pinned ?? false,
        tabCount: tabs.length,
        hasTabsToRight: tabIndex >= 0 && tabIndex < tabs.length - 1,
        ...this.paneLayoutOptions(),
      }),
    );
    this.contextMenuPosition.set({ x: payload.event.clientX, y: payload.event.clientY });
    this.contextMenuOpen.set(true);
  }

  protected handleTabBarContextMenu(groupId: string, event: MouseEvent): void {
    this.editor.focusGroup(groupId);
    this.contextTarget = { type: 'bar', groupId };
    this.contextMenuItems.set(buildWorkspaceTabBarContextMenu(this.paneLayoutOptions()));
    this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.contextMenuOpen.set(true);
  }

  protected handleEmptyPaneContextMenu(groupId: string, event: MouseEvent): void {
    event.preventDefault();
    this.editor.focusGroup(groupId);
    this.contextTarget = { type: 'empty', groupId };
    this.contextMenuItems.set(buildWorkspaceEmptyPaneContextMenu(this.paneLayoutOptions()));
    this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.contextMenuOpen.set(true);
  }

  protected handleClosePane(groupId: string): void {
    const tabs = this.editor.tabsForGroup(groupId);
    this.evictTabMounts(
      groupId,
      tabs.map((t) => t.id),
    );
    this.editor.closePane(groupId);
  }

  protected handleMergeToSinglePane(): void {
    this.editor.mergeToSinglePane();
  }

  protected handleContextMenuSelect(actionId: string): void {
    const target = this.contextTarget;
    this.contextMenuOpen.set(false);
    this.contextTarget = null;

    if (!target) {
      return;
    }

    const groupId = target.groupId;

    if (target.type === 'tab') {
      this.runTabContextAction(actionId, groupId, target.tabId);
      return;
    }

    if (target.type === 'empty') {
      this.runPaneLayoutAction(actionId, groupId);
      return;
    }

    this.runBarContextAction(actionId, groupId);
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
    this.contextTarget = null;
  }

  private beginTabMount(tabId: string, kind: WorkspaceTabKind): void {
    if (!peekWorkspaceTabComponent(kind)) {
      this.mountingTabIds.update((ids) => new Set([...ids, tabId]));
      void loadWorkspaceTabComponent(kind);
    }
  }

  private clearTabMounting(tabId: string): void {
    this.mountingTabIds.update((ids) => {
      if (!ids.has(tabId)) {
        return ids;
      }
      const next = new Set(ids);
      next.delete(tabId);
      return next;
    });
  }

  private evictTabMount(groupId: string, tabId: string): void {
    this.evictTabMounts(groupId, [tabId]);
  }

  private rememberWarmTab(tabId: string): void {
    this.warmTabOrder.update((order) => {
      const next = [tabId, ...order.filter((id) => id !== tabId)];
      return next.length > MAX_WARM_TABS ? next.slice(0, MAX_WARM_TABS) : next;
    });
  }

  private promoteWarmTab(tabId: string): void {
    this.warmTabOrder.update((order) => order.filter((id) => id !== tabId));
  }

  private dropWarmTabs(tabIds: readonly string[]): void {
    if (tabIds.length === 0) {
      return;
    }
    const drop = new Set(tabIds);
    this.warmTabOrder.update((order) => {
      const next = order.filter((id) => !drop.has(id));
      return next.length === order.length ? order : next;
    });
  }

  private evictTabMounts(groupId: string, tabIds: readonly string[]): void {
    if (tabIds.length === 0) {
      return;
    }
    this.dropWarmTabs(tabIds);
    this.mountedTabs.update((mounted) => removeMountedTabs(mounted, groupId, tabIds));
    this.mountingTabIds.update((ids) => {
      const drop = new Set(tabIds);
      const next = new Set([...ids].filter((id) => !drop.has(id)));
      return next.size === ids.size ? ids : next;
    });
    this.cachedTabIds.update((ids) => {
      const drop = new Set(tabIds);
      const next = new Set([...ids].filter((id) => !drop.has(id)));
      return next.size === ids.size ? ids : next;
    });
  }

  private runTabContextAction(actionId: string, groupId: string, tabId: string): void {
    switch (actionId) {
      case 'close':
        this.handleTabClose(groupId, tabId);
        break;
      case 'close-others': {
        const others = this.editor
          .tabsForGroup(groupId)
          .filter((t) => t.id !== tabId)
          .map((t) => t.id);
        this.evictTabMounts(groupId, others);
        this.editor.closeOthers(groupId, tabId);
        break;
      }
      case 'close-to-right': {
        const tabs = this.editor.tabsForGroup(groupId);
        const index = tabs.findIndex((t) => t.id === tabId);
        const toRight = index >= 0 ? tabs.slice(index + 1).map((t) => t.id) : [];
        this.evictTabMounts(groupId, toRight);
        this.editor.closeToRight(groupId, tabId);
        break;
      }
      case 'close-all': {
        const all = this.editor.tabsForGroup(groupId).map((t) => t.id);
        this.evictTabMounts(groupId, all);
        this.editor.closeAllInGroup(groupId);
        break;
      }
      case 'pin': {
        this.editor.pinTab(groupId, tabId, true);
        break;
      }
      case 'unpin':
        this.editor.pinTab(groupId, tabId, false);
        break;
      case 'close-pane':
        this.handleClosePane(groupId);
        break;
      case 'merge-single':
        this.editor.mergeToSinglePane();
        break;
      default: {
        const splitZone = parseSplitContextMenuAction(actionId);
        if (splitZone) {
          this.editor.focusGroup(groupId);
          this.editor.splitFocusedPane(splitZone);
        }
        break;
      }
    }
  }

  private runPaneLayoutAction(actionId: string, groupId: string): void {
    switch (actionId) {
      case 'close-pane':
        this.handleClosePane(groupId);
        break;
      case 'merge-single':
        this.editor.mergeToSinglePane();
        break;
    }
  }

  private runBarContextAction(actionId: string, groupId: string): void {
    const splitZone = parseSplitContextMenuAction(actionId);
    if (splitZone) {
      this.editor.focusGroup(groupId);
      this.editor.splitFocusedPane(splitZone);
      return;
    }

    switch (actionId) {
      case 'close-all': {
        const all = this.editor.tabsForGroup(groupId).map((t) => t.id);
        this.evictTabMounts(groupId, all);
        this.editor.closeAllInGroup(groupId);
        break;
      }
      case 'close-pane':
        this.handleClosePane(groupId);
        break;
      case 'merge-single':
        this.editor.mergeToSinglePane();
        break;
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeydown(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    if (isTextInputTarget(event.target)) {
      return;
    }

    if (event.key === 'w') {
      event.preventDefault();
      const editor = this.editor.editor();
      const group = editor.groups[editor.focusedGroupId];
      const activeId = group?.activeTabId;
      if (activeId) {
        this.evictTabMount(editor.focusedGroupId, activeId);
      }
      this.editor.closeActiveTab();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      this.editor.cycleTabInFocusedGroup(event.shiftKey);
    }
  }
}
