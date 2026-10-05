import { z } from 'zod';

import { collectionFolderConfigSchema, parseCollectionFolderConfig, type CollectionFolderConfig } from './collection-folder';
import {
  collectionRequestConfigSchema,
  parseCollectionRequestConfig,
  type CollectionRequestConfig,
} from './collection-request';
import {
  collectionWebSocketConfigSchema,
  parseCollectionWebSocketConfig,
  type CollectionWebSocketConfig,
} from './collection-websocket';

/** Supported HTTP methods for collection request nodes. */
export const httpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

export type HttpMethod = z.infer<typeof httpMethodSchema>;

export const HTTP_METHODS = httpMethodSchema.options;

/** Node kinds shown in the collections tree. */
export const collectionNodeKindSchema = z.enum(['folder', 'http', 'websocket']);

export type CollectionNodeKind = z.infer<typeof collectionNodeKindSchema>;

const collectionNodeBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  modifiedAt: z.string().min(1),
});

export type CollectionFolderNode = {
  readonly kind: 'folder';
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly children: CollectionNode[];
  readonly config?: CollectionFolderConfig;
};

export type CollectionHttpNode = {
  readonly kind: 'http';
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly method: HttpMethod;
  readonly status: number | null;
  readonly config?: CollectionRequestConfig;
};

export type CollectionWebSocketNode = {
  readonly kind: 'websocket';
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly config?: CollectionWebSocketConfig;
};

export type CollectionNode = CollectionFolderNode | CollectionHttpNode | CollectionWebSocketNode;

function optionalRequestConfig(value: unknown): CollectionRequestConfig | undefined {
  if (value === undefined || value === null)
    return undefined;
  const parsed = collectionRequestConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : parseCollectionRequestConfig(value);
}

export const collectionHttpNodeSchema = collectionNodeBaseSchema.extend({
  kind: z.literal('http'),
  method: httpMethodSchema,
  status: z.number().int().positive().nullable(),
  config: z.preprocess(optionalRequestConfig, collectionRequestConfigSchema.optional()),
});

function optionalWebsocketConfig(value: unknown): CollectionWebSocketConfig | undefined {
  if (value === undefined || value === null)
    return undefined;
  const parsed = collectionWebSocketConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : parseCollectionWebSocketConfig(value);
}

export const collectionWebSocketNodeSchema = collectionNodeBaseSchema.extend({
  kind: z.literal('websocket'),
  config: z.preprocess(optionalWebsocketConfig, collectionWebSocketConfigSchema.optional()),
});

function optionalFolderConfig(value: unknown): CollectionFolderConfig | undefined {
  if (value === undefined || value === null)
    return undefined;
  const parsed = collectionFolderConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : parseCollectionFolderConfig(value);
}

export const collectionNodeSchema: z.ZodType<CollectionNode> = z.lazy(() =>
  z.union([
    collectionNodeBaseSchema.extend({
      kind: z.literal('folder'),
      children: z.array(collectionNodeSchema),
      config: z.preprocess(optionalFolderConfig, collectionFolderConfigSchema.optional()),
    }),
    collectionHttpNodeSchema,
    collectionWebSocketNodeSchema,
  ]),
);

export const collectionFolderNodeSchema: z.ZodType<CollectionFolderNode> = z.lazy(() =>
  collectionNodeBaseSchema.extend({
    kind: z.literal('folder'),
    children: z.array(collectionNodeSchema),
    config: z.preprocess(optionalFolderConfig, collectionFolderConfigSchema.optional()),
  }),
);

export const collectionTreeSchema = z.array(collectionNodeSchema);

export type CollectionTree = CollectionNode[];

/** How siblings are ordered after folders-first. */
export const collectionSortModeSchema = z.enum([
  'name-asc',
  'name-desc',
  'type',
  'modified-desc',
]);

export type CollectionSortMode = z.infer<typeof collectionSortModeSchema>;

/** Common HTTP status buckets for filtering. */
export const collectionStatusFilterSchema = z.union([
  z.literal('unset'),
  z.literal(200),
  z.literal(201),
  z.literal(400),
  z.literal(401),
  z.literal(404),
  z.literal(500),
]);

export type CollectionStatusFilter = z.infer<typeof collectionStatusFilterSchema>;

export const COLLECTION_STATUS_FILTERS = [
  'unset',
  200,
  201,
  400,
  401,
  404,
  500,
] as const satisfies readonly CollectionStatusFilter[];

export const collectionFiltersSchema = z.object({
  kinds: z.array(collectionNodeKindSchema),
  methods: z.array(httpMethodSchema),
  statuses: z.array(collectionStatusFilterSchema),
});

export type CollectionFilters = z.infer<typeof collectionFiltersSchema>;

export const DEFAULT_COLLECTION_FILTERS: CollectionFilters = {
  kinds: [],
  methods: [],
  statuses: [],
};

export const collectionPrefsSchema = z.object({
  expandedIds: z.array(z.string()),
  sortMode: collectionSortModeSchema,
  filters: collectionFiltersSchema,
});

export type CollectionPrefs = z.infer<typeof collectionPrefsSchema>;

export const DEFAULT_COLLECTION_PREFS: CollectionPrefs = {
  expandedIds: [],
  sortMode: 'name-asc',
  filters: DEFAULT_COLLECTION_FILTERS,
};
