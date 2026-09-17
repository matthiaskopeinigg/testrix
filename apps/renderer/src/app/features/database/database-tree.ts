import {
  createDatabaseFolder,
  createDefaultDatabaseConnection,
  createDefaultSavedQuery,
  createQueryFolder,
  isDatabaseConnectionFolder,
  isSavedQueryFolder,
  type DatabaseConnection,
  type DatabaseConnectionFolder,
  type DatabaseConnectionTreeItem,
  type DatabaseSortMode,
  type DatabaseType,
  type SavedDatabaseQuery,
  type SavedQueryFolder,
  type SavedQueryTreeItem,
} from '@testrix/contracts';

export const DATABASE_TREE_ROOT = '__db_root__';

export function allDatabaseTreeIds(nodes: readonly DatabaseConnectionTreeItem[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (isDatabaseConnectionFolder(node))
      ids.push(...allDatabaseTreeIds(node.children));
  }
  return ids;
}

export function allQueryTreeIds(nodes: readonly SavedQueryTreeItem[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (isSavedQueryFolder(node))
      ids.push(...allQueryTreeIds(node.children));
  }
  return ids;
}

export function findConnectionParent(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
  parentId: string | null = null,
): { readonly parentId: string | null; readonly index: number; readonly node: DatabaseConnectionTreeItem } | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.id === id)
      return { parentId, index, node };
    if (isDatabaseConnectionFolder(node)) {
      const nested = findConnectionParent(node.children, id, node.id);
      if (nested)
        return nested;
    }
  }
  return null;
}

export function findQueryParent(
  nodes: readonly SavedQueryTreeItem[],
  id: string,
  parentId: string | null = null,
): { readonly parentId: string | null; readonly index: number; readonly node: SavedQueryTreeItem } | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.id === id)
      return { parentId, index, node };
    if (isSavedQueryFolder(node)) {
      const nested = findQueryParent(node.children, id, node.id);
      if (nested)
        return nested;
    }
  }
  return null;
}

export function removeConnectionNode(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
): { readonly tree: DatabaseConnectionTreeItem[]; readonly removed: DatabaseConnectionTreeItem | null } {
  const next: DatabaseConnectionTreeItem[] = [];
  let removed: DatabaseConnectionTreeItem | null = null;
  for (const node of nodes) {
    if (node.id === id) {
      removed = node;
      continue;
    }
    if (isDatabaseConnectionFolder(node)) {
      const child = removeConnectionNode(node.children, id);
      if (child.removed) {
        removed = child.removed;
        next.push({ ...node, children: child.tree });
        continue;
      }
    }
    next.push(node);
  }
  return { tree: next, removed };
}

export function removeQueryNode(
  nodes: readonly SavedQueryTreeItem[],
  id: string,
): { readonly tree: SavedQueryTreeItem[]; readonly removed: SavedQueryTreeItem | null } {
  const next: SavedQueryTreeItem[] = [];
  let removed: SavedQueryTreeItem | null = null;
  for (const node of nodes) {
    if (node.id === id) {
      removed = node;
      continue;
    }
    if (isSavedQueryFolder(node)) {
      const child = removeQueryNode(node.children, id);
      if (child.removed) {
        removed = child.removed;
        next.push({ ...node, children: child.tree });
        continue;
      }
    }
    next.push(node);
  }
  return { tree: next, removed };
}

export function insertConnectionNode(
  nodes: readonly DatabaseConnectionTreeItem[],
  parentId: string | null,
  index: number,
  items: readonly DatabaseConnectionTreeItem[],
): DatabaseConnectionTreeItem[] {
  if (items.length === 0)
    return [...nodes];
  if (!parentId || parentId === DATABASE_TREE_ROOT) {
    const copy = [...nodes];
    copy.splice(Math.max(0, Math.min(index, copy.length)), 0, ...items);
    return copy;
  }
  return nodes.map((node) => {
    if (!isDatabaseConnectionFolder(node))
      return node;
    if (node.id === parentId) {
      const children = [...node.children];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, ...items);
      return { ...node, children, updatedAt: new Date().toISOString() };
    }
    return { ...node, children: insertConnectionNode(node.children, parentId, index, items) };
  });
}

