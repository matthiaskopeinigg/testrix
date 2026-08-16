import { isDatabaseFolderNode, isDatabaseQueryNode } from './database-tree.mutations';
import type { DatabaseTreeNode } from './database-tree.types';
import type { DatabaseSidebarFilter, DatabaseSidebarSortBy } from './database-sidebar-menus';

export interface DatabaseTreeViewOptions {
  readonly query: string;
  readonly kindFilter: DatabaseSidebarFilter;
  readonly sortBy: DatabaseSidebarSortBy;
  readonly connectionIds?: readonly string[];
}

/** Filters the query tree by name or SQL body, keeping ancestors of matches. */
export function filterDatabaseTree(nodes: readonly DatabaseTreeNode[], query: string): DatabaseTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly DatabaseTreeNode[]): DatabaseTreeNode[] => {
    const out: DatabaseTreeNode[] = [];
    for (const node of list) {
      const labelMatch = node.label.toLowerCase().includes(q);
      const sqlMatch =
        node.data?.kind === 'query' && (node.data.query ?? '').toLowerCase().includes(q);
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;
      if (labelMatch || sqlMatch || childMatch) {
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

/** Keeps queries whose connectionId is in `connectionIds`. Empty set means all. */
export function filterDatabaseTreeByConnection(
  nodes: readonly DatabaseTreeNode[],
  connectionIds: readonly string[],
): DatabaseTreeNode[] {
  if (connectionIds.length === 0) {
    return [...nodes];
  }
  const allowed = new Set(connectionIds);
  const filterNodes = (list: readonly DatabaseTreeNode[]): DatabaseTreeNode[] => {
    const out: DatabaseTreeNode[] = [];
    for (const node of list) {
      if (isDatabaseQueryNode(node)) {
        const connectionId = node.data?.kind === 'query' ? node.data.connectionId : undefined;
        if (connectionId && allowed.has(connectionId)) {
          out.push(node);
        }
        continue;
      }
      const children = node.children ? filterNodes(node.children) : undefined;
      if (children?.length) {
        out.push({ ...node, children });
      }
    }
    return out;
  };
  return filterNodes(nodes);
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
  const aTs = nodeUpdatedAt(a);
  const bTs = nodeUpdatedAt(b);
  if (aTs || bTs) {
    if (sortBy === 'date-new') {
      return bTs.localeCompare(aTs);
    }
    return aTs.localeCompare(bTs);
  }
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

function nodeUpdatedAt(node: DatabaseTreeNode): string {
  if (node.data?.kind === 'folder' || node.data?.kind === 'query') {
    return node.data.updatedAt ?? '';
  }
  return '';
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

/** Applies kind filter, connection filter, presentation sort, and search to the query tree. */
export function applyDatabaseTreeView(
  nodes: readonly DatabaseTreeNode[],
  options: DatabaseTreeViewOptions,
): DatabaseTreeNode[] {
  const kindFiltered = filterDatabaseTreeByKind(nodes, options.kindFilter);
  const connectionFiltered = filterDatabaseTreeByConnection(
    kindFiltered,
    options.connectionIds ?? [],
  );
  const sorted = sortDatabaseTree(connectionFiltered, options.sortBy);
  return filterDatabaseTree(sorted, options.query);
}
