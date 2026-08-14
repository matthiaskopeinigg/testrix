import { describe, expect, it } from 'vitest';

import {
  buildExpandRevealIndices,
  estimateExpandRevealSettleMs,
} from './tx-tree-expand.animation';

describe('tx-tree-expand.animation', () => {
  it('assigns stagger indices only to newly visible rows', () => {
    const previous = new Set(['folder', 'next']);
    const indices = buildExpandRevealIndices(previous, ['folder', 'a', 'b', 'next']);

    expect([...indices.entries()]).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('returns a positive settle duration for revealed rows', () => {
    expect(estimateExpandRevealSettleMs(3)).toBeGreaterThan(0);
  });
});
