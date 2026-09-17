import { describe, expect, it } from 'vitest';

import {
  applyPointerSelect,
  applyRangeSelect,
  applyToggleSelect,
  shouldKeepPointerSelection,
} from './range-select';

const ids = ['a', 'b', 'c', 'd'];

describe('applyRangeSelect', () => {
  it('selects an inclusive visual range', () => {
    expect(applyRangeSelect({ ids, anchorId: 'b', targetId: 'd' }).ids).toEqual(['b', 'c', 'd']);
  });

  it('works backwards', () => {
    expect(applyRangeSelect({ ids, anchorId: 'd', targetId: 'b' }).ids).toEqual(['b', 'c', 'd']);
  });

  it('falls back to the target when the anchor is missing', () => {
    expect(applyRangeSelect({ ids, anchorId: null, targetId: 'c' })).toEqual({
      ids: ['c'],
      anchorId: 'c',
    });
  });
});

describe('applyToggleSelect', () => {
  it('adds a missing id', () => {
    expect(applyToggleSelect({ selectedIds: ['a'], targetId: 'c' })).toEqual({
      ids: ['a', 'c'],
      anchorId: 'c',
    });
  });

  it('removes an existing id', () => {
    expect(applyToggleSelect({ selectedIds: ['a', 'c'], targetId: 'a' }).ids).toEqual(['c']);
  });
});

describe('applyPointerSelect', () => {
  it('replaces on a plain click', () => {
    expect(
      applyPointerSelect({
        event: { shiftKey: false, ctrlKey: false, metaKey: false },
        visibleIds: ids,
        selectedIds: ['a', 'b'],
        anchorId: 'a',
        targetId: 'c',
      }).ids,
    ).toEqual(['c']);
  });

  it('keeps a multi-set on a plain click of a selected row', () => {
    expect(
      shouldKeepPointerSelection({
        event: { shiftKey: false, ctrlKey: false, metaKey: false },
        selectedIds: ['a', 'b'],
        targetId: 'a',
      }),
    ).toBe(true);
  });

  it('does not keep a sole selection', () => {
    expect(
      shouldKeepPointerSelection({
        event: { shiftKey: false, ctrlKey: false, metaKey: false },
        selectedIds: ['a'],
        targetId: 'a',
      }),
    ).toBe(false);
  });

  it('prefers shift over ctrl', () => {
    expect(
      applyPointerSelect({
        event: { shiftKey: true, ctrlKey: true, metaKey: false },
        visibleIds: ids,
        selectedIds: ['a'],
        anchorId: 'a',
        targetId: 'c',
      }).ids,
    ).toEqual(['a', 'b', 'c']);
  });
});
