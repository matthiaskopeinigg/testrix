import type { RegressionProfile, RegressionRun } from './regression-run.schema';
import type { RegressionArtifact } from './regressions.schema';

/** Flow IDs with status `failed` from a completed run, in original run order. */
export function collectFailedFlowIdsFromRun(run: RegressionRun): readonly string[] {
  return run.flowResults.filter((result) => result.status === 'failed').map((result) => result.flowId);
}

/** Resolves which flow IDs to execute for a regression run. */
export function resolveRegressionFlowIds(
  artifact: RegressionArtifact,
  profile: RegressionProfile,
  options: {
    readonly flowIdsOverride?: readonly string[];
    readonly selectedFlowIds?: readonly string[];
  } = {},
): readonly string[] {
  if (options.flowIdsOverride?.length) {
    return [...options.flowIdsOverride];
  }

  const scope = profile.runScope;
  if (scope === 'selected') {
    const selected = new Set(options.selectedFlowIds ?? []);
    return artifact.flowIds.filter((id: string) => selected.has(id));
  }

  if (scope === 'failed-from-last') {
    const lastRun = artifact.runs[0];
    if (!lastRun) {
      return [...artifact.flowIds];
    }
    const failed = new Set(collectFailedFlowIdsFromRun(lastRun));
    return artifact.flowIds.filter((id: string) => failed.has(id));
  }

  return [...artifact.flowIds];
}

/** Filters failed flow IDs to those still linked on the artifact. */
export function filterFailedFlowIdsStillLinked(
  artifact: RegressionArtifact,
  failedIds: readonly string[],
): readonly string[] {
  const linked = new Set(artifact.flowIds);
  return failedIds.filter((id) => linked.has(id));
}
