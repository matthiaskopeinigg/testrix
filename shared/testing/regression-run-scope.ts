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
    readonly existingFlowIds?: readonly string[];
  } = {},
): readonly string[] {
  let resolved: string[];
  if (options.flowIdsOverride?.length) {
    resolved = [...options.flowIdsOverride];
  } else {
    const scope = profile.runScope;
    if (scope === 'selected') {
      const selected = new Set(options.selectedFlowIds ?? []);
      resolved = artifact.flowIds.filter((id: string) => selected.has(id));
    } else if (scope === 'failed-from-last') {
      const lastRun = artifact.runs[0];
      if (!lastRun) {
        resolved = [...artifact.flowIds];
      } else {
        const failed = new Set(collectFailedFlowIdsFromRun(lastRun));
        resolved = artifact.flowIds.filter((id: string) => failed.has(id));
      }
    } else {
      resolved = [...artifact.flowIds];
    }
  }

  if (!options.existingFlowIds) {
    return resolved;
  }
  const existing = new Set(options.existingFlowIds);
  return resolved.filter((id) => existing.has(id));
}

/** Filters failed flow IDs to those still linked on the artifact. */
export function filterFailedFlowIdsStillLinked(
  artifact: RegressionArtifact,
  failedIds: readonly string[],
): readonly string[] {
  const linked = new Set(artifact.flowIds);
  return failedIds.filter((id) => linked.has(id));
}
