import { z } from 'zod';

import { collectionRequestBodySchema } from '../config/collection-request-settings.schema';
import { HTTP_METHOD_IDS } from '../config/http-settings.schema';
import { flowConditionSchema } from './flow-condition';

const boundedText = (max: number) => z.string().max(max);

export const TEST_SUITE_STEP_TYPES = [
  'REQUEST',
  'VALIDATION',
  'CACHE',
  'DATABASE',
  'E2E',
  'HTTP_LISTENER',
  'HTTP_INTERCEPTOR',
  'WAIT',
  'MANUAL',
  'TRIGGER',
  'IF',
  'FOR_EACH',
  'WHILE',
  'PARALLEL',
  'RETRY',
] as const;

export const testSuiteStepTypeSchema = z.enum(TEST_SUITE_STEP_TYPES);
export type TestSuiteStepType = z.infer<typeof testSuiteStepTypeSchema>;

export const testSuiteStepStatusSchema = z.enum([
  'never',
  'running',
  'passed',
  'failed',
  'skipped',
  'waiting',
]);
export type TestSuiteStepStatus = z.infer<typeof testSuiteStepStatusSchema>;

export const testSuiteKeyValuePairSchema = z.object({
  /** Stable editor row id so typing a key does not remount the input. */
  id: z.string().optional(),
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().default(true),
  description: z.string().optional(),
});

export type TestSuiteKeyValuePair = z.infer<typeof testSuiteKeyValuePairSchema>;

export const requestStepConfigSchema = z.object({
  method: z.enum(HTTP_METHOD_IDS).default('GET'),
  url: z.string().default(''),
  headers: z.array(testSuiteKeyValuePairSchema).default([]),
  queryParams: z.array(testSuiteKeyValuePairSchema).default([]),
  body: z.string().default(''),
  bodyType: z
    .enum(['json', 'xml', 'text', 'graphql', 'form-data', 'urlencoded', 'binary', 'none'])
    .default('none'),
  /** Collection-style body editor state (preferred over legacy body/bodyType). */
  requestBody: collectionRequestBodySchema.optional(),
  binaryFilePath: z.string().optional(),
  binaryContentType: z.string().optional(),
  timeoutMs: z.union([z.number(), z.string()]).optional(),
  /** Optional collection request to merge settings from at run time. */
  collectionRequestId: z.string().optional(),
  /** Whether the step uses inline fields or a collection request. */
  requestSource: z.enum(['manual', 'collection']).optional(),
});

export type RequestStepConfig = z.infer<typeof requestStepConfigSchema>;

export type FlowRequestStepSource = 'manual' | 'collection';

/**
 * Resolves whether a REQUEST step sends inline fields or a collection request.
 * An explicit `requestSource` wins so a leftover collection id cannot hijack a manual URL.
 */
export function resolveFlowRequestStepSource(
  cfg: Pick<RequestStepConfig, 'requestSource' | 'collectionRequestId'>,
): FlowRequestStepSource {
  if (cfg.requestSource === 'manual' || cfg.requestSource === 'collection') {
    return cfg.requestSource;
  }
  return cfg.collectionRequestId ? 'collection' : 'manual';
}

export const validationRuleSchema = z.object({
  label: z.string().optional(),
  source: z.enum([
    'response_body',
    'response_status',
    'response_header',
    'request_body',
    'request_header',
    'request_param',
    'cached_value',
    'e2e_element_text',
    'e2e_element_html',
    'e2e_selector_exists',
    'e2e_page_url',
  ]),
  expression: z.string().default(''),
  operator: z
    .enum([
      'equals',
      'not_equals',
      'contains',
      'matches_regex',
      'matches_json_schema',
      'greater_than',
      'less_than',
      'is_null',
      'is_not_null',
      'exists',
      'not_exists',
      'is_empty',
      'is_not_empty',
    ])
    .default('equals'),
  expected: z.string().default(''),
  bodyFormat: z
    .enum(['auto', 'json', 'xml', 'text', 'graphql', 'form-data', 'urlencoded', 'binary'])
    .optional(),
  bodyWiremockMatcherJson: z.string().optional(),
});

export type ValidationRule = z.infer<typeof validationRuleSchema>;

