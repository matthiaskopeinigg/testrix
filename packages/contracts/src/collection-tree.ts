import { z } from 'zod';

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
};

export type CollectionHttpNode = {
  readonly kind: 'http';
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly method: HttpMethod;
  readonly status: number | null;
};

export type CollectionWebSocketNode = {
  readonly kind: 'websocket';
  readonly id: string;
  readonly name: string;
  readonly modifiedAt: string;
};

export type CollectionNode = CollectionFolderNode | CollectionHttpNode | CollectionWebSocketNode;

export const collectionHttpNodeSchema = collectionNodeBaseSchema.extend({
  kind: z.literal('http'),
  method: httpMethodSchema,
  status: z.number().int().positive().nullable(),
});

export const collectionWebSocketNodeSchema = collectionNodeBaseSchema.extend({
  kind: z.literal('websocket'),
});

export const collectionNodeSchema: z.ZodType<CollectionNode> = z.lazy(() =>
  z.union([
    collectionNodeBaseSchema.extend({
      kind: z.literal('folder'),
      children: z.array(collectionNodeSchema),
    }),
    collectionHttpNodeSchema,
    collectionWebSocketNodeSchema,
  ]),
);

export const collectionFolderNodeSchema: z.ZodType<CollectionFolderNode> = z.lazy(() =>
  collectionNodeBaseSchema.extend({
    kind: z.literal('folder'),
    children: z.array(collectionNodeSchema),
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
