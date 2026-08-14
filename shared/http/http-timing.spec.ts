import { describe, expect, it } from 'vitest';

import { computeTimingFromMarkers } from './http-timing';

describe('computeTimingFromMarkers', () => {
  it('computes all phases when markers are present', () => {
    const timing = computeTimingFromMarkers({
      startedAt: 0,
      dnsAt: 10,
      connectAt: 30,
      secureAt: 50,
      ttfbAt: 100,
      endedAt: 200,
    });

    expect(timing).toEqual({
      totalMs: 200,
      dnsMs: 10,
      connectMs: 20,
      tlsMs: 20,
      ttfbMs: 50,
      downloadMs: 100,
    });
  });

  it('omits phases that were not observed', () => {
    const timing = computeTimingFromMarkers({
      startedAt: 0,
      ttfbAt: 40,
      endedAt: 100,
    });

    expect(timing.totalMs).toBe(100);
    expect(timing.ttfbMs).toBe(40);
    expect(timing.downloadMs).toBe(60);
    expect(timing.dnsMs).toBeUndefined();
  });
});
