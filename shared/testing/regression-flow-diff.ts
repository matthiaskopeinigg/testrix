import type { RegressionFlowResult } from './regression-run.schema';

export type RegressionFlowChangeType =
  | 'new_failure'
  | 'fixed'
  | 'still_failing'
  | 'skipped_change'
  | 'added'
  | 'removed'
  | 'unchanged'
  | 'duration_regression'
  | 'duration_improvement';

export interface RegressionFlowDiff {
  readonly flowId: string;
  readonly flowName: string;
  readonly statusA: RegressionFlowResult['status'] | null;
  readonly statusB: RegressionFlowResult['status'] | null;
  readonly durationA: number | null;
  readonly durationB: number | null;
  readonly durationDeltaMs: number | null;
  readonly changeType: RegressionFlowChangeType;
}

const PASS = new Set(['passed']);
const FAIL = new Set(['failed']);

function classifyStatusChange(
  statusA: RegressionFlowResult['status'] | null,
  statusB: RegressionFlowResult['status'] | null,
): RegressionFlowChangeType {
  if (statusA === null && statusB !== null) {
    return 'added';
  }
  if (statusA !== null && statusB === null) {
    return 'removed';
  }
  if (statusA === statusB) {
    return statusA && FAIL.has(statusA) ? 'still_failing' : 'unchanged';
  }
  if (statusA && PASS.has(statusA) && statusB && FAIL.has(statusB)) {
    return 'new_failure';
  }
  if (statusA && FAIL.has(statusA) && statusB && PASS.has(statusB)) {
    return 'fixed';
  }
  if (statusA !== statusB) {
    return 'skipped_change';
  }
  return 'unchanged';
}

/** Compares flow results between two runs keyed by flowId. */
export function compareRegressionFlowResults(
  resultsA: readonly RegressionFlowResult[],
  resultsB: readonly RegressionFlowResult[],
  durationRegressionThresholdPercent = 20,
): RegressionFlowDiff[] {
  const mapA = new Map(resultsA.map((r) => [r.flowId, r]));
  const mapB = new Map(resultsB.map((r) => [r.flowId, r]));
  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const diffs: RegressionFlowDiff[] = [];

  for (const flowId of allIds) {
    const a = mapA.get(flowId);
    const b = mapB.get(flowId);
    const statusA = a?.status ?? null;
    const statusB = b?.status ?? null;
    let changeType = classifyStatusChange(statusA, statusB);

    const durationA = a?.durationMs ?? null;
    const durationB = b?.durationMs ?? null;
    let durationDeltaMs =
      durationA !== null && durationB !== null ? durationB - durationA : null;

    if (
      changeType === 'unchanged' &&
      durationA !== null &&
      durationB !== null &&
      durationA > 0
    ) {
      const pctChange = ((durationB - durationA) / durationA) * 100;
      if (pctChange >= durationRegressionThresholdPercent) {
        changeType = 'duration_regression';
      } else if (pctChange <= -durationRegressionThresholdPercent) {
        changeType = 'duration_improvement';
      }
    }

    diffs.push({
      flowId,
      flowName: b?.flowName ?? a?.flowName ?? flowId,
      statusA,
      statusB,
      durationA,
      durationB,
      durationDeltaMs,
      changeType,
    });
  }

  return diffs.sort((x, y) => x.flowName.localeCompare(y.flowName));
}

/** Filters flow diffs to changed entries only. */
export function filterRegressionFlowDiffs(
  diffs: readonly RegressionFlowDiff[],
  filter: 'all' | 'changed' | 'regressions' | 'improvements' | 'new_failures',
): RegressionFlowDiff[] {
  if (filter === 'all') {
    return [...diffs];
  }
  return diffs.filter((d) => {
    switch (filter) {
      case 'changed':
        return d.changeType !== 'unchanged';
      case 'regressions':
        return (
          d.changeType === 'new_failure' ||
          d.changeType === 'still_failing' ||
          d.changeType === 'duration_regression'
        );
      case 'improvements':
        return d.changeType === 'fixed' || d.changeType === 'duration_improvement';
      case 'new_failures':
        return d.changeType === 'new_failure';
      default:
        return true;
    }
  });
}
