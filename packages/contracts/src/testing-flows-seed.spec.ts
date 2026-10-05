import { describe, expect, it } from 'vitest';

import { ensureFlowScenarioTerminals, flowHasStartToEndPath, flowNodeKindSchema, emptyFlowGraphNode, FLOW_DEVICE_NODES_ENABLED, isFlowDeviceKind } from './flow-graph';
import { parseFlowsFile } from './flows-file';
import type { FlowArtifactFields } from './flows-file';
import type { ServiceTreeNode } from './service-tree';
import {
  TUTORIAL_BASICS_FOLDER_ID,
  TUTORIAL_CONTROL_FLOW_FLOW_ID,
  TUTORIAL_NODE_REFERENCE_FLOW_ID,
} from './testing-flows-basics';
import {
  TUTORIAL_API_ADVANCED_FLOW_ID,
  TUTORIAL_API_COMPLEX_FLOW_ID,
  TUTORIAL_API_FOLDER_ID,
  TUTORIAL_API_SIMPLE_FLOW_ID,
  TUTORIAL_DEVICE_ADVANCED_FLOW_ID,
  TUTORIAL_DEVICE_COMPLEX_FLOW_ID,
  TUTORIAL_DEVICE_FOLDER_ID,
  TUTORIAL_DEVICE_SIMPLE_FLOW_ID,
  TUTORIAL_E2E_ADVANCED_FLOW_ID,
  TUTORIAL_E2E_COMPLEX_FLOW_ID,
  TUTORIAL_E2E_FOLDER_ID,
  TUTORIAL_E2E_SIMPLE_FLOW_ID,
  TUTORIAL_FOLDER_ID,
  countFlowNodes,
  createTestingFlowsFile,
} from './testing-flows-seed';

const BASICS_FLOW_IDS = [
  TUTORIAL_NODE_REFERENCE_FLOW_ID,
  TUTORIAL_CONTROL_FLOW_FLOW_ID,
] as const;

const API_FLOW_IDS = [
  TUTORIAL_API_SIMPLE_FLOW_ID,
  TUTORIAL_API_ADVANCED_FLOW_ID,
  TUTORIAL_API_COMPLEX_FLOW_ID,
] as const;

const E2E_FLOW_IDS = [
  TUTORIAL_E2E_SIMPLE_FLOW_ID,
  TUTORIAL_E2E_ADVANCED_FLOW_ID,
  TUTORIAL_E2E_COMPLEX_FLOW_ID,
] as const;

const DEVICE_FLOW_IDS = [
  TUTORIAL_DEVICE_SIMPLE_FLOW_ID,
  TUTORIAL_DEVICE_ADVANCED_FLOW_ID,
  TUTORIAL_DEVICE_COMPLEX_FLOW_ID,
] as const;

function findArtifact(
  items: readonly ServiceTreeNode<FlowArtifactFields>[],
  id: string,
): Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'artifact' }> | null {
  for (const item of items) {
    if (item.kind === 'artifact' && item.id === id)
      return item;
    if (item.kind === 'folder') {
      const found = findArtifact(item.children as typeof items, id);
      if (found)
        return found;
    }
  }
  return null;
}

function collectArtifacts(
  items: readonly ServiceTreeNode<FlowArtifactFields>[],
): Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'artifact' }>[] {
  const out: Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'artifact' }>[] = [];
  for (const item of items) {
    if (item.kind === 'artifact')
      out.push(item);
    else
      out.push(...collectArtifacts(item.children as typeof items));
  }
  return out;
}

function countScenarios(flowIds: readonly string[], fileItems: readonly ServiceTreeNode<FlowArtifactFields>[]): number {
  return flowIds.reduce((sum, id) => {
    const artifact = findArtifact(fileItems, id);
    return sum + (artifact?.scenarios.length ?? 0);
  }, 0);
}

