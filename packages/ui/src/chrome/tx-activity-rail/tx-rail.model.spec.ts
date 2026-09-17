import { describe, expect, it } from 'vitest';

import { railIndex, railSlideDirection } from './tx-rail.model';

describe('railSlideDirection', () => {
  it('slides down when the next rail is below', () => {
    expect(railSlideDirection('collections', 'environments')).toBe('down');
    expect(railSlideDirection('environments', 'tools')).toBe('down');
  });

  it('slides up when the next rail is above', () => {
    expect(railSlideDirection('tools', 'collections')).toBe('up');
    expect(railSlideDirection('environments', 'collections')).toBe('up');
  });

  it('keeps collections at the top of the rail', () => {
    expect(railIndex('collections')).toBe(0);
  });
});
