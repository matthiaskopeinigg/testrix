import { z } from 'zod';

export const loadTestStartOptionsSchema = z.object({
  virtualUsers: z.number().int().min(1).max(10_000).default(10),
  durationSec: z.number().int().min(1).max(86_400).default(60),
  rampUpSec: z.number().int().min(0).default(0),
});

export type LoadTestStartOptions = z.infer<typeof loadTestStartOptionsSchema>;

export const loadTestMetricsSampleSchema = z.object({
  elapsedSec: z.number().min(0),
  virtualUsers: z.number().int().min(0),
  requestsPerSec: z.number().min(0),
  errorRatePercent: z.number().min(0).max(100),
  p50LatencyMs: z.number().min(0),
  p95LatencyMs: z.number().min(0),
  avgLatencyMs: z.number().min(0),
});

export type LoadTestMetricsSample = z.infer<typeof loadTestMetricsSampleSchema>;

export const loadTestLatencySnapshotSchema = z.object({
  avg: z.number().min(0),
  p50: z.number().min(0),
  p95: z.number().min(0),
  p99: z.number().min(0),
});

export type LoadTestLatencySnapshot = z.infer<typeof loadTestLatencySnapshotSchema>;

export const loadTestRunMetricsSchema = z.object({
  running: z.boolean(),
  elapsedSec: z.number().min(0),
  virtualUsers: z.number().int().min(0),
  totalRequests: z.number().int().min(0),
  failedRequests: z.number().int().min(0),
  successRatePercent: z.number().min(0).max(100),
  requestsPerSec: z.number().min(0),
  peakRequestsPerSec: z.number().min(0),
  errorRatePercent: z.number().min(0).max(100),
  latencyMs: loadTestLatencySnapshotSchema,
  samples: z.array(loadTestMetricsSampleSchema).max(180),
});

export type LoadTestRunMetrics = z.infer<typeof loadTestRunMetricsSchema>;

/** Returns idle load test metrics with no samples. */
export function createIdleLoadTestRunMetrics(): LoadTestRunMetrics {
  return loadTestRunMetricsSchema.parse({
    running: false,
    elapsedSec: 0,
    virtualUsers: 0,
    totalRequests: 0,
    failedRequests: 0,
    successRatePercent: 100,
    requestsPerSec: 0,
    peakRequestsPerSec: 0,
    errorRatePercent: 0,
    latencyMs: { avg: 0, p50: 0, p95: 0, p99: 0 },
    samples: [],
  });
}

/** Returns zeroed metrics for a newly started run before the first sample tick. */
export function createStartingLoadTestRunMetrics(): LoadTestRunMetrics {
  return loadTestRunMetricsSchema.parse({
    running: true,
    elapsedSec: 0,
    virtualUsers: 0,
    totalRequests: 0,
    failedRequests: 0,
    successRatePercent: 0,
    requestsPerSec: 0,
    peakRequestsPerSec: 0,
    errorRatePercent: 0,
    latencyMs: { avg: 0, p50: 0, p95: 0, p99: 0 },
    samples: [],
  });
}
