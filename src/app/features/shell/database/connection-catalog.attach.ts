import type { DatabaseType } from '@shared/config';
import type { DatabaseConnectionStatusMap } from '@shared/database';

import type { ConnectionCatalogState } from '@app/core/database/database-catalog.types';

import {
  buildConnectionCatalogChildren,
} from './connection-catalog.tree';
import { isConnectionFolderNode, isConnectionLeafNode } from './connection-tree.mutations';
import type { ConnectionTreeNode } from './connection-tree.types';

/**
 * Walks the persisted connection tree and attaches live catalog children plus status dots.
 */
export function attachCatalogToConnectionTree(
  nodes: readonly ConnectionTreeNode[],
  getCatalog: (connectionId: string) => ConnectionCatalogState | undefined,
  statuses: DatabaseConnectionStatusMap,
  showSystemObjects: boolean,
): ConnectionTreeNode[] {
  return nodes.map((node) => {
    if (isConnectionFolderNode(node)) {
      return {
        ...node,
        children: attachCatalogToConnectionTree(
          node.children ?? [],
          getCatalog,
          statuses,
          showSystemObjects,
        ),
      };
    }
    if (!isConnectionLeafNode(node)) {
      return node;
    }
    const type = node.data?.kind === 'connection' ? node.data.type : undefined;
    const catalog = getCatalog(node.id);
    const status = statuses[node.id]?.state;
    const loadingCatalog =
      type !== 'redis' && (!catalog || catalog.state === 'idle' || catalog.state === 'loading');
    return {
      ...node,
      subtitle: loadingCatalog
        ? node.subtitle
          ? `${node.subtitle} · Loading…`
          : 'Loading objects…'
        : node.subtitle,
      statusDot:
        status === 'connected'
          ? 'connected'
          : status === 'error'
            ? 'error'
            : status === 'checking'
              ? 'checking'
              : 'idle',
      children: buildConnectionCatalogChildren(
        node.id,
        type as DatabaseType | undefined,
        catalog,
        showSystemObjects,
      ),
    };
  });
}
