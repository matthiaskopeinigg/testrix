import { describe, expect, it } from 'vitest';

import type { FlowArtifactFields, ServiceTreeNode } from '@testrix/contracts';
import { emptyRegressionPackEntry } from '@testrix/contracts';

import {
  buildPickerRows,
  collectFlowIdsFromTree,
  flowCheckState,
  folderCheckState,
  folderCheckStateFromEntries,
  orderRegressionEntries,
  orderRegressionFlowIds,
  scenarioCheckState,
  syncEntriesFromLinkedFolder,
  toggleFolderEntries,
  toggleFolderInSelection,
  toggleFlowEntry,
  toggleFlowInSelection,
  toggleScenarioEntry,
} from './rg-flow-picker-tree';

function artifact(
  id: string,
  name = id,
  scenarios: { id: string; name: string; enabled?: boolean }[] = [],
): Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'artifact' }> {
  return {
    kind: 'artifact',
    id,
    name,
    updatedAt: '2026-01-01T00:00:00.000Z',
    description: '',
    tags: [],
    docs: '',
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      enabled: scenario.enabled !== false,
      folderId: null,
      nodes: [],
      edges: [],
      data: { enabled: true, columns: [], rows: [] },
    })),
    scenariosRunMode: 'sequential',
    scenarioFolders: [],
    e2eShowWindow: true,
    e2eReplay: 'slow',
    environmentId: null,
    deviceSerial: null,
    apkPath: null,
    deviceStartEmulator: false,
    deviceShowEmulator: false,
  } as unknown as Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'artifact' }>;
}

describe('rg-flow-picker-tree', () => {
  const login = artifact('flow_1', 'Login', [
    { id: 'sc_a', name: 'Happy' },
    { id: 'sc_b', name: 'Sad' },
    { id: 'sc_c', name: 'Off', enabled: false },
  ]);
  const logout = artifact('flow_2', 'Logout', [{ id: 'sc_x', name: 'Default' }]);
  const checkout = artifact('flow_3', 'Checkout');

  const tree: ServiceTreeNode<FlowArtifactFields>[] = [
    {
      kind: 'folder',
      id: 'folder_a',
      name: 'Auth',
      updatedAt: '2026-01-01T00:00:00.000Z',
      children: [login, logout],
    },
    checkout,
  ];

  it('collects flow ids depth-first', () => {
    expect(collectFlowIdsFromTree(tree)).toEqual(['flow_1', 'flow_2', 'flow_3']);
  });

  it('toggles flows and folders by id', () => {
    expect(toggleFlowInSelection([], 'flow_3')).toEqual(['flow_3']);
    expect(toggleFlowInSelection(['flow_3'], 'flow_3')).toEqual([]);
    expect(toggleFolderInSelection([], tree[0] as Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'folder' }>)).toEqual([
      'flow_1',
      'flow_2',
    ]);
  });

  it('orders selection by tree and reports folder check state', () => {
    expect(orderRegressionFlowIds(tree, ['flow_3', 'flow_1'])).toEqual(['flow_1', 'flow_3']);
    const folder = tree[0] as Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'folder' }>;
    expect(folderCheckState(folder, new Set(['flow_1']))).toBe('partial');
    expect(folderCheckState(folder, new Set(['flow_1', 'flow_2']))).toBe('checked');
  });

  it('toggles flow entries as all-scenarios', () => {
    const linked = toggleFlowEntry([], 'flow_1');
    expect(linked).toHaveLength(1);
    expect(linked[0]?.flowId).toBe('flow_1');
    expect(linked[0]?.scenarioId).toBeNull();
    expect(toggleFlowEntry(linked, 'flow_1')).toEqual([]);
  });

  it('toggles folder entries as all-scenarios for descendants', () => {
    const folder = tree[0] as Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'folder' }>;
    const linked = toggleFolderEntries([], folder);
    expect(linked.map((entry) => entry.flowId)).toEqual(['flow_1', 'flow_2']);
    expect(linked.every((entry) => entry.scenarioId === null)).toBe(true);
    expect(toggleFolderEntries(linked, folder)).toEqual([]);
  });

  it('toggles scenarios and replaces an all-entry', () => {
    const all = [emptyRegressionPackEntry('flow_1', null)];
    expect(scenarioCheckState(all, 'flow_1', 'sc_a')).toBe('checked');
    expect(flowCheckState(all, login)).toBe('checked');

    const afterUncheck = toggleScenarioEntry(all, login, 'sc_a');
    expect(afterUncheck.map((entry) => entry.scenarioId)).toEqual(['sc_b']);
    expect(scenarioCheckState(afterUncheck, 'flow_1', 'sc_a')).toBe('unchecked');
    expect(scenarioCheckState(afterUncheck, 'flow_1', 'sc_b')).toBe('checked');
    expect(flowCheckState(afterUncheck, login)).toBe('partial');

    const withBoth = toggleScenarioEntry(afterUncheck, login, 'sc_a');
    expect(withBoth.map((entry) => entry.scenarioId).sort()).toEqual(['sc_a', 'sc_b']);
    expect(flowCheckState(withBoth, login)).toBe('checked');
  });

  it('orders multi-scenario entries by tree DFS', () => {
    const mixed = [
      emptyRegressionPackEntry('flow_3', null),
      emptyRegressionPackEntry('flow_1', 'sc_b'),
      emptyRegressionPackEntry('flow_1', 'sc_a'),
      emptyRegressionPackEntry('flow_2', null),
    ];
    const ordered = orderRegressionEntries(tree, mixed);
    expect(ordered.map((entry) => `${entry.flowId}:${entry.scenarioId ?? 'all'}`)).toEqual([
      'flow_1:sc_a',
      'flow_1:sc_b',
      'flow_2:all',
      'flow_3:all',
    ]);
  });

  it('syncs missing descendant flows from a linked folder', () => {
    const existing = [emptyRegressionPackEntry('flow_3', null), emptyRegressionPackEntry('flow_1', 'sc_a')];
    const synced = syncEntriesFromLinkedFolder(existing, 'folder_a', tree);
    expect(synced.map((entry) => `${entry.flowId}:${entry.scenarioId ?? 'all'}`)).toEqual([
      'flow_1:sc_a',
      'flow_2:all',
      'flow_3:all',
    ]);
  });

  it('builds scenario rows under expanded flows', () => {
    const rows = buildPickerRows({
      nodes: tree,
      expandedIds: new Set(['folder_a', 'flow_1']),
    });
    expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
      'folder:folder_a',
      'flow:flow_1',
      'scenario:flow_1::sc_a',
      'scenario:flow_1::sc_b',
      'scenario:flow_1::sc_c',
      'flow:flow_2',
      'flow:flow_3',
    ]);
  });

  it('reports folder check state from entries', () => {
    const folder = tree[0] as Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'folder' }>;
    expect(folderCheckStateFromEntries(folder, [emptyRegressionPackEntry('flow_1', null)])).toBe('partial');
    expect(
      folderCheckStateFromEntries(folder, [
        emptyRegressionPackEntry('flow_1', null),
        emptyRegressionPackEntry('flow_2', null),
      ]),
    ).toBe('checked');
  });
});
