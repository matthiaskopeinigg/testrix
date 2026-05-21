import type { CollectionNode, HttpMethodId } from '@shared/config';
import {
  createDefaultCollectionFolderSettings,
  createDefaultCollectionRequestSettings,
  enrichCollectionFolderNode,
  enrichCollectionRequestNode,
} from '@shared/config';

import { iconForCollectionKind } from './collection-tree.icons';
import type { CollectionTreeKind, CollectionTreeNode } from './collection-tree.types';

/** Non-empty tag list for tree presentation. */
function treeTagsFromSettings(tags: readonly string[]): readonly string[] | undefined {
  return tags.length > 0 ? [...tags] : undefined;
}

/** Maps persisted collection nodes to tx-tree nodes (adds icons + data). */
export function toTreeNodes(fileNodes: readonly CollectionNode[]): CollectionTreeNode[] {
  return fileNodes.map(toTreeNode);
}

function toTreeNode(node: CollectionNode): CollectionTreeNode {
  const kind = node.kind as CollectionTreeKind;

  if (node.kind === 'folder') {
    const enriched = enrichCollectionFolderNode(node);
    const description = enriched.description?.trim();
    return {
      id: enriched.id,
      label: enriched.label,
      subtitle: description || undefined,
      tags: treeTagsFromSettings(enriched.settings.tags),
      kind,
      icon: iconForCollectionKind('folder'),
      order: enriched.order,
      priority: enriched.priority,
      data: { kind: 'folder', description: enriched.description, settings: enriched.settings },
      children: enriched.children.map(toTreeNode),
    };
  }

  if (node.kind === 'request') {
    const enriched = enrichCollectionRequestNode(node);
    const description = enriched.description?.trim();
    return {
      id: enriched.id,
      label: enriched.label,
      subtitle: description || undefined,
      tags: treeTagsFromSettings(enriched.settings.tags),
      kind,
      icon: iconForCollectionKind('request'),
      order: enriched.order,
      priority: enriched.priority,
      data: {
        kind: 'request',
        method: enriched.method,
        url: enriched.url,
        description: enriched.description,
        requestSettings: enriched.settings,
      },
    };
  }

  return {
    id: node.id,
    label: node.label,
    kind,
    icon: iconForCollectionKind('websocket'),
    order: node.order,
    priority: node.priority,
    data: { kind: 'websocket', wsPath: node.wsPath },
  };
}

/** Strips presentation fields before persisting to collections.json. */
export function fromTreeNodes(treeNodes: readonly CollectionTreeNode[]): CollectionNode[] {
  return treeNodes.map(fromTreeNode);
}

function fromTreeNode(node: CollectionTreeNode): CollectionNode {
  const kind = node.data?.kind ?? node.kind ?? 'folder';

  if (kind === 'folder') {
    return {
      id: node.id,
      label: node.label,
      kind: 'folder',
      order: node.order,
      priority: node.priority,
      description: node.data?.description,
      settings: node.data?.settings ?? createDefaultCollectionFolderSettings(),
      children: (node.children ?? []).map(fromTreeNode),
    };
  }

  if (kind === 'request') {
    return {
      id: node.id,
      label: node.label,
      kind: 'request',
      order: node.order,
      priority: node.priority,
      method: (node.data?.method ?? 'GET') as HttpMethodId,
      url: node.data?.url ?? '',
      description: node.data?.description,
      settings: node.data?.requestSettings ?? createDefaultCollectionRequestSettings(),
    };
  }

  return {
    id: node.id,
    label: node.label,
    kind: 'websocket',
    order: node.order,
    priority: node.priority,
    wsPath: node.data?.wsPath ?? '/',
  };
}
