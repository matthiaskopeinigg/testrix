import { describe, expect, it } from 'vitest';

import { changedPixelPercent, paintDiffMagenta } from './pixel-diff';

describe('pixel-diff', () => {
  it('returns 0 when bitmaps match', () => {
    const a = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(changedPixelPercent(a, Uint8Array.from(a))).toBe(0);
  });

  it('returns 50 when one of two pixels differs', () => {
    const actual = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
    const expected = new Uint8Array([1, 2, 3, 255, 9, 5, 6, 255]);
    expect(changedPixelPercent(actual, expected)).toBe(50);
  });

  it('paints differing pixels magenta', () => {
    const actual = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
    const expected = new Uint8Array([1, 2, 3, 255, 9, 5, 6, 255]);
    expect([...paintDiffMagenta(actual, expected)]).toEqual([1, 2, 3, 255, 255, 0, 255, 255]);
  });
});
