import type { TestSuiteSidebarFilter } from '@shared/config';

import type { TestSuiteTreeKind, TestSuiteTreeNode } from './test-suite-tree.types';

function resolveKind(node: TestSuiteTreeNode): TestSuiteTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'flow') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'flow';
}

function collectFlows(nodes: readonly TestSuiteTreeNode[]): TestSuiteTreeNode[] {
  const out: TestSuiteTreeNode[] = [];
  for (const node of nodes) {
    if (resolveKind(node) === 'flow') {
      out.push(node);
      continue;
    }
    if (node.children?.length) {
      out.push(...collectFlows(node.children));
    }
  }
  return out;
}

/**
 * Restricts the suite tree to folders only, flows only, or both.
 */
export function filterTestSuiteTreeByKind(
  nodes: readonly TestSuiteTreeNode[],
  filter: TestSuiteSidebarFilter,
): TestSuiteTreeNode[] {
  if (filter === 'all') {
    return [...nodes];
  }

  if (filter === 'folders') {
    return nodes
      .filter((node) => resolveKind(node) === 'folder')
      .map((node) => ({ ...node, children: undefined }));
  }

  return collectFlows(nodes);
}
