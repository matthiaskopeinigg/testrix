import { describe, expect, it } from 'vitest';

import { createDefaultLoadTestManualTarget, isLoadTestTargetReady } from './load-test-target.schema';

describe('isLoadTestTargetReady', () => {
  it('requires a non-empty collection request id', () => {
    expect(isLoadTestTargetReady({})).toBe(false);
    expect(isLoadTestTargetReady({ targetRequestId: '  ' })).toBe(false);
    expect(isLoadTestTargetReady({ targetRequestId: 'req-1' })).toBe(true);
  });

  it('requires a non-empty URL for a manual target', () => {
    expect(
      isLoadTestTargetReady({
        targetSource: 'manual',
        targetRequestId: 'req-1',
        manualTarget: { url: '  ' },
      }),
    ).toBe(false);
    expect(
      isLoadTestTargetReady({
        targetSource: 'manual',
        manualTarget: { url: 'https://api.example.com' },
      }),
    ).toBe(true);
  });

  it('ignores a collection request id while the source is manual', () => {
    expect(
      isLoadTestTargetReady({
        targetSource: 'manual',
        targetRequestId: 'req-1',
      }),
    ).toBe(false);
  });
});

describe('createDefaultLoadTestManualTarget', () => {
  it('starts with GET and an empty URL', () => {
    const target = createDefaultLoadTestManualTarget();
    expect(target.method).toBe('GET');
    expect(target.url).toBe('');
  });
});
