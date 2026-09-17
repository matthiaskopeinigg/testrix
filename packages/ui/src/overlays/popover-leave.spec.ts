import { describe, expect, it } from 'vitest';

import { playLeaveThen } from './popover-leave';

describe('playLeaveThen', () => {
  it('invokes done immediately without an element', () => {
    let calls = 0;
    playLeaveThen(null, () => {
      calls += 1;
    });
    expect(calls).toBe(1);
  });
});
