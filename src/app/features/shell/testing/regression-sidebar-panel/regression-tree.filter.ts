import type { RegressionTreeNode } from './regression-tree.types';

/** Collects folder ids in the regression tree. */
export function collectRegressionFolderIds(nodes: readonly RegressionTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder' || node.data?.kind === 'folder') {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectRegressionFolderIds(node.children));
    }
  }
  return ids;
}

export function collectRegressionFolderIdsInSubtree(nodes: readonly RegressionTreeNode[]): string[] {
  return collectRegressionFolderIds(nodes);
}

/** Filters regression tree by label, description, and tags. */
export function filterRegressionTree(
  nodes: readonly RegressionTreeNode[],
  query: string,
): RegressionTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly RegressionTreeNode[]): RegressionTreeNode[] => {
    const out: RegressionTreeNode[] = [];
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

/** Hides archived nodes unless showArchived is true. */
export function filterRegressionArchived(
  nodes: readonly RegressionTreeNode[],
  showArchived: boolean,
): RegressionTreeNode[] {
  if (showArchived) {
    return [...nodes];
  }

  const walk = (list: readonly RegressionTreeNode[]): RegressionTreeNode[] => {
    const out: RegressionTreeNode[] = [];
    for (const node of list) {
      if (node.data?.archivedAt) {
        continue;
      }
      const children = node.children ? walk(node.children) : undefined;
      out.push({
        ...node,
        children: children?.length ? children : undefined,
      });
    }
    return out;
  };

  return walk(nodes);
}

/** Splits tree into active (non-archived) and archived node lists for sidebar sections. */
export function partitionRegressionArchived(nodes: readonly RegressionTreeNode[]): {
  readonly active: RegressionTreeNode[];
  readonly archived: RegressionTreeNode[];
} {
  const archived: RegressionTreeNode[] = [];

  const collectArchived = (list: readonly RegressionTreeNode[]): void => {
    for (const node of list) {
      if (node.data?.archivedAt) {
        archived.push(node);
        continue;
      }
      if (node.children?.length) {
        collectArchived(node.children);
      }
    }
  };

  collectArchived(nodes);
  return {
    active: filterRegressionArchived(nodes, false),
    archived,
  };
}

/** Filters tree to nodes matching any of the selected tags. */
export function filterRegressionByTags(
  nodes: readonly RegressionTreeNode[],
  tagFilter: readonly string[],
): RegressionTreeNode[] {
  if (tagFilter.length === 0) {
    return [...nodes];
  }
  const wanted = new Set(tagFilter.map((t) => t.toLowerCase()));

  const filterNodes = (list: readonly RegressionTreeNode[]): RegressionTreeNode[] => {
    const out: RegressionTreeNode[] = [];
    for (const node of list) {
      const tags = node.data?.tags ?? node.tags ?? [];
      const tagMatch = tags.some((tag) => wanted.has(tag.toLowerCase()));
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;
      if (tagMatch || childMatch) {
        out.push({
          ...node,
          children: children?.length ? children : undefined,
        });
      }
    }
    return out;
  };

  return filterNodes(nodes);
}
