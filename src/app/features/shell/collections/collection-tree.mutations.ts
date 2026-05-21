import type {
  CollectionFolderSettings,
  CollectionRequestSettings,
  CollectionWebsocketSettings,
  HttpMethodId,
} from '@shared/config';
import {
  createDefaultCollectionFolderSettings,
  createDefaultCollectionRequestSettings,
  createDefaultCollectionWebsocketSettings,
  enrichCollectionFolderSettings,
  enrichCollectionRequestSettings,
  enrichCollectionWebsocketSettings,
} from '@shared/config';

import { iconForCollectionKind } from './collection-tree.icons';
import type { CollectionTreeKind, CollectionTreeNode } from './collection-tree.types';

function treeTagsFromSettings(tags: readonly string[]): readonly string[] | undefined {
  return tags.length > 0 ? [...tags] : undefined;
}

export interface CollectionNodeLocation {
  readonly node: CollectionTreeNode;
  readonly parent: CollectionTreeNode | null;
  readonly siblings: CollectionTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested tree. */
export function findCollectionNode(
  nodes: readonly CollectionTreeNode[],
  id: string,
  parent: CollectionTreeNode | null = null,
): CollectionNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findCollectionNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Returns true when a collection folder has at least one child node. */
export function collectionFolderHasChildren(
  nodes: readonly CollectionTreeNode[],
  folderId: string,
): boolean {
  const loc = findCollectionNode(nodes, folderId);
  return !!loc?.node.children?.length;
}

/** Collects folder ids in subtree (for session prune). */
export function collectFolderIdsFromNodes(nodes: readonly CollectionTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder' || node.data?.kind === 'folder') {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectFolderIdsFromNodes(node.children));
    }
  }
  return ids;
}

