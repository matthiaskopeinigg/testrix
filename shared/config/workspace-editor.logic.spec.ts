import { describe, expect, it } from 'vitest';

import { createDefaultWorkspaceEditor } from './workspace-editor.schema';
import {
  WORKSPACE_SPLIT_MAX_RATIO,
  WORKSPACE_SPLIT_MIN_RATIO,
} from './workspace-editor.schema';
import {
  clampWorkspaceSplitRatio,
  normalizeWorkspaceEditorState,
  splitLayoutAtGroup,
  workspaceEditorHasAnyTabs,
} from './workspace-editor.logic';

describe('clampWorkspaceSplitRatio', () => {
  it('clamps to configured percent bounds', () => {
    expect(clampWorkspaceSplitRatio(0.05)).toBe(WORKSPACE_SPLIT_MIN_RATIO);
    expect(clampWorkspaceSplitRatio(0.95)).toBe(WORKSPACE_SPLIT_MAX_RATIO);
    expect(clampWorkspaceSplitRatio(0.5)).toBe(0.5);
  });

  it('respects minimum pane pixel size when container size is known', () => {
    const ratio = clampWorkspaceSplitRatio(0.1, {
      containerSizePx: 400,
      minPaneSizePx: 120,
    });
    expect(ratio).toBeGreaterThanOrEqual(0.3);
    expect(ratio).toBeLessThanOrEqual(WORKSPACE_SPLIT_MAX_RATIO);
  });
});

describe('splitLayoutAtGroup', () => {
  it('places new pane on the right by default', () => {
    const layout = splitLayoutAtGroup(
      { type: 'leaf', groupId: 'main' },
      'main',
      'horizontal',
      'pane-b',
    );
    expect(layout).toEqual({
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'leaf', groupId: 'main' },
      second: { type: 'leaf', groupId: 'pane-b' },
    });
  });

  it('ignores tabs in groups not referenced by the layout', () => {
    const editor = createDefaultWorkspaceEditor();
    editor.groups['orphan'] = {
      tabs: [
        {
          id: 'tab-1',
          resourceId: 'req-1',
          kind: 'request',
          pinned: false,
        },
      ],
      activeTabId: 'tab-1',
    };
    expect(workspaceEditorHasAnyTabs(editor)).toBe(false);
  });

  it('normalizes to default when no layout panes have tabs', () => {
    const editor = createDefaultWorkspaceEditor();
    editor.layout = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'leaf', groupId: 'main' },
      second: { type: 'leaf', groupId: 'pane-b' },
    };
    editor.groups['pane-b'] = { tabs: [], activeTabId: null };
    editor.recentResourceIds = ['req-1'];

    const next = normalizeWorkspaceEditorState(editor);
    expect(workspaceEditorHasAnyTabs(next)).toBe(false);
    expect(next.layout).toEqual({ type: 'leaf', groupId: 'main' });
    expect(next.recentResourceIds).toEqual(['req-1']);
  });

  it('places new pane on the left when placement is before', () => {
    const layout = splitLayoutAtGroup(
      { type: 'leaf', groupId: 'main' },
      'main',
      'horizontal',
      'pane-b',
      0.5,
      'before',
    );
    expect(layout).toEqual({
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'leaf', groupId: 'pane-b' },
      second: { type: 'leaf', groupId: 'main' },
    });
  });
});
