import { collectFlowsUnderFolder } from './collect-trigger-targets';
import type { TestSuiteTreeItem } from './test-suites.schema';
import { findTestSuiteFlowInTree } from './collect-test-suite-ancestor-folders';

/** Result of syncing a regression's linked Test Suite folder onto `flowIds`. */
export interface SyncedRegressionFolderFlows {
  readonly flowIds: readonly string[];
  readonly folderMissing: boolean;
}

/**
 * Replaces linked-folder descendants in tree order and keeps extra flow ids
 * that are not in the folder (and still exist in the suite).
 */
export function syncRegressionFlowIdsFromLinkedFolder(
  currentFlowIds: readonly string[],
  linkedFolderId: string | null | undefined,
  items: readonly TestSuiteTreeItem[],
): SyncedRegressionFolderFlows {
  const folderId = linkedFolderId?.trim() ?? '';
  if (!folderId) {
    return { flowIds: [...currentFlowIds], folderMissing: false };
  }

  const descendants = collectFlowsUnderFolder(items, folderId);
  if (descendants === null) {
    return { flowIds: [...currentFlowIds], folderMissing: true };
  }

  const folderIds = descendants.map((location) => location.flow.id);
  const inFolder = new Set(folderIds);
  const extras = currentFlowIds.filter((id) => {
    if (inFolder.has(id)) {
      return false;
    }
    return findTestSuiteFlowInTree(items, id) !== null;
  });

  return { flowIds: [...folderIds, ...extras], folderMissing: false };
}

/** True when two flow-id lists match in order. */
export function regressionFlowIdsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((id, index) => id === b[index]);
}
