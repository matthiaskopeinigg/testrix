import { describe, expect, it } from 'vitest';

import { TestrixError } from '../errors';
import { createIdleLoadTestRunMetrics, type LoadTestRunMetrics } from './load-test-run.schema';
import {
  LoadTestRunnerSlots,
  parseLoadTestIpcId,
  type LoadTestRunnerSlot,
} from './load-test-runner-slots';

function fakeRunner(metrics: LoadTestRunMetrics): LoadTestRunnerSlot {
  let current = metrics;
  return {
    snapshot: () => current,
    cancel: () => {
      current = { ...current, running: false };
      return current;
    },
  };
}

describe('parseLoadTestIpcId', () => {
  it('returns a trimmed id', () => {
    expect(parseLoadTestIpcId('  lt-1  ')).toBe('lt-1');
  });

  it('returns null for missing or blank values', () => {
    expect(parseLoadTestIpcId(undefined)).toBeNull();
    expect(parseLoadTestIpcId('')).toBeNull();
    expect(parseLoadTestIpcId('   ')).toBeNull();
    expect(parseLoadTestIpcId(1)).toBeNull();
  });
});

describe('LoadTestRunnerSlots', () => {
  it('returns idle metrics for an unknown id', () => {
    const slots = new LoadTestRunnerSlots();
    expect(slots.snapshot('missing')).toEqual(createIdleLoadTestRunMetrics());
    expect(slots.status('missing')).toEqual({ running: false });
    expect(slots.cancel('missing')).toEqual(createIdleLoadTestRunMetrics());
  });

  it('keeps metrics isolated per load test id', () => {
    const slots = new LoadTestRunnerSlots();
    const runningA: LoadTestRunMetrics = {
      ...createIdleLoadTestRunMetrics(),
      running: true,
      totalRequests: 12,
    };
    slots.assertCanStart('lt-a');
    slots.set('lt-a', fakeRunner(runningA));

    expect(slots.status('lt-a')).toEqual({ running: true });
    expect(slots.snapshot('lt-a').totalRequests).toBe(12);
    expect(slots.snapshot('lt-b')).toEqual(createIdleLoadTestRunMetrics());
    expect(slots.status('lt-b')).toEqual({ running: false });
  });

  it('throws when starting the same id while it is already running', () => {
    const slots = new LoadTestRunnerSlots();
    slots.set('lt-a', fakeRunner({ ...createIdleLoadTestRunMetrics(), running: true }));
    expect(() => slots.assertCanStart('lt-a')).toThrow(TestrixError);
    expect(() => slots.assertCanStart('lt-a')).toThrow(/already running/i);
  });

  it('allows a second id to start while another run is active', () => {
    const slots = new LoadTestRunnerSlots();
    slots.set('lt-a', fakeRunner({ ...createIdleLoadTestRunMetrics(), running: true }));
    expect(() => slots.assertCanStart('lt-b')).not.toThrow();
    slots.set('lt-b', fakeRunner({ ...createIdleLoadTestRunMetrics(), running: true }));
    expect(slots.status('lt-a').running).toBe(true);
    expect(slots.status('lt-b').running).toBe(true);
  });

  it('allows replacing a finished runner for the same id', () => {
    const slots = new LoadTestRunnerSlots();
    slots.set('lt-a', fakeRunner({ ...createIdleLoadTestRunMetrics(), running: false }));
    expect(() => slots.assertCanStart('lt-a')).not.toThrow();
  });
});
