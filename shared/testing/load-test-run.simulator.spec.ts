import { describe, expect, it, vi } from 'vitest';

import { LoadTestRunSimulator } from '@shared/testing';

describe('LoadTestRunSimulator', () => {
  it('starts with zero samples before the first tick', () => {
    const simulator = new LoadTestRunSimulator();
    const snapshot = simulator.start({ virtualUsers: 5, durationSec: 30, rampUpSec: 2 });
    expect(snapshot.running).toBe(true);
    expect(snapshot.samples).toHaveLength(0);
    expect(snapshot.totalRequests).toBe(0);
    expect(snapshot.requestsPerSec).toBe(0);
  });

  it('produces increasing samples while running', () => {
    vi.useFakeTimers();
    const simulator = new LoadTestRunSimulator();
    simulator.start({ virtualUsers: 5, durationSec: 30, rampUpSec: 2 });
    vi.advanceTimersByTime(1500);
    const snapshot = simulator.snapshot();
    expect(snapshot.running).toBe(true);
    expect(snapshot.samples.length).toBeGreaterThan(0);
    expect(snapshot.totalRequests).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('stops when cancelled', () => {
    const simulator = new LoadTestRunSimulator();
    simulator.start({ virtualUsers: 3, durationSec: 60, rampUpSec: 0 });
    const cancelled = simulator.cancel();
    expect(cancelled.running).toBe(false);
    expect(simulator.snapshot().running).toBe(false);
  });
});