export function insertQueryNode(
  nodes: readonly SavedQueryTreeItem[],
  parentId: string | null,
  index: number,
  items: readonly SavedQueryTreeItem[],
): SavedQueryTreeItem[] {
  if (items.length === 0)
    return [...nodes];
  if (!parentId || parentId === DATABASE_TREE_ROOT) {
    const copy = [...nodes];
    copy.splice(Math.max(0, Math.min(index, copy.length)), 0, ...items);
    return copy;
  }
  return nodes.map((node) => {
    if (!isSavedQueryFolder(node))
      return node;
    if (node.id === parentId) {
      const children = [...node.children];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, ...items);
      return { ...node, children, updatedAt: new Date().toISOString() };
    }
    return { ...node, children: insertQueryNode(node.children, parentId, index, items) };
  });
}

export function renameConnectionNode(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
  name: string,
): DatabaseConnectionTreeItem[] {
  return nodes.map((node) => {
    if (node.id === id)
      return isDatabaseConnectionFolder(node)
        ? { ...node, name, updatedAt: new Date().toISOString() }
        : { ...node, name };
    if (isDatabaseConnectionFolder(node))
      return { ...node, children: renameConnectionNode(node.children, id, name) };
    return node;
  });
}

export function renameQueryNode(
  nodes: readonly SavedQueryTreeItem[],
  id: string,
  name: string,
): SavedQueryTreeItem[] {
  const now = new Date().toISOString();
  return nodes.map((node) => {
    if (node.id === id)
      return { ...node, name, updatedAt: now };
    if (isSavedQueryFolder(node))
      return { ...node, children: renameQueryNode(node.children, id, name) };
    return node;
  });
}

export function patchConnection(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
  patch: Partial<DatabaseConnection>,
): DatabaseConnectionTreeItem[] {
  return nodes.map((node) => {
    if (node.id === id && !isDatabaseConnectionFolder(node))
      return { ...node, ...patch, id: node.id, kind: 'connection' };
    if (isDatabaseConnectionFolder(node))
      return { ...node, children: patchConnection(node.children, id, patch) };
    return node;
  });
}

export function patchQuery(
  nodes: readonly SavedQueryTreeItem[],
  id: string,
  patch: Partial<SavedDatabaseQuery>,
): SavedQueryTreeItem[] {
  const now = new Date().toISOString();
  return nodes.map((node) => {
    if (node.id === id && !isSavedQueryFolder(node))
      return { ...node, ...patch, id: node.id, kind: 'query', updatedAt: now };
    if (isSavedQueryFolder(node))
      return { ...node, children: patchQuery(node.children, id, patch) };
    return node;
  });
}

export function cloneConnectionNode(
  node: DatabaseConnectionTreeItem,
  used: Set<string>,
): DatabaseConnectionTreeItem {
  const id = nextId(used, isDatabaseConnectionFolder(node) ? 'dbf' : 'dbc');
  used.add(id);
  const now = new Date().toISOString();
  if (isDatabaseConnectionFolder(node)) {
    return {
      ...node,
      id,
      name: `${node.name} copy`,
      updatedAt: now,
      children: node.children.map((child) => cloneConnectionNode(child, used)),
    };
  }
  return { ...node, id, name: `${node.name} copy` };
}

export function cloneQueryNode(node: SavedQueryTreeItem, used: Set<string>): SavedQueryTreeItem {
  const id = nextId(used, isSavedQueryFolder(node) ? 'qrf' : 'qry');
  used.add(id);
  const now = new Date().toISOString();
  if (isSavedQueryFolder(node)) {
    return {
      ...node,
      id,
      name: `${node.name} copy`,
      updatedAt: now,
      children: node.children.map((child) => cloneQueryNode(child, used)),
    };
  }
  return { ...node, id, name: `${node.name} copy`, updatedAt: now };
}

