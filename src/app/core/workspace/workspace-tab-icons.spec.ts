import { describe, expect, it } from 'vitest';

import { iconForWorkspaceTabKind } from './workspace-tab-icons';

describe('iconForWorkspaceTabKind', () => {
  it('maps request tabs to the http icon', () => {
    expect(iconForWorkspaceTabKind('request')).toBe('http');
  });

  it('maps history tabs to the clock icon', () => {
    expect(iconForWorkspaceTabKind('history')).toBe('clock');
  });

  it('maps folder tabs to the folder icon', () => {
    expect(iconForWorkspaceTabKind('folder')).toBe('folder');
  });

  it('maps design-system tabs to the grid icon', () => {
    expect(iconForWorkspaceTabKind('design-system')).toBe('grid');
  });
});
