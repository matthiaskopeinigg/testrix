import { describe, expect, it } from 'vitest';

import {
  addMountedTab,
  createEmptyMountedTabs,
  isTabMounted,
  pruneMountedTabsForGroup,
  removeMountedTabs,
  skeletonVariantForTabKind,
} from './workspace-editor-mount.cache';

describe('workspace-editor-mount.cache', () => {
  it('addMountedTab tracks first visit', () => {
    let mounted = createEmptyMountedTabs();
    const first = addMountedTab(mounted, 'g1', 't1');
    expect(first.firstVisit).toBe(true);
    expect(isTabMounted(first.next, 'g1', 't1')).toBe(true);

    const second = addMountedTab(first.next, 'g1', 't1');
    expect(second.firstVisit).toBe(false);
  });

  it('removeMountedTabs evicts ids', () => {
    let mounted = createEmptyMountedTabs();
    mounted = addMountedTab(mounted, 'g1', 't1').next;
    mounted = addMountedTab(mounted, 'g1', 't2').next;
    mounted = removeMountedTabs(mounted, 'g1', ['t1']);
    expect(isTabMounted(mounted, 'g1', 't1')).toBe(false);
    expect(isTabMounted(mounted, 'g1', 't2')).toBe(true);
  });

  it('pruneMountedTabsForGroup drops closed tabs', () => {
    let mounted = createEmptyMountedTabs();
    mounted = addMountedTab(mounted, 'g1', 't1').next;
    mounted = addMountedTab(mounted, 'g1', 't2').next;
    mounted = pruneMountedTabsForGroup(mounted, 'g1', ['t2']);
    expect(isTabMounted(mounted, 'g1', 't1')).toBe(false);
    expect(isTabMounted(mounted, 'g1', 't2')).toBe(true);
  });

  it('skeletonVariantForTabKind maps kinds', () => {
    expect(skeletonVariantForTabKind('request')).toBe('request');
    expect(skeletonVariantForTabKind('folder')).toBe('folder');
    expect(skeletonVariantForTabKind('environment')).toBe('generic');
  });
});
