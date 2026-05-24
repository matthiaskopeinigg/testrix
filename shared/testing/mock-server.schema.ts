import { z } from 'zod';

import {
  collectionRequestBodySchema,
  createDefaultCollectionRequestBody,
} from '../config/collection-request-settings.schema';
import { HTTP_METHOD_IDS, httpKeyValueRowSchema } from '../config/http-settings.schema';

const boundedText = (max: number) => z.string().max(max);

/** Maximum in-memory unmatched-request records kept by the mock server runner. */
export const MOCK_SERVER_MISMATCH_BUFFER_MAX = 100;

export const MOCK_PATH_MATCH_MODE_IDS = ['exact', 'prefix', 'glob', 'regex'] as const;
export type MockPathMatchMode = (typeof MOCK_PATH_MATCH_MODE_IDS)[number];

export const MOCK_HEADER_MATCH_MODE_IDS = ['equals', 'contains', 'regex'] as const;
export type MockHeaderMatchMode = (typeof MOCK_HEADER_MATCH_MODE_IDS)[number];

export const MOCK_BODY_MATCH_MODE_IDS = [
  'equals',
  'contains',
  'regex',
  'jsonPath',
  'jsonSchema',
] as const;
export type MockBodyMatchMode = (typeof MOCK_BODY_MATCH_MODE_IDS)[number];

export const MOCK_BODY_TYPE_IDS = [
  'none',
  'json',
  'xml',
  'text',
  'graphql',
  'form-data',
  'urlencoded',
  'binary',
] as const;
export type MockBodyTypeId = (typeof MOCK_BODY_TYPE_IDS)[number];

/** Ephemeral record for a request that matched no endpoint (not persisted in mock.json). */
export const mockServerMismatchRecordSchema = z.object({
  id: z.string().min(1),
  at: z.string(),
  method: z.string(),
  url: boundedText(8_192),
  pathname: boundedText(4_096),
  query: boundedText(4_096).default(''),
  headers: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  bodyPreview: boundedText(4_096).default(''),
  bodyTruncated: z.boolean().default(false),
  contentType: boundedText(256).optional(),
  historyItemId: z.string().optional(),
});

export type MockServerMismatchRecord = z.infer<typeof mockServerMismatchRecordSchema>;

export const mockPathMatchSchema = z.object({
  mode: z.enum(MOCK_PATH_MATCH_MODE_IDS).default('exact'),
  value: boundedText(4_096).default('/'),
  ignoreQuery: z.boolean().default(false),
});

export type MockPathMatch = z.infer<typeof mockPathMatchSchema>;

export const mockHeaderMatchRowSchema = httpKeyValueRowSchema.extend({
  match: z.enum(MOCK_HEADER_MATCH_MODE_IDS).default('equals'),
});

export type MockHeaderMatchRow = z.infer<typeof mockHeaderMatchRowSchema>;

export const mockBodyMatchSchema = z.object({
  bodyType: z.enum(MOCK_BODY_TYPE_IDS).default('none'),
  match: z.enum(MOCK_BODY_MATCH_MODE_IDS).default('equals'),
  value: boundedText(512_000).default(''),
});

export type MockBodyMatch = z.infer<typeof mockBodyMatchSchema>;

export const mockRuleMatcherSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256).default('Matcher'),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  methods: z.array(z.enum(HTTP_METHOD_IDS)).default([]),
  path: mockPathMatchSchema,
  headers: z.array(mockHeaderMatchRowSchema).max(32).default([]),
  body: mockBodyMatchSchema.optional(),
});

export type MockRuleMatcher = z.infer<typeof mockRuleMatcherSchema>;

export const mockResponseSchema = z.object({
  statusCode: z.number().int().min(100).max(599).default(200),
  headers: z.array(httpKeyValueRowSchema).max(64).default([]),
  body: collectionRequestBodySchema.default({ mode: 'none' }),
  latencyMs: z.number().int().min(0).default(0),
  delayMs: z.number().int().min(0).optional(),
});

export type MockResponse = z.infer<typeof mockResponseSchema>;

export const mockServerEndpointSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  description: boundedText(4_000).default(''),
  tags: z.array(boundedText(64)).max(32).default([]),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  matchers: z.array(mockRuleMatcherSchema).default([]),
  response: mockResponseSchema,
  updatedAt: z.string(),
});

export type MockServerEndpoint = z.infer<typeof mockServerEndpointSchema>;

export const mockServerFolderSchema: z.ZodType<MockServerFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: boundedText(256),
    children: z.array(mockServerTreeItemSchema).default([]),
    updatedAt: z.string(),
  }),
);

export type MockServerFolder = {
  readonly id: string;
  readonly name: string;
  readonly children: readonly MockServerTreeItem[];
  readonly updatedAt: string;
};