/** Cache entry that stores a generated/literal template instead of extracting a capture. */
export const GENERATED_CACHE_SOURCE = 'generated' as const;

/** Capture sources plus generated templates for CACHE step entries. */
export const cacheStepEntrySourceSchema = z.union([
  validationRuleSchema.shape.source,
  z.literal(GENERATED_CACHE_SOURCE),
]);

/** RSA OAEP wrap applied to a CACHE entry after the value is resolved. */
export const CACHE_CIPHER_MODES = ['none', 'encrypt', 'decrypt'] as const;

export const cacheStepCipherSchema = z.object({
  mode: z.enum(CACHE_CIPHER_MODES).default('none'),
  pem: z.string().default(''),
  keyPassword: z.string().default(''),
});

export type CacheStepCipher = z.infer<typeof cacheStepCipherSchema>;

export const cacheStepEntrySchema = z.object({
  variableName: z.string().default(''),
  source: cacheStepEntrySourceSchema,
  expression: z.string().default(''),
  extractKind: z
    .enum(['full', 'json_pointer', 'jsonpath', 'xpath', 'text_regex', 'form_field', 'url_param', 'binary_metric'])
    .optional(),
  extract: z.string().optional(),
  /** Template for `generated` entries (`$uuid`, `{{vars}}`). Ignored for extract sources. */
  value: z.string().optional(),
  /** Optional RSA OAEP wrap applied after the value is resolved. */
  cipher: cacheStepCipherSchema.optional(),
});

export type CacheStepEntry = z.infer<typeof cacheStepEntrySchema>;

export const cacheStepConfigSchema = z.object({
  refStepId: z.string().nullable().optional(),
  entries: z.array(cacheStepEntrySchema).default([]),
});

export type CacheStepConfig = z.infer<typeof cacheStepConfigSchema>;

export const validationStepConfigSchema = z.object({
  refStepId: z.string().nullable().optional(),
  rules: z.array(validationRuleSchema).default([]),
  /** When true, the flow keeps running after this step fails; the flow still fails at the end. */
  continueOnFailure: z.boolean().default(false),
});

export type ValidationStepConfig = z.infer<typeof validationStepConfigSchema>;

export const databaseStepConfigSchema = z.object({
  connectionId: z.string().default(''),
  query: z.string().default(''),
  /** Whether the step uses inline SQL or a saved Database sidebar query. */
  querySource: z.enum(['manual', 'saved']).optional(),
  /** Saved query id from the Database sidebar (`queries.json`). */
  savedQueryId: z.string().optional(),
  cacheAs: z.string().optional(),
  timeoutMs: z.union([z.number(), z.string()]).optional(),
});

export type DatabaseStepConfig = z.infer<typeof databaseStepConfigSchema>;

export const e2eStepConfigSchema = z.object({
  action: z
    .enum([
      'NAVIGATE_TO',
      'CLICK',
      'TYPE_TEXT',
      'HOVER',
      'WAIT',
      'SCROLL_TO',
      'SCREENSHOT',
      'ASSERT_ELEMENT',
      'ASSERT_URL',
      'WAIT_FOR_URL',
    ])
    .default('NAVIGATE_TO'),
  selector: z.string().default(''),
  value: z.string().default(''),
  timeout: z.union([z.number(), z.string()]).default(5000),
  screenshotPath: z.string().optional(),
  screenshotFileName: z.string().optional(),
  /** Compare this capture against a per-profile baseline PNG. */
  checkpoint: z.boolean().default(false),
  /** Fail the checkpoint when changed pixels exceed this percent (0–5). */
  diffThresholdPercent: z.number().min(0).max(5).default(0.5),
});

export type E2eStepConfig = z.infer<typeof e2eStepConfigSchema>;

export const waitStepConfigSchema = z.object({
  durationMs: z.union([z.number(), z.string()]).default(2000),
});

export type WaitStepConfig = z.infer<typeof waitStepConfigSchema>;

export const manualStepConfigSchema = z.object({
  prompt: z.string().default('Please enter value:'),
  variableName: z.string().default('userInput'),
  timeout: z.union([z.number(), z.string()]).optional(),
});

export type ManualStepConfig = z.infer<typeof manualStepConfigSchema>;

