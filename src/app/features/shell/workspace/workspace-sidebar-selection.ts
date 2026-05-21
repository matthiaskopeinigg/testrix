import type { WorkspaceTab, WorkspaceTabKind } from '@shared/config';

/** Tab kinds shown in the collections sidebar tree. */
export const COLLECTIONS_SIDEBAR_TAB_KINDS: readonly WorkspaceTabKind[] = [
  'request',
  'websocket',
  'folder',
];

/** Tab kinds shown in the environments sidebar tree. */
export const ENVIRONMENTS_SIDEBAR_TAB_KINDS: readonly WorkspaceTabKind[] = ['environment'];

/** Tab kinds highlighted in the development tools sidebar. */
export const DEVELOPMENT_SIDEBAR_TAB_KINDS: readonly WorkspaceTabKind[] = ['dev-tool'];

/** Tab kinds highlighted in the history sidebar list. */
export const HISTORY_SIDEBAR_TAB_KINDS: readonly WorkspaceTabKind[] = ['history'];

/** Tab kinds managed from the Testing sidebar. */
export const TESTING_SIDEBAR_TAB_KINDS: readonly WorkspaceTabKind[] = [
  'test-suite',
  'load-test',
  'regression',
  'mock-server',
  'capture',
  'interceptor-rule',
];

/**
 * Returns tree row ids to highlight for the active workspace tab in collections.
 */
export function collectionsSidebarSelectionIds(tab: WorkspaceTab | null): readonly string[] {
  if (!tab || !COLLECTIONS_SIDEBAR_TAB_KINDS.includes(tab.kind)) {
    return [];
  }
  return [tab.resourceId];
}

/**
 * Returns tree row ids to highlight for the active workspace tab in environments.
 */
export function environmentsSidebarSelectionIds(tab: WorkspaceTab | null): readonly string[] {
  if (!tab || !ENVIRONMENTS_SIDEBAR_TAB_KINDS.includes(tab.kind)) {
    return [];
  }
  return [tab.resourceId];
}

/**
 * Returns tool ids to highlight for the active workspace tab in development.
 */
export function developmentSidebarSelectionIds(tab: WorkspaceTab | null): readonly string[] {
  if (!tab || !DEVELOPMENT_SIDEBAR_TAB_KINDS.includes(tab.kind)) {
    return [];
  }
  return [tab.resourceId];
}

/** Returns history entry ids to highlight for the active workspace tab. */
export function historySidebarSelectionIds(tab: WorkspaceTab | null): readonly string[] {
  if (!tab || !HISTORY_SIDEBAR_TAB_KINDS.includes(tab.kind)) {
    return [];
  }
  return [tab.resourceId];
}

/** Returns resource ids to highlight in testing tree sidebars. */
export function testingSidebarSelectionIds(tab: WorkspaceTab | null): readonly string[] {
  if (!tab || !TESTING_SIDEBAR_TAB_KINDS.includes(tab.kind)) {
    return [];
  }
  if (tab.kind === 'test-suite') {
    const raw = tab.resourceId;
    if (raw.startsWith('ts:fld:')) {
      return [raw.slice('ts:fld:'.length)];
    }
    if (raw.startsWith('ts:flw:')) {
      return [raw.slice('ts:flw:'.length)];
    }
  }
  if (tab.kind === 'load-test' && tab.resourceId.startsWith('lt:')) {
    return [tab.resourceId.slice(3)];
  }
  if (tab.kind === 'regression' && tab.resourceId.startsWith('rg:')) {
    return [tab.resourceId.slice(3)];
  }
  if (tab.kind === 'mock-server' && tab.resourceId.startsWith('ms:')) {
    return [tab.resourceId.slice(3)];
  }
  if (tab.kind === 'capture' && tab.resourceId.startsWith('cap:')) {
    return [tab.resourceId.slice(4)];
  }
  if (tab.kind === 'interceptor-rule' && tab.resourceId.startsWith('int-rule:')) {
    return [tab.resourceId.slice('int-rule:'.length)];
  }
  return [];
}

/**
 * Collects folder ancestor ids so a nested row can be revealed when selected from a tab.
 */
export function collectFolderAncestorIds<T extends { readonly id: string }>(
  nodes: readonly T[],
  resourceId: string,
  findNode: (list: readonly T[], id: string) => { readonly parent: T | null } | null,
): string[] {
  const loc = findNode(nodes, resourceId);
  if (!loc?.parent) {
    return [];
  }

  const out: string[] = [];
  let parentId: string | null = loc.parent.id;
  while (parentId) {
    out.push(parentId);
    const parentLoc = findNode(nodes, parentId);
    parentId = parentLoc?.parent?.id ?? null;
  }
  return out;
}
