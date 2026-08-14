import { z } from 'zod';

import { requestStepConfigSchema } from './test-suite-steps.schema';

/**
 * Load tests target a collection request only.
 * `manual` remains accepted on disk for older saved files; the UI and runner ignore it.
 */
export const LOAD_TEST_TARGET_SOURCE_IDS = ['collection', 'manual'] as const;
export type LoadTestTargetSource = (typeof LOAD_TEST_TARGET_SOURCE_IDS)[number];

/** @deprecated Kept for reading older load-test files that stored an inline HTTP target. */
export const loadTestManualTargetSchema = requestStepConfigSchema.omit({
  collectionRequestId: true,
  requestSource: true,
});

/** @deprecated Kept for reading older load-test files. */
export type LoadTestManualTarget = z.infer<typeof loadTestManualTargetSchema>;

/** Returns true when a collection request id is set for the load test. */
export function isLoadTestTargetReady(artifact: {
  readonly targetRequestId?: string;
}): boolean {
  return Boolean(artifact.targetRequestId?.trim());
}
