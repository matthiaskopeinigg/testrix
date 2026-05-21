import type { EnvironmentTreeNode } from './environment-tree.types';

function compareEnvironmentNodeLabels(a: EnvironmentTreeNode, b: EnvironmentTreeNode): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

function sortSiblingList(nodes: readonly EnvironmentTreeNode[]): EnvironmentTreeNode[] {
  return [...nodes].sort(compareEnvironmentNodeLabels);
}

/**
 * Returns a copy of the tree with each sibling list sorted by label (folder name or variable key).
 */
export function sortEnvironmentTreeByName(
  nodes: readonly EnvironmentTreeNode[],
): EnvironmentTreeNode[] {
  return sortSiblingList(nodes).map((node) =>
    node.children?.length
      ? { ...node, children: sortEnvironmentTreeByName(node.children) }
      : node,
  );
}
