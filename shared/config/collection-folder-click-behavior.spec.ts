import { describe, expect, it } from 'vitest';

import {
  coerceCollectionFolderClickBehavior,
  resolveCollectionFolderClickAction,
  collectionFolderClickBehaviorLabel,
} from './collection-folder-click-behavior';

describe('resolveCollectionFolderClickAction', () => {
  it('toggles expansion without opening a tab', () => {
    expect(resolveCollectionFolderClickAction('toggle', false)).toEqual({
      openTab: false,
      setExpanded: true,
    });
    expect(resolveCollectionFolderClickAction('toggle', true)).toEqual({
      openTab: false,
      setExpanded: false,
    });
  });

  it('opens and expands only when collapsed', () => {
    expect(resolveCollectionFolderClickAction('openAndExpand', false)).toEqual({
      openTab: true,
      setExpanded: true,
    });
    expect(resolveCollectionFolderClickAction('openAndExpand', true)).toEqual({ openTab: true });
  });
});

describe('coerceCollectionFolderClickBehavior', () => {
  it('maps legacy open and expandOnly to toggle', () => {
    expect(coerceCollectionFolderClickBehavior('open')).toBe('toggle');
    expect(coerceCollectionFolderClickBehavior('expandOnly')).toBe('toggle');
  });

  it('keeps supported values and defaults unknown', () => {
    expect(coerceCollectionFolderClickBehavior('toggle')).toBe('toggle');
    expect(coerceCollectionFolderClickBehavior('openAndExpand')).toBe('openAndExpand');
    expect(coerceCollectionFolderClickBehavior('invalid')).toBe('openAndExpand');
  });
});

describe('collectionFolderClickBehaviorLabel', () => {
  it('returns readable labels', () => {
    expect(collectionFolderClickBehaviorLabel('toggle')).toBe('Toggle');
    expect(collectionFolderClickBehaviorLabel('openAndExpand')).toBe('Open and expand');
  });
});
