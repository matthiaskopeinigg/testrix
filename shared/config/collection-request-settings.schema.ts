import { z } from 'zod';

import { httpResponseSnapshotSchema } from '../http/outgoing-request.schema';
import {
  collectionFolderAuthSchema,
  collectionFolderScriptsSchema,
  createDefaultCollectionFolderAuth,
  createDefaultCollectionFolderScripts,
} from './collection-folder-settings.schema';
import { collectionTransportSettingsSchema } from './collection-transport-settings.schema';
import {
  HTTP_METHOD_IDS,
  createHttpKeyValueRow,
  httpKeyValueRowSchema,
} from './http-settings.schema';

export {
  collectionRequestTransportSettingsSchema,
  type CollectionRequestTransportSettings,
} from './collection-transport-settings.schema';

export const COLLECTION_REQUEST_KV_MAX_ROWS = 64;
export const COLLECTION_REQUEST_TAGS_MAX = 16;

export const collectionRequestPathParamSchema = z.object({
  id: z.string().min(1),
  key: z.string(),
  value: z.string(),
  description: z.string().optional(),
});

export type CollectionRequestPathParam = z.infer<typeof collectionRequestPathParamSchema>;

export const collectionRequestHeaderOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  value: z.string().optional(),
});

export type CollectionRequestHeaderOverride = z.infer<typeof collectionRequestHeaderOverrideSchema>;

export const collectionRequestHeadersSchema = z.object({
  rows: z.array(httpKeyValueRowSchema).max(COLLECTION_REQUEST_KV_MAX_ROWS),
  overrides: z.record(z.string(), collectionRequestHeaderOverrideSchema).default({}),
});

export type CollectionRequestHeaders = z.infer<typeof collectionRequestHeadersSchema>;

export const REQUEST_BODY_MODE_IDS = [
  'none',
  'json',
  'text',
  'html',
  'xml',
  'form-data',
  'x-www-form-urlencoded',
  'binary',
  'graphql',
] as const;

export type RequestBodyModeId = (typeof REQUEST_BODY_MODE_IDS)[number];

export const collectionRequestFormFieldSchema = z.object({
  id: z.string().min(1),
  key: z.string(),
  enabled: z.boolean(),
  type: z.enum(['text', 'file']),
  value: z.string().optional(),
  filePath: z.string().nullable().optional(),
  fileName: z.string().optional(),
});

export type CollectionRequestFormField = z.infer<typeof collectionRequestFormFieldSchema>;

export const collectionRequestBinaryInlineSchema = z.object({
  source: z.literal('inline'),
  contentBase64: z.string(),
  fileName: z.string().optional(),
  contentType: z.string().optional(),
});

export const collectionRequestBinaryFileSchema = z.object({
  source: z.literal('file'),
  filePath: z.string().min(1),
  fileName: z.string().optional(),
});

export type CollectionRequestBinaryBody =
  | z.infer<typeof collectionRequestBinaryInlineSchema>
  | z.infer<typeof collectionRequestBinaryFileSchema>;

const collectionRequestBodyNoneSchema = z.object({ mode: z.literal('none') });
const collectionRequestBodyRawSchema = z.object({
  mode: z.enum(['json', 'text', 'html', 'xml']),
  raw: z.string(),
});
const collectionRequestBodyFormDataSchema = z.object({
  mode: z.literal('form-data'),
  fields: z.array(collectionRequestFormFieldSchema).max(COLLECTION_REQUEST_KV_MAX_ROWS),
});
const collectionRequestBodyUrlEncodedSchema = z.object({
  mode: z.literal('x-www-form-urlencoded'),
  fields: z.array(httpKeyValueRowSchema).max(COLLECTION_REQUEST_KV_MAX_ROWS),
});
const collectionRequestBodyBinarySchema = z.object({
  mode: z.literal('binary'),
  source: z.enum(['file', 'inline']),
  filePath: z.string().optional(),
  fileName: z.string().optional(),
  contentBase64: z.string().optional(),
  contentType: z.string().optional(),
});
const collectionRequestBodyGraphqlSchema = z.object({
  mode: z.literal('graphql'),
  query: z.string(),
  variables: z.string(),
  operationName: z.string().optional(),
});

export const collectionRequestBodySchema = z.discriminatedUnion('mode', [
  collectionRequestBodyNoneSchema,
  collectionRequestBodyRawSchema,
  collectionRequestBodyFormDataSchema,
  collectionRequestBodyUrlEncodedSchema,
  collectionRequestBodyBinarySchema,
  collectionRequestBodyGraphqlSchema,
]);

export type CollectionRequestBody = z.infer<typeof collectionRequestBodySchema>;

export const collectionRequestTestRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  /** HTTP status must be in inclusive range. */
  statusMin: z.number().int().optional(),
  statusMax: z.number().int().optional(),
  /** JSON path must equal value (string compare). */
  jsonPath: z.string().optional(),
  expectedValue: z.string().optional(),
  headerName: z.string().optional(),
  headerIncludes: z.string().optional(),
});

export type CollectionRequestTestRule = z.infer<typeof collectionRequestTestRuleSchema>;

export const collectionRequestExampleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  snapshot: httpResponseSnapshotSchema,
});

export type CollectionRequestExample = z.infer<typeof collectionRequestExampleSchema>;

export const collectionRequestSavedSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  snapshot: httpResponseSnapshotSchema,
});

export type CollectionRequestSavedSnapshot = z.infer<typeof collectionRequestSavedSnapshotSchema>;