export function createConnectionItem(
  kind: 'folder' | 'connection',
  type: DatabaseType,
  used: Set<string>,
): DatabaseConnectionFolder | DatabaseConnection {
  if (kind === 'folder') {
    const folder = createDatabaseFolder();
    return used.has(folder.id) ? { ...folder, id: nextId(used, 'dbf') } : folder;
  }
  const connection = createDefaultDatabaseConnection(type);
  return used.has(connection.id) ? { ...connection, id: nextId(used, 'dbc') } : connection;
}

export function createQueryItem(
  kind: 'folder' | 'query',
  connectionId: string,
  used: Set<string>,
): SavedQueryFolder | SavedDatabaseQuery {
  if (kind === 'folder') {
    const folder = createQueryFolder();
    return used.has(folder.id) ? { ...folder, id: nextId(used, 'qrf') } : folder;
  }
  const query = createDefaultSavedQuery(connectionId);
  return used.has(query.id) ? { ...query, id: nextId(used, 'qry') } : query;
}

export function collectConnectionFolderIds(nodes: readonly DatabaseConnectionTreeItem[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (!isDatabaseConnectionFolder(node))
      continue;
    ids.push(node.id);
    ids.push(...collectConnectionFolderIds(node.children));
  }
  return ids;
}

export function collectQueryFolderIds(nodes: readonly SavedQueryTreeItem[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (!isSavedQueryFolder(node))
      continue;
    ids.push(node.id);
    ids.push(...collectQueryFolderIds(node.children));
  }
  return ids;
}

export function sortConnectionTree(
  nodes: readonly DatabaseConnectionTreeItem[],
  mode: DatabaseSortMode,
): DatabaseConnectionTreeItem[] {
  const sorted = [...nodes].sort((left, right) => compareConnection(left, right, mode));
  return sorted.map((node) =>
    isDatabaseConnectionFolder(node) ? { ...node, children: sortConnectionTree(node.children, mode) } : node,
  );
}

export function sortQueryTree(
  nodes: readonly SavedQueryTreeItem[],
  mode: DatabaseSortMode,
): SavedQueryTreeItem[] {
  const sorted = [...nodes].sort((left, right) => compareQuery(left, right, mode));
  return sorted.map((node) =>
    isSavedQueryFolder(node) ? { ...node, children: sortQueryTree(node.children, mode) } : node,
  );
}

function compareConnection(
  left: DatabaseConnectionTreeItem,
  right: DatabaseConnectionTreeItem,
  mode: DatabaseSortMode,
): number {
  const leftFolder = isDatabaseConnectionFolder(left);
  const rightFolder = isDatabaseConnectionFolder(right);
  if (leftFolder !== rightFolder)
    return leftFolder ? -1 : 1;
  if (mode === 'saved')
    return 0;
  if (mode === 'name-asc')
    return left.name.localeCompare(right.name);
  if (mode === 'name-desc')
    return right.name.localeCompare(left.name);
  const leftDate = leftFolder ? left.updatedAt : '';
  const rightDate = rightFolder ? right.updatedAt : '';
  if (mode === 'date-new')
    return rightDate.localeCompare(leftDate);
  return leftDate.localeCompare(rightDate);
}

function compareQuery(left: SavedQueryTreeItem, right: SavedQueryTreeItem, mode: DatabaseSortMode): number {
  const leftFolder = isSavedQueryFolder(left);
  const rightFolder = isSavedQueryFolder(right);
  if (leftFolder !== rightFolder)
    return leftFolder ? -1 : 1;
  if (mode === 'saved')
    return 0;
  if (mode === 'name-asc')
    return left.name.localeCompare(right.name);
  if (mode === 'name-desc')
    return right.name.localeCompare(left.name);
  if (mode === 'date-new')
    return right.updatedAt.localeCompare(left.updatedAt);
  return left.updatedAt.localeCompare(right.updatedAt);
}

function nextId(used: Set<string>, prefix: string): string {
  let n = 1;
  while (used.has(`${prefix}_${n}`))
    n += 1;
  return `${prefix}_${n}`;
}
