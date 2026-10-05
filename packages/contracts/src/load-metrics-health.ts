import type { LoadArtifactFields, LoadMetricSample } from './load-file';

/** Health band for a load metric or overall run. */
export type LoadHealthLevel = 'good' | 'ok' | 'bad';

export interface LoadMetricHealth {
  readonly level: LoadHealthLevel;
  readonly label: 'Good' | 'OK' | 'Bad';
  readonly hint?: string;
}

export interface LoadHealthOverview {
  readonly level: LoadHealthLevel;
  readonly label: 'Good' | 'OK' | 'Bad';
  readonly score: number;
  readonly summary: string;
  readonly checks: readonly LoadMetricHealth[];
}

/**
 * Metrics snapshot used to score run health.
 *
 * Uses 2.0 flat field names so both live metrics and run records can be mapped
 * into it without renaming the whole live API to the 1.0 shape.
 */
export interface LoadHealthMetrics {
  readonly rps: number;
  readonly peakRps: number;
  readonly errorRatePercent: number;
  readonly successRatePercent: number;
  readonly virtualUsers: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly samples: readonly LoadMetricSample[];
}

/** Normalized threshold targets used to score health. */
export interface LoadHealthThresholds {
  readonly maxErrorRate?: number;
  readonly maxP95Ms?: number;
  readonly minSuccessRate?: number;
  readonly minRps?: number;
}

