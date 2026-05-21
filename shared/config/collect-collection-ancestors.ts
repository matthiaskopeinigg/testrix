import type { CollectionFolderSettings } from './collection-folder-settings.schema';
import type { CollectionRequestSettings } from './collection-request-settings.schema';
import type { CollectionNode } from './collections.schema';

export interface AncestorFolderRef {
  readonly id: string;
  readonly label: string;
  readonly settings: CollectionFolderSettings;
}

export interface CollectionRequestRef {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly settings: CollectionRequestSettings;
}

export interface CollectionRequestLocation {
  readonly request: CollectionRequestRef;
  readonly ancestorFolders: readonly AncestorFolderRef[];
}

function isFolder(node: CollectionNode): node is Extract<CollectionNode, { kind: 'folder' }> {
  return node.kind === 'folder';
}

/** Finds a request node and its ancestor folders (root → parent). */
export function findCollectionRequestInTree(
  nodes: readonly CollectionNode[],
  requestId: string,
): CollectionRequestLocation | null {
  let result: CollectionRequestLocation | null = null;

  const walk = (list: readonly CollectionNode[], chain: readonly AncestorFolderRef[]): void => {
    for (const node of list) {
      if (node.kind === 'request' && node.id === requestId) {
        result = {
          request: {
            id: node.id,
            label: node.label,
            method: node.method,
            url: node.url,
            settings: node.settings,
          },
          ancestorFolders: chain,
        };
        return;
      }
      if (isFolder(node) && node.children.length > 0) {
        const nextChain: AncestorFolderRef[] = [
          ...chain,
          { id: node.id, label: node.label, settings: node.settings },
        ];
        walk(node.children, nextChain);
        if (result) {
          return;
        }
      }
    }
  };

  walk(nodes, []);
  return result;
}
