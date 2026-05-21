import { describe, expect, it } from 'vitest';

import { createDefaultWorkspaceEditor } from '@shared/config';
import { collapseEmptyEditorPanes, splitLayoutAtGroup } from '@shared/config';

import {
  buildWorkspaceEmptyPaneContextMenu,
  buildWorkspaceTabBarContextMenu,
  buildWorkspaceTabContextMenu,
} from './workspace-editor-tab-context-menu';

describe('buildWorkspaceTabContextMenu', () => {
  it('includes reset to single pane when multiple panes exist', () => {
    const items = buildWorkspaceTabContextMenu({
      pinned: false,
      tabCount: 3,
      hasTabsToRight: true,
      canClosePane: true,
      hasMultiplePanes: true,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain('merge-single');
    expect(ids).toContain('close-pane');
  });

  it('offers all four cardinal split actions', () => {
    const ids = buildWorkspaceTabContextMenu({
      pinned: false,
      tabCount: 1,
      hasTabsToRight: false,
      canClosePane: false,
      hasMultiplePanes: false,
    }).map((i) => i.id);
    expect(ids).toContain('split-left');
    expect(ids).toContain('split-right');
    expect(ids).toContain('split-top');
    expect(ids).toContain('split-bottom');
  });

  it('disables close to the right when no tabs follow', () => {
    const items = buildWorkspaceTabContextMenu({
      pinned: true,
      tabCount: 2,
      hasTabsToRight: false,
      canClosePane: false,
      hasMultiplePanes: false,
    });
    const closeRight = items.find((i) => i.id === 'close-to-right');
    expect(closeRight?.disabled).toBe(true);
    expect(items.find((i) => i.id === 'unpin')?.label).toBe('Unpin');
  });
});

describe('buildWorkspaceTabBarContextMenu', () => {
  it('puts reset and close pane first when split', () => {
    const ids = buildWorkspaceTabBarContextMenu({
      canClosePane: true,
      hasMultiplePanes: true,
    }).map((i) => i.id);
    expect(ids[0]).toBe('merge-single');
    expect(ids).toContain('close-pane');
  });
});

describe('buildWorkspaceEmptyPaneContextMenu', () => {
  it('offers escape actions on empty pane body', () => {
    const ids = buildWorkspaceEmptyPaneContextMenu({
      canClosePane: true,
      hasMultiplePanes: true,
    }).map((i) => i.id);
    expect(ids).toEqual(['merge-single', 'close-pane']);
  });
});

describe('collapseEmptyEditorPanes', () => {
  it('removes empty groups from a triple split', () => {
    const base = createDefaultWorkspaceEditor();
    const groupB = 'group-b';
    const groupC = 'group-c';
    let layout = splitLayoutAtGroup(base.layout, 'main', 'horizontal', groupB);
    layout = splitLayoutAtGroup(layout, groupB, 'horizontal', groupC);

    const collapsed = collapseEmptyEditorPanes({
      ...base,
      layout,
      groups: {
        main: { tabs: [{ id: 't1', resourceId: 'r1', kind: 'request', pinned: false }], activeTabId: 't1' },
        [groupB]: { tabs: [], activeTabId: null },
        [groupC]: { tabs: [], activeTabId: null },
      },
    });

    expect(collapsed.layout).toEqual({ type: 'leaf', groupId: 'main' });
    expect(collapsed.groups['main']?.tabs).toHaveLength(1);
    expect(collapsed.groups[groupB]).toBeUndefined();
  });
});
