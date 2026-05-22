import { z } from 'zod';

import type { TestSuiteStepType } from './test-suite-steps.schema';

/** Step types that may supply data to a validation step. */
export const FLOW_VALIDATION_REFERENCE_STEP_TYPES = [
  'REQUEST',
  'E2E',
  'HTTP_LISTENER',
  'HTTP_INTERCEPTOR',
  'DATABASE',
] as const satisfies readonly TestSuiteStepType[];

export type FlowValidationReferenceStepType = (typeof FLOW_VALIDATION_REFERENCE_STEP_TYPES)[number];

export function isFlowValidationReferenceStepType(
  stepType: TestSuiteStepType | undefined,
): stepType is FlowValidationReferenceStepType {
  return (
    stepType != null &&
    (FLOW_VALIDATION_REFERENCE_STEP_TYPES as readonly string[]).includes(stepType)
  );
}

const boundedText = (max: number) => z.string().max(max);

export const flowStepHttpResponseCaptureSchema = z.object({
  kind: z.literal('http_response'),
  capturedAt: z.string(),
  statusCode: z.number().int(),
  statusText: boundedText(128).default(''),
  bodyText: boundedText(512_000).default(''),
  headers: z.record(z.string(), boundedText(8_000)).default({}),
  requestMethod: boundedText(16).optional(),
  requestUrl: boundedText(4_096).optional(),
});

export type FlowStepHttpResponseCapture = z.infer<typeof flowStepHttpResponseCaptureSchema>;

export const flowStepE2eElementCaptureSchema = z.object({
  kind: z.literal('e2e_element'),
  capturedAt: z.string(),
  action: boundedText(64).default(''),
  selector: boundedText(4_096).default(''),
  pageUrl: boundedText(4_096).default(''),
  elementText: boundedText(512_000).default(''),
  elementHtml: boundedText(512_000).default(''),
  elementExists: z.boolean().default(false),
});

export type FlowStepE2eElementCapture = z.infer<typeof flowStepE2eElementCaptureSchema>;

export const flowStepDatabaseCaptureSchema = z.object({
  kind: z.literal('database_result'),
  capturedAt: z.string(),
  dbText: boundedText(512_000).default(''),
});

export type FlowStepDatabaseCapture = z.infer<typeof flowStepDatabaseCaptureSchema>;

export const flowStepRunCaptureSchema = z.discriminatedUnion('kind', [
  flowStepHttpResponseCaptureSchema,
  flowStepE2eElementCaptureSchema,
  flowStepDatabaseCaptureSchema,
]);

export type FlowStepRunCapture = z.infer<typeof flowStepRunCaptureSchema>;

/** Builds an HTTP response capture from a request executor snapshot. */
export function buildHttpResponseStepCapture(
  snapshot: {
    readonly status: { readonly code: number; readonly text: string };
    readonly body: { readonly text?: string };
    readonly headers: readonly { readonly key: string; readonly value: string }[];
    readonly requestSummary?: { readonly method?: string; readonly url?: string };
  },
): FlowStepHttpResponseCapture {
  const headers: Record<string, string> = {};
  for (const header of snapshot.headers) {
    if (header.key) {
      headers[header.key] = header.value;
    }
  }
  return flowStepHttpResponseCaptureSchema.parse({
    kind: 'http_response',
    capturedAt: new Date().toISOString(),
    statusCode: snapshot.status.code,
    statusText: snapshot.status.text,
    bodyText: snapshot.body.text ?? '',
    headers,
    requestMethod: snapshot.requestSummary?.method,
    requestUrl: snapshot.requestSummary?.url,
  });
}

/** Builds a database query result capture for validation and step references. */
export function buildDatabaseStepCapture(dbText: string): FlowStepDatabaseCapture {
  return flowStepDatabaseCaptureSchema.parse({
    kind: 'database_result',
    capturedAt: new Date().toISOString(),
    dbText,
  });
}
