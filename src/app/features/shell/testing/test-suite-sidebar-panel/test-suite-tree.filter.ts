import type { TestSuiteTreeNode } from './test-suite-tree.types';

/** Collects folder ids in the suite tree. */
export function collectTestSuiteFolderIds(nodes: readonly TestSuiteTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder' || node.data?.kind === 'folder') {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectTestSuiteFolderIds(node.children));
    }
  }
  return ids;
}

export function collectTestSuiteFolderIdsInSubtree(nodes: readonly TestSuiteTreeNode[]): string[] {
  return collectTestSuiteFolderIds(nodes);
}

/** Filters suite tree by label, description, and tags. */
export function filterTestSuiteTree(
  nodes: readonly TestSuiteTreeNode[],
  query: string,
): TestSuiteTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly TestSuiteTreeNode[]): TestSuiteTreeNode[] => {
    const out: TestSuiteTreeNode[] = [];
    for (const node of list) {
      const labelMatch = node.label.toLowerCase().includes(q);
      const descMatch = (node.data?.description ?? node.subtitle ?? '').toLowerCase().includes(q);
      const tagMatch = (node.data?.tags ?? []).some((tag) => tag.toLowerCase().includes(q));
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;

      if (labelMatch || descMatch || tagMatch || childMatch) {
        out.push({
          ...node,
          children: children?.length ? children : node.children && childMatch ? children : undefined,
        });
      }
    }
    return out;
  };

  return filterNodes(nodes);
}
