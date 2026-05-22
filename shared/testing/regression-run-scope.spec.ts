import { describe, expect, it } from 'vitest';

import {
  collectFailedFlowIdsFromRun,
  filterFailedFlowIdsStillLinked,
  resolveRegressionFlowIds,
} from './regression-run-scope';
import type { RegressionRun } from './regression-run.schema';
import { createDefaultRegressionProfile } from './regression-run.schema';
import type { RegressionArtifact } from './regressions.schema';

function artifact(overrides: Partial<RegressionArtifact> = {}): RegressionArtifact {
  return {
    id: 'rg-1',
    name: 'Test',
    release: '',
    description: '',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    docs: '',
    flowIds: ['f1', 'f2', 'f3'],
    profile: createDefaultRegressionProfile(),
    thresholds: { acceptancePercent: 100 },
    runs: [],
    ...overrides,
  };
}

function runWithFailures(failedIds: string[]): RegressionRun {
  return {
    id: 'run-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    status: 'failed',
    passedCount: 0,
    failedCount: failedIds.length,
    skippedCount: 0,
    profileSnapshot: createDefaultRegressionProfile(),
    thresholdsSnapshot: { acceptancePercent: 100 },
    flowResults: failedIds.map((flowId) => ({
      flowId,
      flowName: flowId,
      status: 'failed' as const,
      durationMs: 100,
      attemptCount: 1,
      passedStepCount: 0,
      failedStepCount: 1,
      skippedStepCount: 0,
      validationFailures: [],
    })),
    flowTimeline: [],
    samples: [],
    thresholdResults: [],
  };
}

describe('collectFailedFlowIdsFromRun', () => {
  it('returns failed flow ids in run order', () => {
    const run = runWithFailures(['f2', 'f3']);
    expect(collectFailedFlowIdsFromRun(run)).toEqual(['f2', 'f3']);
  });
});

describe('resolveRegressionFlowIds', () => {
  it('uses flowIdsOverride when provided', () => {
    const ids = resolveRegressionFlowIds(artifact(), createDefaultRegressionProfile(), {
      flowIdsOverride: ['f1'],
    });
    expect(ids).toEqual(['f1']);
  });

  it('resolves failed-from-last scope', () => {
    const item = artifact({
      runs: [runWithFailures(['f2'])],
      profile: { ...createDefaultRegressionProfile(), runScope: 'failed-from-last' },
    });
    const ids = resolveRegressionFlowIds(item, item.profile);
    expect(ids).toEqual(['f2']);
  });

  it('filters selected scope to linked flow ids', () => {
    const item = artifact({
      profile: { ...createDefaultRegressionProfile(), runScope: 'selected' },
    });
    const ids = resolveRegressionFlowIds(item, item.profile, {
      selectedFlowIds: ['f2', 'missing'],
    });
    expect(ids).toEqual(['f2']);
  });
});

describe('filterFailedFlowIdsStillLinked', () => {
  it('drops failed ids no longer linked', () => {
    const item = artifact({ flowIds: ['f1'] });
    expect(filterFailedFlowIdsStillLinked(item, ['f1', 'f2'])).toEqual(['f1']);
  });
});