function cloneNodes(nodes: readonly CollectionTreeNode[]): CollectionTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function nextSiblingOrder(siblings: readonly CollectionTreeNode[]): number {
  if (siblings.length === 0) {
    return 0;
  }
  return Math.max(...siblings.map((s) => s.order ?? 0)) + 10;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface CreateCollectionRequestDefaults {
  readonly method?: HttpMethodId;
  readonly url?: string;
}

function defaultLabel(kind: CollectionTreeKind, requestDefaults?: CreateCollectionRequestDefaults): string {
  if (kind === 'folder') {
    return 'New folder';
  }
  if (kind === 'request') {
    const method = requestDefaults?.method ?? 'GET';
    const url = requestDefaults?.url ?? '';
    return url.trim() ? `${method} ${url.trim()}` : method;
  }
  return 'WS /path';
}

function createNode(
  kind: CollectionTreeKind,
  order: number,
  label?: string,
  requestDefaults?: CreateCollectionRequestDefaults,
): CollectionTreeNode {
  const id = newId();
  const resolvedLabel = label ?? defaultLabel(kind, requestDefaults);

  if (kind === 'folder') {
    return {
      id,
      label: resolvedLabel,
      kind: 'folder',
      icon: iconForCollectionKind('folder'),
      order,
      data: { kind: 'folder', settings: createDefaultCollectionFolderSettings() },
      children: [],
    };
  }

  if (kind === 'request') {
    const method = requestDefaults?.method ?? 'GET';
    const url = requestDefaults?.url ?? '';
    return {
      id,
      label: resolvedLabel,
      kind: 'request',
      icon: iconForCollectionKind('request'),
      order,
      data: {
        kind: 'request',
        method,
        url,
        requestSettings: createDefaultCollectionRequestSettings(),
      },
    };
  }

  return {
    id,
    label: resolvedLabel,
    kind: 'websocket',
    icon: iconForCollectionKind('websocket'),
    order,
    data: {
      kind: 'websocket',
      wsPath: 'ws://localhost/path',
      websocketSettings: createDefaultCollectionWebsocketSettings(),
    },
  };
}

function insertIntoParent(
  nodes: CollectionTreeNode[],
  parentId: string | null,
  child: CollectionTreeNode,
): CollectionTreeNode[] {
  if (parentId === null) {
    return [...nodes, child];
  }

  return nodes.map((node) => {
    if (node.id === parentId) {
      const children = [...(node.children ?? []), child];
      return { ...node, children };
    }
    if (node.children?.length) {
      return { ...node, children: insertIntoParent([...node.children], parentId, child) };
    }
    return node;
  });
}

/** Creates a folder, request, or websocket under `parentId` (null = root). */
export function createCollectionNode(
  nodes: readonly CollectionTreeNode[],
  parentId: string | null,
  kind: CollectionTreeKind,
  label?: string,
  requestDefaults?: CreateCollectionRequestDefaults,
): { nodes: CollectionTreeNode[]; nodeId: string } | null {
  let siblings: CollectionTreeNode[];

  if (parentId === null) {
    siblings = [...nodes];
  } else {
    const parent = findCollectionNode(nodes, parentId);
    if (!parent || parent.node.data?.kind !== 'folder') {
      return null;
    }
    siblings = [...(parent.node.children ?? [])];
  }

  const node = createNode(kind, nextSiblingOrder(siblings), label, requestDefaults);
  return {
    nodes: insertIntoParent(cloneNodes(nodes), parentId, node),
    nodeId: node.id,
  };
}

/** Renames any node by id. */
export function renameCollectionNode(
  nodes: readonly CollectionTreeNode[],
  id: string,
  label: string,
): CollectionTreeNode[] | null {
  const trimmed = label.trim();
  if (!trimmed) {
    return null;
  }

  let found = false;
  const mapNodes = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] =>
    list.map((node) => {
      if (node.id === id) {
        found = true;
        return { ...node, label: trimmed };
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });

  const next = mapNodes(nodes);
  return found ? next : null;
}

/**
 * Collects ids of the target node and all descendants (for closing workspace tabs on delete).
 */
export function collectCollectionNodeIdsForDeletion(
  nodes: readonly CollectionTreeNode[],
  id: string,
): readonly string[] {
  const loc = findCollectionNode(nodes, id);
  if (!loc) {
    return [id];
  }

  const ids: string[] = [];
  const walk = (node: CollectionTreeNode): void => {
    ids.push(node.id);
    if (node.children?.length) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };
  walk(loc.node);
  return ids;
}

/** Deletes a node and its subtree. */
export function deleteCollectionNode(
  nodes: readonly CollectionTreeNode[],
  id: string,
): CollectionTreeNode[] | null {
  let found = false;

  const filterNodes = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] =>
    list
      .filter((node) => {
        if (node.id === id) {
          found = true;
          return false;
        }
        return true;
      })
      .map((node) =>
        node.children?.length ? { ...node, children: filterNodes(node.children) } : node,
      );

  const next = filterNodes(nodes);
  return found ? next : null;
}

/** Duplicates a request or websocket sibling with a new id. */
export function duplicateCollectionNode(
  nodes: readonly CollectionTreeNode[],
  id: string,
): { nodes: CollectionTreeNode[]; nodeId: string } | null {
  const loc = findCollectionNode(nodes, id);
  if (!loc || loc.node.data?.kind === 'folder') {
    return null;
  }

  const copy: CollectionTreeNode = {
    ...structuredClone(loc.node),
    id: newId(),
    label: `${loc.node.label} (copy)`,
    order: nextSiblingOrder(loc.siblings),
  };

  const parentId = loc.parent?.id ?? null;
  return {
    nodes: insertIntoParent(cloneNodes(nodes), parentId, copy),
    nodeId: copy.id,
  };
}

