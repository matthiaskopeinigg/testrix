import { describe, expect, it } from 'vitest';

import {
  createDefaultWorkspaceDatabase,
  mergeWorkspaceDatabase,
  workspaceDatabaseSchema,
} from './database-session.schema';

describe('database-session.schema', () => {
  it('defaults connections and queries expanded and folders closed', () => {
    const state = createDefaultWorkspaceDatabase();
    expect(state.connectionsExpanded).toBe(true);
    expect(state.queriesExpanded).toBe(true);
    expect(state.queryExpandedIds).toEqual([]);
    expect(state.connectionExpandedIds).toEqual([]);
    expect(workspaceDatabaseSchema.safeParse({}).success).toBe(true);
  });

  it('merges expansion patches without dropping sibling fields', () => {
    const current = mergeWorkspaceDatabase(undefined, {
      connectionsExpanded: true,
      queriesExpanded: false,
      queryExpandedIds: ['q1'],
      connectionExpandedIds: ['c1'],
    });
    const merged = mergeWorkspaceDatabase(current, { connectionsExpanded: false });
    expect(merged.connectionsExpanded).toBe(false);
    expect(merged.queriesExpanded).toBe(false);
    expect(merged.queryExpandedIds).toEqual(['q1']);
    expect(merged.connectionExpandedIds).toEqual(['c1']);
  });

  it('defaults queryTabsById empty and merges per-tab height/hidden', () => {
    const state = createDefaultWorkspaceDatabase();
    expect(state.queryTabsById).toEqual({});
    const withHeight = mergeWorkspaceDatabase(state, {
      queryTabsById: { 'dbq:1': { resultPanelHeightPx: 320 } },
    });
    expect(withHeight.queryTabsById['dbq:1']?.resultPanelHeightPx).toBe(320);
    expect(withHeight.queryTabsById['dbq:1']?.isResultPanelHidden).toBeUndefined();
    const hidden = mergeWorkspaceDatabase(withHeight, {
      queryTabsById: { 'dbq:1': { isResultPanelHidden: true } },
    });
    expect(hidden.queryTabsById['dbq:1']?.resultPanelHeightPx).toBe(320);
    expect(hidden.queryTabsById['dbq:1']?.isResultPanelHidden).toBe(true);
    expect(hidden.queriesExpanded).toBe(true);
  });
});
