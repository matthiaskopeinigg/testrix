import type { LoadTestRunMetrics } from './load-test-run.schema';
import type { LoadTestThresholds } from './load-tests.schema';

/** Health band for a load test metric or overall run. */
export type LoadTestHealthLevel = 'good' | 'ok' | 'bad';

export interface LoadTestMetricHealth {
  readonly level: LoadTestHealthLevel;
  readonly label: 'Good' | 'OK' | 'Bad';
  readonly hint?: string;
}

export interface LoadTestHealthOverview {
  readonly level: LoadTestHealthLevel;
  readonly label: 'Good' | 'OK' | 'Bad';
  readonly score: number;
  readonly summary: string;
  readonly checks: readonly LoadTestMetricHealth[];
}

const LEVEL_LABEL: Record<LoadTestHealthLevel, 'Good' | 'OK' | 'Bad'> = {
  good: 'Good',
  ok: 'OK',
  bad: 'Bad',
};

const HEALTH_SMOOTHING_WINDOW = 6;

const METRIC_WEIGHTS = {
  throughput: 0.25,
  errorRate: 0.25,
  p95Latency: 0.2,
  successRate: 0.2,
  peakStability: 0.1,
} as const;

function health(level: LoadTestHealthLevel, hint?: string): LoadTestMetricHealth {
  return { level, label: LEVEL_LABEL[level], hint };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Maps a 0–100 score to a health band. */
export function levelFromScore(
  score: number,
  bands: { readonly good: number; readonly ok: number } = { good: 80, ok: 55 },
): LoadTestHealthLevel {
  if (score >= bands.good) {
    return 'good';
  }
  if (score >= bands.ok) {
    return 'ok';
  }
  return 'bad';
}

/** Converts a ratio (1 = on target) into a smooth 0–100 score. */
export function scoreRatio(ratio: number): number {
  if (ratio >= 1) {
    return 100;
  }
  if (ratio >= 0.85) {
    return 85 + ((ratio - 0.85) / 0.15) * 15;
  }
  if (ratio >= 0.65) {
    return 60 + ((ratio - 0.65) / 0.2) * 25;
  }
  if (ratio >= 0.4) {
    return 30 + ((ratio - 0.4) / 0.25) * 30;
  }
  return Math.max(0, (ratio / 0.4) * 30);
}

function healthFromScore(score: number, hint?: string): LoadTestMetricHealth {
  return health(levelFromScore(score), hint);
}

function throughputTarget(thresholds: LoadTestThresholds, virtualUsers: number): number {
  if (thresholds.minRequestsPerSec !== undefined) {
    return thresholds.minRequestsPerSec;
  }
  return Math.max(1, virtualUsers * 2.2);
}

function errorRateLimit(thresholds: LoadTestThresholds): number {
  return thresholds.maxErrorRatePercent ?? 3;
}

function p95LatencyLimit(thresholds: LoadTestThresholds): number {
  return thresholds.maxP95LatencyMs ?? 450;
}

function successRateTarget(thresholds: LoadTestThresholds): number {
  return thresholds.minSuccessRatePercent ?? 99;
}

/** Scores throughput on a continuous 0–100 scale. */
export function scoreThroughputHealth(
  requestsPerSec: number,
  thresholds: LoadTestThresholds,
  virtualUsers: number,
): number {
  const target = throughputTarget(thresholds, virtualUsers);
  return clampScore(scoreRatio(requestsPerSec / target));
}

/** Scores error rate on a continuous 0–100 scale. */
export function scoreErrorRateHealth(
  errorRatePercent: number,
  thresholds: LoadTestThresholds,
): number {
  const max = errorRateLimit(thresholds);
  if (errorRatePercent <= 0) {
    return 100;
  }
  return clampScore(scoreRatio(max / errorRatePercent));
}

/** Scores p95 latency on a continuous 0–100 scale. */
export function scoreP95LatencyHealth(
  p95LatencyMs: number,
  thresholds: LoadTestThresholds,
): number {
  const max = p95LatencyLimit(thresholds);
  if (p95LatencyMs <= 0) {
    return 100;
  }
  return clampScore(scoreRatio(max / p95LatencyMs));
}

/** Scores success rate on a continuous 0–100 scale. */
export function scoreSuccessRateHealth(
  successRatePercent: number,
  thresholds: LoadTestThresholds = {},
): number {
  const target = successRateTarget(thresholds);
  return clampScore(scoreRatio(successRatePercent / target));
}

/** Scores throughput stability on a continuous 0–100 scale. */
export function scorePeakThroughputHealth(
  peakRequestsPerSec: number,
  requestsPerSec: number,
  samples: LoadTestRunMetrics['samples'] = [],
): number {
  const recent = samples.slice(-8);
  if (recent.length >= 3) {
    const avgRps = mean(recent.map((sample) => sample.requestsPerSec));
    const windowPeak = Math.max(...recent.map((sample) => sample.requestsPerSec));
    if (windowPeak <= 0) {
      return 70;
    }
    return clampScore(scoreRatio(avgRps / windowPeak));
  }

  if (peakRequestsPerSec <= 0) {
    return 70;
  }

  return clampScore(scoreRatio(requestsPerSec / peakRequestsPerSec));
}

/** Evaluates throughput against thresholds or default heuristics. */
export function evaluateThroughputHealth(
  requestsPerSec: number,
  thresholds: LoadTestThresholds,
  virtualUsers: number,
): LoadTestMetricHealth {
  const score = scoreThroughputHealth(requestsPerSec, thresholds, virtualUsers);
  const target = throughputTarget(thresholds, virtualUsers);
  const hint =
    score >= 80
      ? thresholds.minRequestsPerSec !== undefined
        ? 'Meets minimum throughput'
        : undefined
      : score >= 55
        ? 'Slightly below target throughput'
        : 'Below minimum throughput';
  if (thresholds.minRequestsPerSec === undefined && requestsPerSec < target) {
    return healthFromScore(score, hint ?? `Target ~${target.toFixed(1)} rps`);
  }
  return healthFromScore(score, hint);
}

/** Evaluates error rate against thresholds or default heuristics. */
export function evaluateErrorRateHealth(
  errorRatePercent: number,
  thresholds: LoadTestThresholds,
): LoadTestMetricHealth {
  const score = scoreErrorRateHealth(errorRatePercent, thresholds);
  const hint =
    score >= 80
      ? 'Well under error budget'
      : score >= 55
        ? 'Within error budget'
        : 'Exceeded error budget';
  return healthFromScore(score, hint);
}

/** Evaluates p95 latency against thresholds or default heuristics. */
export function evaluateP95LatencyHealth(
  p95LatencyMs: number,
  thresholds: LoadTestThresholds,
): LoadTestMetricHealth {
  const score = scoreP95LatencyHealth(p95LatencyMs, thresholds);
  const hint =
    score >= 80
      ? 'Comfortably under latency budget'
      : score >= 55
        ? 'Within latency budget'
        : 'Exceeded latency budget';
  return healthFromScore(score, hint);
}

/** Evaluates success rate against thresholds or default heuristics. */
export function evaluateSuccessRateHealth(
  successRatePercent: number,
  thresholds: LoadTestThresholds = {},
): LoadTestMetricHealth {
  const score = scoreSuccessRateHealth(successRatePercent, thresholds);
  const hint =
    score >= 80
      ? thresholds.minSuccessRatePercent !== undefined
        ? 'Meets minimum success rate'
        : undefined
      : score >= 55
        ? 'Slightly below success target'
        : 'Below minimum success rate';
  return healthFromScore(score, hint);
}

/** Evaluates throughput stability using a recent sample window when available. */
export function evaluatePeakThroughputHealth(
  peakRequestsPerSec: number,
  requestsPerSec: number,
  samples: LoadTestRunMetrics['samples'] = [],
): LoadTestMetricHealth {
  const score = scorePeakThroughputHealth(peakRequestsPerSec, requestsPerSec, samples);
  const hint =
    score >= 80
      ? 'Stable throughput'
      : score >= 55
        ? 'Some throughput variance'
        : 'Throughput falling in recent window';
  return healthFromScore(score, hint);
}

/** Averages recent samples so live health checks do not flicker on each poll. */
export function smoothLoadTestMetricsForHealth(metrics: LoadTestRunMetrics): LoadTestRunMetrics {
  const recent = metrics.samples.slice(-HEALTH_SMOOTHING_WINDOW);
  if (recent.length < 2) {
    return metrics;
  }

  const avgErrorRatePercent = mean(recent.map((sample) => sample.errorRatePercent));

  return {
    ...metrics,
    requestsPerSec: mean(recent.map((sample) => sample.requestsPerSec)),
    errorRatePercent: avgErrorRatePercent,
    successRatePercent: Math.max(0, 100 - avgErrorRatePercent),
    latencyMs: {
      ...metrics.latencyMs,
      avg: Math.round(mean(recent.map((sample) => sample.avgLatencyMs))),
      p50: Math.round(mean(recent.map((sample) => sample.p50LatencyMs))),
      p95: Math.round(mean(recent.map((sample) => sample.p95LatencyMs))),
    },
  };
}

function weightedHealthScore(scores: readonly number[]): number {
  return clampScore(
    scores[0]! * METRIC_WEIGHTS.throughput +
      scores[1]! * METRIC_WEIGHTS.errorRate +
      scores[2]! * METRIC_WEIGHTS.p95Latency +
      scores[3]! * METRIC_WEIGHTS.successRate +
      scores[4]! * METRIC_WEIGHTS.peakStability,
  );
}

/** Builds an overall health summary from individual metric checks. */
export function buildLoadTestHealthOverview(
  metrics: LoadTestRunMetrics,
  thresholds: LoadTestThresholds,
): LoadTestHealthOverview {
  const smoothed = smoothLoadTestMetricsForHealth(metrics);
  const scores = [
    scoreThroughputHealth(smoothed.requestsPerSec, thresholds, smoothed.virtualUsers),
    scoreErrorRateHealth(smoothed.errorRatePercent, thresholds),
    scoreP95LatencyHealth(smoothed.latencyMs.p95, thresholds),
    scoreSuccessRateHealth(smoothed.successRatePercent, thresholds),
    scorePeakThroughputHealth(
      metrics.peakRequestsPerSec,
      smoothed.requestsPerSec,
      metrics.samples,
    ),
  ] as const;

  const checks: LoadTestMetricHealth[] = [
    evaluateThroughputHealth(smoothed.requestsPerSec, thresholds, smoothed.virtualUsers),
    evaluateErrorRateHealth(smoothed.errorRatePercent, thresholds),
    evaluateP95LatencyHealth(smoothed.latencyMs.p95, thresholds),
    evaluateSuccessRateHealth(smoothed.successRatePercent, thresholds),
    evaluatePeakThroughputHealth(
      metrics.peakRequestsPerSec,
      smoothed.requestsPerSec,
      metrics.samples,
    ),
  ];

  const score = weightedHealthScore(scores);
  const level = levelFromScore(score, { good: 85, ok: 65 });

  const summary =
    level === 'good'
      ? 'All key metrics look healthy for this run.'
      : level === 'ok'
        ? 'Mixed signals — some metrics are borderline.'
        : 'One or more metrics need attention.';

  return {
    level,
    label: LEVEL_LABEL[level],
    score,
    summary,
    checks,
  };
}

/** Returns a zero-score health overview before the first sample arrives. */
export function buildStartingLoadTestHealthOverview(): LoadTestHealthOverview {
  return {
    level: 'ok',
    label: 'OK',
    score: 0,
    summary: 'Collecting first samples…',
    checks: [],
  };
}

/** Returns a zero-score health overview when no run data is available. */
export function buildEmptyLoadTestHealthOverview(): LoadTestHealthOverview {
  return {
    level: 'ok',
    label: 'OK',
    score: 0,
    summary: 'No run data yet. Start a load test to populate this dashboard.',
    checks: [],
  };
}

/** Maps health level to tx-tag variant. */
export function loadTestHealthTagVariant(
  level: LoadTestHealthLevel,
): 'success' | 'warning' | 'error' {
  if (level === 'good') {
    return 'success';
  }
  if (level === 'ok') {
    return 'warning';
  }
  return 'error';
}
