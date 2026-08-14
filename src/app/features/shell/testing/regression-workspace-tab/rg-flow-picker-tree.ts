import type { TestSuiteTreeNode } from '../test-suite-sidebar-panel/test-suite-tree.types';

/** Resolves whether a tree node is a folder or flow. */
export function resolveTestSuiteTreeKind(node: TestSuiteTreeNode): 'folder' | 'flow' {
  if (node.data?.kind === 'folder' || node.kind === 'folder') {
    return 'folder';
  }
  return 'flow';
}

/** Collects flow ids in depth-first order under a folder node. */
export function collectFlowIdsInSubtree(node: TestSuiteTreeNode): readonly string[] {
  const ids: string[] = [];
  const walk = (current: TestSuiteTreeNode): void => {
    if (resolveTestSuiteTreeKind(current) === 'flow') {
      ids.push(current.id);
      return;
    }
    for (const child of current.children ?? []) {
      walk(child);
    }
  };
  walk(node);
  return ids;
}

/** Collects all flow ids from a tree in depth-first order. */
export function collectFlowIdsFromTree(nodes: readonly TestSuiteTreeNode[]): readonly string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (resolveTestSuiteTreeKind(node) === 'flow') {
      ids.push(node.id);
      continue;
    }
    ids.push(...collectFlowIdsInSubtree(node));
  }
  return ids;
}

/** Toggles a single flow in the linked selection. */
export function toggleFlowInSelection(
  selected: readonly string[],
  flowId: string,
): readonly string[] {
  const set = new Set(selected);
  if (set.has(flowId)) {
    set.delete(flowId);
  } else {
    set.add(flowId);
  }
  return [...set];
}

/** Selects or clears all flows under a folder depending on current selection. */
export function toggleFolderInSelection(
  selected: readonly string[],
  folder: TestSuiteTreeNode,
): readonly string[] {
  const flowIds = collectFlowIdsInSubtree(folder);
  if (flowIds.length === 0) {
    return selected;
  }
  const set = new Set(selected);
  const allSelected = flowIds.every((id) => set.has(id));
  if (allSelected) {
    for (const id of flowIds) {
      set.delete(id);
    }
  } else {
    for (const id of flowIds) {
      set.add(id);
    }
  }
  return [...set];
}

/** Reorders linked flow ids to match test-suite tree traversal. */
export function orderRegressionFlowIds(
  treeNodes: readonly TestSuiteTreeNode[],
  selectedIds: readonly string[],
): readonly string[] {
  const selected = new Set(selectedIds);
  const ordered: string[] = [];
  const walk = (nodes: readonly TestSuiteTreeNode[]): void => {
    for (const node of nodes) {
      if (resolveTestSuiteTreeKind(node) === 'flow') {
        if (selected.has(node.id)) {
          ordered.push(node.id);
        }
        continue;
      }
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(treeNodes);
  for (const id of selectedIds) {
    if (!ordered.includes(id)) {
      ordered.push(id);
    }
  }
  return ordered;
}

/** Returns whether every flow under a folder is linked. */
export function isFolderFullySelected(
  folder: TestSuiteTreeNode,
  selected: ReadonlySet<string>,
): boolean {
  const flowIds = collectFlowIdsInSubtree(folder);
  return flowIds.length > 0 && flowIds.every((id) => selected.has(id));
}

/** Returns whether some but not all flows under a folder are linked. */
export function isFolderPartiallySelected(
  folder: TestSuiteTreeNode,
  selected: ReadonlySet<string>,
): boolean {
  const flowIds = collectFlowIdsInSubtree(folder);
  if (flowIds.length === 0) {
    return false;
  }
  const selectedCount = flowIds.filter((id) => selected.has(id)).length;
  return selectedCount > 0 && selectedCount < flowIds.length;
}
