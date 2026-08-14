import type { EnvironmentTreeNode } from './environment-tree.types';

function nodeMatches(node: EnvironmentTreeNode, needle: string): boolean {
  const kind = node.data?.kind ?? (node.kind === 'folder' ? 'folder' : 'variable');
  if (kind === 'folder') {
    const desc = node.data?.description?.toLowerCase() ?? '';
    return node.label.toLowerCase().includes(needle) || desc.includes(needle);
  }

  const key = (node.data?.key ?? node.label).toLowerCase();
  const value = (node.data?.value ?? '').toLowerCase();
  const desc = (node.data?.description ?? '').toLowerCase();
  return key.includes(needle) || value.includes(needle) || desc.includes(needle);
}

/**
 * Filters the environment tree by folder label or variable key/value/description.
 * Keeps matching nodes and their ancestors.
 */
export function filterEnvironmentTree(
  nodes: readonly EnvironmentTreeNode[],
  query: string,
): EnvironmentTreeNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...nodes];
  }

  const filterList = (list: readonly EnvironmentTreeNode[]): EnvironmentTreeNode[] => {
    const out: EnvironmentTreeNode[] = [];

    for (const node of list) {
      const selfMatch = nodeMatches(node, needle);
      const filteredChildren = node.children?.length ? filterList(node.children) : [];
      const childMatch = filteredChildren.length > 0;

      if (selfMatch || childMatch) {
        out.push({
          ...node,
          children: childMatch ? filteredChildren : selfMatch ? node.children : undefined,
        });
      }
    }

    return out;
  };

  return filterList(nodes);
}
