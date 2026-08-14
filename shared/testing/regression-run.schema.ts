import { z } from 'zod';

import { flowStepRunCaptureSchema } from './flow-step-capture';
import { testSuiteStepStatusSchema } from './test-suite-steps.schema';

const boundedText = (max: number) => z.string().max(max);

/** Maximum completed runs stored per regression artifact. */
export const REGRESSION_RUN_HISTORY_MAX = 30;

/** Maximum time-series samples stored on each run record. */
export const REGRESSION_RUN_SAMPLES_MAX = 120;

/** Upper bound for parallel flow workers in a regression run. */
export const REGRESSION_MAX_PARALLELISM = 32;

export const regressionExecutionModeSchema = z.enum(['sequential', 'parallel']);

export type RegressionExecutionMode = z.infer<typeof regressionExecutionModeSchema>;

export const regressionRunScopeSchema = z.enum(['all', 'selected', 'failed-from-last']);

export type RegressionRunScope = z.infer<typeof regressionRunScopeSchema>;

export const regressionProfileSchema = z.object({
  executionMode: regressionExecutionModeSchema.default('parallel'),
  maxParallelism: z
    .number()
    .int()
    .min(1)
    .max(REGRESSION_MAX_PARALLELISM)
    .default(3),
  stopOnFirstFailure: z.boolean().default(true),
  retryFailedFlows: z.number().int().min(0).max(3).default(0),
  delayBetweenFlowsMs: z.number().int().min(0).default(0),
  environmentId: z.string().nullable().optional(),
  updateFlowLastRunStatus: z.boolean().default(true),
  e2eShowWindowOverride: z.boolean().optional(),
  e2eKeepWindowOpenOverride: z.boolean().optional(),
  runScope: regressionRunScopeSchema.default('all'),
  shuffleOrder: z.boolean().default(false),
  includeStepCaptures: z.boolean().default(true),
  includeStepErrors: z.boolean().default(true),
  allFlowsAtOnce: z.boolean().default(false),
});

export type RegressionProfile = z.infer<typeof regressionProfileSchema>;

export const regressionThresholdsSchema = z.object({
  acceptancePercent: z.number().min(0).max(100).default(100),
  maxFailedFlows: z.number().int().min(0).optional(),
  maxTotalDurationMs: z.number().int().min(0).optional(),
  maxP95FlowDurationMs: z.number().int().min(0).optional(),
});

export type RegressionThresholds = z.infer<typeof regressionThresholdsSchema>;

export const regressionFlowResultStatusSchema = z.enum([
  'passed',
  'failed',
  'skipped',
  'cancelled',
]);

export type RegressionFlowResultStatus = z.infer<typeof regressionFlowResultStatusSchema>;

export const regressionValidationFailureSchema = z.object({
  stepId: z.string().min(1),
  stepName: boundedText(256),
  label: boundedText(128),
  operatorLabel: boundedText(64),
  expected: boundedText(8_000).default(''),
  actual: boundedText(8_000).default(''),
});

export type RegressionValidationFailure = z.infer<typeof regressionValidationFailureSchema>;

export const regressionFlowResultSchema = z.object({
  flowId: z.string().min(1),
  flowName: boundedText(256),
  status: regressionFlowResultStatusSchema,
  durationMs: z.number().int().min(0).default(0),
  message: boundedText(4_000).optional(),
  attemptCount: z.number().int().min(1).default(1),
  stepStatuses: z.record(z.string(), testSuiteStepStatusSchema).optional(),
  stepDurations: z.record(z.string(), z.number()).optional(),
  stepErrors: z.record(z.string(), boundedText(4_000)).optional(),
  stepCaptures: z.record(z.string(), flowStepRunCaptureSchema).optional(),
  validationFailures: z.array(regressionValidationFailureSchema).default([]),
  passedStepCount: z.number().int().min(0).default(0),
  failedStepCount: z.number().int().min(0).default(0),
  skippedStepCount: z.number().int().min(0).default(0),
});

export type RegressionFlowResult = z.infer<typeof regressionFlowResultSchema>;

export const regressionFlowTimelineEntrySchema = z.object({
  flowId: z.string().min(1),
  flowName: boundedText(256),
  workerSlot: z.number().int().min(0).default(0),
  startedAtOffsetMs: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  status: z.enum(['passed', 'failed', 'skipped', 'cancelled', 'running']),
});

export type RegressionFlowTimelineEntry = z.infer<typeof regressionFlowTimelineEntrySchema>;

export const regressionMetricsSampleSchema = z.object({
  elapsedSec: z.number().min(0),
  completedFlows: z.number().int().min(0),
  passedFlows: z.number().int().min(0),
  failedFlows: z.number().int().min(0),
  skippedFlows: z.number().int().min(0),
  activeParallelism: z.number().int().min(0),
  passRatePercent: z.number().min(0).max(100),
  avgFlowDurationMs: z.number().min(0),
});

