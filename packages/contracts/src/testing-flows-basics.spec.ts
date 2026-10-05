import { describe, expect, it } from 'vitest';

import {
  flowHasStartToEndPath,
  flowNodeKindSchema,
  FLOW_DEVICE_NODES_ENABLED,
  isFlowDeviceKind,
  isFlowFrameKind,
  isFlowNestKind,
  isFlowTerminalKind,
  type FlowGraphNode,
  type FlowScenario,
} from './flow-graph';
import { parseFlowsFile } from './flows-file';
import type { FlowArtifactFields } from './flows-file';
import type { ServiceTreeNode } from './service-tree';
import {
  CONTROL_FLOW_FOLDERS,
  NODE_REFERENCE_FOLDERS,
  TUTORIAL_BASICS_FOLDER_ID,
  TUTORIAL_CONTROL_FLOW_FLOW_ID,
  TUTORIAL_NODE_REFERENCE_FLOW_ID,
  buildBasicsFolder,
  buildControlFlowFlow,
  buildNodeReferenceFlow,
} from './testing-flows-basics';

const NODE_W = 208;
const NODE_H = 64;
const NOTE_W = 248;
const NOTE_H = 96;
const FRAME_PAD = 24;
const FRAME_HEAD = 56;
/** The canvas treats larger child offsets as legacy absolute coordinates. */
const MAX_CHILD_X = NODE_W * 2;
const MAX_CHILD_Y = NODE_H * 3;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function childrenOf(scenario: FlowScenario, parentId: string | null): readonly FlowGraphNode[] {
  return scenario.nodes.filter((node) => node.parentId === parentId);
}

