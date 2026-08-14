import { describe, expect, it } from 'vitest';

import {
  mapSplitZoneToLayout,
  resolveWorkspaceEditorSplitZone,
} from './workspace-tab-drag';

describe('workspace-tab-drag', () => {
  const rect = new DOMRect(0, 0, 400, 300);

  it('resolves edge split zones only', () => {
    expect(resolveWorkspaceEditorSplitZone(rect, 10, 150)).toBe('left');
    expect(resolveWorkspaceEditorSplitZone(rect, 390, 150)).toBe('right');
    expect(resolveWorkspaceEditorSplitZone(rect, 200, 10)).toBe('top');
    expect(resolveWorkspaceEditorSplitZone(rect, 200, 290)).toBe('bottom');
    expect(resolveWorkspaceEditorSplitZone(rect, 200, 150)).toBeNull();
  });

  it('prefers the nearest edge in corners', () => {
    expect(resolveWorkspaceEditorSplitZone(rect, 20, 20)).toBe('left');
    expect(resolveWorkspaceEditorSplitZone(rect, 380, 20)).toBe('right');
    expect(resolveWorkspaceEditorSplitZone(rect, 200, 20)).toBe('top');
  });

  it('maps cardinal zones to split direction and placement', () => {
    expect(mapSplitZoneToLayout('left')).toEqual({ direction: 'horizontal', placement: 'before' });
    expect(mapSplitZoneToLayout('right')).toEqual({ direction: 'horizontal', placement: 'after' });
    expect(mapSplitZoneToLayout('top')).toEqual({ direction: 'vertical', placement: 'before' });
    expect(mapSplitZoneToLayout('bottom')).toEqual({ direction: 'vertical', placement: 'after' });
  });
});
