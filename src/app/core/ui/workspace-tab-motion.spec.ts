import { describe, expect, it, vi } from 'vitest';

import { readEntranceStaggerSettleMs, WorkspaceTabMotionController } from './workspace-tab-motion';

describe('readEntranceStaggerSettleMs', () => {
  it('returns a positive duration for default child count', () => {
    expect(readEntranceStaggerSettleMs(6)).toBeGreaterThan(0);
  });

  it('caps child count at 24 steps', () => {
    const capped = readEntranceStaggerSettleMs(100);
    const at24 = readEntranceStaggerSettleMs(24);
    expect(capped).toBe(at24);
  });
});

describe('WorkspaceTabMotionController section stagger', () => {
  it('plays stagger on the target section then settles', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0);
      return 1;
    });

    const destroyRef = { onDestroy: vi.fn() };
    const uiPreferences = { entranceStaggerEnabled: () => true };
    const motion = new WorkspaceTabMotionController(
      uiPreferences as never,
      destroyRef as never,
    );

    motion.onSectionChange('params', { contentBlockCount: 2 });
    expect(motion.isSectionContentAnimating('params')).toBe(true);
    expect(motion.isSectionContentSettled('params')).toBe(false);

    vi.advanceTimersByTime(readEntranceStaggerSettleMs(2));
    expect(motion.isSectionContentAnimating('params')).toBe(false);
    expect(motion.isSectionContentSettled('params')).toBe(true);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('skips section stagger when entrance stagger is disabled', () => {
    const destroyRef = { onDestroy: vi.fn() };
    const uiPreferences = { entranceStaggerEnabled: () => false };
    const motion = new WorkspaceTabMotionController(
      uiPreferences as never,
      destroyRef as never,
    );

    motion.onSectionChange('overview');
    expect(motion.isSectionContentAnimating('overview')).toBe(false);
    expect(motion.isSectionContentSettled('overview')).toBe(true);
  });
});
