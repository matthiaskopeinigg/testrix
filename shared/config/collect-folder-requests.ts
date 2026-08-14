import type { CollectionNode } from './collections.schema';
export interface FolderRequestEntry {
  readonly requestId: string;
  readonly label: string;
  readonly ancestorFolderIds: readonly string[];
}

function isFolder(node: CollectionNode): node is Extract<CollectionNode, { kind: 'folder' }> {
  return node.kind === 'folder';
}

function siblingOrder(a: CollectionNode, b: CollectionNode): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

function sortSiblings(
  nodes: readonly CollectionNode[],
  foldersFirst: boolean,
): CollectionNode[] {
  const sorted = [...nodes].sort(siblingOrder);
  if (!foldersFirst) {
    return sorted;
  }
  const folders = sorted.filter((n) => n.kind === 'folder');
  const rest = sorted.filter((n) => n.kind !== 'folder');
  return [...folders, ...rest];
}

function findFolder(
  nodes: readonly CollectionNode[],
  folderId: string,
): Extract<CollectionNode, { kind: 'folder' }> | null {
  for (const node of nodes) {
    if (node.kind === 'folder' && node.id === folderId) {
      return node;
    }
    if (isFolder(node)) {
      const found = findFolder(node.children, folderId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Depth-first list of all requests under a folder (preorder), respecting sibling order and foldersFirst.
 */
export function collectRequestsInFolder(
  nodes: readonly CollectionNode[],
  folderId: string,
  options?: { readonly foldersFirst?: boolean },
): readonly FolderRequestEntry[] {
  const folder = findFolder(nodes, folderId);
  if (!folder) {
    return [];
  }

  const foldersFirst = options?.foldersFirst ?? true;
  const out: FolderRequestEntry[] = [];

  const walk = (
    children: readonly CollectionNode[],
    ancestorIds: readonly string[],
  ): void => {
    for (const node of sortSiblings(children, foldersFirst)) {
      if (node.kind === 'request') {
        out.push({
          requestId: node.id,
          label: node.label,
          ancestorFolderIds: [...ancestorIds],
        });
        continue;
      }
      if (isFolder(node)) {
        const nextIds = [...ancestorIds, node.id];
        walk(node.children, nextIds);
      }
    }
  };

  walk(folder.children, [folder.id]);
  return out;
}