export const httpListenerStepConfigSchema = z.object({
  urlPattern: z.string().default(''),
  method: z.string().default('POST'),
  matchPhase: z.enum(['request', 'response']).default('response'),
  timeout: z.union([z.number(), z.string()]).optional(),
  variableName: z.string().optional(),
});

export const httpInterceptorStepConfigSchema = httpListenerStepConfigSchema.extend({
  interceptAction: z.enum(['modify', 'block']).default('modify'),
  amendHeaders: z.array(testSuiteKeyValuePairSchema).default([]),
  amendQueryParams: z.array(testSuiteKeyValuePairSchema).default([]),
  replaceBodyType: requestStepConfigSchema.shape.bodyType.optional(),
  replacePostBody: z.string().optional(),
});

export type HttpListenerStepConfig = z.infer<typeof httpListenerStepConfigSchema>;
export type HttpInterceptorStepConfig = z.infer<typeof httpInterceptorStepConfigSchema>;

export const triggerStepConfigSchema = z.object({
  targetType: z.enum(['flow', 'folder']).default('flow'),
  targetId: z.string().default(''),
  /**
   * When true, nested E2E steps keep the parent run’s browser window, cookies, and
   * in-page state (login). When false, the runner session is cleared before the target.
   */
  reuseE2eSession: z.boolean().default(true),
});

export type TriggerStepConfig = z.infer<typeof triggerStepConfigSchema>;

export const ifStepConfigSchema = z.object({
  condition: flowConditionSchema.default({ clauses: [] }),
});

export type IfStepConfig = z.infer<typeof ifStepConfigSchema>;

export const forEachStepConfigSchema = z.object({
  source: z.string().default(''),
  itemVariable: z.string().default('item'),
  maxIterations: z.number().int().min(1).max(200).default(50),
});

export type ForEachStepConfig = z.infer<typeof forEachStepConfigSchema>;

export const whileStepConfigSchema = z.object({
  condition: flowConditionSchema.default({ clauses: [] }),
  maxIterations: z.number().int().min(1).max(200).default(50),
});

export type WhileStepConfig = z.infer<typeof whileStepConfigSchema>;

export const parallelStepConfigSchema = z.object({});

export type ParallelStepConfig = z.infer<typeof parallelStepConfigSchema>;

export const retryStepConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  delayMs: z.number().int().min(0).max(30_000).default(0),
});

export type RetryStepConfig = z.infer<typeof retryStepConfigSchema>;

export const FLOW_CONTROL_STEP_TYPES = ['IF', 'FOR_EACH', 'WHILE', 'PARALLEL', 'RETRY'] as const;

export type FlowControlStepType = (typeof FLOW_CONTROL_STEP_TYPES)[number];

export function isFlowControlStepType(stepType: string): stepType is FlowControlStepType {
  return (FLOW_CONTROL_STEP_TYPES as readonly string[]).includes(stepType);
}

export const testSuiteStepConfigSchema = z.union([
  requestStepConfigSchema,
  validationStepConfigSchema,
  cacheStepConfigSchema,
  databaseStepConfigSchema,
  e2eStepConfigSchema,
  httpListenerStepConfigSchema,
  httpInterceptorStepConfigSchema,
  waitStepConfigSchema,
  manualStepConfigSchema,
  triggerStepConfigSchema,
  ifStepConfigSchema,
  forEachStepConfigSchema,
  whileStepConfigSchema,
  parallelStepConfigSchema,
  retryStepConfigSchema,
]);

export type TestSuiteStepConfig = z.infer<typeof testSuiteStepConfigSchema>;

export const DEFAULT_WAIT_STEP_DURATION_MS = 2000;

export function createDefaultRequestStepConfig(): RequestStepConfig {
  return requestStepConfigSchema.parse({
    method: 'GET',
    url: '',
    headers: [],
    queryParams: [],
    body: '',
    bodyType: 'none',
    timeoutMs: 30_000,
  });
}

export function createDefaultValidationStepConfig(): ValidationStepConfig {
  return validationStepConfigSchema.parse({
    refStepId: null,
    rules: [
      {
        source: 'e2e_element_text',
        expression: '',
        operator: 'contains',
        expected: '',
      },
    ],
  });
}

