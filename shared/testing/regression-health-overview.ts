import type { RegressionRunSummary } from './regression-run.schema';

export type RegressionHealthLevel = 'excellent' | 'good' | 'fair' | 'poor';

export interface RegressionHealthOverview {
  readonly score: number;
  readonly level: RegressionHealthLevel;
  readonly label: string;
  readonly hint: string;
}

function levelFromScore(score: number): RegressionHealthLevel {
  if (score >= 90) {
    return 'excellent';
  }
  if (score >= 75) {
    return 'good';
  }
  if (score >= 50) {
    return 'fair';
  }
  return 'poor';
}

function levelLabel(level: RegressionHealthLevel): string {
  switch (level) {
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'poor':
      return 'Poor';
  }
}

/** Builds health overview from a run summary. */
export function buildRegressionHealthOverview(
  summary: RegressionRunSummary | null | undefined,
): RegressionHealthOverview | null {
  if (!summary) {
    return null;
  }

  const acceptanceScore = Math.min(
    100,
    Math.max(0, 50 + summary.acceptanceMarginPercent * 2),
  );
  const durationPenalty =
    summary.meetsAcceptance && summary.acceptanceMarginPercent >= 0 ? 0 : 20;
  const stepTotal = summary.totalSteps;
  const stepPassRate =
    stepTotal > 0 ? (summary.passedSteps / stepTotal) * 100 : summary.passRatePercent;
  const stepScore = stepPassRate * 0.3;
  const score = Math.round(Math.min(100, Math.max(0, acceptanceScore * 0.7 + stepScore - durationPenalty)));
  const level = levelFromScore(score);

  const hint = summary.meetsAcceptance
    ? `${summary.passRatePercent.toFixed(1)}% pass rate (≥ ${summary.acceptancePercent}% required)`
    : `${summary.passRatePercent.toFixed(1)}% pass rate — below ${summary.acceptancePercent}% acceptance`;

  return {
    score,
    level,
    label: levelLabel(level),
    hint,
  };
}

/** Tag variant for health score display. */
export function regressionHealthTagVariant(
  level: RegressionHealthLevel,
): 'success' | 'warning' | 'error' | 'info' {
  switch (level) {
    case 'excellent':
    case 'good':
      return 'success';
    case 'fair':
      return 'warning';
    case 'poor':
      return 'error';
  }
}
