import { describe, expect, it } from 'vitest';

import {
  REGRESSION_RUN_SAMPLES_MAX,
  emptyRegressionArtifact,
  normalizeRegressionSection,
  parseRegressionsFile,
  regressionDurationStats,
  regressionRunPassRate,
} from './regressions-file';

describe('parseRegressionsFile', () => {
  it('migrates legacy flowIds into pack entries', () => {
    const file = parseRegressionsFile({
      schemaVersion: 1,
      items: [
        {
          kind: 'artifact',
          id: 'reg_1',
          name: 'Checkout',
          updatedAt: '2026-01-01T00:00:00.000Z',
          flowIds: ['flow_a', 'flow_b'],
          virtualUsers: 5,
          durationSec: 30,
          maxErrorRate: 0.1,
          runs: [
            {
              id: 'old_1',
              at: '2026-01-01T00:00:00.000Z',
              durationMs: 1200,
              virtualUsers: 1,
              requests: 2,
              errors: 1,
              p50Ms: 100,
              p95Ms: 200,
              p99Ms: 300,
              rps: 1,
              error: '1 flow(s) failed',
            },
          ],
        },
      ],
    });

    const artifact = file.items[0];
    expect(artifact?.kind).toBe('artifact');
    if (artifact?.kind !== 'artifact')
      return;
    expect(artifact.entries).toHaveLength(2);
    expect(artifact.entries[0]?.flowId).toBe('flow_a');
    expect(artifact.entries[0]?.scenarioId).toBeNull();
    expect(artifact.environmentId).toBeNull();
    expect(artifact.executionMode).toBe('parallel');
    expect(artifact.maxParallelism).toBe(4);
    expect(artifact.stopOnFirstFailure).toBe(false);
    expect(emptyRegressionArtifact().maxParallelism).toBe(4);
    expect(artifact.runs[0]?.status).toBe('failed');
    expect(artifact.runs[0]?.failed).toBe(1);
    expect(artifact.runs[0]?.entries).toEqual([]);
    expect(artifact.runs[0]?.samples).toEqual([]);
    expect(artifact.runs[0]?.flowTimeline).toEqual([]);
  });

  it('normalizes legacy section ids', () => {
    expect(normalizeRegressionSection('flows')).toBe('pack');
    expect(normalizeRegressionSection('results')).toBe('overview');
    expect(normalizeRegressionSection('runs')).toBe('overview');
    expect(normalizeRegressionSection('docs')).toBe('docs');
    expect(normalizeRegressionSection('pack')).toBe('pack');
  });

  it('parses linkedFolderId and defaults to null', () => {
    const withFolder = parseRegressionsFile({
      items: [
        {
          kind: 'artifact',
          id: 'reg_2',
          name: 'Suite',
          updatedAt: '2026-01-01T00:00:00.000Z',
          linkedFolderId: 'folder_a',
          entries: [{ id: 'e1', flowId: 'flow_a', scenarioId: null, enabled: true }],
        },
      ],
    });
    const artifact = withFolder.items[0];
    expect(artifact?.kind).toBe('artifact');
    if (artifact?.kind !== 'artifact')
      return;
    expect(artifact.linkedFolderId).toBe('folder_a');
    expect(emptyRegressionArtifact().linkedFolderId).toBeNull();
  });

  it('computes pass rate from suite counts', () => {
    const empty = emptyRegressionArtifact();
    const run = {
      id: 'r1',
      at: empty.updatedAt,
      durationMs: 10,
      status: 'passed' as const,
      passed: 3,
      failed: 1,
      skipped: 0,
      environmentId: null,
      release: '',
      error: null,
      entries: [],
      samples: [],
      flowTimeline: [],
    };
    expect(regressionRunPassRate(run)).toBe(0.75);
  });

  it('parses samples, timeline, and duration summary fields', () => {
    const file = parseRegressionsFile({
      items: [
        {
          kind: 'artifact',
          id: 'reg_3',
          name: 'Suite',
          updatedAt: '2026-01-01T00:00:00.000Z',
          entries: [{ id: 'e1', flowId: 'flow_a', scenarioId: null, enabled: true }],
          runs: [
            {
              id: 'run_1',
              at: '2026-01-01T00:00:00.000Z',
              durationMs: 5_000,
              status: 'passed',
              passed: 2,
              failed: 0,
              skipped: 0,
              entries: [],
              avgDurationMs: 1_200,
              p95DurationMs: 1_800,
              samples: [
                {
                  elapsedSec: 1,
                  completedFlows: 1,
                  passedFlows: 1,
                  failedFlows: 0,
                  skippedFlows: 0,
                  activeParallelism: 1,
                  passRatePercent: 100,
                  avgFlowDurationMs: 1_000,
                },
              ],
              flowTimeline: [
                {
                  flowId: 'flow_a',
                  flowName: 'Flow A',
                  workerSlot: 0,
                  startedAtOffsetMs: 0,
                  durationMs: 1_200,
                  status: 'ok',
                },
                { flowName: 'no id, dropped', durationMs: 5 },
              ],
            },
          ],
        },
      ],
    });
    const artifact = file.items[0];
    if (artifact?.kind !== 'artifact')
      throw new Error('expected artifact');
    const run = artifact.runs[0]!;
    expect(run.samples).toHaveLength(1);
    expect(run.samples[0]?.passRatePercent).toBe(100);
    expect(run.flowTimeline).toHaveLength(1);
    expect(run.flowTimeline[0]?.status).toBe('ok');
    expect(run.avgDurationMs).toBe(1_200);
    expect(run.p95DurationMs).toBe(1_800);
  });

  it('caps stored samples at the sample maximum', () => {
    const samples = Array.from({ length: REGRESSION_RUN_SAMPLES_MAX + 40 }, (_, index) => ({
      elapsedSec: index,
      completedFlows: index,
      passedFlows: index,
      failedFlows: 0,
      skippedFlows: 0,
      activeParallelism: 1,
      passRatePercent: 100,
      avgFlowDurationMs: 10,
    }));
    const file = parseRegressionsFile({
      items: [
        {
          kind: 'artifact',
          id: 'reg_4',
          name: 'Suite',
          updatedAt: '2026-01-01T00:00:00.000Z',
          runs: [
            {
              id: 'run_2',
              at: '2026-01-01T00:00:00.000Z',
              durationMs: 1,
              status: 'passed',
              passed: 1,
              failed: 0,
              skipped: 0,
              entries: [],
              samples,
            },
          ],
        },
      ],
    });
    const artifact = file.items[0];
    if (artifact?.kind !== 'artifact')
      throw new Error('expected artifact');
    expect(artifact.runs[0]?.samples).toHaveLength(REGRESSION_RUN_SAMPLES_MAX);
    // Keeps the most recent window.
    expect(artifact.runs[0]?.samples[REGRESSION_RUN_SAMPLES_MAX - 1]?.elapsedSec).toBe(
      REGRESSION_RUN_SAMPLES_MAX + 39,
    );
  });

  it('computes average and p95 duration stats', () => {
    expect(regressionDurationStats([])).toEqual({ avgMs: 0, p95Ms: 0 });
    const stats = regressionDurationStats([100, 200, 300, 400, 500]);
    expect(stats.avgMs).toBe(300);
    expect(stats.p95Ms).toBe(500);
  });
});
