import type { RegressionRun } from './regression-run.schema';
import { evaluateRegressionThresholds, buildRegressionRunSummary } from './regression-metrics-aggregate';
import { classifyRegressionFlowCounts } from './regression-flake';
import { regressionRunSchema } from './regression-run.schema';
import type {
  RegressionFlowResult,
  RegressionFlowTimelineEntry,
  RegressionProfile,
  RegressionThresholds,
} from './regression-run.schema';

export interface FinalizeRegressionRunInput {
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly cancelled: boolean;
  readonly profile: RegressionProfile;
  readonly thresholds: RegressionThresholds;
  readonly flowResults: readonly RegressionFlowResult[];
  readonly flowTimeline: readonly RegressionFlowTimelineEntry[];
  readonly samples: RegressionRun['samples'];
}

/**
 * Finalizes a regression run record with summary, threshold evaluation, and status.
 */
export function finalizeRegressionRun(input: FinalizeRegressionRunInput): RegressionRun {
  const counts = classifyRegressionFlowCounts(input.flowResults);
  const passed = counts.passed;
  const failed = counts.failed;
  const skipped = counts.skipped;
  const flaked = counts.flaked;
  const totalDurationMs = Math.max(
    0,
    new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime(),
  );

  const summary = buildRegressionRunSummary(
    input.flowResults,
    totalDurationMs,
    input.thresholds.acceptancePercent,
    input.flowTimeline,
  );

  const thresholdEval = evaluateRegressionThresholds(
    passed,
    failed,
    totalDurationMs,
    summary?.p95FlowDurationMs ?? 0,
    input.thresholds,
    input.flowResults.filter((r) => r.isCritical && r.status === 'failed').length,
  );

  let status: RegressionRun['status'] = 'passed';
  if (input.cancelled) {
    status = 'cancelled';
  } else if (!thresholdEval.pass) {
    status = 'failed';
  }

  return regressionRunSchema.parse({
    id: input.runId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    status,
    passedCount: passed,
    failedCount: failed,
    skippedCount: skipped,
    flakedCount: flaked,
    profileSnapshot: input.profile,
    thresholdsSnapshot: input.thresholds,
    summary,
    flowResults: [...input.flowResults],
    flowTimeline: [...input.flowTimeline],
    samples: [...input.samples],
    thresholdResults: thresholdEval.results,
  });
}

/** Prepends a run to history capped at max. */
export function prependRegressionRun(
  runs: readonly RegressionRun[],
  run: RegressionRun,
  max = 30,
): RegressionRun[] {
  return [run, ...runs].slice(0, max);
}
