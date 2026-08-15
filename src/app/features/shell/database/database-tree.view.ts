import { isDatabaseFolderNode, isDatabaseQueryNode } from './database-tree.mutations';
import type { DatabaseTreeNode } from './database-tree.types';
import type { DatabaseSidebarFilter, DatabaseSidebarSortBy } from './database-sidebar-menus';

export interface DatabaseTreeViewOptions {
  readonly query: string;
  readonly kindFilter: DatabaseSidebarFilter;
  readonly sortBy: DatabaseSidebarSortBy;
}

/** Filters the query tree by name, keeping ancestors of matches. */
export function filterDatabaseTree(nodes: readonly DatabaseTreeNode[], query: string): DatabaseTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly DatabaseTreeNode[]): DatabaseTreeNode[] => {
    const out: DatabaseTreeNode[] = [];
    for (const node of list) {
      const labelMatch = node.label.toLowerCase().includes(q);
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;
      if (labelMatch || childMatch) {
        out.push({
          ...node,
          children: childMatch ? children : node.children,
        });
      }
    }
    return out;
  };

  return filterNodes(nodes);
}

function collectQueries(nodes: readonly DatabaseTreeNode[]): DatabaseTreeNode[] {
  const out: DatabaseTreeNode[] = [];
  for (const node of nodes) {
    if (isDatabaseQueryNode(node)) {
      out.push(node);
      continue;
    }
    if (node.children?.length) {
      out.push(...collectQueries(node.children));
    }
  }
  return out;
}

function filterDatabaseTreeByKind(
  nodes: readonly DatabaseTreeNode[],
  filter: DatabaseSidebarFilter,
): DatabaseTreeNode[] {
  if (filter === 'all') {
    return [...nodes];
  }
  if (filter === 'folders') {
    return nodes
      .filter((node) => isDatabaseFolderNode(node))
      .map((node) => ({ ...node, children: undefined }));
  }
  return collectQueries(nodes);
}

function compareNodes(a: DatabaseTreeNode, b: DatabaseTreeNode, sortBy: DatabaseSidebarSortBy): number {
  if (sortBy === 'saved') {
    return 0;
  }
  if (sortBy === 'name-asc') {
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  }
  if (sortBy === 'name-desc') {
    return b.label.localeCompare(a.label, undefined, { sensitivity: 'base' });
  }
  const aTs = a.data?.updatedAt ?? '';
  const bTs = b.data?.updatedAt ?? '';
  if (sortBy === 'date-new') {
    return bTs.localeCompare(aTs);
  }
  return aTs.localeCompare(bTs);
}

function sortDatabaseTree(
  nodes: readonly DatabaseTreeNode[],
  sortBy: DatabaseSidebarSortBy,
): DatabaseTreeNode[] {
  if (sortBy === 'saved') {
    return nodes.map((node) => ({
      ...node,
      children: node.children ? sortDatabaseTree(node.children, sortBy) : undefined,
    }));
  }
  const folders = nodes
    .filter((node) => isDatabaseFolderNode(node))
    .map((node) => ({
      ...node,
      children: node.children ? sortDatabaseTree(node.children, sortBy) : undefined,
    }))
    .sort((a, b) => compareNodes(a, b, sortBy));
  const queries = nodes.filter((node) => isDatabaseQueryNode(node)).sort((a, b) => compareNodes(a, b, sortBy));
  return [...folders, ...queries];
}

/** Applies kind filter, presentation sort, and search to the query tree. */
export function applyDatabaseTreeView(
  nodes: readonly DatabaseTreeNode[],
  options: DatabaseTreeViewOptions,
): DatabaseTreeNode[] {
  const kindFiltered = filterDatabaseTreeByKind(nodes, options.kindFilter);
  const sorted = sortDatabaseTree(kindFiltered, options.sortBy);
  return filterDatabaseTree(sorted, options.query);
}
