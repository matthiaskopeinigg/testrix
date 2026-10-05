import { describe, expect, it } from 'vitest';

import { nextCronTimes, parseCron, summarizeCron } from './cron-builder';

describe('parseCron', () => {
  it('accepts a five-field expression', () => {
    const result = parseCron('*/5 * * * 1-5');
    expect(result.error).toBeNull();
    expect(result.parsed?.fields.minute).toBe('*/5');
  });

  it('keeps invalid raw input as an error', () => {
    const result = parseCron('not cron');
    expect(result.parsed).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe('nextCronTimes', () => {
  it('returns the next midnight runs', () => {
    const from = new Date(2026, 8, 17, 10, 0, 0);
    const times = nextCronTimes('0 0 * * *', from, 2);
    expect(times).toHaveLength(2);
    expect(times[0]?.getHours()).toBe(0);
    expect(times[0]?.getMinutes()).toBe(0);
    expect(times[0]?.getDate()).toBe(18);
  });
});

describe('summarizeCron', () => {
  it('describes every minute', () => {
    expect(summarizeCron('* * * * *')).toBe('Every minute');
  });
});
