import type { MockServerTreeNode } from './mock-server-tree.types';

export function collectMockServerFolderIds(nodes: readonly MockServerTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder' || node.data?.kind === 'folder') {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectMockServerFolderIds(node.children));
    }
  }
  return ids;
}

export function collectMockServerFolderIdsInSubtree(nodes: readonly MockServerTreeNode[]): string[] {
  return collectMockServerFolderIds(nodes);
}

export function filterMockServerTree(
  nodes: readonly MockServerTreeNode[],
  query: string,
): MockServerTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly MockServerTreeNode[]): MockServerTreeNode[] => {
    const out: MockServerTreeNode[] = [];
    for (const node of list) {
      const labelMatch = node.label.toLowerCase().includes(q);
      const descMatch = (node.data?.description ?? node.subtitle ?? '').toLowerCase().includes(q);
      const tagMatch = (node.data?.tags ?? node.tags ?? []).some((tag) =>
        tag.toLowerCase().includes(q),
      );
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
