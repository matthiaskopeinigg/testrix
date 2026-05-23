import { z } from 'zod';

import {
  type CollectionFolderSettings,
  collectionFolderSettingsSchema,
  enrichCollectionFolderSettings,
} from './collection-folder-settings.schema';
import {
  type CollectionRequestSettings,
  collectionRequestSettingsSchema,
  enrichCollectionRequestSettings,
} from './collection-request-settings.schema';
import {
  type CollectionWebsocketSettings,
  collectionWebsocketSettingsSchema,
  enrichCollectionWebsocketSettings,
} from './collection-websocket-settings.schema';
import { HTTP_METHOD_IDS } from './http-settings.schema';

const metaCollectionsSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
});

const collectionNodeBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  order: z.number().optional(),
  priority: z.number().optional(),
  favourite: z.boolean().optional(),
});

const collectionRequestNodeSchema = collectionNodeBaseSchema.extend({
  kind: z.literal('request'),
  method: z.enum(HTTP_METHOD_IDS),
  url: z.string(),
  description: z.string().optional(),
  settings: collectionRequestSettingsSchema,
});

const collectionWebsocketNodeSchema = collectionNodeBaseSchema.extend({
  kind: z.literal('websocket'),
  wsPath: z.string().min(1),
  description: z.string().optional(),
  settings: collectionWebsocketSettingsSchema,
});

export type CollectionFolderNode = z.infer<typeof collectionNodeBaseSchema> & {
  readonly kind: 'folder';
  readonly description?: string;
  readonly children: CollectionNode[];
  readonly settings: CollectionFolderSettings;
};

export type CollectionRequestNode = z.infer<typeof collectionRequestNodeSchema> & {
  readonly settings: CollectionRequestSettings;
};
export type CollectionWebsocketNode = z.infer<typeof collectionWebsocketNodeSchema> & {
  readonly settings: CollectionWebsocketSettings;
};

export type CollectionNode =
  | CollectionFolderNode
  | CollectionRequestNode
  | CollectionWebsocketNode;

export const collectionNodeSchema: z.ZodType<CollectionNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    collectionNodeBaseSchema.extend({
      kind: z.literal('folder'),
      description: z.string().optional(),
      children: z.array(collectionNodeSchema),
      settings: collectionFolderSettingsSchema,
    }),
    collectionRequestNodeSchema,
    collectionWebsocketNodeSchema,
  ]),
);

export const collectionsFileSchema = z.object({
  schemaVersion: z.literal(1),
  meta: metaCollectionsSchema,
  nodes: z.array(collectionNodeSchema),
});

export type CollectionsFile = z.infer<typeof collectionsFileSchema>;

export const collectionsPatchSchema = z
  .object({
    nodes: z.array(collectionNodeSchema).optional(),
  })
  .strict();

export type CollectionsPatch = z.infer<typeof collectionsPatchSchema>;

/** Applies default folder settings when missing (migration / read path). */
export function enrichCollectionFolderNode(
  node: Omit<CollectionFolderNode, 'settings'> & { settings?: CollectionFolderSettings },
): CollectionFolderNode {
  return {
    ...node,
    settings: enrichCollectionFolderSettings(node.settings),
    children: node.children.map(enrichCollectionNode),
  };
}

/** Applies default request settings when missing (migration / read path). */
export function enrichCollectionRequestNode(
  node: Omit<CollectionRequestNode, 'settings'> & { settings?: CollectionRequestSettings },
): CollectionRequestNode {
  return {
    ...node,
    settings: enrichCollectionRequestSettings(node.settings),
  };
}

/** Applies default websocket settings when missing (migration / read path). */
export function enrichCollectionWebsocketNode(
  node: Omit<CollectionWebsocketNode, 'settings'> & { settings?: CollectionWebsocketSettings },
): CollectionWebsocketNode {
  return {
    ...node,
    settings: enrichCollectionWebsocketSettings(node.settings),
  };
}

/** Recursively enriches folder nodes in a collection tree. */
export function enrichCollectionNode(node: CollectionNode): CollectionNode {
  if (node.kind === 'folder') {
    return enrichCollectionFolderNode(node);
  }
  if (node.kind === 'request') {
    return enrichCollectionRequestNode(node);
  }
  if (node.kind === 'websocket') {
    return enrichCollectionWebsocketNode(node);
  }
  return node;
}

/** Enriches all nodes in a collections file tree. */
export function enrichCollectionNodes(nodes: readonly CollectionNode[]): CollectionNode[] {
  return nodes.map(enrichCollectionNode);
}