describe('testing flows seed', () => {
  it('ships Tutorial → API/E2E/Device Showcase folders covering every node kind', () => {
    const raw = createTestingFlowsFile();
    const file = parseFlowsFile(raw);
    expect(countFlowNodes(file)).toBeGreaterThan(200);

    const tutorial = file.items.find((item) => item.id === TUTORIAL_FOLDER_ID);
    expect(tutorial?.kind).toBe('folder');
    expect(tutorial?.name).toBe('Tutorial');
    if (tutorial?.kind !== 'folder')
      return;

    const basicsFolder = tutorial.children.find((item) => item.id === TUTORIAL_BASICS_FOLDER_ID);
    expect(basicsFolder?.kind).toBe('folder');
    expect(basicsFolder?.name).toBe('Basics');
    if (basicsFolder?.kind === 'folder')
      expect(basicsFolder.children.map((item) => item.id)).toEqual([...BASICS_FLOW_IDS]);

    const apiFolder = tutorial.children.find((item) => item.id === TUTORIAL_API_FOLDER_ID);
    const e2eFolder = tutorial.children.find((item) => item.id === TUTORIAL_E2E_FOLDER_ID);
    const deviceFolder = tutorial.children.find((item) => item.id === TUTORIAL_DEVICE_FOLDER_ID);
    expect(apiFolder?.kind).toBe('folder');
    expect(apiFolder?.name).toBe('API Showcase');
    expect(e2eFolder?.kind).toBe('folder');
    expect(e2eFolder?.name).toBe('E2E Showcase');
    if (FLOW_DEVICE_NODES_ENABLED) {
      expect(deviceFolder?.kind).toBe('folder');
      expect(deviceFolder?.name).toBe('Device Showcase');
    }
    if (apiFolder?.kind !== 'folder' || e2eFolder?.kind !== 'folder')
      return;

    expect(apiFolder.children.map((item) => item.id)).toEqual([...API_FLOW_IDS]);
    expect(e2eFolder.children.map((item) => item.id)).toEqual([...E2E_FLOW_IDS]);
    expect(countScenarios(API_FLOW_IDS, file.items)).toBe(50);
    expect(countScenarios(E2E_FLOW_IDS, file.items)).toBe(50);
    if (FLOW_DEVICE_NODES_ENABLED && deviceFolder?.kind === 'folder') {
      expect(deviceFolder.children.map((item) => item.id)).toEqual([...DEVICE_FLOW_IDS]);
      expect(countScenarios(DEVICE_FLOW_IDS, file.items)).toBe(6);
    }

    const knownIds = [
      ...BASICS_FLOW_IDS,
      ...API_FLOW_IDS,
      ...E2E_FLOW_IDS,
      ...(FLOW_DEVICE_NODES_ENABLED ? DEVICE_FLOW_IDS : []),
    ];
    const kinds = new Set<string>();
    for (const artifact of collectArtifacts(file.items)) {
      expect(knownIds).toContain(artifact.id);
      for (const scenario of artifact.scenarios) {
        const start = scenario.nodes.find((node) => node.kind === 'start');
        expect(start, `${scenario.name} missing Start`).toBeTruthy();
        expect(
          scenario.edges.some((edge) => edge.from === start!.id),
          `${scenario.name} Start disconnected`,
        ).toBe(true);
        for (const node of scenario.nodes)
          kinds.add(node.kind);
      }
    }

    for (const kind of flowNodeKindSchema.options) {
      if (kind === 'device-install')
        continue;
      if (!FLOW_DEVICE_NODES_ENABLED && isFlowDeviceKind(kind))
        continue;
      expect(kinds.has(kind), `missing kind ${kind}`).toBe(true);
    }
  });

  it('does not invent Start links for orphan roots (disconnects persist)', () => {
    const note = { ...emptyFlowGraphNode('note', { x: 0, y: 0 }), id: 'n', name: 'Intro', config: { text: 'hi' } };
    const req = { ...emptyFlowGraphNode('request', { x: 200, y: 0 }), id: 'r', name: 'GET' };
    const wired = ensureFlowScenarioTerminals({
      id: 's',
      name: 'Note root',
      enabled: true,
      folderId: null,
      nodes: [note, req],
      edges: [{ id: 'e1', from: 'n', fromPort: 'next', to: 'r' }],
      data: { enabled: false, columns: [], rows: [] },
    });
    const start = wired.nodes.find((node) => node.kind === 'start')!;
    expect(wired.edges.some((edge) => edge.from === start.id && edge.to === 'r')).toBe(false);
  });

  it('leaves an unlinked snippet disconnected from Start and End', () => {
    const start = { ...emptyFlowGraphNode('start', { x: 0, y: 0 }), id: 'start', name: 'Start' };
    const end = { ...emptyFlowGraphNode('end', { x: 600, y: 0 }), id: 'end', name: 'End' };
    const req = { ...emptyFlowGraphNode('request', { x: 200, y: 0 }), id: 'req', name: 'HTTP' };
    const ok = { ...emptyFlowGraphNode('assert-status', { x: 400, y: 0 }), id: 'ok', name: '200' };
    const wired = ensureFlowScenarioTerminals({
      id: 's',
      name: 'After snippet',
      enabled: true,
      folderId: null,
      nodes: [start, end, req, ok],
      edges: [
        { id: 'bypass', from: 'start', fromPort: 'next', to: 'end' },
        { id: 'chain', from: 'req', fromPort: 'next', to: 'ok' },
      ],
      data: { enabled: false, columns: [], rows: [] },
    });
    expect(wired.edges.some((edge) => edge.from === 'start' && edge.to === 'end')).toBe(true);
    expect(wired.edges.some((edge) => edge.from === 'start' && edge.to === 'req')).toBe(false);
    expect(wired.edges.some((edge) => edge.from === 'ok' && edge.to === 'end')).toBe(false);
  });

  it('reports whether Start can reach End', () => {
    const start = { ...emptyFlowGraphNode('start', { x: 0, y: 0 }), id: 'start', name: 'Start' };
    const end = { ...emptyFlowGraphNode('end', { x: 400, y: 0 }), id: 'end', name: 'End' };
    const mid = { ...emptyFlowGraphNode('request', { x: 200, y: 0 }), id: 'mid', name: 'HTTP' };
    expect(
      flowHasStartToEndPath({
        nodes: [start, end],
        edges: [{ id: 'e', from: 'start', fromPort: 'next', to: 'end' }],
      }),
    ).toBe(true);
    expect(
      flowHasStartToEndPath({
        nodes: [start, mid, end],
        edges: [
          { id: 'e1', from: 'start', fromPort: 'next', to: 'mid' },
          { id: 'e2', from: 'mid', fromPort: 'next', to: 'end' },
        ],
      }),
    ).toBe(true);
    expect(
      flowHasStartToEndPath({
        nodes: [start, mid, end],
        edges: [{ id: 'e1', from: 'start', fromPort: 'next', to: 'mid' }],
      }),
    ).toBe(false);
  });

  it('wires Capture JSON field in a single linear path', () => {
    const file = parseFlowsFile(createTestingFlowsFile());
    const api = findArtifact(file.items, TUTORIAL_API_SIMPLE_FLOW_ID);
    expect(api?.kind).toBe('artifact');
    if (api?.kind !== 'artifact')
      return;
    const scenario = api.scenarios.find((item) => item.id === 'fs_api_capture_json');
    expect(scenario).toBeTruthy();
    if (!scenario)
      return;

    const byId = new Map(scenario.nodes.map((node) => [node.id, node]));
    const start = scenario.nodes.find((node) => node.kind === 'start');
    const capture = scenario.nodes.find((node) => node.kind === 'capture');
    const assert = scenario.nodes.find((node) => node.kind === 'assert-json');
    const request = scenario.nodes.find((node) => node.kind === 'request');
    expect(start && capture && assert && request).toBeTruthy();
    if (!start || !capture || !assert || !request)
      return;

    const startTargets = scenario.edges.filter((edge) => edge.from === start.id).map((edge) => edge.to);
    expect(startTargets).toEqual([request.id]);
    expect(scenario.edges.some((edge) => edge.from === request.id && byId.get(edge.to)?.kind === 'assert-status')).toBe(
      true,
    );
    expect(scenario.edges.some((edge) => edge.from !== start.id && edge.to === assert.id)).toBe(true);
    expect(
      scenario.edges.some((edge) => {
        const from = byId.get(edge.from);
        return from?.kind === 'capture' && edge.to === assert.id;
      }),
    ).toBe(true);
    expect(scenario.edges.some((edge) => edge.from === start.id && edge.to === assert.id)).toBe(false);
  });

  it('enables Data rows tutorials with columns and multiple runs', () => {
    const file = parseFlowsFile(createTestingFlowsFile());
    const simple = findArtifact(file.items, TUTORIAL_API_SIMPLE_FLOW_ID);
    const advanced = findArtifact(file.items, TUTORIAL_API_ADVANCED_FLOW_ID);
    expect(simple?.kind).toBe('artifact');
    expect(advanced?.kind).toBe('artifact');
    if (simple?.kind !== 'artifact' || advanced?.kind !== 'artifact')
      return;

    const status = simple.scenarios.find((item) => item.id === 'fs_api_data_status');
    expect(status?.data.enabled).toBe(true);
    expect(status?.data.columns).toEqual(['code']);
    expect(status?.data.rows).toHaveLength(3);
    expect(status?.nodes.some((node) => node.kind === 'request')).toBe(true);

    const query = advanced.scenarios.find((item) => item.id === 'fs_api_data_query');
    expect(query?.data.enabled).toBe(true);
    expect(query?.data.columns).toEqual(['marker']);
    expect(query?.nodes.some((node) => node.kind === 'capture')).toBe(true);

    const post = advanced.scenarios.find((item) => item.id === 'fs_api_data_post');
    expect(post?.data.enabled).toBe(true);
    expect(post?.data.columns).toEqual(['product', 'qty']);
    expect(post?.data.rows).toHaveLength(3);
  });

  it('does not invent a Start→End wire on empty scenarios', () => {
    const start = { ...emptyFlowGraphNode('start', { x: 0, y: 0 }), id: 'start', name: 'Start' };
    const end = { ...emptyFlowGraphNode('end', { x: 400, y: 0 }), id: 'end', name: 'End' };
    const wired = ensureFlowScenarioTerminals({
      id: 's',
      name: 'Empty',
      enabled: true,
      folderId: null,
      nodes: [start, end],
      edges: [{ id: 'bypass', from: 'start', fromPort: 'next', to: 'end' }],
      data: { enabled: false, columns: [], rows: [] },
    });
    expect(wired.edges).toEqual([]);
  });
});