const LEVEL_LABEL: Record<LoadHealthLevel, 'Good' | 'OK' | 'Bad'> = {
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

function health(level: LoadHealthLevel, hint?: string): LoadMetricHealth {
  return { level, label: LEVEL_LABEL[level], hint };
}

function mean(values: readonly number[]): number {
  if (values.length === 0)
    return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sampleErrorRate(sample: LoadMetricSample): number {
  if (typeof sample.errorRatePercent === 'number')
    return sample.errorRatePercent;
  return sample.requests === 0 ? 0 : (sample.errors / sample.requests) * 100;
}

/** Builds normalized health thresholds from an artifact, dropping disabled mins. */
export function loadHealthThresholdsOf(
  artifact: Pick<LoadArtifactFields, 'maxErrorRate' | 'maxP95Ms' | 'minSuccessRate' | 'minRps'>,
): LoadHealthThresholds {
  return {
    maxErrorRate: artifact.maxErrorRate,
    maxP95Ms: artifact.maxP95Ms,
    ...(artifact.minSuccessRate > 0 ? { minSuccessRate: artifact.minSuccessRate } : {}),
    ...(artifact.minRps > 0 ? { minRps: artifact.minRps } : {}),
  };
}

/** Maps a 0–100 score to a health band. */
export function levelFromScore(
  score: number,
  bands: { readonly good: number; readonly ok: number } = { good: 80, ok: 55 },
): LoadHealthLevel {
  if (score >= bands.good)
    return 'good';
  if (score >= bands.ok)
    return 'ok';
  return 'bad';
}

/** Converts a ratio (1 = on target) into a smooth 0–100 score. */
export function scoreRatio(ratio: number): number {
  if (ratio >= 1)
    return 100;
  if (ratio >= 0.85)
    return 85 + ((ratio - 0.85) / 0.15) * 15;
  if (ratio >= 0.65)
    return 60 + ((ratio - 0.65) / 0.2) * 25;
  if (ratio >= 0.4)
    return 30 + ((ratio - 0.4) / 0.25) * 30;
  return Math.max(0, (ratio / 0.4) * 30);
}

function healthFromScore(score: number, hint?: string): LoadMetricHealth {
  return health(levelFromScore(score), hint);
}

function throughputTarget(thresholds: LoadHealthThresholds, virtualUsers: number): number {
  if (thresholds.minRps !== undefined)
    return thresholds.minRps;
  return Math.max(1, virtualUsers * 2.2);
}

function errorRateLimit(thresholds: LoadHealthThresholds): number {
  return thresholds.maxErrorRate ?? 3;
}

function p95LatencyLimit(thresholds: LoadHealthThresholds): number {
  return thresholds.maxP95Ms ?? 450;
}

function successRateTarget(thresholds: LoadHealthThresholds): number {
  return thresholds.minSuccessRate ?? 99;
}

/** Scores throughput on a continuous 0–100 scale. */
export function scoreThroughputHealth(
  rps: number,
  thresholds: LoadHealthThresholds,
  virtualUsers: number,
): number {
  const target = throughputTarget(thresholds, virtualUsers);
  return clampScore(scoreRatio(rps / target));
}

/** Scores error rate on a continuous 0–100 scale. */
export function scoreErrorRateHealth(errorRatePercent: number, thresholds: LoadHealthThresholds): number {
  const max = errorRateLimit(thresholds);
  if (errorRatePercent <= 0)
    return 100;
  return clampScore(scoreRatio(max / errorRatePercent));
}

/** Scores p95 latency on a continuous 0–100 scale. */
export function scoreP95LatencyHealth(p95Ms: number, thresholds: LoadHealthThresholds): number {
  const max = p95LatencyLimit(thresholds);
  if (p95Ms <= 0)
    return 100;
  return clampScore(scoreRatio(max / p95Ms));
}

/** Scores success rate on a continuous 0–100 scale. */
export function scoreSuccessRateHealth(
  successRatePercent: number,
  thresholds: LoadHealthThresholds = {},
): number {
  const target = successRateTarget(thresholds);
  return clampScore(scoreRatio(successRatePercent / target));
}

/** Scores throughput stability on a continuous 0–100 scale. */
export function scorePeakThroughputHealth(
  peakRps: number,
  rps: number,
  samples: readonly LoadMetricSample[] = [],
): number {
  const recent = samples.slice(-8);
  if (recent.length >= 3) {
    const avgRps = mean(recent.map((sample) => sample.rps));
    const windowPeak = Math.max(...recent.map((sample) => sample.rps));
    if (windowPeak <= 0)
      return 70;
    return clampScore(scoreRatio(avgRps / windowPeak));
  }
  if (peakRps <= 0)
    return 70;
  return clampScore(scoreRatio(rps / peakRps));
}

/** Evaluates throughput against thresholds or default heuristics. */
export function evaluateThroughputHealth(
  rps: number,
  thresholds: LoadHealthThresholds,
  virtualUsers: number,
): LoadMetricHealth {
  const score = scoreThroughputHealth(rps, thresholds, virtualUsers);
  const target = throughputTarget(thresholds, virtualUsers);
  const hint =
    score >= 80
      ? thresholds.minRps !== undefined
        ? 'Meets minimum throughput'
        : undefined
      : score >= 55
        ? 'Slightly below target throughput'
        : 'Below minimum throughput';
  if (thresholds.minRps === undefined && rps < target)
    return healthFromScore(score, hint ?? `Target ~${target.toFixed(1)} rps`);
  return healthFromScore(score, hint);
}

/** Evaluates error rate against thresholds or default heuristics. */
export function evaluateErrorRateHealth(
  errorRatePercent: number,
  thresholds: LoadHealthThresholds,
): LoadMetricHealth {
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
  p95Ms: number,
  thresholds: LoadHealthThresholds,
): LoadMetricHealth {
  const score = scoreP95LatencyHealth(p95Ms, thresholds);
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
  thresholds: LoadHealthThresholds = {},
): LoadMetricHealth {
  const score = scoreSuccessRateHealth(successRatePercent, thresholds);
  const hint =
    score >= 80
      ? thresholds.minSuccessRate !== undefined
        ? 'Meets minimum success rate'
        : undefined
      : score >= 55
        ? 'Slightly below success target'
        : 'Below minimum success rate';
  return healthFromScore(score, hint);
}

/** Evaluates throughput stability using a recent sample window when available. */
export function evaluatePeakThroughputHealth(
  peakRps: number,
  rps: number,
  samples: readonly LoadMetricSample[] = [],
): LoadMetricHealth {
  const score = scorePeakThroughputHealth(peakRps, rps, samples);
  const hint =
    score >= 80
      ? 'Stable throughput'
      : score >= 55
        ? 'Some throughput variance'
        : 'Throughput falling in recent window';
  return healthFromScore(score, hint);
}

/** Averages recent samples so live health checks do not flicker on each poll. */
export function smoothLoadMetricsForHealth(metrics: LoadHealthMetrics): LoadHealthMetrics {
  const recent = metrics.samples.slice(-HEALTH_SMOOTHING_WINDOW);
  if (recent.length < 2)
    return metrics;
  const avgErrorRatePercent = mean(recent.map(sampleErrorRate));
  return {
    ...metrics,
    rps: mean(recent.map((sample) => sample.rps)),
    errorRatePercent: avgErrorRatePercent,
    successRatePercent: Math.max(0, 100 - avgErrorRatePercent),
    avgMs: Math.round(mean(recent.map((sample) => sample.avgMs ?? 0))),
    p50Ms: Math.round(mean(recent.map((sample) => sample.p50Ms))),
    p95Ms: Math.round(mean(recent.map((sample) => sample.p95Ms))),
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
export function buildLoadHealthOverview(
  metrics: LoadHealthMetrics,
  thresholds: LoadHealthThresholds,
): LoadHealthOverview {
  const smoothed = smoothLoadMetricsForHealth(metrics);
  const scores = [
    scoreThroughputHealth(smoothed.rps, thresholds, smoothed.virtualUsers),
    scoreErrorRateHealth(smoothed.errorRatePercent, thresholds),
    scoreP95LatencyHealth(smoothed.p95Ms, thresholds),
    scoreSuccessRateHealth(smoothed.successRatePercent, thresholds),
    scorePeakThroughputHealth(metrics.peakRps, smoothed.rps, metrics.samples),
  ] as const;

  const checks: LoadMetricHealth[] = [
    evaluateThroughputHealth(smoothed.rps, thresholds, smoothed.virtualUsers),
    evaluateErrorRateHealth(smoothed.errorRatePercent, thresholds),
    evaluateP95LatencyHealth(smoothed.p95Ms, thresholds),
    evaluateSuccessRateHealth(smoothed.successRatePercent, thresholds),
    evaluatePeakThroughputHealth(metrics.peakRps, smoothed.rps, metrics.samples),
  ];

  const score = weightedHealthScore(scores);
  const level = levelFromScore(score, { good: 85, ok: 65 });

  const summary =
    level === 'good'
      ? 'All key metrics look healthy for this run.'
      : level === 'ok'
        ? 'Mixed signals — some metrics are borderline.'
        : 'One or more metrics need attention.';

  return { level, label: LEVEL_LABEL[level], score, summary, checks };
}

/** Returns a zero-score overview before the first sample arrives. */
export function buildStartingLoadHealthOverview(): LoadHealthOverview {
  return {
    level: 'ok',
    label: 'OK',
    score: 0,
    summary: 'Collecting first samples…',
    checks: [],
  };
}

/** Returns a zero-score overview when no run data is available. */
export function buildEmptyLoadHealthOverview(): LoadHealthOverview {
  return {
    level: 'ok',
    label: 'OK',
    score: 0,
    summary: 'No run data yet. Start a load test to populate this dashboard.',
    checks: [],
  };
}

/** Maps a health level to a stat-card tone. */
export function loadHealthTagTone(level: LoadHealthLevel): 'success' | 'warning' | 'error' {
  if (level === 'good')
    return 'success';
  if (level === 'ok')
    return 'warning';
  return 'error';
}
