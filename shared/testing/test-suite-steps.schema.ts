import { z } from 'zod';

import { collectionRequestBodySchema } from '../config/collection-request-settings.schema';
import { HTTP_METHOD_IDS } from '../config/http-settings.schema';

const boundedText = (max: number) => z.string().max(max);

export const TEST_SUITE_STEP_TYPES = [
  'REQUEST',
  'VALIDATION',
  'DATABASE',
  'E2E',
  'HTTP_LISTENER',
  'HTTP_INTERCEPTOR',
  'WAIT',
  'MANUAL',
  'TRIGGER',
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
  extractKind: z
    .enum(['full', 'json_pointer', 'jsonpath', 'xpath', 'text_regex', 'form_field', 'url_param', 'binary_metric'])
    .optional(),
  extract: z.string().optional(),
  bodyWiremockMatcherJson: z.string().optional(),
});

export type ValidationRule = z.infer<typeof validationRuleSchema>;

export const validationStepConfigSchema = z.object({
  refStepId: z.string().nullable().optional(),
  rules: z.array(validationRuleSchema).default([]),
});

export type ValidationStepConfig = z.infer<typeof validationStepConfigSchema>;

export const databaseStepConfigSchema = z.object({
  connectionId: z.string().default(''),
  query: z.string().default(''),
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
});

export const testSuiteStepConfigSchema = z.union([
  requestStepConfigSchema,
  validationStepConfigSchema,
  databaseStepConfigSchema,
  e2eStepConfigSchema,
  httpListenerStepConfigSchema,
  httpInterceptorStepConfigSchema,
  waitStepConfigSchema,
  manualStepConfigSchema,
  triggerStepConfigSchema,
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
        source: 'response_status',
        expression: '',
        operator: 'equals',
        expected: '200',
      },
    ],
  });
}

export function createDefaultDatabaseStepConfig(): z.infer<typeof databaseStepConfigSchema> {
  return databaseStepConfigSchema.parse({ connectionId: '', query: '' });
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

/** Returns default config for a step type. */
export function defaultConfigForStepType(stepType: TestSuiteStepType): TestSuiteStepConfig {
  switch (stepType) {
    case 'REQUEST':
      return createDefaultRequestStepConfig();
    case 'VALIDATION':
      return createDefaultValidationStepConfig();
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
    default:
      return createDefaultRequestStepConfig();
  }
}
