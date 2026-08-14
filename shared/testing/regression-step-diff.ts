import type { RegressionFlowResult } from './regression-run.schema';
import type { TestSuiteStepStatus } from './test-suite-steps.schema';

export interface RegressionStepDiff {
  readonly stepId: string;
  readonly stepName: string;
  readonly statusA: TestSuiteStepStatus | null;
  readonly statusB: TestSuiteStepStatus | null;
  readonly durationA: number | null;
  readonly durationB: number | null;
  readonly errorA: string | null;
  readonly errorB: string | null;
  readonly changed: boolean;
}

/** Compares step-level results between two flow results. */
export function compareRegressionStepResults(
  resultA: RegressionFlowResult | null,
  resultB: RegressionFlowResult | null,
  stepNames: Readonly<Record<string, string>> = {},
): RegressionStepDiff[] {
  const stepIds = new Set([
    ...Object.keys(resultA?.stepStatuses ?? {}),
    ...Object.keys(resultB?.stepStatuses ?? {}),
  ]);

  const diffs: RegressionStepDiff[] = [];
  for (const stepId of stepIds) {
    const statusA = resultA?.stepStatuses?.[stepId] ?? null;
    const statusB = resultB?.stepStatuses?.[stepId] ?? null;
    const durationA = resultA?.stepDurations?.[stepId] ?? null;
    const durationB = resultB?.stepDurations?.[stepId] ?? null;
    const errorA = resultA?.stepErrors?.[stepId] ?? null;
    const errorB = resultB?.stepErrors?.[stepId] ?? null;
    const changed =
      statusA !== statusB ||
      durationA !== durationB ||
      errorA !== errorB;

    diffs.push({
      stepId,
      stepName: stepNames[stepId] ?? stepId,
      statusA,
      statusB,
      durationA,
      durationB,
      errorA,
      errorB,
      changed,
    });
  }

  return diffs;
}