/** Endpoint must be first — folder shape is a subset when unknown keys are stripped. */
export const mockServerTreeItemSchema = z.union([mockServerEndpointSchema, mockServerFolderSchema]);

export type MockServerTreeItem = MockServerFolder | MockServerEndpoint;

export const mockServerCorsSchema = z.object({
  enabled: z.boolean().default(false),
  allowOrigin: boundedText(512).default('*'),
  allowMethods: boundedText(256).default('*'),
  allowHeaders: boundedText(512).default('*'),
});

export type MockServerCors = z.infer<typeof mockServerCorsSchema>;

export const mockServerPortSchema = z.union([
  z.literal('auto'),
  z.number().int().min(1).max(65_535),
]);

export type MockServerPort = z.infer<typeof mockServerPortSchema>;

export const mockServerOptionsSchema = z.object({
  port: mockServerPortSchema.default('auto'),
  delayMs: z.number().int().min(0).default(0),
  host: boundedText(256).default('127.0.0.1'),
  cors: mockServerCorsSchema,
  captureToHistory: z.boolean().default(false),
  captureMismatchesToHistory: z.boolean().default(false),
  autoStartOnLaunch: z.boolean().default(false),
});

export type MockServerOptions = z.infer<typeof mockServerOptionsSchema>;

/**
 * Parses mock server options, filling nested defaults for partial or legacy files.
 */
export function parseMockServerOptions(raw: unknown = {}): MockServerOptions {
  const input = typeof raw === 'object' && raw !== null ? raw : {};
  const record = input as Record<string, unknown>;
  return mockServerOptionsSchema.parse({
    ...record,
    cors: typeof record['cors'] === 'object' && record['cors'] !== null ? record['cors'] : {},
  });
}

/** Runtime status returned by mock start/stop/status IPC. */
export interface MockServerRuntimeStatus {
  readonly running: boolean;
  readonly host: string;
  readonly port: number;
  readonly resolvedPort?: number;
  readonly startedAt?: string;
  readonly unmatchedCount: number;
}

export const mockServerFileSchema = z.object({
  schemaVersion: z.literal(2),
  options: mockServerOptionsSchema,
  items: z.array(mockServerTreeItemSchema).default([]),
});

export type MockServerFile = z.infer<typeof mockServerFileSchema>;

/** Legacy v1 flat endpoint (migration only). */
export const mockEndpointV1Schema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).default('GET'),
  path: boundedText(2_048).default('/'),
  statusCode: z.number().int().min(100).max(599).default(200),
  body: boundedText(512_000).default(''),
  latencyMs: z.number().int().min(0).default(0),
  updatedAt: z.string(),
});

export const mockServerFileV1Schema = z.object({
  schemaVersion: z.literal(1),
  options: z.object({
    port: z.number().int().min(1).max(65_535).default(9_876),
    host: boundedText(256).default('127.0.0.1'),
  }),
  endpoints: z.array(mockEndpointV1Schema).default([]),
});

export type MockServerFileV1 = z.infer<typeof mockServerFileV1Schema>;

/** @deprecated Use MockServerEndpoint */
export type MockEndpoint = MockServerEndpoint;

/**
 * Returns default mock response payload.
 */
export function createDefaultMockResponse(): MockResponse {
  return mockResponseSchema.parse({
    statusCode: 200,
    body: createDefaultCollectionRequestBody(),
    latencyMs: 0,
  });
}

/**
 * Returns a new rule matcher with defaults.
 */
export function createDefaultMockRuleMatcher(id: string): MockRuleMatcher {
  return mockRuleMatcherSchema.parse({
    id,
    name: 'Matcher',
    methods: [],
    path: { mode: 'exact', value: '/', ignoreQuery: false },
    headers: [],
  });
}

/**
 * Returns a new mock server endpoint shell.
 */
export function createDefaultMockServerEndpoint(
  id: string,
  name: string,
  updatedAt: string,
): MockServerEndpoint {
  return mockServerEndpointSchema.parse({
    id,
    name,
    description: '',
    tags: [],
    enabled: true,
    priority: 0,
    matchers: [],
    response: createDefaultMockResponse(),
    updatedAt,
  });
}

/**
 * Returns an empty mock server workspace file (v2).
 */
export function createDefaultMockServerFile(): MockServerFile {
  return mockServerFileSchema.parse({
    schemaVersion: 2,
    options: parseMockServerOptions({}),
    items: [],
  });
}

/**
 * Returns true when the tree item is an endpoint (not a folder).
 */
export function isMockServerEndpoint(item: MockServerTreeItem): item is MockServerEndpoint {
  return 'matchers' in item;
}

/**
 * Returns true when the tree item is a folder.
 */
export function isMockServerFolder(item: MockServerTreeItem): item is MockServerFolder {
  return 'children' in item && !('matchers' in item);
}
