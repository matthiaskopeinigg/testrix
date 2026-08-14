import { describe, expect, it } from 'vitest';

import { buildCronExpression, describeCron, nextCronRuns } from './cron.logic';

describe('cron.logic', () => {
  it('builds a five-field expression', () => {
    expect(
      buildCronExpression({
        minute: '0',
        hour: '9',
        dayOfMonth: '*',
        month: '*',
        dayOfWeek: '1-5',
      }),
    ).toBe('0 9 * * 1-5');
  });

  it('describes a valid cron expression', () => {
    const text = describeCron('0 9 * * 1-5');
    expect(text).not.toBe('Invalid cron expression.');
    expect(text.length).toBeGreaterThan(0);
  });

  it('returns next run times for a valid expression', () => {
    const runs = nextCronRuns('0 9 * * 1-5', 3);
    expect(runs.length).toBe(3);
  });
});
