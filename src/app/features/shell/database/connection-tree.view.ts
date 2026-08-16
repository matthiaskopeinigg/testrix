import type { DatabaseSidebarSortBy } from './database-sidebar-menus';
import { isConnectionFolderNode, isConnectionLeafNode } from './connection-tree.mutations';
import type { ConnectionTreeNode } from './connection-tree.types';

/**
 * Filters the connection tree by name or subtitle, keeping ancestors of matches.
 *
 * An empty query returns the same array reference so the tree can skip a refresh.
 */
export function filterConnectionTree(
  nodes: readonly ConnectionTreeNode[],
  query: string,
): ConnectionTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return nodes as ConnectionTreeNode[];
  }

  const filterNodes = (list: readonly ConnectionTreeNode[]): ConnectionTreeNode[] => {
    const out: ConnectionTreeNode[] = [];
    for (const node of list) {
      const labelMatch =
        node.label.toLowerCase().includes(q) ||
        (node.subtitle?.toLowerCase().includes(q) ?? false) ||
        (node.data?.kind === 'connection' && node.data.type?.toLowerCase().includes(q));
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

function nodeUpdatedAt(node: ConnectionTreeNode): string {
  if (node.data?.kind === 'folder') {
    return node.data.updatedAt ?? '';
  }
  return '';
}

function compareConnectionNodes(
  a: ConnectionTreeNode,
  b: ConnectionTreeNode,
  sortBy: DatabaseSidebarSortBy,
): number {
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

/**
 * Sorts folders and connections. Catalog children under a connection stay as-is.
 */
export function sortConnectionTree(
  nodes: readonly ConnectionTreeNode[],
  sortBy: DatabaseSidebarSortBy,
): ConnectionTreeNode[] {
  if (sortBy === 'saved') {
    return nodes.map((node) => ({
      ...node,
      children: isConnectionFolderNode(node) && node.children
        ? sortConnectionTree(node.children, sortBy)
        : node.children,
    }));
  }
  const folders = nodes
    .filter((node) => isConnectionFolderNode(node))
    .map((node) => ({
      ...node,
      children: node.children ? sortConnectionTree(node.children, sortBy) : undefined,
    }))
    .sort((a, b) => compareConnectionNodes(a, b, sortBy));
  const connections = nodes
    .filter((node) => isConnectionLeafNode(node))
    .sort((a, b) => compareConnectionNodes(a, b, sortBy));
  const rest = nodes.filter((node) => !isConnectionFolderNode(node) && !isConnectionLeafNode(node));
  return [...folders, ...connections, ...rest];
}

export interface ConnectionTreeViewOptions {
  readonly query: string;
  readonly sortBy: DatabaseSidebarSortBy;
}

/** Applies presentation sort and search to the connections tree. */
export function applyConnectionTreeView(
  nodes: readonly ConnectionTreeNode[],
  options: ConnectionTreeViewOptions,
): ConnectionTreeNode[] {
  if (options.sortBy === 'saved' && !options.query.trim()) {
    return nodes as ConnectionTreeNode[];
  }
  return filterConnectionTree(sortConnectionTree(nodes, options.sortBy), options.query);
}
