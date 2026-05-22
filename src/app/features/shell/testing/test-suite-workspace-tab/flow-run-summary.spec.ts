import { describe, expect, it } from 'vitest';

import { createFlowStep } from '@shared/testing';

import { buildFlowRunProgress, buildFlowRunSummary } from './flow-run-summary';

describe('buildFlowRunProgress', () => {
  it('returns null when there are no enabled steps', () => {
    expect(buildFlowRunProgress([], {})).toBeNull();
  });

  it('counts completed enabled steps from live statuses', () => {
    const passed = { ...createFlowStep('WAIT', 'Wait'), id: 's1', enabled: true };
    const running = { ...createFlowStep('REQUEST', 'Req'), id: 's2', enabled: true };

    expect(
      buildFlowRunProgress([passed, running], {
        s1: 'passed',
        s2: 'running',
      }),
    ).toEqual({
      total: 2,
      completed: 1,
      percent: 50,
    });
  });
});

describe('buildFlowRunSummary', () => {
  it('returns null when the flow has never run', () => {
    expect(
      buildFlowRunSummary({
        id: 'f1',
        name: 'Flow',
        description: '',
        tags: [],
        lastRunStatus: 'never',
        lastRunAt: null,
        nodes: [],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('summarizes passed and failed step counts', () => {
    const passed = { ...createFlowStep('WAIT', 'Wait'), id: 's1', lastRunStatus: 'passed' as const };
    const failed = {
      ...createFlowStep('REQUEST', 'Req'),
      id: 's2',
      lastRunStatus: 'failed' as const,
    };

    const summary = buildFlowRunSummary({
      id: 'f1',
      name: 'Flow',
      description: '',
      tags: [],
      lastRunStatus: 'failed',
      lastRunAt: '2026-01-02T00:00:00.000Z',
      lastRunDurationMs: 1200,
      nodes: [passed, failed],
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(summary?.durationLabel).toBe('1.2 s');
    expect(summary?.countsLabel).toContain('1 passed');
    expect(summary?.countsLabel).toContain('1 failed');
    expect(summary?.passedCount).toBe(1);
    expect(summary?.failedCount).toBe(1);
  });
});
