import { describe, expect, it } from 'vitest';

import { readEntranceStaggerSettleMs } from './workspace-tab-motion';

describe('readEntranceStaggerSettleMs', () => {
  it('returns a positive duration for default child count', () => {
    expect(readEntranceStaggerSettleMs(6)).toBeGreaterThan(0);
  });

  it('caps child count at 24 steps', () => {
    const capped = readEntranceStaggerSettleMs(100);
    const at24 = readEntranceStaggerSettleMs(24);
    expect(capped).toBe(at24);
  });
});
