import { describe, expect, it } from 'vitest';

import {
  coerceCollectionFolderClickBehavior,
  resolveCollectionFolderClickAction,
  collectionFolderClickBehaviorLabel,
} from './collection-folder-click-behavior';

describe('resolveCollectionFolderClickAction', () => {
  it('opens a tab without changing expansion', () => {
    expect(resolveCollectionFolderClickAction('openTab', false)).toEqual({ openTab: true });
    expect(resolveCollectionFolderClickAction('openTab', true)).toEqual({ openTab: true });
  });

  it('toggles expansion without opening a tab', () => {
    expect(resolveCollectionFolderClickAction('expandCollapse', false)).toEqual({
      openTab: false,
      setExpanded: true,
    });
    expect(resolveCollectionFolderClickAction('expandCollapse', true)).toEqual({
      openTab: false,
      setExpanded: false,
    });
  });

  it('opens a tab and toggles expansion', () => {
    expect(resolveCollectionFolderClickAction('expandCollapseAndOpenTab', false)).toEqual({
      openTab: true,
      setExpanded: true,
    });
    expect(resolveCollectionFolderClickAction('expandCollapseAndOpenTab', true)).toEqual({
      openTab: true,
      setExpanded: false,
    });
  });
});

describe('coerceCollectionFolderClickBehavior', () => {
  it('maps legacy values to supported behaviors', () => {
    expect(coerceCollectionFolderClickBehavior('open')).toBe('openTab');
    expect(coerceCollectionFolderClickBehavior('expandOnly')).toBe('expandCollapse');
    expect(coerceCollectionFolderClickBehavior('toggle')).toBe('expandCollapse');
    expect(coerceCollectionFolderClickBehavior('openAndExpand')).toBe('expandCollapseAndOpenTab');
  });

  it('keeps supported values and defaults unknown', () => {
    expect(coerceCollectionFolderClickBehavior('openTab')).toBe('openTab');
    expect(coerceCollectionFolderClickBehavior('expandCollapse')).toBe('expandCollapse');
    expect(coerceCollectionFolderClickBehavior('expandCollapseAndOpenTab')).toBe(
      'expandCollapseAndOpenTab',
    );
    expect(coerceCollectionFolderClickBehavior('invalid')).toBe('expandCollapseAndOpenTab');
  });
});

describe('collectionFolderClickBehaviorLabel', () => {
  it('returns readable labels', () => {
    expect(collectionFolderClickBehaviorLabel('openTab')).toBe('Open Tab');
    expect(collectionFolderClickBehaviorLabel('expandCollapse')).toBe('Expand/Collapse');
    expect(collectionFolderClickBehaviorLabel('expandCollapseAndOpenTab')).toBe(
      'Expand/Collapse and open Tab',
    );
  });
});