export function createDefaultCacheStepConfig(): CacheStepConfig {
  return cacheStepConfigSchema.parse({
    refStepId: null,
    entries: [
      {
        variableName: '',
        source: GENERATED_CACHE_SOURCE,
        expression: '',
        value: '',
        extractKind: 'full',
        extract: '',
      },
    ],
  });
}

export function createDefaultDatabaseStepConfig(): z.infer<typeof databaseStepConfigSchema> {
  return databaseStepConfigSchema.parse({ connectionId: '', query: '', querySource: 'manual' });
}

export function createDefaultE2eStepConfig(): z.infer<typeof e2eStepConfigSchema> {
  return e2eStepConfigSchema.parse({
    action: 'NAVIGATE_TO',
    selector: '',
    value: '',
    timeout: 5000,
  });
}

export function createDefaultHttpListenerStepConfig(): z.infer<typeof httpListenerStepConfigSchema> {
  return httpListenerStepConfigSchema.parse({ urlPattern: '', method: 'POST' });
}

export function createDefaultHttpInterceptorStepConfig(): z.infer<typeof httpInterceptorStepConfigSchema> {
  return httpInterceptorStepConfigSchema.parse({
    urlPattern: '',
    method: 'POST',
    interceptAction: 'modify',
  });
}

export function createDefaultWaitStepConfig(): z.infer<typeof waitStepConfigSchema> {
  return waitStepConfigSchema.parse({ durationMs: DEFAULT_WAIT_STEP_DURATION_MS });
}

export function createDefaultManualStepConfig(): z.infer<typeof manualStepConfigSchema> {
  return manualStepConfigSchema.parse({
    prompt: 'Please enter value:',
    variableName: 'userInput',
  });
}

export function createDefaultTriggerStepConfig(): z.infer<typeof triggerStepConfigSchema> {
  return triggerStepConfigSchema.parse({ targetType: 'flow', targetId: '' });
}

export function createDefaultIfStepConfig(): IfStepConfig {
  return ifStepConfigSchema.parse({ condition: { clauses: [{ left: '', operator: 'equals', right: '' }] } });
}

export function createDefaultForEachStepConfig(): ForEachStepConfig {
  return forEachStepConfigSchema.parse({ source: '', itemVariable: 'item', maxIterations: 50 });
}

export function createDefaultWhileStepConfig(): WhileStepConfig {
  return whileStepConfigSchema.parse({
    condition: { clauses: [{ left: '', operator: 'equals', right: '' }] },
    maxIterations: 50,
  });
}

export function createDefaultParallelStepConfig(): ParallelStepConfig {
  return parallelStepConfigSchema.parse({});
}

export function createDefaultRetryStepConfig(): RetryStepConfig {
  return retryStepConfigSchema.parse({ maxAttempts: 3, delayMs: 0 });
}

/** Returns default config for a step type. */
export function defaultConfigForStepType(stepType: TestSuiteStepType): TestSuiteStepConfig {
  switch (stepType) {
    case 'REQUEST':
      return createDefaultRequestStepConfig();
    case 'VALIDATION':
      return createDefaultValidationStepConfig();
    case 'CACHE':
      return createDefaultCacheStepConfig();
    case 'DATABASE':
      return createDefaultDatabaseStepConfig();
    case 'E2E':
      return createDefaultE2eStepConfig();
    case 'HTTP_LISTENER':
      return createDefaultHttpListenerStepConfig();
    case 'HTTP_INTERCEPTOR':
      return createDefaultHttpInterceptorStepConfig();
    case 'WAIT':
      return createDefaultWaitStepConfig();
    case 'MANUAL':
      return createDefaultManualStepConfig();
    case 'TRIGGER':
      return createDefaultTriggerStepConfig();
    case 'IF':
      return createDefaultIfStepConfig();
    case 'FOR_EACH':
      return createDefaultForEachStepConfig();
    case 'WHILE':
      return createDefaultWhileStepConfig();
    case 'PARALLEL':
      return createDefaultParallelStepConfig();
    case 'RETRY':
      return createDefaultRetryStepConfig();
    default:
      return createDefaultRequestStepConfig();
  }
}
