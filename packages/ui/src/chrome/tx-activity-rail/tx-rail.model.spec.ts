import { describe, expect, it } from 'vitest';

import { DEFAULT_RAIL_ITEMS, railIndex, railSlideDirection } from './tx-rail.model';

describe('railSlideDirection', () => {
  it('slides down when the next rail is below', () => {
    expect(railSlideDirection('collections', 'environments')).toBe('down');
    expect(railSlideDirection('environments', 'tools')).toBe('down');
    expect(railSlideDirection('tools', 'history')).toBe('down');
  });

  it('slides up when the next rail is above', () => {
    expect(railSlideDirection('tools', 'collections')).toBe('up');
    expect(railSlideDirection('environments', 'collections')).toBe('up');
    expect(railSlideDirection('history', 'tools')).toBe('up');
  });

  it('keeps collections at the top of the rail', () => {
    expect(railIndex('collections')).toBe(0);
  });

  it('keeps history last, above Help', () => {
    expect(DEFAULT_RAIL_ITEMS[DEFAULT_RAIL_ITEMS.length - 1]?.id).toBe('history');
    expect(railIndex('history')).toBe(DEFAULT_RAIL_ITEMS.length - 1);
  });
});
