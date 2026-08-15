/**
 * Inserts `child` under `parentId`. When `parentId` is missing from the tree, appends at the root.
 *
 * Recursive misses must not append. An empty folder is a new array, so a naive
 * `children !== item.children` check treats every empty folder as the insert target.
 *
 * @param nodes - Sibling list to search.
 * @param parentId - Folder id to insert into, or `null` for the root list.
 * @param child - Node to insert.
 * @param isFolder - True for nodes that may contain children.
 * @param updateFolder - Builds a replacement folder with new children.
 * @returns A new tree with `child` inserted once.
 */
export function insertChildIntoFolderTree<T extends { readonly id: string }>(
  nodes: readonly T[],
  parentId: string | null,
  child: T,
  isFolder: (item: T) => boolean,
  updateFolder: (folder: T, children: readonly T[]) => T,
  getChildren: (folder: T) => readonly T[],
): T[] {
  if (!parentId) {
    return [...nodes, child];
  }
  return (
    insertIntoFolder(nodes, parentId, child, isFolder, updateFolder, getChildren) ?? [...nodes, child]
  );
}

/**
 * Walks `nodes` and inserts `child` under `parentId`.
 *
 * @returns The updated sibling list, or `null` when `parentId` is not in this subtree.
 */
function insertIntoFolder<T extends { readonly id: string }>(
  nodes: readonly T[],
  parentId: string,
  child: T,
  isFolder: (item: T) => boolean,
  updateFolder: (folder: T, children: readonly T[]) => T,
  getChildren: (folder: T) => readonly T[],
): T[] | null {
  let inserted = false;
  const next = nodes.map((item) => {
    if (isFolder(item) && item.id === parentId) {
      inserted = true;
      return updateFolder(item, [...getChildren(item), child]);
    }
    if (isFolder(item)) {
      const nested = insertIntoFolder(
        getChildren(item),
        parentId,
        child,
        isFolder,
        updateFolder,
        getChildren,
      );
      if (nested) {
        inserted = true;
        return updateFolder(item, nested);
      }
    }
    return item;
  });
  return inserted ? next : null;
}

/**
 * Drops later nodes that reuse an id already seen (depth-first).
 *
 * Repairs trees corrupted by inserting the same child into every empty folder.
 *
 * @param nodes - Sibling list to scan.
 * @param isFolder - True for nodes that may contain children.
 * @param updateFolder - Builds a replacement folder with deduped children.
 * @param getChildren - Reads the current child list from a folder.
 * @param seen - Ids already kept higher in the tree.
 * @returns A new tree with unique ids.
 */
export function dedupeFolderTreeById<T extends { readonly id: string }>(
  nodes: readonly T[],
  isFolder: (item: T) => boolean,
  updateFolder: (folder: T, children: readonly T[]) => T,
  getChildren: (folder: T) => readonly T[],
  seen: Set<string> = new Set(),
): T[] {
  const out: T[] = [];
  for (const item of nodes) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    if (isFolder(item)) {
      out.push(
        updateFolder(item, dedupeFolderTreeById(getChildren(item), isFolder, updateFolder, getChildren, seen)),
      );
    } else {
      out.push(item);
    }
  }
  return out;
}
