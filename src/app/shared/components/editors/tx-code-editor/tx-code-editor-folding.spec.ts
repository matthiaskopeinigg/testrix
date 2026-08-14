import { describe, expect, it } from 'vitest';

import {
  collapseTxCodeEditorFoldRegion,
  expandAllTxCodeEditorFolds,
  expandTxCodeEditorFoldRegion,
  findCollapsedFoldRegionAtPlaceholderLine,
  findTxCodeEditorFoldRegions,
  isRegionCollapsed,
} from './tx-code-editor-folding';

describe('tx-code-editor-folding', () => {
  const sample = `{
  "widget": {
    "text": {
      "data": "Click Me"
    },
    "window": {
      "title": "Sample"
    }
  }
}`;

  it('finds nested JSON fold regions', () => {
    const regions = findTxCodeEditorFoldRegions(sample, 'json');
    expect(regions.length).toBeGreaterThan(1);
    expect(regions.some((r) => r.startLine === 0)).toBe(true);
  });

  it('collapses and expands a region while preserving hidden content', () => {
    const regions = findTxCodeEditorFoldRegions(sample, 'json');
    const outer = regions.find((r) => r.startLine === 0);
    expect(outer).toBeDefined();
    if (!outer) {
      return;
    }

    const collapsed = collapseTxCodeEditorFoldRegion(sample, outer);
    expect(collapsed).not.toBeNull();
    if (!collapsed) {
      return;
    }

    expect(isRegionCollapsed(collapsed.collapsed, outer)).toBe(true);
    expect(collapsed.collapsed).toContain('...');
    expect(collapsed.collapsed).not.toContain('"text"');

    const expanded = expandTxCodeEditorFoldRegion(collapsed.collapsed, outer, collapsed.hidden);
    expect(expanded).toBe(sample);
  });

  it('expandAll restores every collapsed region from hidden map', () => {
    const regions = findTxCodeEditorFoldRegions(sample, 'json');
    const outer = regions.find((r) => r.startLine === 0);
    expect(outer).toBeDefined();
    if (!outer) {
      return;
    }
    const collapsed = collapseTxCodeEditorFoldRegion(sample, outer);
    expect(collapsed).not.toBeNull();
    if (!collapsed || !outer) {
      return;
    }

    const hiddenMap = new Map([[outer.id, collapsed.hidden]]);
    const restored = expandAllTxCodeEditorFolds(collapsed.collapsed, hiddenMap, 'json');
    expect(restored).toBe(sample);
  });

  it('resolves collapsed region from a display placeholder line', () => {
    const regions = findTxCodeEditorFoldRegions(sample, 'json');
    const outer = regions.find((r) => r.startLine === 0);
    expect(outer).toBeDefined();
    if (!outer) {
      return;
    }

    const collapsed = collapseTxCodeEditorFoldRegion(sample, outer);
    expect(collapsed).not.toBeNull();
    if (!collapsed) {
      return;
    }

    const resolved = findCollapsedFoldRegionAtPlaceholderLine(
      collapsed.collapsed,
      1,
      sample,
      new Set([outer.id]),
      regions,
    );
    expect(resolved?.id).toBe(outer.id);
  });
});
