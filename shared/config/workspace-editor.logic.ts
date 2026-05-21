import type {
  SplitLayoutNode,
  SplitDirection,
  TabGroupState,
  WorkspaceEditorState,
  WorkspaceTab,
} from './workspace-editor.schema';
import {
  WORKSPACE_EDITOR_MAIN_GROUP_ID,
  WORKSPACE_SPLIT_MAX_RATIO,
  WORKSPACE_SPLIT_MIN_PANE_SIZE_PX,
  WORKSPACE_SPLIT_MIN_RATIO,
} from './workspace-editor.schema';

export interface ClampWorkspaceSplitRatioOptions {
  readonly minRatio?: number;
  readonly maxRatio?: number;
  /** Split container size along the split axis (px); enables min pane size clamping. */
  readonly containerSizePx?: number;
  readonly minPaneSizePx?: number;
}

/**
 * Clamps a split ratio to configured percent bounds and optional minimum pane width/height.
 */
export function clampWorkspaceSplitRatio(
  ratio: number,
  options: ClampWorkspaceSplitRatioOptions = {},
): number {
  const minRatio = options.minRatio ?? WORKSPACE_SPLIT_MIN_RATIO;
  const maxRatio = options.maxRatio ?? WORKSPACE_SPLIT_MAX_RATIO;
  const minPaneSizePx = options.minPaneSizePx ?? WORKSPACE_SPLIT_MIN_PANE_SIZE_PX;

  let effectiveMin = minRatio;
  let effectiveMax = maxRatio;

  if (options.containerSizePx !== undefined && options.containerSizePx > 0) {
    const paneMinShare = minPaneSizePx / options.containerSizePx;
    effectiveMin = Math.max(effectiveMin, paneMinShare);
    effectiveMax = Math.min(effectiveMax, 1 - paneMinShare);
  }

  if (effectiveMin > effectiveMax) {
    return (effectiveMin + effectiveMax) / 2;
  }

  return Math.min(effectiveMax, Math.max(effectiveMin, ratio));
}

/** Clamps every split ratio in the layout tree to workspace limits. */
export function clampLayoutSplitRatios(layout: SplitLayoutNode): SplitLayoutNode {
  if (layout.type === 'leaf') {
    return layout;
  }

  return {
    ...layout,
    ratio: clampWorkspaceSplitRatio(layout.ratio),
    first: clampLayoutSplitRatios(layout.first),
    second: clampLayoutSplitRatios(layout.second),
  };
}

