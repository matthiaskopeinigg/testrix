import type { DatabaseType } from '@shared/config';
import type { DatabaseConnectionStatusMap, DatabaseConnectionStatusState } from '@shared/database';

import type { ConnectionCatalogState } from '@app/core/database/database-catalog.types';

import {
  buildConnectionCatalogChildren,
  createConnectionCatalogBuildMemo,
  type ConnectionCatalogBuildMemo,
} from './connection-catalog.tree';
import { isConnectionFolderNode, isConnectionLeafNode } from './connection-tree.mutations';
import type { ConnectionTreeNode } from './connection-tree.types';

interface ConnectionChildrenCacheEntry {
  catalog: ConnectionCatalogState | undefined;
  showSystemObjects: boolean;
  children: readonly ConnectionTreeNode[];
  build: ConnectionCatalogBuildMemo;
}

/**
 * Reuses catalog children and connection-row wrappers across sidebar rebuilds.
 *
 * A patch to connection A must not rebuild B/C, and a table-detail patch must
 * not recreate sibling table nodes.
 */
export class ConnectionCatalogAttachCache {
  private readonly byConnection = new Map<string, ConnectionChildrenCacheEntry>();
  private previous: readonly ConnectionTreeNode[] = [];

  /**
   * Attaches live catalog children and status dots. Returns the previous tree
   * reference when nothing visible changed.
   */
  attach(
    nodes: readonly ConnectionTreeNode[],
    getCatalog: (connectionId: string) => ConnectionCatalogState | undefined,
    statuses: DatabaseConnectionStatusMap,
    showSystemObjects: boolean,
  ): ConnectionTreeNode[] {
    const liveIds = new Set<string>();
    const previousById = indexConnectionSpine(this.previous);
    const next = mapAttachedNodes(
      nodes,
      getCatalog,
      statuses,
      showSystemObjects,
      this,
      liveIds,
      previousById,
    );
    for (const id of [...this.byConnection.keys()]) {
      if (!liveIds.has(id)) {
        this.byConnection.delete(id);
      }
    }
    if (sameNodeList(next, this.previous)) {
      return this.previous as ConnectionTreeNode[];
    }
    this.previous = next;
    return next;
  }

  /**
   * Returns catalog children for a connection, reusing the previous build when
   * the catalog object and system-object flag are unchanged.
   */
  childrenFor(
    connectionId: string,
    type: DatabaseType | undefined,
    catalog: ConnectionCatalogState | undefined,
    showSystemObjects: boolean,
  ): readonly ConnectionTreeNode[] {
    const entry = this.byConnection.get(connectionId);
    if (entry && entry.catalog === catalog && entry.showSystemObjects === showSystemObjects) {
      return entry.children;
    }
    const build =
      entry && entry.showSystemObjects === showSystemObjects
        ? entry.build
        : createConnectionCatalogBuildMemo();
    const children = buildConnectionCatalogChildren(
      connectionId,
      type,
      catalog,
      showSystemObjects,
      build,
    );
    this.byConnection.set(connectionId, {
      catalog,
      showSystemObjects,
      children,
      build,
    });
    return children;
  }
}

/**
 * Walks the persisted connection tree and attaches live catalog children plus status dots.
 */
export function attachCatalogToConnectionTree(
  nodes: readonly ConnectionTreeNode[],
  getCatalog: (connectionId: string) => ConnectionCatalogState | undefined,
  statuses: DatabaseConnectionStatusMap,
  showSystemObjects: boolean,
  cache?: ConnectionCatalogAttachCache,
): ConnectionTreeNode[] {
  if (cache) {
    return cache.attach(nodes, getCatalog, statuses, showSystemObjects);
  }
  return mapAttachedNodes(
    nodes,
    getCatalog,
    statuses,
    showSystemObjects,
    undefined,
    undefined,
    new Map(),
  );
}