export type RegressionMetricsSample = z.infer<typeof regressionMetricsSampleSchema>;

export const regressionRunSummarySchema = z.object({
  totalDurationMs: z.number().int().min(0),
  passRatePercent: z.number().min(0).max(100),
  acceptancePercent: z.number().min(0).max(100),
  meetsAcceptance: z.boolean(),
  acceptanceMarginPercent: z.number(),
  avgFlowDurationMs: z.number().min(0),
  p50FlowDurationMs: z.number().min(0),
  p95FlowDurationMs: z.number().min(0),
  peakParallelism: z.number().int().min(0),
  totalSteps: z.number().int().min(0),
  passedSteps: z.number().int().min(0),
  failedSteps: z.number().int().min(0),
  skippedSteps: z.number().int().min(0),
});

export type RegressionRunSummary = z.infer<typeof regressionRunSummarySchema>;

export const regressionThresholdResultSchema = z.object({
  label: boundedText(128),
  pass: z.boolean(),
  expected: boundedText(128),
  actual: boundedText(128),
});

export type RegressionThresholdResult = z.infer<typeof regressionThresholdResultSchema>;

export const regressionRunStatusSchema = z.enum(['running', 'passed', 'failed', 'cancelled']);

export type RegressionRunStatus = z.infer<typeof regressionRunStatusSchema>;

export const regressionRunSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: regressionRunStatusSchema.default('running'),
  passedCount: z.number().int().min(0).default(0),
  failedCount: z.number().int().min(0).default(0),
  skippedCount: z.number().int().min(0).default(0),
  profileSnapshot: regressionProfileSchema,
  thresholdsSnapshot: regressionThresholdsSchema,
  summary: regressionRunSummarySchema.optional(),
  flowResults: z.array(regressionFlowResultSchema).default([]),
  flowTimeline: z.array(regressionFlowTimelineEntrySchema).default([]),
  samples: z.array(regressionMetricsSampleSchema).max(REGRESSION_RUN_SAMPLES_MAX).default([]),
  thresholdResults: z.array(regressionThresholdResultSchema).default([]),
});

export type RegressionRun = z.infer<typeof regressionRunSchema>;

export const regressionRunMetricsSchema = z.object({
  running: z.boolean().default(false),
  regressionId: z.string().optional(),
  runId: z.string().optional(),
  completed: z.number().int().min(0).default(0),
  total: z.number().int().min(0).default(0),
  passed: z.number().int().min(0).default(0),
  failed: z.number().int().min(0).default(0),
  skipped: z.number().int().min(0).default(0),
  activeParallelism: z.number().int().min(0).default(0),
  passRatePercent: z.number().min(0).max(100).default(0),
  acceptancePercent: z.number().min(0).max(100).default(100),
  elapsedSec: z.number().min(0).default(0),
  samples: z.array(regressionMetricsSampleSchema).max(REGRESSION_RUN_SAMPLES_MAX).default([]),
});

export type RegressionRunMetrics = z.infer<typeof regressionRunMetricsSchema>;

export const regressionStartOptionsSchema = z.object({
  regressionId: z.string().min(1),
  flowIdsOverride: z.array(z.string()).optional(),
  profileOverride: regressionProfileSchema.partial().optional(),
  selectedFlowIds: z.array(z.string()).optional(),
});

export const regressionRunProgressEventSchema = z.object({
  regressionId: z.string().min(1),
  runId: z.string().min(1),
  flowId: z.string().optional(),
  stepStatuses: z.record(z.string(), testSuiteStepStatusSchema).optional(),
  flowResult: regressionFlowResultSchema.optional(),
  flowTimeline: z.array(regressionFlowTimelineEntrySchema).optional(),
  done: z.boolean().optional(),
  run: regressionRunSchema.optional(),
});

export type RegressionRunProgressEvent = z.infer<typeof regressionRunProgressEventSchema>;

export type RegressionStartOptions = z.infer<typeof regressionStartOptionsSchema>;

/** Returns default execution profile for a regression artifact. */
export function createDefaultRegressionProfile(): RegressionProfile {
  return regressionProfileSchema.parse({});
}

/** Returns default thresholds for a regression artifact. */
export function createDefaultRegressionThresholds(): RegressionThresholds {
  return regressionThresholdsSchema.parse({});
}

/** Returns idle regression run metrics. */
export function createIdleRegressionRunMetrics(): RegressionRunMetrics {
  return regressionRunMetricsSchema.parse({});
}

/** Returns starting regression run metrics for a new run. */
export function createStartingRegressionRunMetrics(
  regressionId: string,
  runId: string,
  total: number,
  acceptancePercent: number,
): RegressionRunMetrics {
  return regressionRunMetricsSchema.parse({
    running: true,
    regressionId,
    runId,
    total,
    acceptancePercent,
  });
}
