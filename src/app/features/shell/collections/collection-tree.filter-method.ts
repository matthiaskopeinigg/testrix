import type { HttpMethodId } from '@shared/config';

import type { CollectionTreeKind, CollectionTreeNode } from './collection-tree.types';

function resolveKind(node: CollectionTreeNode): CollectionTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'request' || node.data?.kind === 'websocket') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'request';
}

function requestMatchesMethod(node: CollectionTreeNode, methods: ReadonlySet<HttpMethodId>): boolean {
  const method = node.data?.method?.toUpperCase() as HttpMethodId | undefined;
  return method !== undefined && methods.has(method);
}

/**
 * Restricts the tree to HTTP requests whose method is in `methodFilter`.
 * Folders are kept when they contain a matching request; websockets are omitted.
 */
export function filterCollectionTreeByMethod(
  nodes: readonly CollectionTreeNode[],
  methodFilter: readonly HttpMethodId[],
): CollectionTreeNode[] {
  if (methodFilter.length === 0) {
    return [...nodes];
  }

  const methods = new Set<HttpMethodId>(methodFilter);

  const filterList = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] => {
    const out: CollectionTreeNode[] = [];

    for (const node of list) {
      const kind = resolveKind(node);
      const filteredChildren = node.children?.length ? filterList(node.children) : [];
      const childMatch = filteredChildren.length > 0;

      if (kind === 'request') {
        if (requestMatchesMethod(node, methods)) {
          out.push({ ...node, children: undefined });
        }
        continue;
      }

      if (kind === 'websocket') {
        continue;
      }

      if (childMatch) {
        out.push({
          ...node,
          children: filteredChildren,
        });
      }
    }

    return out;
  };

  return filterList(nodes);
}