function mapAttachedNodes(
  nodes: readonly ConnectionTreeNode[],
  getCatalog: (connectionId: string) => ConnectionCatalogState | undefined,
  statuses: DatabaseConnectionStatusMap,
  showSystemObjects: boolean,
  cache: ConnectionCatalogAttachCache | undefined,
  liveIds: Set<string> | undefined,
  previousById: ReadonlyMap<string, ConnectionTreeNode>,
): ConnectionTreeNode[] {
  return nodes.map((node) =>
    attachNode(node, getCatalog, statuses, showSystemObjects, cache, liveIds, previousById),
  );
}

function attachNode(
  node: ConnectionTreeNode,
  getCatalog: (connectionId: string) => ConnectionCatalogState | undefined,
  statuses: DatabaseConnectionStatusMap,
  showSystemObjects: boolean,
  cache: ConnectionCatalogAttachCache | undefined,
  liveIds: Set<string> | undefined,
  previousById: ReadonlyMap<string, ConnectionTreeNode>,
): ConnectionTreeNode {
  const previous = previousById.get(node.id);
  if (isConnectionFolderNode(node)) {
    const mappedChildren = mapAttachedNodes(
      node.children ?? [],
      getCatalog,
      statuses,
      showSystemObjects,
      cache,
      liveIds,
      previousById,
    );
    const children = sameNodeList(mappedChildren, previous?.children) ? previous!.children! : mappedChildren;
    if (previous && previous.label === node.label && previous.children === children) {
      return previous;
    }
    return { ...node, children };
  }
  if (!isConnectionLeafNode(node)) {
    return node;
  }
  liveIds?.add(node.id);
  const type = node.data?.kind === 'connection' ? node.data.type : undefined;
  const catalog = getCatalog(node.id);
  const children = cache
    ? cache.childrenFor(node.id, type, catalog, showSystemObjects)
    : buildConnectionCatalogChildren(node.id, type as DatabaseType | undefined, catalog, showSystemObjects);
  const status = statuses[node.id]?.state;
  const loadingCatalog =
    type !== 'redis' && (!catalog || catalog.state === 'idle' || catalog.state === 'loading');
  const next: ConnectionTreeNode = {
    ...node,
    subtitle: loadingCatalog
      ? node.subtitle
        ? `${node.subtitle} · Loading…`
        : 'Loading objects…'
      : node.subtitle,
    statusDot: statusDotFor(status),
    children: children as ConnectionTreeNode[],
  };
  if (connectionRowUnchanged(previous, next)) {
    return previous;
  }
  return next;
}

function statusDotFor(status: DatabaseConnectionStatusState | undefined): ConnectionTreeNode['statusDot'] {
  if (status === 'connected') {
    return 'connected';
  }
  if (status === 'error') {
    return 'error';
  }
  if (status === 'checking') {
    return 'checking';
  }
  return 'idle';
}

function connectionRowUnchanged(
  previous: ConnectionTreeNode | undefined,
  next: ConnectionTreeNode,
): previous is ConnectionTreeNode {
  return (
    !!previous &&
    previous.label === next.label &&
    previous.subtitle === next.subtitle &&
    previous.statusDot === next.statusDot &&
    previous.icon === next.icon &&
    previous.children === next.children &&
    previous.data === next.data
  );
}

function sameNodeList(
  next: readonly ConnectionTreeNode[],
  previous: readonly ConnectionTreeNode[] | undefined,
): boolean {
  return (
    !!previous &&
    previous.length === next.length &&
    previous.every((node, index) => node === next[index])
  );
}

function indexConnectionSpine(
  nodes: readonly ConnectionTreeNode[],
): Map<string, ConnectionTreeNode> {
  const map = new Map<string, ConnectionTreeNode>();
  const walk = (list: readonly ConnectionTreeNode[]): void => {
    for (const node of list) {
      if (isConnectionFolderNode(node) || isConnectionLeafNode(node)) {
        map.set(node.id, node);
      }
      if (isConnectionFolderNode(node) && node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return map;
}
