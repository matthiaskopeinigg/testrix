import { z } from 'zod';

import { requestStepConfigSchema } from './test-suite-steps.schema';

export const LOAD_TEST_TARGET_SOURCE_IDS = ['collection', 'manual'] as const;
export type LoadTestTargetSource = (typeof LOAD_TEST_TARGET_SOURCE_IDS)[number];

export const loadTestManualTargetSchema = requestStepConfigSchema.omit({
  collectionRequestId: true,
  requestSource: true,
});

export type LoadTestManualTarget = z.infer<typeof loadTestManualTargetSchema>;

/** Default inline HTTP target for load tests. */
export function createDefaultLoadTestManualTarget(): LoadTestManualTarget {
  return loadTestManualTargetSchema.parse({
    method: 'GET',
    url: '',
    headers: [],
    queryParams: [],
    body: '',
    bodyType: 'none',
    timeoutMs: 30_000,
  });
}

/** Resolves how a load test target is configured. */
export function resolveLoadTestTargetSource(artifact: {
  readonly targetSource?: LoadTestTargetSource;
  readonly targetRequestId?: string;
}): LoadTestTargetSource {
  if (artifact.targetSource === 'collection' || artifact.targetSource === 'manual') {
    return artifact.targetSource;
  }
  return artifact.targetRequestId ? 'collection' : 'manual';
}

/** Returns true when the artifact has enough target data to start a run. */
export function isLoadTestTargetReady(artifact: {
  readonly targetSource?: LoadTestTargetSource;
  readonly targetRequestId?: string;
  readonly manualTarget?: LoadTestManualTarget;
}): boolean {
  const source = resolveLoadTestTargetSource(artifact);
  if (source === 'collection') {
    return Boolean(artifact.targetRequestId?.trim());
  }
  return Boolean(artifact.manualTarget?.url?.trim());
}