/** Generates a unique tab group id. */
export function createWorkspaceGroupId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `group-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Generates a unique tab id. */
export function createWorkspaceTabId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Returns true when any layout pane has at least one tab. */
export function workspaceEditorHasAnyTabs(editor: WorkspaceEditorState): boolean {
  const layoutGroupIds = new Set(collectLayoutGroupIds(editor.layout));
  for (const [groupId, group] of Object.entries(editor.groups)) {
    if (layoutGroupIds.has(groupId) && group.tabs.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Drops groups not referenced by the layout and resets to a single empty pane when
 * no tabs remain (so the home welcome view can replace the editor chrome).
 */
export function normalizeWorkspaceEditorState(editor: WorkspaceEditorState): WorkspaceEditorState {
  const layout = editor.layout;
  const groups = pruneEditorGroups(layout, editor.groups);

  if (!workspaceEditorHasAnyTabs({ ...editor, groups })) {
    return {
      focusedGroupId: WORKSPACE_EDITOR_MAIN_GROUP_ID,
      layout: { type: 'leaf', groupId: WORKSPACE_EDITOR_MAIN_GROUP_ID },
      groups: {
        [WORKSPACE_EDITOR_MAIN_GROUP_ID]: { tabs: [], activeTabId: null },
      },
      recentResourceIds: editor.recentResourceIds,
    };
  }

  let focusedGroupId = editor.focusedGroupId;
  if (!groups[focusedGroupId]) {
    const layoutIds = collectLayoutGroupIds(layout);
    focusedGroupId = layoutIds[0] ?? WORKSPACE_EDITOR_MAIN_GROUP_ID;
  }

  return {
    ...editor,
    layout: clampLayoutSplitRatios(layout),
    groups,
    focusedGroupId,
  };
}

/** Collects all group ids referenced by the layout tree. */
export function collectLayoutGroupIds(layout: SplitLayoutNode): string[] {
  if (layout.type === 'leaf') {
    return [layout.groupId];
  }
  return [...collectLayoutGroupIds(layout.first), ...collectLayoutGroupIds(layout.second)];
}

/** Which side of the target leaf the new pane is placed on. */
export type SplitPanePlacement = 'before' | 'after';

/**
 * Replaces the leaf with the given groupId by a horizontal or vertical split.
 * `placement` `before` puts the new pane left (horizontal) or above (vertical).
 */
export function splitLayoutAtGroup(
  layout: SplitLayoutNode,
  groupId: string,
  direction: SplitDirection,
  newGroupId: string,
  ratio = 0.5,
  placement: SplitPanePlacement = 'after',
): SplitLayoutNode {
  if (layout.type === 'leaf') {
    if (layout.groupId !== groupId) {
      return layout;
    }
    const existingLeaf = layout;
    const newLeaf: SplitLayoutNode = { type: 'leaf', groupId: newGroupId };
    return {
      type: 'split',
      direction,
      ratio,
      first: placement === 'before' ? newLeaf : existingLeaf,
      second: placement === 'before' ? existingLeaf : newLeaf,
    };
  }

  return {
    ...layout,
    first: splitLayoutAtGroup(layout.first, groupId, direction, newGroupId, ratio, placement),
    second: splitLayoutAtGroup(layout.second, groupId, direction, newGroupId, ratio, placement),
  };
}

/**
 * Removes a leaf for groupId and promotes the sibling when the parent is a split.
 */
export function removeLayoutGroup(layout: SplitLayoutNode, groupId: string): SplitLayoutNode | null {
  if (layout.type === 'leaf') {
    return layout.groupId === groupId ? null : layout;
  }

  const firstRemoved = removeLayoutGroup(layout.first, groupId);
  const secondRemoved = removeLayoutGroup(layout.second, groupId);

  if (firstRemoved === null) {
    return secondRemoved;
  }
  if (secondRemoved === null) {
    return firstRemoved;
  }

  return {
    ...layout,
    first: firstRemoved,
    second: secondRemoved,
  };
}

/**
 * Updates split ratio on the split node at the given path (indices into first/second).
 */
export function setLayoutRatioAtPath(
  layout: SplitLayoutNode,
  path: readonly number[],
  ratio: number,
): SplitLayoutNode {
  if (path.length === 0) {
    if (layout.type !== 'split') {
      return layout;
    }
    return { ...layout, ratio };
  }

  if (layout.type === 'leaf') {
    return layout;
  }

  const [head, ...rest] = path;
  if (head === 0) {
    return { ...layout, first: setLayoutRatioAtPath(layout.first, rest, ratio) };
  }
  return { ...layout, second: setLayoutRatioAtPath(layout.second, rest, ratio) };
}

/** Sorts tabs with pinned first, preserving relative order within each bucket. */
export function sortTabsWithPinned(tabs: readonly WorkspaceTab[]): WorkspaceTab[] {
  const pinned = tabs.filter((t) => t.pinned);
  const unpinned = tabs.filter((t) => !t.pinned);
  return [...pinned, ...unpinned];
}

/** Finds a tab by resourceId across all groups. */
export function findTabByResourceId(
  groups: Readonly<Record<string, TabGroupState>>,
  resourceId: string,
): { groupId: string; tab: WorkspaceTab } | null {
  for (const [groupId, group] of Object.entries(groups)) {
    const tab = group.tabs.find((t) => t.resourceId === resourceId);
    if (tab) {
      return { groupId, tab };
    }
  }
  return null;
}

/**
 * Prunes groups map to only ids still present in layout; ensures main group exists.
 */
export function pruneEditorGroups(
  layout: SplitLayoutNode,
  groups: Readonly<Record<string, TabGroupState>>,
): Record<string, TabGroupState> {
  const ids = new Set(collectLayoutGroupIds(layout));
  const next: Record<string, TabGroupState> = {};

  for (const id of ids) {
    next[id] = groups[id] ?? { tabs: [], activeTabId: null };
  }

  if (!next[WORKSPACE_EDITOR_MAIN_GROUP_ID] && ids.size === 0) {
    next[WORKSPACE_EDITOR_MAIN_GROUP_ID] = { tabs: [], activeTabId: null };
  }

  return next;
}

/**
 * Removes pane leaves whose tab group is empty when more than one pane exists.
 */
export function collapseEmptyEditorPanes(state: WorkspaceEditorState): WorkspaceEditorState {
  const paneIds = collectLayoutGroupIds(state.layout);
  if (paneIds.length <= 1) {
    return state;
  }

  let layout = state.layout;
  let groups = { ...state.groups };
  let focusedGroupId = state.focusedGroupId;

  for (const groupId of paneIds) {
    const group = groups[groupId];
    if (!group || group.tabs.length > 0) {
      continue;
    }
    const nextLayout = removeLayoutGroup(layout, groupId);
    if (!nextLayout) {
      continue;
    }
    layout = nextLayout;
    delete groups[groupId];
    if (focusedGroupId === groupId) {
      const remaining = collectLayoutGroupIds(layout);
      focusedGroupId = remaining[0] ?? WORKSPACE_EDITOR_MAIN_GROUP_ID;
    }
  }

  return {
    ...state,
    layout,
    groups: pruneEditorGroups(layout, groups),
    focusedGroupId,
  };
}

/** Pushes resourceId to front of recent list, capped at 32 entries. */
export function pushRecentResourceId(recent: readonly string[], resourceId: string): string[] {
  const filtered = recent.filter((id) => id !== resourceId);
  return [resourceId, ...filtered].slice(0, 32);
}
