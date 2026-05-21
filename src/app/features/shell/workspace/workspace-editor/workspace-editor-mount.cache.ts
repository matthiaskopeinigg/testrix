import type { WorkspaceTabKind } from '@shared/config';

import type { TxWorkspaceTabSkeletonVariant } from '@app/shared/components/tx-workspace-tab-skeleton/tx-workspace-tab-skeleton.component';

/** Maps workspace tab kind to skeleton chrome variant. */
export function skeletonVariantForTabKind(kind: WorkspaceTabKind): TxWorkspaceTabSkeletonVariant {
  switch (kind) {
    case 'request':
    case 'websocket':
      return 'request';
    case 'folder':
      return 'folder';
    default:
      return 'generic';
  }
}

/** Per-pane mounted tab ids (visited tabs kept in DOM until closed). */
export type MountedTabsByGroup = Readonly<Record<string, readonly string[]>>;

export function createEmptyMountedTabs(): MountedTabsByGroup {
  return {};
}

export function isTabMounted(
  mounted: MountedTabsByGroup,
  groupId: string,
  tabId: string,
): boolean {
  return mounted[groupId]?.includes(tabId) ?? false;
}

export function addMountedTab(
  mounted: MountedTabsByGroup,
  groupId: string,
  tabId: string,
): { readonly next: MountedTabsByGroup; readonly firstVisit: boolean } {
  const existing = mounted[groupId] ?? [];
  if (existing.includes(tabId)) {
    return { next: mounted, firstVisit: false };
  }
  return {
    next: { ...mounted, [groupId]: [...existing, tabId] },
    firstVisit: true,
  };
}

export function removeMountedTabs(
  mounted: MountedTabsByGroup,
  groupId: string,
  tabIds: readonly string[],
): MountedTabsByGroup {
  if (tabIds.length === 0) {
    return mounted;
  }
  const existing = mounted[groupId];
  if (!existing?.length) {
    return mounted;
  }
  const drop = new Set(tabIds);
  const nextGroup = existing.filter((id) => !drop.has(id));
  if (nextGroup.length === existing.length) {
    return mounted;
  }
  if (nextGroup.length === 0) {
    const { [groupId]: _removed, ...rest } = mounted;
    return rest;
  }
  return { ...mounted, [groupId]: nextGroup };
}

/** Drops mount entries for tabs no longer present in the editor group. */
export function pruneMountedTabsForGroup(
  mounted: MountedTabsByGroup,
  groupId: string,
  openTabIds: readonly string[],
): MountedTabsByGroup {
  const existing = mounted[groupId];
  if (!existing?.length) {
    return mounted;
  }
  const open = new Set(openTabIds);
  const nextGroup = existing.filter((id) => open.has(id));
  if (nextGroup.length === existing.length) {
    return mounted;
  }
  if (nextGroup.length === 0) {
    const { [groupId]: _removed, ...rest } = mounted;
    return rest;
  }
  return { ...mounted, [groupId]: nextGroup };
}

export function removeMountedGroup(
  mounted: MountedTabsByGroup,
  groupId: string,
): MountedTabsByGroup {
  if (!(groupId in mounted)) {
    return mounted;
  }
  const { [groupId]: _removed, ...rest } = mounted;
  return rest;
}
