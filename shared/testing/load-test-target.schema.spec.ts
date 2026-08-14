import { describe, expect, it } from 'vitest';

import { isLoadTestTargetReady } from './load-test-target.schema';

describe('isLoadTestTargetReady', () => {
  it('requires a non-empty collection request id', () => {
    expect(isLoadTestTargetReady({})).toBe(false);
    expect(isLoadTestTargetReady({ targetRequestId: '  ' })).toBe(false);
    expect(isLoadTestTargetReady({ targetRequestId: 'req-1' })).toBe(true);
  });
});
