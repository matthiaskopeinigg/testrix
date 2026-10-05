import { describe, expect, it } from 'vitest';

import {
  ganttBarGeometry,
  ganttBarLabel,
  ganttEffectiveDurationMs,
  ganttTimelineExtentMs,
} from './rg-gantt-geometry';

describe('ganttBarGeometry', () => {
  it('maps offset and duration to left/width percentages', () => {
    const bar = ganttBarGeometry(2_000, 4_000, 10_000);
    expect(bar.leftPercent).toBeCloseTo(20);
    expect(bar.widthPercent).toBeCloseTo(40);
  });

  it('clamps a full-width bar to the remaining track', () => {
    const bar = ganttBarGeometry(0, 20_000, 10_000);
    expect(bar.leftPercent).toBe(0);
    expect(bar.widthPercent).toBe(100);
  });

  it('keeps a minimum visible width for tiny bars', () => {
    const bar = ganttBarGeometry(0, 1, 10_000);
    expect(bar.widthPercent).toBeGreaterThanOrEqual(2.5);
  });

  it('caps left offset and guards against zero total', () => {
    const bar = ganttBarGeometry(50_000, 100, 0);
    expect(bar.leftPercent).toBeLessThanOrEqual(99);
    expect(bar.widthPercent).toBeGreaterThan(0);
  });
});

describe('ganttEffectiveDurationMs', () => {
  it('stretches running bars with zero duration out to now', () => {
    expect(
      ganttEffectiveDurationMs(
        { startedAtOffsetMs: 1_000, durationMs: 0, status: 'running' },
        5_000,
      ),
    ).toBe(4_000);
  });

  it('keeps completed durations unchanged', () => {
    expect(
      ganttEffectiveDurationMs(
        { startedAtOffsetMs: 1_000, durationMs: 250, status: 'ok' },
        5_000,
      ),
    ).toBe(250);
  });
});

describe('ganttTimelineExtentMs', () => {
  it('uses stretched running bars when computing extent', () => {
    const extent = ganttTimelineExtentMs(
      [
        {
          flowId: 'a',
          flowName: 'A',
          workerSlot: 0,
          startedAtOffsetMs: 500,
          durationMs: 0,
          status: 'running',
        },
      ],
      4_000,
    );
    expect(extent).toBe(4_000);
  });
});

describe('ganttBarLabel', () => {
  it('prefers scenario name when present', () => {
    expect(
      ganttBarLabel({
        flowId: 'f',
        flowName: 'Complex examples',
        scenarioName: 'Listeners and trigger',
        workerSlot: 0,
        startedAtOffsetMs: 0,
        durationMs: 100,
        status: 'error',
      }),
    ).toBe('Listeners and trigger');
  });
});
