import { z } from 'zod';

import {
  loadTestLatencySnapshotSchema,
  loadTestMetricsSampleSchema,
} from './load-test-run.schema';

const boundedText = (max: number) => z.string().max(max);

/** Maximum completed runs stored per load test artifact. */
export const LOAD_TEST_RUN_HISTORY_MAX = 30;

/** Maximum time-series samples stored on each run record. */
export const LOAD_TEST_RUN_SAMPLES_MAX = 60;

export const loadTestProfileSchema = z.object({
  durationSec: z.number().int().min(1).max(86_400).default(60),
  virtualUsers: z.number().int().min(1).max(10_000).default(10),
  rampUpSec: z.number().int().min(0).default(0),
});

export type LoadTestProfile = z.infer<typeof loadTestProfileSchema>;

export const loadTestThresholdsSchema = z.object({
  maxErrorRatePercent: z.number().min(0).max(100).optional(),
  minSuccessRatePercent: z.number().min(0).max(100).optional(),
  maxP95LatencyMs: z.number().int().min(0).optional(),
  minRequestsPerSec: z.number().min(0).optional(),
});

export type LoadTestThresholds = z.infer<typeof loadTestThresholdsSchema>;

export const loadTestRunSummarySchema = z.object({
  successRatePercent: z.number().min(0).max(100),
  errorRatePercent: z.number().min(0).max(100),
  requestsPerSec: z.number().min(0),
  peakRequestsPerSec: z.number().min(0),
  totalRequests: z.number().int().min(0),
  failedRequests: z.number().int().min(0),
  latencyMs: loadTestLatencySnapshotSchema,
  elapsedSec: z.number().min(0),
  virtualUsers: z.number().int().min(0),
});

export type LoadTestRunSummary = z.infer<typeof loadTestRunSummarySchema>;

export const loadTestThresholdResultSchema = z.object({
  label: boundedText(128),
  pass: z.boolean(),
  expected: boundedText(128),
  actual: boundedText(128),
});

export type LoadTestThresholdResult = z.infer<typeof loadTestThresholdResultSchema>;

export const loadTestRunStatusSchema = z.enum(['running', 'passed', 'failed', 'cancelled']);

export type LoadTestRunStatus = z.infer<typeof loadTestRunStatusSchema>;

export const loadTestRunRecordSchema = z.object({
  id: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: loadTestRunStatusSchema.default('running'),
  profileSnapshot: loadTestProfileSchema,
  thresholdsSnapshot: loadTestThresholdsSchema.default({}),
  summary: loadTestRunSummarySchema,
  samples: z.array(loadTestMetricsSampleSchema).max(LOAD_TEST_RUN_SAMPLES_MAX).default([]),
  thresholdResults: z.array(loadTestThresholdResultSchema).default([]),
});

export type LoadTestRunRecord = z.infer<typeof loadTestRunRecordSchema>;

export const loadTestArtifactSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  description: boundedText(4_000).default(''),
  docs: boundedText(32_000).default(''),
  targetRequestId: z.string().optional(),
  profile: loadTestProfileSchema,
  thresholds: loadTestThresholdsSchema.default({}),
  runs: z.array(loadTestRunRecordSchema).max(LOAD_TEST_RUN_HISTORY_MAX).default([]),
  updatedAt: z.string(),
});

export type LoadTestArtifact = z.infer<typeof loadTestArtifactSchema>;

function folderChildrenAreArtifactsOnly(children: readonly LoadTestTreeItem[]): boolean {
  for (const child of children) {
    if (!('profile' in child)) {
      return false;
    }
  }
  return true;
}

export const loadTestFolderSchema: z.ZodType<LoadTestFolder> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      name: boundedText(256),
      children: z.array(loadTestTreeItemSchema).default([]),
      updatedAt: z.string(),
    })
    .superRefine((folder, ctx) => {
      if (!folderChildrenAreArtifactsOnly(folder.children)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Load test folders may only contain load test artifacts (no nested folders).',
          path: ['children'],
        });
      }
    }),
);

export type LoadTestFolder = {
  readonly id: string;
  readonly name: string;
  readonly children: readonly LoadTestTreeItem[];
  readonly updatedAt: string;
};

export const loadTestTreeItemSchema = z.union([loadTestArtifactSchema, loadTestFolderSchema]);

export type LoadTestTreeItem = LoadTestFolder | LoadTestArtifact;

export const loadTestsFileSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(loadTestTreeItemSchema).default([]),
});

export type LoadTestsFile = z.infer<typeof loadTestsFileSchema>;

/** Returns default thresholds for a load test artifact. */
export function createDefaultLoadTestThresholds(): LoadTestThresholds {
  return loadTestThresholdsSchema.parse({});
}

/** Returns default profile for a load test artifact. */
export function createDefaultLoadTestProfile(): LoadTestProfile {
  return loadTestProfileSchema.parse({});
}

/**
 * Returns an empty load tests workspace file.
 */
export function createDefaultLoadTestsFile(): LoadTestsFile {
  return loadTestsFileSchema.parse({ schemaVersion: 1, items: [] });
}
