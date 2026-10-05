import { describe, expect, it } from 'vitest';

import { idsInside, normalizeRect, selectionFromClick } from './plantuml-selection';

describe('diagram selection', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('replaces the selection on a plain click', () => {
    expect(selectionFromClick(['a', 'b'], 'c', false, false, order)).toEqual(['c']);
  });

  it('toggles one id when the modifier is held', () => {
    expect(selectionFromClick(['a', 'b'], 'b', true, false, order)).toEqual(['a']);
    expect(selectionFromClick(['a'], 'c', true, false, order)).toEqual(['a', 'c']);
  });

  it('selects the span from the anchor to the clicked id', () => {
    expect(selectionFromClick(['a', 'c'], 'a', false, true, order)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the previous selection when a marquee adds to it', () => {
    const rect = normalizeRect(0, 0, 40, 40);
    const items = [
      { id: 'a', x: 10, y: 10, width: 20, height: 20 },
      { id: 'b', x: 80, y: 10, width: 20, height: 20 },
    ];
    expect(idsInside(items, rect, ['b'])).toEqual(['b', 'a']);
    expect(idsInside(items, rect, [])).toEqual(['a']);
  });
});