/** Mirrors the canvas layout so seeds cannot ship overlapping or oversized frames. */
function boxOf(scenario: FlowScenario, node: FlowGraphNode): Box {
  if (isFlowTerminalKind(node.kind))
    return { x: node.x, y: node.y, width: 28, height: 28 };
  if (node.kind === 'note')
    return { x: node.x, y: node.y, width: NOTE_W, height: NOTE_H };
  if (!isFlowNestKind(node.kind))
    return { x: node.x, y: node.y, width: NODE_W, height: NODE_H };

  const kids = childrenOf(scenario, node.id);
  if (kids.length === 0)
    return { x: node.x, y: node.y, width: NODE_W + FRAME_PAD * 2, height: FRAME_HEAD + NODE_H + FRAME_PAD };

  let right = 0;
  let bottom = 0;
  for (const kid of kids) {
    const box = boxOf(scenario, kid);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return {
    x: node.x,
    y: node.y,
    width: right + FRAME_PAD * 2,
    height: FRAME_HEAD + bottom + FRAME_PAD,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
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

const basics = buildBasicsFolder();
const nodeReference = buildNodeReferenceFlow();
const controlFlow = buildControlFlowFlow();
const allScenarios = [...nodeReference.scenarios, ...controlFlow.scenarios];

describe('tutorial basics folder', () => {
  it('ships a node reference and a control flow artifact', () => {
    expect(basics.kind).toBe('folder');
    expect(basics.id).toBe(TUTORIAL_BASICS_FOLDER_ID);
    expect(basics.children.map((item) => item.id)).toEqual([
      TUTORIAL_NODE_REFERENCE_FLOW_ID,
      TUTORIAL_CONTROL_FLOW_FLOW_ID,
    ]);
    expect(collectArtifacts(basics.children as ServiceTreeNode<FlowArtifactFields>[])).toHaveLength(2);
  });

  it('survives a parse round trip', () => {
    const file = parseFlowsFile({ items: [basics] });
    const parsed = collectArtifacts(file.items);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.scenarios).toHaveLength(nodeReference.scenarios.length);
    expect(parsed[1]?.scenarios).toHaveLength(controlFlow.scenarios.length);
  });
});

describe('node reference flow', () => {
  it('dedicates a scenario to every node kind', () => {
    const covered = new Map<string, string[]>();
    for (const scenario of nodeReference.scenarios) {
      for (const node of scenario.nodes) {
        const list = covered.get(node.kind) ?? [];
        if (!list.includes(scenario.id))
          list.push(scenario.id);
        covered.set(node.kind, list);
      }
    }
    for (const kind of flowNodeKindSchema.options) {
      if (kind === 'device-install')
        continue;
      if (!FLOW_DEVICE_NODES_ENABLED && isFlowDeviceKind(kind))
        continue;
      expect(covered.get(kind) ?? [], `no scenario uses ${kind}`).not.toHaveLength(0);
    }
  });

  it('files every scenario under a declared sidebar folder', () => {
    const expected = new Set(
      Object.entries(NODE_REFERENCE_FOLDERS)
        .filter(([key]) => FLOW_DEVICE_NODES_ENABLED || key !== 'device')
        .map(([, id]) => id),
    );
    const declared = new Set(nodeReference.scenarioFolders.map((item) => item.id));
    expect(declared).toEqual(expected);
    for (const scenario of nodeReference.scenarios)
      expect(declared.has(scenario.folderId ?? ''), `${scenario.name} has no folder`).toBe(true);
  });

  it('documents each scenario with a Group frame and String notes', () => {
    for (const scenario of nodeReference.scenarios) {
      expect(
        scenario.nodes.some((node) => node.kind === 'group'),
        `${scenario.name} has no Group frame`,
      ).toBe(true);
      const notes = scenario.nodes.filter((node) => node.kind === 'note');
      expect(notes.length, `${scenario.name} has no String note`).toBeGreaterThan(0);
      for (const note of notes)
        expect((note.config['text'] as string)?.length ?? 0).toBeGreaterThan(30);
    }
  });

  it('keeps the database sample disabled until a connection is picked', () => {
    const scenario = nodeReference.scenarios.find((item) => item.id === 'fs_ref_database');
    const query = scenario?.nodes.find((node) => node.kind === 'database');
    expect(query?.enabled).toBe(false);
    expect(query?.config['connectionId']).toBe('');
  });
});

describe('control flow flow', () => {
  it('files every scenario under a declared sidebar folder', () => {
    const declared = new Set(controlFlow.scenarioFolders.map((item) => item.id));
    expect(declared).toEqual(new Set(Object.values(CONTROL_FLOW_FOLDERS)));
    for (const scenario of controlFlow.scenarios)
      expect(declared.has(scenario.folderId ?? ''), `${scenario.name} has no folder`).toBe(true);
  });

  it('labels the then and else wires leaving every If', () => {
    for (const scenario of controlFlow.scenarios) {
      for (const gate of scenario.nodes.filter((node) => node.kind === 'if')) {
        const ports = scenario.edges.filter((edge) => edge.from === gate.id);
        expect(ports.map((edge) => edge.fromPort).sort(), `${scenario.name} If ports`).toEqual(['else', 'then']);
        for (const edge of ports)
          expect(edge.name?.length ?? 0, `${scenario.name} ${edge.fromPort} wire is unlabelled`).toBeGreaterThan(0);
      }
    }
  });

  it('wires both body and done on every container', () => {
    for (const scenario of controlFlow.scenarios) {
      for (const container of scenario.nodes.filter((node) => isFlowNestKind(node.kind) && !isFlowFrameKind(node.kind))) {
        const ports = new Set(
          scenario.edges.filter((edge) => edge.from === container.id).map((edge) => edge.fromPort),
        );
        expect([...ports].sort(), `${scenario.name} ${container.name}`).toEqual(['body', 'done']);
      }
    }
  });

  it('drives one scenario from Data rows', () => {
    const scenario = controlFlow.scenarios.find((item) => item.id === 'fs_ctl_data_rows');
    expect(scenario?.data.enabled).toBe(true);
    expect(scenario?.data.columns).toEqual(['code', 'label']);
    expect(scenario?.data.rows).toHaveLength(3);
  });

  it('covers every control node kind', () => {
    const kinds = new Set(controlFlow.scenarios.flatMap((scenario) => scenario.nodes.map((node) => node.kind)));
    for (const kind of ['if', 'for-each', 'while', 'retry', 'join', 'wait', 'group', 'note'] as const)
      expect(kinds.has(kind), `missing ${kind}`).toBe(true);
  });
});

describe('basics scenario graphs', () => {
  it('connects Start to End in every scenario', () => {
    for (const scenario of allScenarios)
      expect(flowHasStartToEndPath(scenario), `${scenario.name} cannot reach End`).toBe(true);
  });

  it('keeps node ids unique within each scenario', () => {
    for (const scenario of allScenarios) {
      const ids = scenario.nodes.map((node) => node.id);
      expect(new Set(ids).size, `${scenario.name} has duplicate node ids`).toBe(ids.length);
    }
  });

  it('keeps Wait for element Start terminal distinct from the Start click', () => {
    const scenario = allScenarios.find((item) => item.id === 'fs_ref_browser_wait_for');
    expect(scenario).toBeTruthy();
    const start = scenario!.nodes.find((node) => node.kind === 'start');
    const click = scenario!.nodes.find((node) => node.kind === 'browser-click');
    const open = scenario!.nodes.find((node) => node.kind === 'browser-open');
    expect(start?.id).toBe('fs_ref_browser_wait_for_start');
    expect(click?.id).toBe('fs_ref_browser_wait_for_go');
    expect(click?.parentId).toBe('fs_ref_browser_wait_for_p1');
    expect(open?.config['url']).toBe('https://the-internet.herokuapp.com/dynamic_loading/2');
    expect(scenario!.edges.some((edge) => edge.from === start!.id && edge.to === open!.id)).toBe(true);
  });

  it('never wires a String note as an edge source', () => {
    for (const scenario of allScenarios) {
      const notes = new Set(scenario.nodes.filter((node) => node.kind === 'note').map((node) => node.id));
      const wired = scenario.edges.filter((edge) => notes.has(edge.from) || notes.has(edge.to));
      expect(wired, `${scenario.name} wires a note`).toEqual([]);
    }
  });

  it('keeps nested coordinates inside the relative window the canvas expects', () => {
    for (const scenario of allScenarios) {
      for (const node of scenario.nodes) {
        if (!node.parentId)
          continue;
        expect(node.x, `${scenario.name}/${node.name} x`).toBeLessThanOrEqual(MAX_CHILD_X);
        expect(node.y, `${scenario.name}/${node.name} y`).toBeLessThanOrEqual(MAX_CHILD_Y);
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('lays out siblings without overlapping boxes', () => {
    for (const scenario of allScenarios) {
      const scopes = new Set<string | null>([null, ...scenario.nodes.map((node) => node.parentId)]);
      for (const scope of scopes) {
        const boxes = childrenOf(scenario, scope)
          .filter((node) => !isFlowTerminalKind(node.kind))
          .map((node) => ({ node, box: boxOf(scenario, node) }));
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i]!;
            const b = boxes[j]!;
            expect(
              overlaps(a.box, b.box),
              `${scenario.name}: ${a.node.name || a.node.kind} overlaps ${b.node.name || b.node.kind}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('gives every scenario a unique id and name', () => {
    const ids = allScenarios.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = allScenarios.map((scenario) => scenario.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
