import { describe, expect, it } from 'vitest';

import { loadTestStartOptionsSchema } from './load-test-run.schema';

describe('loadTestStartOptionsSchema', () => {
  it('requires a load test id', () => {
    expect(() =>
      loadTestStartOptionsSchema.parse({
        targetRequestId: 'req-1',
        virtualUsers: 1,
        durationSec: 1,
      }),
    ).toThrow(/loadTestId/i);
  });

  it('accepts a collection target with a request id', () => {
    const parsed = loadTestStartOptionsSchema.parse({
      loadTestId: 'lt-1',
      targetRequestId: 'req-1',
      virtualUsers: 2,
      durationSec: 5,
    });
    expect(parsed.targetSource).toBe('collection');
    expect(parsed.targetRequestId).toBe('req-1');
    expect(parsed.loadTestId).toBe('lt-1');
  });

  it('rejects a collection target without a request id', () => {
    expect(() =>
      loadTestStartOptionsSchema.parse({
        loadTestId: 'lt-1',
        virtualUsers: 1,
        durationSec: 1,
      }),
    ).toThrow(/request id/i);
  });

  it('accepts a manual target with a URL', () => {
    const parsed = loadTestStartOptionsSchema.parse({
      loadTestId: 'lt-1',
      targetSource: 'manual',
      manualTarget: { method: 'POST', url: 'https://api.example.com/items' },
      virtualUsers: 1,
      durationSec: 1,
    });
    expect(parsed.targetSource).toBe('manual');
    expect(parsed.manualTarget?.url).toBe('https://api.example.com/items');
  });

  it('rejects a manual target without a URL', () => {
    expect(() =>
      loadTestStartOptionsSchema.parse({
        loadTestId: 'lt-1',
        targetSource: 'manual',
        virtualUsers: 1,
        durationSec: 1,
      }),
    ).toThrow(/URL/i);
  });

  it('accepts an environment override', () => {
    const parsed = loadTestStartOptionsSchema.parse({
      loadTestId: 'lt-1',
      targetRequestId: 'req-1',
      environmentId: 'env-prod',
      virtualUsers: 1,
      durationSec: 1,
    });
    expect(parsed.environmentId).toBe('env-prod');
  });

  it('accepts a forced-none environment', () => {
    const parsed = loadTestStartOptionsSchema.parse({
      loadTestId: 'lt-1',
      targetRequestId: 'req-1',
      environmentId: '',
      virtualUsers: 1,
      durationSec: 1,
    });
    expect(parsed.environmentId).toBe('');
  });
});
