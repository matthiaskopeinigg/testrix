import {
  findTestSuiteFlowInTree,
  type TestSuiteFlowLocation,
} from './collect-test-suite-ancestor-folders';
import {
  isTestSuiteFlow,
  isTestSuiteFolder,
  type TestSuiteFolder,
  type TestSuiteTreeItem,
} from './test-suites.schema';

/** Safety cap for nested TRIGGER calls (root flow counts as depth 1). */
export const TRIGGER_MAX_NESTING_DEPTH = 16;

/** TRIGGER step target from persisted step config. */
export interface TriggerStepTarget {
  readonly targetType: 'flow' | 'folder';
  readonly targetId: string;
}

export type ResolveTriggerTargetResult =
  | { readonly ok: true; readonly locations: readonly TestSuiteFlowLocation[] }
  | { readonly ok: false; readonly message: string };

/** Finds a suite folder by id (depth-first). */
export function findTestSuiteFolderInTree(
  items: readonly TestSuiteTreeItem[],
  folderId: string,
): TestSuiteFolder | null {
  for (const item of items) {
    if (!isTestSuiteFolder(item)) {
      continue;
    }
    if (item.id === folderId) {
      return item;
    }
    const nested = findTestSuiteFolderInTree(item.children, folderId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/**
 * Collects descendant flows under a folder in tree (preorder) run order.
 * Returns `null` when the folder id is missing from the tree.
 */
export function collectFlowsUnderFolder(
  items: readonly TestSuiteTreeItem[],
  folderId: string,
): readonly TestSuiteFlowLocation[] | null {
  let found = false;
  const locations: TestSuiteFlowLocation[] = [];

  const walk = (
    list: readonly TestSuiteTreeItem[],
    chain: TestSuiteFlowLocation['ancestorFolders'],
    collecting: boolean,
  ): void => {
    for (const item of list) {
      if (isTestSuiteFlow(item)) {
        if (collecting) {
          locations.push({ flow: item, ancestorFolders: chain });
        }
        continue;
      }
      if (!isTestSuiteFolder(item)) {
        continue;
      }
      const nextChain = [
        ...chain,
        {
          id: item.id,
          name: item.name,
          environmentId: item.environmentId ?? null,
        },
      ];
      const isTarget = item.id === folderId;
      if (isTarget) {
        found = true;
      }
      walk(item.children, nextChain, collecting || isTarget);
    }
  };

  walk(items, [], false);
  return found ? locations : null;
}

/** Resolves a TRIGGER target to the flows that should run (fail-fast order). */
export function resolveTriggerTargetFlows(
  items: readonly TestSuiteTreeItem[],
  target: TriggerStepTarget,
): ResolveTriggerTargetResult {
  const targetId = target.targetId.trim();
  if (!targetId) {
    return { ok: false, message: 'TRIGGER step has no target selected.' };
  }

  if (target.targetType === 'flow') {
    const location = findTestSuiteFlowInTree(items, targetId);
    if (!location) {
      return { ok: false, message: 'TRIGGER target flow was not found.' };
    }
    return { ok: true, locations: [location] };
  }

  const folder = findTestSuiteFolderInTree(items, targetId);
  if (!folder) {
    return { ok: false, message: 'TRIGGER target folder was not found.' };
  }
  const locations = collectFlowsUnderFolder(items, targetId) ?? [];
  if (locations.length === 0) {
    return { ok: false, message: `Folder "${folder.name}" has no flows to run.` };
  }
  return { ok: true, locations };
}

/**
 * Returns an error message when entering `flowId` would cycle or exceed the nesting cap.
 * `ancestorFlowIds` is the stack of flows already running (root first).
 */
export function triggerFlowCycleMessage(
  ancestorFlowIds: readonly string[],
  flowId: string,
  flowName?: string,
  maxDepth: number = TRIGGER_MAX_NESTING_DEPTH,
): string | null {
  const label = flowName?.trim() || flowId;
  if (ancestorFlowIds.includes(flowId)) {
    return `TRIGGER would re-enter flow "${label}".`;
  }
  if (ancestorFlowIds.length >= maxDepth) {
    return `TRIGGER nesting exceeds ${maxDepth} flows.`;
  }
  return null;
}