/** Sets folder description (empty string clears). */
export function setCollectionFolderDescription(
  nodes: readonly CollectionTreeNode[],
  folderId: string,
  description: string,
): CollectionTreeNode[] | null {
  let found = false;

  const mapNodes = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] =>
    list.map((node) => {
      if (node.id === folderId && (node.data?.kind === 'folder' || node.kind === 'folder')) {
        found = true;
        const trimmed = description.trim();
        return {
          ...node,
          subtitle: trimmed || undefined,
          data: {
            kind: 'folder',
            description: trimmed || undefined,
            settings: node.data?.settings ?? createDefaultCollectionFolderSettings(),
          },
        };
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });

  const next = mapNodes(nodes);
  return found ? next : null;
}

/** Patches folder settings for a folder node by id. */
export function updateCollectionFolderSettings(
  nodes: readonly CollectionTreeNode[],
  folderId: string,
  patch: Partial<CollectionFolderSettings>,
): CollectionTreeNode[] | null {
  let found = false;

  const mapNodes = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] =>
    list.map((node) => {
      if (node.id === folderId && node.data?.kind === 'folder') {
        found = true;
        const current = node.data.settings ?? createDefaultCollectionFolderSettings();
        const settings = enrichCollectionFolderSettings({ ...current, ...patch });
        return {
          ...node,
          tags: treeTagsFromSettings(settings.tags),
          data: {
            kind: 'folder',
            description: node.data.description,
            settings,
          },
        };
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });

  const next = mapNodes(nodes);
  return found ? next : null;
}

/** Collects ancestor folder nodes from root to parent of `requestId`. */
export function collectAncestorFolders(
  nodes: readonly CollectionTreeNode[],
  requestId: string,
): CollectionTreeNode[] {
  const ancestors: CollectionTreeNode[] = [];

  const walk = (
    list: readonly CollectionTreeNode[],
    chain: CollectionTreeNode[],
  ): boolean => {
    for (const node of list) {
      if (node.id === requestId) {
        ancestors.push(...chain);
        return true;
      }
      if (node.children?.length) {
        const nextChain =
          node.data?.kind === 'folder' || node.kind === 'folder' ? [...chain, node] : chain;
        if (walk(node.children, nextChain)) {
          return true;
        }
      }
    }
    return false;
  };

  walk(nodes, []);
  return ancestors;
}

/** Sets request description (empty string clears). */
export function setCollectionRequestDescription(
  nodes: readonly CollectionTreeNode[],
  requestId: string,
  description: string,
): CollectionTreeNode[] | null {
  const trimmed = description.trim();
  return updateCollectionRequestNode(nodes, requestId, (node, data) => ({
    node: {
      ...node,
      subtitle: trimmed || undefined,
      data: { ...data, description: trimmed || undefined },
    },
  }));
}

interface UpdateCollectionRequestNodeResult {
  readonly node: CollectionTreeNode;
}

/** Updates a request node via callback. */
export function updateCollectionRequestNode(
  nodes: readonly CollectionTreeNode[],
  requestId: string,
  updater: (
    node: CollectionTreeNode,
    data: NonNullable<CollectionTreeNode['data']> & { kind: 'request' },
  ) => UpdateCollectionRequestNodeResult,
): CollectionTreeNode[] | null {
  let found = false;

  const mapNodes = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] =>
    list.map((node) => {
      if (node.id === requestId && node.data?.kind === 'request') {
        found = true;
        const data = node.data as NonNullable<CollectionTreeNode['data']> & { kind: 'request' };
        const { node: nextNode } = updater(node, data);
        return nextNode;
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });

  const next = mapNodes(nodes);
  return found ? next : null;
}

/** Updates method and url on a request node. */
export function updateCollectionRequestLine(
  nodes: readonly CollectionTreeNode[],
  requestId: string,
  patch: { readonly method?: HttpMethodId; readonly url?: string; readonly label?: string },
): CollectionTreeNode[] | null {
  return updateCollectionRequestNode(nodes, requestId, (node, data) => {
    const method = patch.method ?? data.method ?? 'GET';
    const url = patch.url ?? data.url ?? '';
    const label = patch.label ?? node.label;
    return {
      node: {
        ...node,
        label,
        data: {
          ...data,
          kind: 'request',
          method,
          url,
          requestSettings: data.requestSettings ?? createDefaultCollectionRequestSettings(),
        },
      },
    };
  });
}