export const collectionRequestSettingsSchema = z.object({
  /** Environment profile id from environments.json used for `{{variable}}` substitution. */
  environmentId: z.string().nullable().default(null),
  tags: z.array(z.string().min(1)).max(COLLECTION_REQUEST_TAGS_MAX).default([]),
  docs: z.string().default(''),
  queryParams: z.array(httpKeyValueRowSchema).max(COLLECTION_REQUEST_KV_MAX_ROWS),
  pathParams: z.array(collectionRequestPathParamSchema).max(COLLECTION_REQUEST_KV_MAX_ROWS),
  headers: collectionRequestHeadersSchema,
  body: collectionRequestBodySchema,
  auth: collectionFolderAuthSchema,
  scripts: collectionFolderScriptsSchema,
  transport: collectionTransportSettingsSchema,
  tests: z.array(collectionRequestTestRuleSchema).max(32).default([]),
  examples: z.array(collectionRequestExampleSchema).max(32).default([]),
  snapshots: z.array(collectionRequestSavedSnapshotSchema).max(32).default([]),
});

export type CollectionRequestSettings = z.infer<typeof collectionRequestSettingsSchema>;

export function createCollectionRequestPathParam(
  partial?: Partial<Pick<CollectionRequestPathParam, 'key' | 'value' | 'description'>>,
): CollectionRequestPathParam {
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `pp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    key: partial?.key ?? '',
    value: partial?.value ?? '',
    description: partial?.description,
  };
}

export function createCollectionRequestFormField(
  partial?: Partial<Pick<CollectionRequestFormField, 'key' | 'enabled' | 'type' | 'value'>>,
): CollectionRequestFormField {
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `fd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    key: partial?.key ?? '',
    enabled: partial?.enabled ?? true,
    type: partial?.type ?? 'text',
    value: partial?.value ?? '',
    filePath: null,
    fileName: undefined,
  };
}

export function createDefaultCollectionRequestBody(): CollectionRequestBody {
  return { mode: 'none' };
}

export function createDefaultCollectionRequestSettings(): CollectionRequestSettings {
  return {
    environmentId: null,
    tags: [],
    docs: '',
    queryParams: [],
    pathParams: [],
    headers: { rows: [], overrides: {} },
    body: createDefaultCollectionRequestBody(),
    auth: createDefaultCollectionFolderAuth(),
    scripts: createDefaultCollectionFolderScripts(),
    transport: {},
    tests: [],
    examples: [],
    snapshots: [],
  };
}

/** Normalizes binary body to discriminated file/inline shape for UI. */
export function normalizeCollectionRequestBinaryBody(
  body: Extract<CollectionRequestBody, { mode: 'binary' }>,
): CollectionRequestBinaryBody {
  if (body.source === 'file' && body.filePath) {
    return { source: 'file', filePath: body.filePath, fileName: body.fileName };
  }
  return {
    source: 'inline',
    contentBase64: body.contentBase64 ?? '',
    fileName: body.fileName,
    contentType: body.contentType,
  };
}

/** Ensures request settings include defaults for missing fields. */
export function enrichCollectionRequestSettings(raw: unknown): CollectionRequestSettings {
  const defaults = createDefaultCollectionRequestSettings();
  if (typeof raw !== 'object' || raw === null) {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const parsed = collectionRequestSettingsSchema.safeParse({
    environmentId:
      typeof record['environmentId'] === 'string'
        ? record['environmentId']
        : record['environmentId'] === null
          ? null
          : defaults.environmentId,
    tags: Array.isArray(record['tags']) ? record['tags'] : defaults.tags,
    docs: typeof record['docs'] === 'string' ? record['docs'] : defaults.docs,
    queryParams: Array.isArray(record['queryParams']) ? record['queryParams'] : defaults.queryParams,
    pathParams: Array.isArray(record['pathParams']) ? record['pathParams'] : defaults.pathParams,
    headers:
      typeof record['headers'] === 'object' && record['headers'] !== null
        ? record['headers']
        : defaults.headers,
    body: record['body'] ?? defaults.body,
    auth: record['auth'] ?? defaults.auth,
    scripts:
      typeof record['scripts'] === 'object' && record['scripts'] !== null
        ? { ...defaults.scripts, ...(record['scripts'] as object) }
        : defaults.scripts,
    transport:
      typeof record['transport'] === 'object' && record['transport'] !== null
        ? record['transport']
        : defaults.transport,
    tests: Array.isArray(record['tests'])
      ? record['tests'].filter((t) => typeof t === 'object' && t !== null && 'id' in t)
      : defaults.tests,
    examples: Array.isArray(record['examples'])
      ? record['examples'].filter(
          (e) =>
            typeof e === 'object' &&
            e !== null &&
            'id' in e &&
            'snapshot' in e &&
            'name' in e,
        )
      : defaults.examples,
    snapshots: Array.isArray(record['snapshots'])
      ? record['snapshots'].filter(
          (s) => typeof s === 'object' && s !== null && 'id' in s && 'snapshot' in s,
        )
      : defaults.snapshots,
  });

  return parsed.success ? parsed.data : defaults;
}

/** Suggested Content-Type from body mode (for header hint UI). */
export function suggestRequestContentType(body: CollectionRequestBody): string | null {
  switch (body.mode) {
    case 'json':
      return 'application/json';
    case 'html':
      return 'text/html';
    case 'xml':
      return 'application/xml';
    case 'text':
      return 'text/plain';
    case 'x-www-form-urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'form-data':
      return 'multipart/form-data';
    case 'binary':
      if (body.source === 'inline' && body.contentType?.trim()) {
        return body.contentType.trim();
      }
      return 'application/octet-stream';
    case 'graphql':
      return 'application/json';
    default:
      return null;
  }
}

export { createHttpKeyValueRow };
