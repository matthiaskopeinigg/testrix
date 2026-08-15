import { z } from 'zod';

import { requestStepConfigSchema, createDefaultRequestStepConfig } from './test-suite-steps.schema';

/** How a load test chooses its HTTP target. */
export const LOAD_TEST_TARGET_SOURCE_IDS = ['collection', 'manual'] as const;
export type LoadTestTargetSource = (typeof LOAD_TEST_TARGET_SOURCE_IDS)[number];

/** Inline HTTP target used when `targetSource` is `manual`. */
export const loadTestManualTargetSchema = requestStepConfigSchema.omit({
  collectionRequestId: true,
  requestSource: true,
});

export type LoadTestManualTarget = z.infer<typeof loadTestManualTargetSchema>;

/** Empty manual target for a newly switched load test. */
export function createDefaultLoadTestManualTarget(): LoadTestManualTarget {
  const cfg = createDefaultRequestStepConfig();
  return loadTestManualTargetSchema.parse({
    method: cfg.method,
    url: cfg.url,
    headers: cfg.headers,
    queryParams: cfg.queryParams,
    body: cfg.body,
    bodyType: cfg.bodyType,
    requestBody: cfg.requestBody,
    timeoutMs: cfg.timeoutMs,
  });
}

/** Returns true when the load test has a runnable collection or manual target. */
export function isLoadTestTargetReady(artifact: {
  readonly targetSource?: LoadTestTargetSource;
  readonly targetRequestId?: string;
  readonly manualTarget?: { readonly url?: string };
}): boolean {
  if (artifact.targetSource === 'manual') {
    return Boolean(artifact.manualTarget?.url?.trim());
  }
  return Boolean(artifact.targetRequestId?.trim());
}