/** Patches request settings for a request node by id. */
export function updateCollectionRequestSettings(
  nodes: readonly CollectionTreeNode[],
  requestId: string,
  settingsPatch: Partial<CollectionRequestSettings>,
): CollectionTreeNode[] | null {
  return updateCollectionRequestNode(nodes, requestId, (node, data) => {
    const current = enrichCollectionRequestSettings(data.requestSettings);
    const requestSettings = enrichCollectionRequestSettings({ ...current, ...settingsPatch });
    return {
      node: {
        ...node,
        tags: treeTagsFromSettings(requestSettings.tags),
        data: {
          ...data,
          kind: 'request',
          requestSettings,
        },
      },
    };
  });
}

interface UpdateCollectionWebsocketNodeResult {
  readonly node: CollectionTreeNode;
}

/** Updates a websocket node via callback. */
export function updateCollectionWebsocketNode(
  nodes: readonly CollectionTreeNode[],
  websocketId: string,
  updater: (
    node: CollectionTreeNode,
    data: NonNullable<CollectionTreeNode['data']> & { kind: 'websocket' },
  ) => UpdateCollectionWebsocketNodeResult,
): CollectionTreeNode[] | null {
  let found = false;

  const mapNodes = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] =>
    list.map((node) => {
      if (node.id === websocketId && node.data?.kind === 'websocket') {
        found = true;
        const data = node.data as NonNullable<CollectionTreeNode['data']> & { kind: 'websocket' };
        const { node: nextNode } = updater(node, data);
        return nextNode;
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });

  const next = mapNodes(nodes);
  return found ? next : null;
}

/** Sets websocket description (empty string clears). */
export function setCollectionWebsocketDescription(
  nodes: readonly CollectionTreeNode[],
  websocketId: string,
  description: string,
): CollectionTreeNode[] | null {
  const trimmed = description.trim();
  return updateCollectionWebsocketNode(nodes, websocketId, (node, data) => ({
    node: {
      ...node,
      subtitle: trimmed || undefined,
      data: { ...data, description: trimmed || undefined },
    },
  }));
}

/** Updates wsPath and/or label on a websocket node. */
export function updateCollectionWebsocketLine(
  nodes: readonly CollectionTreeNode[],
  websocketId: string,
  patch: { readonly wsPath?: string; readonly label?: string },
): CollectionTreeNode[] | null {
  return updateCollectionWebsocketNode(nodes, websocketId, (node, data) => {
    const wsPath = patch.wsPath ?? data.wsPath ?? 'ws://localhost/path';
    const label = patch.label ?? node.label;
    return {
      node: {
        ...node,
        label,
        data: {
          ...data,
          kind: 'websocket',
          wsPath,
          websocketSettings:
            data.websocketSettings ?? createDefaultCollectionWebsocketSettings(),
        },
      },
    };
  });
}

/** Patches websocket settings for a websocket node by id. */
export function updateCollectionWebsocketSettings(
  nodes: readonly CollectionTreeNode[],
  websocketId: string,
  settingsPatch: Partial<CollectionWebsocketSettings>,
): CollectionTreeNode[] | null {
  return updateCollectionWebsocketNode(nodes, websocketId, (node, data) => {
    const current = enrichCollectionWebsocketSettings(data.websocketSettings);
    const websocketSettings = enrichCollectionWebsocketSettings({ ...current, ...settingsPatch });
    return {
      node: {
        ...node,
        tags: treeTagsFromSettings(websocketSettings.tags),
        data: {
          ...data,
          kind: 'websocket',
          websocketSettings,
        },
      },
    };
  });
}
