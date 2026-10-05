import {
  emptyFlowGraphNode,
  ensureFlowScenarioTerminals,
  FLOW_DEVICE_NODES_ENABLED,
  type FlowGraphEdge,
  type FlowGraphNode,
  type FlowNodeConfigValue,
  type FlowNodeKind,
  type FlowPort,
  type FlowScenario,
  type FlowScenarioData,
  type FlowScenarioFolder,
} from './flow-graph';
import type { FlowArtifactFields } from './flows-file';
import type { ServiceFolderNode, ServiceTreeNode } from './service-tree';

const STAMP = '2026-09-21T12:00:00.000Z';

export const TUTORIAL_BASICS_FOLDER_ID = 'folder_tutorial_basics';
export const TUTORIAL_NODE_REFERENCE_FLOW_ID = 'flow_tutorial_node_reference';
export const TUTORIAL_CONTROL_FLOW_FLOW_ID = 'flow_tutorial_control_flow';

/** Scenario sidebar folders inside the Node reference flow. */
export const NODE_REFERENCE_FOLDERS = {
  canvas: 'sff_ref_canvas',
  control: 'sff_ref_control',
  data: 'sff_ref_data',
  validation: 'sff_ref_validation',
  browser: 'sff_ref_browser',
  device: 'sff_ref_device',
} as const;

/** Scenario sidebar folders inside the Control flow flow. */
export const CONTROL_FLOW_FOLDERS = {
  branch: 'sff_ctl_branch',
  loop: 'sff_ctl_loop',
  compose: 'sff_ctl_compose',
} as const;

const NODE_W = 208;
const NODE_H = 64;
const FRAME_PAD_X = 24;
const FRAME_HEAD = 56;
const FRAME_PAD_Y = 24;
/**
 * Children of a frame store coordinates relative to the frame content box.
 * The canvas treats large child offsets as legacy absolute coordinates, so the
 * inner grid stays inside a safe 2 x 2 window.
 */
const IN_COL = 260;
const IN_ROW = 130;
const FRAME_GAP = 110;
const NOTE_GAP = 72;
const NOTE_PITCH = 288;

type Config = Readonly<Record<string, FlowNodeConfigValue>>;

interface StepSpec {
  readonly key: string;
  readonly kind: FlowNodeKind;
  readonly name: string;
  readonly config?: Config;
  readonly enabled?: boolean;
}

interface PhaseSpec {
  readonly key: string;
  readonly title: string;
  readonly text: string;
  /** Up to four steps; laid out two per row inside the frame. */
  readonly steps: readonly StepSpec[];
}

interface NoteSpec {
  readonly key: string;
  readonly title: string;
  readonly text: string;
}

function mk(
  id: string,
  kind: FlowNodeKind,
  name: string,
  x: number,
  y: number,
  config: Config = {},
  parentId: string | null = null,
  enabled = true,
): FlowGraphNode {
  const base = emptyFlowGraphNode(kind, { x, y }, parentId);
  return { ...base, id, name, enabled, config: { ...base.config, ...config } };
}

function link(from: string, to: string, fromPort: FlowPort = 'next', name?: string): FlowGraphEdge {
  return {
    id: `e_${from}__${fromPort}__${to}`,
    from,
    fromPort,
    to,
    ...(name ? { name } : {}),
  };
}

const NO_DATA: FlowScenarioData = { enabled: false, columns: [], rows: [] };

function frameSize(count: number): { readonly width: number; readonly height: number } {
  const cols = Math.min(2, Math.max(1, count));
  const rows = Math.max(1, Math.ceil(count / 2));
  return {
    width: FRAME_PAD_X * 2 + (cols - 1) * IN_COL + NODE_W,
    height: FRAME_HEAD + (rows - 1) * IN_ROW + NODE_H + FRAME_PAD_Y,
  };
}

function withTerminals(
  id: string,
  nodes: readonly FlowGraphNode[],
  edges: readonly FlowGraphEdge[],
  entryIds: readonly string[],
  exitIds: readonly { readonly id: string; readonly port: FlowPort }[],
  contentWidth: number,
): { readonly nodes: FlowGraphNode[]; readonly edges: FlowGraphEdge[] } {
  const startId = `${id}_start`;
  const endId = `${id}_end`;
  return {
    nodes: [
      mk(startId, 'start', 'Start', -150, 40),
      ...nodes,
      mk(endId, 'end', 'End', contentWidth + 60, 40),
    ],
    edges: [
      ...entryIds.map((target) => link(startId, target)),
      ...edges,
      ...exitIds.map((exit) => link(exit.id, endId, exit.port)),
    ],
  };
}

function placeNotes(id: string, notes: readonly NoteSpec[], baselineY: number): FlowGraphNode[] {
  return notes.map((item, index) =>
    mk(`${id}_${item.key}`, 'note', item.title, index * NOTE_PITCH, baselineY, { text: item.text }),
  );
}

/**
 * Builds a documented scenario: every phase is a Group frame holding its steps,
 * the steps chain left to right, and String notes explain the lane underneath.
 */
function documented(params: {
  readonly id: string;
  readonly name: string;
  readonly folderId: string;
  readonly phases: readonly PhaseSpec[];
  readonly notes: readonly NoteSpec[];
  readonly data?: FlowScenarioData;
}): FlowScenario {
  const { id, phases } = params;
  const nodes: FlowGraphNode[] = [];
  const edges: FlowGraphEdge[] = [];
  const order: string[] = [];
  let x = 0;
  let tallest = 0;

  for (const phase of phases) {
    const size = frameSize(phase.steps.length);
    const frameId = `${id}_${phase.key}`;
    nodes.push(
      mk(frameId, 'group', phase.title, x, 0, {
        text: phase.text,
        width: size.width,
        height: size.height,
      }),
    );
    phase.steps.forEach((step, index) => {
      if (step.key === 'start' || step.key === 'end')
        throw new Error(`Scenario ${id}: step key "${step.key}" collides with terminal node ids`);
      const stepId = `${id}_${step.key}`;
      nodes.push(
        mk(
          stepId,
          step.kind,
          step.name,
          (index % 2) * IN_COL,
          Math.floor(index / 2) * IN_ROW,
          step.config ?? {},
          frameId,
          step.enabled !== false,
        ),
      );
      order.push(stepId);
    });
    tallest = Math.max(tallest, size.height);
    x += size.width + FRAME_GAP;
  }

  for (let index = 1; index < order.length; index += 1)
    edges.push(link(order[index - 1]!, order[index]!));

  nodes.push(...placeNotes(id, params.notes, tallest + NOTE_GAP));

  const wired = withTerminals(
    id,
    nodes,
    edges,
    order[0] ? [order[0]] : [],
    order.length > 0 ? [{ id: order[order.length - 1]!, port: 'next' }] : [],
    Math.max(0, x - FRAME_GAP),
  );

  return ensureFlowScenarioTerminals({
    id,
    name: params.name,
    enabled: true,
    folderId: params.folderId,
    nodes: wired.nodes,
    edges: wired.edges,
    data: params.data ?? NO_DATA,
  });
}

/** Builds a scenario from a hand-placed graph, then adds terminals and notes. */
function handmade(params: {
  readonly id: string;
  readonly name: string;
  readonly folderId: string;
  readonly nodes: readonly FlowGraphNode[];
  readonly edges: readonly FlowGraphEdge[];
  readonly entry: readonly string[];
  readonly exits: readonly { readonly id: string; readonly port: FlowPort }[];
  readonly notes: readonly NoteSpec[];
  readonly noteY: number;
  readonly data?: FlowScenarioData;
}): FlowScenario {
  const contentWidth = params.nodes.reduce(
    (max, node) => (node.parentId ? max : Math.max(max, node.x + NODE_W)),
    0,
  );
  const wired = withTerminals(
    params.id,
    [...params.nodes, ...placeNotes(params.id, params.notes, params.noteY)],
    params.edges,
    params.entry,
    params.exits,
    contentWidth,
  );
  return ensureFlowScenarioTerminals({
    id: params.id,
    name: params.name,
    enabled: true,
    folderId: params.folderId,
    nodes: wired.nodes,
    edges: wired.edges,
    data: params.data ?? NO_DATA,
  });
}

function flow(
  id: string,
  name: string,
  scenarioFolders: readonly FlowScenarioFolder[],
  scenarios: readonly FlowScenario[],
  extra: Partial<FlowArtifactFields> = {},
): ServiceTreeNode<FlowArtifactFields> {
  return {
    kind: 'artifact',
    id,
    name,
    updatedAt: STAMP,
    description: extra.description ?? '',
    tags: extra.tags ?? [],
    environmentId: extra.environmentId ?? 'env-local',
    docs: extra.docs ?? '',
    e2eReplay: extra.e2eReplay ?? 'slow',
    e2eShowWindow: extra.e2eShowWindow !== false,
    scenariosRunMode: extra.scenariosRunMode ?? 'sequential',
    scenarioFolders,
    scenarios,
    deviceSerial: extra.deviceSerial ?? '',
    apkPath: extra.apkPath ?? '',
    deviceStartEmulator: extra.deviceStartEmulator !== false,
    deviceShowEmulator: extra.deviceShowEmulator !== false,
  };
}

function folder(
  id: string,
  name: string,
  parentId: string | null = null,
): FlowScenarioFolder {
  return { id, name, parentId };
}

// ---------------------------------------------------------------------------
// Node reference — one scenario per node kind
// ---------------------------------------------------------------------------

const F = NODE_REFERENCE_FOLDERS;

function buildCanvasScenarios(): FlowScenario[] {
  const terminals = documented({
    id: 'fs_ref_terminals',
    name: 'Start and End',
    folderId: F.canvas,
    phases: [
      {
        key: 'p1',
        title: 'Between the two walls',
        text: 'Everything you build lives here',
        steps: [
          { key: 'first', kind: 'set-var', name: 'First step', config: { name: 'phase', value: 'begin' } },
          { key: 'last', kind: 'wait', name: 'Last step', config: { waitMs: 150 } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Start · fixed entry',
        text: 'Start is pinned to the left canvas wall. Every run begins there and starts each node wired from its port.',
      },
      {
        key: 'n2',
        title: 'End · fixed exit',
        text: 'End is pinned to the right wall. The scenario is finished once every branch that can reach End has arrived.',
      },
      {
        key: 'n3',
        title: 'They are not in the palette',
        text: 'Start and End are created with the scenario and cannot be added or deleted. Only the wiring is yours.',
      },
      {
        key: 'n4',
        title: 'Disconnected work is skipped',
        text: 'A node with no path from Start never runs. That is handy for parking a draft lane without deleting it.',
      },
    ],
  });

  const note = documented({
    id: 'fs_ref_note',
    name: 'String (note)',
    folderId: F.canvas,
    phases: [
      {
        key: 'p1',
        title: 'The only executable step',
        text: 'The four cards below are Strings — they never run',
        steps: [{ key: 'step', kind: 'wait', name: 'A real step', config: { waitMs: 100 } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'String · documentation only',
        text: 'A String node is freeform canvas text. It has no ports and never runs, so it cannot be wired into the graph.',
      },
      {
        key: 'n2',
        title: 'Title and body',
        text: 'The node name is the heading. The Text field in the inspector is the body you are reading right now.',
      },
      {
        key: 'n3',
        title: 'Use it for intent',
        text: 'Explain why a lane exists, record a ticket number, or warn about a flaky selector next to the step it affects.',
      },
      {
        key: 'n4',
        title: 'Moves like any node',
        text: 'Select, drag, copy, and delete a String exactly like a step. Marquee selection picks it up too.',
      },
    ],
  });

  const group = (() => {
    const id = 'fs_ref_group';
    const outer = mk(`${id}_frame`, 'group', 'Group · login block', 0, 0, {
      text: 'Docs frame — nest steps inside, no ports, skipped at run time',
      width: FRAME_PAD_X * 2 + IN_COL + NODE_W,
      height: FRAME_HEAD + IN_ROW + NODE_H + FRAME_PAD_Y,
    });
    const a = mk(`${id}_a`, 'set-var', 'Set user', 0, 0, { name: 'user', value: 'tomsmith' }, outer.id);
    const b = mk(`${id}_b`, 'set-var', 'Set password', IN_COL, 0, { name: 'pass', value: 'SuperSecretPassword!' }, outer.id);
    const c = mk(`${id}_c`, 'wait', 'Settle', 0, IN_ROW, { waitMs: 100 }, outer.id);
    const after = mk(`${id}_after`, 'assert-json', 'User is set', 640, 40, { expression: 'vars.user != null' });
    return handmade({
      id,
      name: 'Group frame',
      folderId: F.canvas,
      nodes: [outer, a, b, c, after],
      edges: [link(a.id, b.id), link(b.id, c.id), link(c.id, after.id)],
      entry: [a.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 330,
      notes: [
        {
          key: 'n1',
          title: 'Group · a frame, not a step',
          text: 'Group has no ports and no run logic. It only nests the steps you drop inside so a block reads as one unit.',
        },
        {
          key: 'n2',
          title: 'Transparent at run time',
          text: 'Nested steps still run in the outer graph. Wrapping steps in a Group never changes execution order.',
        },
        {
          key: 'n3',
          title: 'Resize and label',
          text: 'Select the frame and drag the corner handle. The name is the heading, the Text field is the caption.',
        },
      ],
    });
  })();

  return [terminals, note, group];
}

function buildControlReferenceScenarios(): FlowScenario[] {
  const ifElse = (() => {
    const id = 'fs_ref_if';
    const frame = mk(`${id}_frame`, 'group', 'If · two exclusive ports', 0, 0, {
      text: 'Then runs when the condition holds, Else runs otherwise',
      width: FRAME_PAD_X * 2 + IN_COL + NODE_W,
      height: FRAME_HEAD + IN_ROW + NODE_H + FRAME_PAD_Y,
    });
    const gate = mk(`${id}_if`, 'if', 'Status is 200?', 0, IN_ROW / 2, { condition: 'status == 200' }, frame.id);
    const then = mk(`${id}_then`, 'set-var', 'Mark healthy', IN_COL, 0, { name: 'health', value: 'ok' }, frame.id);
    const other = mk(`${id}_else`, 'set-var', 'Mark degraded', IN_COL, IN_ROW, { name: 'health', value: 'degraded' }, frame.id);
    const probe = mk(`${id}_probe`, 'request', 'GET /status/200', -320, 65, {
      method: 'GET',
      url: 'https://httpbin.org/status/200',
      body: '',
    });
    const join = mk(`${id}_join`, 'join', 'Join both paths', 640, 65);
    return handmade({
      id,
      name: 'If · Then and Else',
      folderId: F.control,
      nodes: [probe, frame, gate, then, other, join],
      edges: [
        link(probe.id, gate.id),
        link(gate.id, then.id, 'then', 'then'),
        link(gate.id, other.id, 'else', 'else'),
        link(then.id, join.id),
        link(other.id, join.id),
      ],
      entry: [probe.id],
      exits: [{ id: join.id, port: 'next' }],
      noteY: 330,
      notes: [
        {
          key: 'n1',
          title: 'If · the branching node',
          text: 'One condition, two ports. Exactly one of Then or Else is taken; the other subtree never starts.',
        },
        {
          key: 'n2',
          title: 'Condition field',
          text: 'Reads the last response and flow variables, for example status == 200, body.id != null, or vars.role == "admin".',
        },
        {
          key: 'n3',
          title: 'Rejoin with Join',
          text: 'Both ports feed one Join so the rest of the graph continues once, no matter which branch ran.',
        },
      ],
    });
  })();

  const forEach = (() => {
    const id = 'fs_ref_foreach';
    const arrange = mk(`${id}_frame`, 'group', 'Arrange', 0, 0, {
      text: 'The list the loop walks',
      width: FRAME_PAD_X * 2 + NODE_W,
      height: FRAME_HEAD + NODE_H + FRAME_PAD_Y,
    });
    const seed = mk(`${id}_seed`, 'set-var', 'Seed the list', 0, 0, {
      name: 'items',
      value: '["alpha","beta","gamma"]',
    }, arrange.id);
    const loop = mk(`${id}_each`, 'for-each', 'For each item', 380, 40, { items: 'items' });
    const body = mk(`${id}_body`, 'request', 'GET ?item={{item}}', 0, 0, {
      method: 'GET',
      url: 'https://httpbin.org/get?item={{item}}',
      body: '',
    }, loop.id);
    const check = mk(`${id}_ok`, 'assert-status', 'Each call is 200', IN_COL, 0, { expected: 200 }, loop.id);
    const after = mk(`${id}_after`, 'set-var', 'After the loop', 960, 40, { name: 'loopDone', value: '1' });
    return handmade({
      id,
      name: 'For each',
      folderId: F.control,
      nodes: [arrange, seed, loop, body, check, after],
      edges: [
        link(seed.id, loop.id),
        link(loop.id, body.id, 'body', 'per item'),
        link(body.id, check.id),
        link(loop.id, after.id, 'done', 'after all'),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 320,
      notes: [
        {
          key: 'n1',
          title: 'For each · repeat per item',
          text: 'Body runs once per entry in the list. Done fires a single time, after the last iteration finishes.',
        },
        {
          key: 'n2',
          title: 'Items field',
          text: 'Name a variable holding a JSON array, or a path into the last response. Here it is the items variable.',
        },
        {
          key: 'n3',
          title: 'The item variable',
          text: 'Inside the body the current entry is available as {{item}}, so URLs and bodies can be templated.',
        },
        {
          key: 'n4',
          title: 'A real container',
          text: 'Unlike Group, For each owns its children. Steps inside run in the loop scope, not the outer graph.',
        },
      ],
    });
  })();

  const whileLoop = (() => {
    const id = 'fs_ref_while';
    const arrange = mk(`${id}_frame`, 'group', 'Arrange', 0, 0, {
      text: 'State the condition reads',
      width: FRAME_PAD_X * 2 + NODE_W,
      height: FRAME_HEAD + NODE_H + FRAME_PAD_Y,
    });
    const seed = mk(`${id}_seed`, 'set-var', 'Start at zero', 0, 0, { name: 'tries', value: '0' }, arrange.id);
    const loop = mk(`${id}_while`, 'while', 'While not ready', 380, 40, {
      condition: 'vars.ready == "yes"',
      maxIterations: 5,
    });
    const poll = mk(`${id}_poll`, 'request', 'Poll the API', 0, 0, {
      method: 'GET',
      url: 'https://httpbin.org/get?poll=1',
      body: '',
    }, loop.id);
    const pause = mk(`${id}_pause`, 'wait', 'Back off', IN_COL, 0, { waitMs: 250 }, loop.id);
    const after = mk(`${id}_after`, 'assert-json', 'Loop finished', 960, 40, { expression: 'vars.tries != null' });
    return handmade({
      id,
      name: 'While',
      folderId: F.control,
      nodes: [arrange, seed, loop, poll, pause, after],
      edges: [
        link(seed.id, loop.id),
        link(loop.id, poll.id, 'body', 'while true'),
        link(poll.id, pause.id),
        link(loop.id, after.id, 'done', 'when false'),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 320,
      notes: [
        {
          key: 'n1',
          title: 'While · repeat on a condition',
          text: 'The condition is tested before every pass. Body runs while it holds; Done continues once it fails.',
        },
        {
          key: 'n2',
          title: 'Max iterations',
          text: 'A hard stop that protects against a condition that never flips. The loop also ends when the cap is hit.',
        },
        {
          key: 'n3',
          title: 'Polling pattern',
          text: 'Request plus Wait inside the body is the usual shape: ask, pause, ask again until the resource is ready.',
        },
      ],
    });
  })();

  const retry = (() => {
    const id = 'fs_ref_retry';
    const arrange = mk(`${id}_frame`, 'group', 'Arrange', 0, 0, {
      text: 'How many attempts we allow',
      width: FRAME_PAD_X * 2 + NODE_W,
      height: FRAME_HEAD + NODE_H + FRAME_PAD_Y,
    });
    const seed = mk(`${id}_seed`, 'set-var', 'Attempt budget', 0, 0, { name: 'budget', value: '3' }, arrange.id);
    const block = mk(`${id}_retry`, 'retry', 'Retry flaky call', 380, 40, { attempts: 3 });
    const call = mk(`${id}_call`, 'request', 'GET /delay/1', 0, 0, {
      method: 'GET',
      url: 'https://httpbin.org/delay/1',
      body: '',
    }, block.id);
    const ok = mk(`${id}_ok`, 'assert-status', 'Must be 200', IN_COL, 0, { expected: 200 }, block.id);
    const after = mk(`${id}_after`, 'set-var', 'Settled', 960, 40, { name: 'settled', value: 'yes' });
    return handmade({
      id,
      name: 'Retry',
      folderId: F.control,
      nodes: [arrange, seed, block, call, ok, after],
      edges: [
        link(seed.id, block.id),
        link(block.id, call.id, 'body', 'attempt'),
        link(call.id, ok.id),
        link(block.id, after.id, 'done', 'on success'),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 320,
      notes: [
        {
          key: 'n1',
          title: 'Retry · re-run on failure',
          text: 'The whole body is repeated when any step inside it fails. Done continues after the first clean pass.',
        },
        {
          key: 'n2',
          title: 'Attempts',
          text: 'Total tries, not extra tries. With 3 attempts a step that keeps failing runs three times, then the run fails.',
        },
        {
          key: 'n3',
          title: 'Keep the body small',
          text: 'Wrap only the unstable call and its assertion. A wide body repeats side effects you did not want to repeat.',
        },
      ],
    });
  })();

  const join = (() => {
    const id = 'fs_ref_join';
    const arrange = mk(`${id}_frame`, 'group', 'Arrange', 0, 130, {
      text: 'One step, then three lanes',
      width: FRAME_PAD_X * 2 + NODE_W,
      height: FRAME_HEAD + NODE_H + FRAME_PAD_Y,
    });
    const seed = mk(`${id}_seed`, 'set-var', 'Start the fan-out', 0, 0, { name: 'fanIn', value: 'pending' }, arrange.id);
    const a = mk(`${id}_a`, 'request', 'Lane A · /get', 380, 0, { method: 'GET', url: 'https://httpbin.org/get', body: '' });
    const b = mk(`${id}_b`, 'request', 'Lane B · /uuid', 380, 150, { method: 'GET', url: 'https://httpbin.org/uuid', body: '' });
    const c = mk(`${id}_c`, 'request', 'Lane C · /headers', 380, 300, { method: 'GET', url: 'https://httpbin.org/headers', body: '' });
    const gate = mk(`${id}_join`, 'join', 'Wait for all three', 700, 150);
    const after = mk(`${id}_after`, 'set-var', 'All lanes done', 1020, 150, { name: 'fanIn', value: 'complete' });
    return handmade({
      id,
      name: 'Join',
      folderId: F.control,
      nodes: [arrange, seed, a, b, c, gate, after],
      edges: [
        link(seed.id, a.id),
        link(seed.id, b.id),
        link(seed.id, c.id),
        link(a.id, gate.id),
        link(b.id, gate.id),
        link(c.id, gate.id),
        link(gate.id, after.id),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 430,
      notes: [
        {
          key: 'n1',
          title: 'Join · wait for every branch',
          text: 'Join stays pending until all of its incoming wires have completed, then continues exactly once.',
        },
        {
          key: 'n2',
          title: 'Parallel by default',
          text: 'Start feeds three lanes here, so they run at the same time. Join is what makes them meet again.',
        },
        {
          key: 'n3',
          title: 'Also closes If',
          text: 'Use it after Then and Else too. Only the branch that ran arrives, so the graph continues without duplication.',
        },
      ],
    });
  })();

  const wait = documented({
    id: 'fs_ref_wait',
    name: 'Wait',
    folderId: F.control,
    phases: [
      {
        key: 'p1',
        title: '1 · Trigger work',
        text: 'Something asynchronous starts here',
        steps: [
          {
            key: 'kick',
            kind: 'request',
            name: 'POST /post',
            config: { method: 'POST', url: 'https://httpbin.org/post', body: '{"job":"tutorial"}' },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Wait',
        text: 'Pause the branch before continuing',
        steps: [{ key: 'pause', kind: 'wait', name: 'Pause 400 ms', config: { waitMs: 400 } }],
      },
      {
        key: 'p3',
        title: '3 · Continue',
        text: 'Now read the result',
        steps: [{ key: 'ok', kind: 'assert-status', name: 'Job accepted', config: { expected: 200 } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Wait · a fixed pause',
        text: 'Blocks only its own branch for the configured milliseconds. Parallel lanes keep running meanwhile.',
      },
      {
        key: 'n2',
        title: 'Prefer waiting for a fact',
        text: 'Wait for element or a While poll beats a fixed sleep. Use Wait for rate limits and animation settling.',
      },
    ],
  });

  const trigger = documented({
    id: 'fs_ref_trigger',
    name: 'Run flow (trigger)',
    folderId: F.control,
    phases: [
      {
        key: 'p1',
        title: '1 · Prepare input',
        text: 'Variables set here are visible to the called flow',
        steps: [
          { key: 'seed', kind: 'set-var', name: 'Set tenant', config: { name: 'tenant', value: 'acme' } },
        ],
      },
      {
        key: 'p2',
        title: '2 · Run another flow',
        text: 'Pick the target flow in the inspector',
        steps: [
          {
            key: 'call',
            kind: 'trigger',
            name: 'Run Node reference',
            config: { flowId: TUTORIAL_NODE_REFERENCE_FLOW_ID },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Continue here',
        text: 'The parent resumes once the child flow ends',
        steps: [{ key: 'after', kind: 'wait', name: 'Settle', config: { waitMs: 100 } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Run flow · reuse a whole flow',
        text: 'Calls another saved flow as one step. Good for login, seeding, and teardown you repeat everywhere.',
      },
      {
        key: 'n2',
        title: 'Flow id field',
        text: 'Holds the id of the flow to run. Point it at a small helper flow rather than a large suite.',
      },
      {
        key: 'n3',
        title: 'Mind recursion',
        text: 'A flow that triggers itself will not terminate. Keep the call graph one or two levels deep.',
      },
    ],
  });

  const manual = documented({
    id: 'fs_ref_manual',
    name: 'Manual step',
    folderId: F.control,
    phases: [
      {
        key: 'p1',
        title: '1 · Automate what you can',
        text: 'Get the system into the state a human must inspect',
        steps: [
          {
            key: 'call',
            kind: 'request',
            name: 'GET /json',
            config: { method: 'GET', url: 'https://httpbin.org/json', body: '' },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Ask a human',
        text: 'The run pauses until the prompt is answered',
        steps: [
          {
            key: 'ask',
            kind: 'manual',
            name: 'Confirm the payload',
            config: { prompt: 'Does the slideshow payload look correct? Type yes to continue.', variable: 'manual' },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Resume',
        text: 'Automation carries on after the confirmation',
        steps: [{ key: 'ok', kind: 'assert-status', name: 'Still 200', config: { expected: 200 } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Manual · a human gate',
        text: 'Pauses the branch and shows the prompt. Use it for checks a machine cannot make, like visual judgement.',
      },
      {
        key: 'n2',
        title: 'Keep it out of suites',
        text: 'The run pauses on an in-app prompt. The human must enter text; that value is stored in a flow variable (default {{manual}}) for later steps. Disable this node before adding the flow to a regression pack.',
      },
    ],
  });

  return [ifElse, forEach, whileLoop, retry, join, wait, trigger, manual];
}

function buildDataReferenceScenarios(): FlowScenario[] {
  const request = documented({
    id: 'fs_ref_request',
    name: 'HTTP request',
    folderId: F.data,
    phases: [
      {
        key: 'p1',
        title: '1 · Arrange',
        text: 'Variables resolve inside URL, headers, and body',
        steps: [{ key: 'seed', kind: 'set-var', name: 'Set marker', config: { name: 'marker', value: 'tutorial' } }],
      },
      {
        key: 'p2',
        title: '2 · HTTP request',
        text: 'Calls the API and keeps the response for later nodes',
        steps: [
          {
            key: 'get',
            kind: 'request',
            name: 'GET /get',
            config: { method: 'GET', url: 'https://httpbin.org/get?marker={{marker}}', body: '' },
          },
          {
            key: 'post',
            kind: 'request',
            name: 'POST /post',
            config: { method: 'POST', url: 'https://httpbin.org/post', body: '{"marker":"{{marker}}"}' },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Check',
        text: 'Assertions read the most recent exchange',
        steps: [
          { key: 'ok', kind: 'assert-status', name: 'Status 200', config: { expected: 200 } },
          { key: 'echo', kind: 'assert-json', name: 'Body echoed', config: { expression: 'body.json != null' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'HTTP request · the workhorse',
        text: 'Sends a call from the desktop host and stores status, headers, and body as the current exchange.',
      },
      {
        key: 'n2',
        title: 'Config',
        text: 'Method, URL, and body. Environment variables and captured values are templated with double braces.',
      },
      {
        key: 'n3',
        title: 'Feeds the next nodes',
        text: 'Validate status, Validate value, and Capture all read whichever request ran immediately before them.',
      },
    ],
  });

  const setVar = documented({
    id: 'fs_ref_set_var',
    name: 'Set variable',
    folderId: F.data,
    phases: [
      {
        key: 'p1',
        title: '1 · Write values',
        text: 'Literal text or a template built from other variables',
        steps: [
          { key: 'a', kind: 'set-var', name: 'Set tenant', config: { name: 'tenant', value: 'acme' } },
          { key: 'b', kind: 'set-var', name: 'Build path', config: { name: 'path', value: '/orgs/{{tenant}}' } },
        ],
      },
      {
        key: 'p2',
        title: '2 · Use them',
        text: 'Any later field can read the variable',
        steps: [
          {
            key: 'call',
            kind: 'request',
            name: 'GET with path',
            config: { method: 'GET', url: 'https://httpbin.org/get?path={{path}}', body: '' },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Check',
        text: 'Variables are visible to assertions too',
        steps: [
          { key: 'ok', kind: 'assert-json', name: 'Path resolved', config: { expression: 'vars.path != null' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Set variable · flow state',
        text: 'Writes one named value into the flow scope. Later nodes read it as {{name}} in any text field.',
      },
      {
        key: 'n2',
        title: 'Templates compose',
        text: 'A value may reference earlier variables, so you can assemble URLs and payloads step by step.',
      },
      {
        key: 'n3',
        title: 'Scope',
        text: 'Variables live for the scenario run. Data rows and captures write into the same namespace.',
      },
    ],
  });

  const capture = documented({
    id: 'fs_ref_capture',
    name: 'Capture',
    folderId: F.data,
    phases: [
      {
        key: 'p1',
        title: '1 · Make an exchange',
        text: 'Capture always reads the previous HTTP node',
        steps: [
          {
            key: 'call',
            kind: 'request',
            name: 'POST /post',
            config: { method: 'POST', url: 'https://httpbin.org/post', body: '{"orderId":"A-42"}' },
          },
          { key: 'ok', kind: 'assert-status', name: 'Status 200', config: { expected: 200 } },
        ],
      },
      {
        key: 'p2',
        title: '2 · Capture',
        text: 'One node, three rule kinds at once',
        steps: [
          {
            key: 'grab',
            kind: 'capture',
            name: 'Capture id, header, body',
            config: {
              rules: JSON.stringify([
                { kind: 'json', path: 'json.orderId', name: 'orderId' },
                { kind: 'header', path: 'content-type', name: 'contentType' },
                { kind: 'body', path: '', name: 'rawBody' },
              ]),
            },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Reuse',
        text: 'Captured names behave like any other variable',
        steps: [
          { key: 'check', kind: 'assert-json', name: 'Order captured', config: { expression: "orderId == 'A-42'" } },
          {
            key: 'next',
            kind: 'request',
            name: 'GET order',
            config: { method: 'GET', url: 'https://httpbin.org/get?order={{orderId}}', body: '' },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Capture · pull values out',
        text: 'Stores parts of the last exchange into variables: a JSON path, a header, the raw body, or the status.',
      },
      {
        key: 'n2',
        title: 'Rules list',
        text: 'Each rule has a kind, a path, and the variable name to write. Add as many rules as one response needs.',
      },
      {
        key: 'n3',
        title: 'Classic use',
        text: 'Grab a token or an id from the first call and template it into every request that follows.',
      },
    ],
  });

  const cache = documented({
    id: 'fs_ref_cache',
    name: 'Cache once',
    folderId: F.data,
    phases: [
      {
        key: 'p1',
        title: '1 · Expensive setup',
        text: 'Work you only want to pay for once',
        steps: [
          {
            key: 'login',
            kind: 'request',
            name: 'POST login',
            config: { method: 'POST', url: 'https://httpbin.org/post', body: '{"user":"tomsmith"}' },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Cache once',
        text: 'Keyed — the first run fills it, later runs skip',
        steps: [{ key: 'once', kind: 'cache', name: 'Cache session', config: { key: 'tutorial-session' } }],
      },
      {
        key: 'p3',
        title: '3 · Always runs',
        text: 'Steps after the cache node run every time',
        steps: [{ key: 'ok', kind: 'assert-status', name: 'Session ready', config: { expected: 200 } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Cache once · run the first time only',
        text: 'Marks a branch as already done for the given key, so repeated scenario runs skip the expensive part.',
      },
      {
        key: 'n2',
        title: 'Key field',
        text: 'Anything unique and stable. Two scenarios sharing a key share the cached result.',
      },
    ],
  });

  const database = documented({
    id: 'fs_ref_database',
    name: 'Database query',
    folderId: F.data,
    phases: [
      {
        key: 'p1',
        title: '1 · Pick a connection',
        text: 'Connections come from the Database sidebar',
        steps: [
          { key: 'seed', kind: 'set-var', name: 'Set email', config: { name: 'email', value: 'demo@testrix.dev' } },
        ],
      },
      {
        key: 'p2',
        title: '2 · Database query',
        text: 'Disabled by default — add a connection id to run it',
        steps: [
          {
            key: 'sql',
            kind: 'database',
            name: 'SELECT the user',
            enabled: false,
            config: {
              connectionId: '',
              query: "SELECT id, email FROM users WHERE email = '{{email}}' LIMIT 1",
            },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Use the rows',
        text: 'Assert on the result or capture a column',
        steps: [
          { key: 'ok', kind: 'assert-json', name: 'Email variable set', config: { expression: 'vars.email != null' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Database query · real SQL',
        text: 'Runs a statement against a saved connection on this machine and keeps the rows for the next nodes.',
      },
      {
        key: 'n2',
        title: 'Why it ships disabled',
        text: 'The tutorial has no connection id. Open the node, pick one of your connections, then enable the step.',
      },
      {
        key: 'n3',
        title: 'Seed and verify',
        text: 'Typical use is arranging fixture rows before an API call, then checking what the API wrote back.',
      },
    ],
  });

  const listener = documented({
    id: 'fs_ref_listener',
    name: 'HTTP listener',
    folderId: F.data,
    phases: [
      {
        key: 'p1',
        title: '1 · Arm the listener',
        text: 'Matches traffic and continues immediately',
        steps: [
          {
            key: 'listen',
            kind: 'http-listener',
            name: 'Listen for /get',
            config: {
              stage: 'response',
              method: 'GET',
              match: 'contains',
              url: '/get',
              headerName: '',
              headerValue: '',
              bodyContains: '',
              waitMs: 8000,
            },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Cause the traffic',
        text: 'Anything that hits the matched URL wakes the listener',
        steps: [
          {
            key: 'call',
            kind: 'request',
            name: 'GET /get',
            config: { method: 'GET', url: 'https://httpbin.org/get?from=listener', body: '' },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Validate the hit',
        text: 'Validate HTTP waits for the armed match, then asserts',
        steps: [
          { key: 'check', kind: 'http-validate', name: 'Hit was 200', config: { expected: 200 } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'HTTP listener · watch traffic',
        text: 'Arms a matcher for stage, method, and URL, then continues. It observes traffic without changing it. On Device flows it uses the emulator MITM proxy; otherwise browser CDP or Mock can supply hits.',
      },
      {
        key: 'n2',
        title: 'Match fields',
        text: 'Stage is request or response. Method may be a wildcard. Match is contains, equals, path, or regex. Optional header and body filters narrow the hit. Wait is how long Validate keeps the arm open.',
      },
      {
        key: 'n3',
        title: 'Pair it with a validator',
        text: 'Wire Validate HTTP or Validate status after it. That node blocks until the matching hit arrives. Certificate-pinned apps will not appear on the MITM proxy.',
      },
    ],
  });

  const interceptor = documented({
    id: 'fs_ref_interceptor',
    name: 'HTTP interceptor',
    folderId: F.data,
    phases: [
      {
        key: 'p1',
        title: '1 · Arm the interceptor',
        text: 'Same matching as the listener, but it can answer',
        steps: [
          {
            key: 'arm',
            kind: 'http-interceptor',
            name: 'Intercept /status/*',
            config: {
              stage: 'request',
              method: '*',
              match: 'contains',
              url: '/status/',
              headerName: '',
              headerValue: '',
              bodyContains: '',
              waitMs: 8000,
              action: 'passthrough',
              setHeaders: '[]',
              removeHeaders: '[]',
              setBody: '',
              bodyMode: 'json',
              mockStatus: 200,
              mockBody: '{\n}\n',
            },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Trigger it',
        text: 'The armed rule applies to the next matching call',
        steps: [
          {
            key: 'call',
            kind: 'request',
            name: 'GET /status/200',
            config: { method: 'GET', url: 'https://httpbin.org/status/200', body: '' },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Validate',
        text: 'Assert what the caller actually received',
        steps: [{ key: 'check', kind: 'http-validate', name: 'Saw 200', config: { expected: 200 } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'HTTP interceptor · change traffic',
        text: 'Arms a rule that matches like Listen, then passthrough (edit headers/body), mock a response, or block. On Device flows this runs on the local MITM proxy.',
      },
      {
        key: 'n2',
        title: 'Listener versus interceptor',
        text: 'Listener watches and never alters the response. Interceptor is the one that can rewrite, substitute, or refuse the call.',
      },
      {
        key: 'n3',
        title: 'Fault injection and pinning',
        text: 'Force a 500 or block one endpoint to prove retry paths. Apps that pin certificates bypass the MITM and will not match.',
      },
    ],
  });

  const httpValidate = documented({
    id: 'fs_ref_http_validate',
    name: 'Validate HTTP',
    folderId: F.data,
    phases: [
      {
        key: 'p1',
        title: '1 · Produce an exchange',
        text: 'A request, listener, or interceptor before it',
        steps: [
          {
            key: 'call',
            kind: 'request',
            name: 'GET /status/201',
            config: { method: 'GET', url: 'https://httpbin.org/status/201', body: '' },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Validate HTTP',
        text: 'Waits for the hit if needed, then asserts the status',
        steps: [{ key: 'check', kind: 'http-validate', name: 'Expect 201', config: { expected: 201 } }],
      },
      {
        key: 'p3',
        title: '3 · Continue',
        text: 'Failure stops this branch immediately',
        steps: [{ key: 'after', kind: 'set-var', name: 'Verified', config: { name: 'verified', value: 'yes' } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Validate HTTP · status with waiting',
        text: 'Checks the previous HTTP node. After a listener or interceptor it first blocks until the hit lands.',
      },
      {
        key: 'n2',
        title: 'Versus Validate status',
        text: 'Validate status asserts what is already there. Validate HTTP is the one to use with armed traffic.',
      },
    ],
  });

  return [request, setVar, capture, cache, database, listener, interceptor, httpValidate];
}

function buildValidationReferenceScenarios(): FlowScenario[] {
  const status = documented({
    id: 'fs_ref_assert_status',
    name: 'Validate status',
    folderId: F.validation,
    phases: [
      {
        key: 'p1',
        title: '1 · Call the API',
        text: 'The node under test reads this exchange',
        steps: [
          {
            key: 'call',
            kind: 'request',
            name: 'GET /status/204',
            config: { method: 'GET', url: 'https://httpbin.org/status/204', body: '' },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Validate status',
        text: 'Compares the HTTP status code',
        steps: [{ key: 'ok', kind: 'assert-status', name: 'Expect 204', config: { expected: 204 } }],
      },
      {
        key: 'p3',
        title: '3 · Continue',
        text: 'Only reached when the assertion passed',
        steps: [{ key: 'after', kind: 'wait', name: 'Settle', config: { waitMs: 80 } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Validate status · the code only',
        text: 'Asserts the status of the previous connected node. The fastest smoke check you can wire.',
      },
      {
        key: 'n2',
        title: 'Expected field',
        text: 'One numeric code. To accept a range, use Validate value with an expression instead.',
      },
    ],
  });

  const value = documented({
    id: 'fs_ref_assert_json',
    name: 'Validate value',
    folderId: F.validation,
    phases: [
      {
        key: 'p1',
        title: '1 · Get a payload',
        text: 'A JSON response to inspect',
        steps: [
          {
            key: 'call',
            kind: 'request',
            name: 'GET /json',
            config: { method: 'GET', url: 'https://httpbin.org/json', body: '' },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Validate value',
        text: 'Expressions over body, status, and variables',
        steps: [
          { key: 'a', kind: 'assert-json', name: 'Body has slideshow', config: { expression: 'body.slideshow != null' } },
          { key: 'b', kind: 'assert-json', name: 'Status under 300', config: { expression: 'status < 300' } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Capture and re-check',
        text: 'Expressions can read captured variables too',
        steps: [
          {
            key: 'grab',
            kind: 'capture',
            name: 'Capture author',
            config: { rules: JSON.stringify([{ kind: 'json', path: 'slideshow.author', name: 'author' }]) },
          },
          { key: 'c', kind: 'assert-json', name: 'Author captured', config: { expression: 'author != null' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Validate value · flexible assertion',
        text: 'Evaluates an expression against the last response and the flow variables. Fails the branch when false.',
      },
      {
        key: 'n2',
        title: 'What you can reference',
        text: 'body for the parsed payload, status for the code, vars for flow state, and captured names directly.',
      },
      {
        key: 'n3',
        title: 'Operators',
        text: 'Comparisons and null checks read naturally, for example body.items.length > 0 or role == "admin".',
      },
    ],
  });

  const text = documented({
    id: 'fs_ref_assert_text',
    name: 'Validate html text',
    folderId: F.validation,
    phases: [
      {
        key: 'p1',
        title: '1 · Open a page',
        text: 'Text assertions need a browser step before them',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open login',
            config: { url: 'https://the-internet.herokuapp.com/login', width: 1200, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Validate html text',
        text: 'Matches the text content of a selector',
        steps: [
          {
            key: 'check',
            kind: 'assert-text',
            name: 'Heading says Login',
            config: { selector: 'h2', match: 'contains', expected: 'Login Page' },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Prove it after an action',
        text: 'The same node works on flash messages',
        steps: [
          { key: 'submit', kind: 'browser-click', name: 'Submit empty', config: { selector: 'button[type="submit"]' } },
          {
            key: 'flash',
            kind: 'assert-text',
            name: 'Flash warns',
            config: { selector: '#flash', match: 'contains', expected: 'Your username is invalid!' },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Validate html text · read the DOM',
        text: 'Asserts the text inside the matched element on the page the previous browser step left open.',
      },
      {
        key: 'n2',
        title: 'Match modes',
        text: 'Contains is forgiving about whitespace and surrounding copy. Equals demands the exact string.',
      },
      {
        key: 'n3',
        title: 'Pick the selector',
        text: 'Use the Pick button next to the Selector field to choose the element in a live browser window.',
      },
    ],
  });

  const visible = documented({
    id: 'fs_ref_assert_visible',
    name: 'Validate visible',
    folderId: F.validation,
    phases: [
      {
        key: 'p1',
        title: '1 · Open a page',
        text: 'Anything with elements to look at',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open checkboxes',
            config: { url: 'https://the-internet.herokuapp.com/checkboxes', width: 1100, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Validate visible',
        text: 'Element exists and is actually on screen',
        steps: [
          { key: 'form', kind: 'assert-visible', name: 'Form is visible', config: { selector: '#checkboxes' } },
          { key: 'box', kind: 'assert-visible', name: 'First box visible', config: { selector: '#checkboxes input' } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Shoot the evidence',
        text: 'A screenshot documents the passing state',
        steps: [
          { key: 'shot', kind: 'browser-screenshot', name: 'Capture page', config: { name: 'ref-visible' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Validate visible · on screen',
        text: 'Stronger than existence. A node hidden by display none or zero size fails this assertion.',
      },
      {
        key: 'n2',
        title: 'Good for empty states',
        text: 'Assert the spinner is gone and the real content is visible before you start reading values.',
      },
    ],
  });

  const url = documented({
    id: 'fs_ref_assert_url',
    name: 'Validate URL',
    folderId: F.validation,
    phases: [
      {
        key: 'p1',
        title: '1 · Log in',
        text: 'An action that navigates the browser',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open login',
            config: { url: 'https://the-internet.herokuapp.com/login', width: 1200, height: 800 },
          },
          {
            key: 'user',
            kind: 'browser-type',
            name: 'Username',
            config: { selector: '#username', text: 'tomsmith', clearFirst: true },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Submit',
        text: 'Navigation is asynchronous',
        steps: [
          {
            key: 'pass',
            kind: 'browser-type',
            name: 'Password',
            config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true },
          },
          { key: 'go', kind: 'browser-click', name: 'Login', config: { selector: 'button[type="submit"]' } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Validate URL',
        text: 'Waits for redirects before it decides',
        steps: [
          {
            key: 'check',
            kind: 'assert-url',
            name: 'Landed on /secure',
            config: { match: 'contains', expected: '/secure', timeoutMs: 8000 },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Validate URL · where did we land',
        text: 'Asserts the address of the current page and keeps polling while redirects are still in flight.',
      },
      {
        key: 'n2',
        title: 'Timeout field',
        text: 'How long to wait for the expected address. Raise it for slow single sign-on hops.',
      },
      {
        key: 'n3',
        title: 'Contains beats equals',
        text: 'Session ids and query strings change between runs, so match on the stable part of the path.',
      },
    ],
  });

  return [status, value, text, visible, url];
}

function buildBrowserReferenceScenarios(): FlowScenario[] {
  const open = documented({
    id: 'fs_ref_browser_open',
    name: 'Open browser',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Open browser',
        text: 'Launches the window every later browser step shares',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open The Internet',
            config: { url: 'https://the-internet.herokuapp.com/', width: 1200, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Prove it loaded',
        text: 'Wait for a real element, not a fixed sleep',
        steps: [
          { key: 'wait', kind: 'browser-wait-for', name: 'Wait for menu', config: { selector: 'ul li a', timeoutMs: 8000 } },
          { key: 'text', kind: 'assert-text', name: 'Heading', config: { selector: 'h1', match: 'contains', expected: 'Welcome' } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Navigate again',
        text: 'Opening a second URL reuses the same window',
        steps: [
          {
            key: 'second',
            kind: 'browser-open',
            name: 'Open dropdown',
            config: { url: 'https://the-internet.herokuapp.com/dropdown', width: 1200, height: 800 },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Open browser · start the session',
        text: 'Every browser scenario begins here. It creates the shared window that later steps drive.',
      },
      {
        key: 'n2',
        title: 'Config',
        text: 'URL plus window width and height. The size matters when your layout is responsive.',
      },
      {
        key: 'n3',
        title: 'Watch or hide',
        text: 'Flow settings choose whether the window is visible and how slowly the replay is paced.',
      },
    ],
  });

  const click = documented({
    id: 'fs_ref_browser_click',
    name: 'Click',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Open a page',
        text: 'Add and remove elements is easy to observe',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open add/remove',
            config: { url: 'https://the-internet.herokuapp.com/add_remove_elements/', width: 1100, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Click',
        text: 'Each click adds one Delete button',
        steps: [
          { key: 'a', kind: 'browser-click', name: 'Add element', config: { selector: 'button[onclick="addElement()"]' } },
          { key: 'b', kind: 'browser-click', name: 'Add again', config: { selector: 'button[onclick="addElement()"]' } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Check the effect',
        text: 'Assert the DOM changed the way you expect',
        steps: [
          { key: 'vis', kind: 'assert-visible', name: 'Delete is there', config: { selector: '.added-manually' } },
          { key: 'del', kind: 'browser-click', name: 'Remove one', config: { selector: '.added-manually' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Click · press an element',
        text: 'Clicks the first element the selector matches, after scrolling it into view.',
      },
      {
        key: 'n2',
        title: 'When it fails',
        text: 'A missing or covered element fails the step. Put Wait for element in front of anything async.',
      },
    ],
  });

  const type = documented({
    id: 'fs_ref_browser_type',
    name: 'Type',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Open the form',
        text: 'The login form on The Internet',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open login',
            config: { url: 'https://the-internet.herokuapp.com/login', width: 1200, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Type',
        text: 'Clear first replaces whatever was in the field',
        steps: [
          {
            key: 'user',
            kind: 'browser-type',
            name: 'Username',
            config: { selector: '#username', text: 'tomsmith', clearFirst: true },
          },
          {
            key: 'pass',
            kind: 'browser-type',
            name: 'Password',
            config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Submit and verify',
        text: 'Typed values drive the real login',
        steps: [
          { key: 'go', kind: 'browser-click', name: 'Login', config: { selector: 'button[type="submit"]' } },
          { key: 'url', kind: 'assert-url', name: 'On /secure', config: { match: 'contains', expected: '/secure' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Type · fill an input',
        text: 'Focuses the element and enters text key by key, so listeners and validation fire like a real user.',
      },
      {
        key: 'n2',
        title: 'Clear first',
        text: 'On means the field is emptied before typing. Off appends to whatever value is already there.',
      },
      {
        key: 'n3',
        title: 'Templates work here',
        text: 'The text field accepts variables, so data rows and captures can drive what gets typed.',
      },
    ],
  });

  const select = documented({
    id: 'fs_ref_browser_select',
    name: 'Select option',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Open the dropdown page',
        text: 'A plain select element',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open dropdown',
            config: { url: 'https://the-internet.herokuapp.com/dropdown', width: 1100, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Select option',
        text: 'Choose by the option value, not its label',
        steps: [
          { key: 'one', kind: 'browser-select', name: 'Pick option 1', config: { selector: '#dropdown', value: '1' } },
          { key: 'two', kind: 'browser-select', name: 'Pick option 2', config: { selector: '#dropdown', value: '2' } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Verify the choice',
        text: 'Read the live value back out of the page',
        steps: [
          {
            key: 'read',
            kind: 'browser-eval',
            name: 'Read value',
            config: { script: 'document.querySelector("#dropdown").value' },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Select option · native dropdowns',
        text: 'Sets the value of a select element and fires the change event the page listens for.',
      },
      {
        key: 'n2',
        title: 'Value, not text',
        text: 'Match the value attribute of the option. Custom dropdowns built from divs need Click instead.',
      },
    ],
  });

  const hover = documented({
    id: 'fs_ref_browser_hover',
    name: 'Hover',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Open hovers',
        text: 'Captions only appear on mouse over',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open hovers',
            config: { url: 'https://the-internet.herokuapp.com/hovers', width: 1100, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Hover',
        text: 'Moves the pointer over the element',
        steps: [
          { key: 'hover', kind: 'browser-hover', name: 'Hover first figure', config: { selector: '.figure' } },
          { key: 'wait', kind: 'browser-wait-for', name: 'Caption appears', config: { selector: '.figcaption a', timeoutMs: 4000 } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Use what appeared',
        text: 'The revealed link is now clickable',
        steps: [
          { key: 'click', kind: 'browser-click', name: 'View profile', config: { selector: '.figcaption a' } },
          { key: 'url', kind: 'assert-url', name: 'On a user page', config: { match: 'contains', expected: '/users/' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Hover · reveal on mouse over',
        text: 'Moves the pointer without clicking, so menus, tooltips, and captions open the way a user sees them.',
      },
      {
        key: 'n2',
        title: 'Always wait after',
        text: 'Revealed content animates in. Follow Hover with Wait for element before you click what appeared.',
      },
    ],
  });

  const press = documented({
    id: 'fs_ref_browser_press',
    name: 'Press key',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Open key presses',
        text: 'The page echoes whichever key it receives',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open key presses',
            config: { url: 'https://the-internet.herokuapp.com/key_presses', width: 1100, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Press key',
        text: 'Sends a single key to the element',
        steps: [
          { key: 'tab', kind: 'browser-press', name: 'Press Tab', config: { selector: '#target', key: 'Tab' } },
          { key: 'enter', kind: 'browser-press', name: 'Press Enter', config: { selector: '#target', key: 'Enter' } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Read the echo',
        text: 'The page prints the last key it saw',
        steps: [
          { key: 'check', kind: 'assert-text', name: 'Result shows ENTER', config: { selector: '#result', match: 'contains', expected: 'ENTER' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Press key · keyboard input',
        text: 'Sends one key to the focused element. Use it for Enter, Tab, Escape, and arrow navigation.',
      },
      {
        key: 'n2',
        title: 'Key names',
        text: 'Standard browser key values such as Enter, Tab, Escape, ArrowUp, and Backspace.',
      },
    ],
  });

  const waitFor = documented({
    id: 'fs_ref_browser_wait_for',
    name: 'Wait for element',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Start slow work',
        text: 'Dynamic loading shows a spinner first',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open dynamic loading',
            config: { url: 'https://the-internet.herokuapp.com/dynamic_loading/2', width: 1100, height: 800 },
          },
          { key: 'go', kind: 'browser-click', name: 'Start', config: { selector: '#start button' } },
        ],
      },
      {
        key: 'p2',
        title: '2 · Wait for element',
        text: 'Blocks until the selector exists or the timeout hits',
        steps: [
          { key: 'wait', kind: 'browser-wait-for', name: 'Wait for #finish', config: { selector: '#finish', timeoutMs: 12000 } },
        ],
      },
      {
        key: 'p3',
        title: '3 · Now assert',
        text: 'The content is guaranteed to be there',
        steps: [
          { key: 'text', kind: 'assert-text', name: 'Hello World', config: { selector: '#finish', match: 'contains', expected: 'Hello World!' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Wait for element · the good wait',
        text: 'Polls until the selector appears. It returns the moment the element exists, so runs stay fast.',
      },
      {
        key: 'n2',
        title: 'Replaces sleeps',
        text: 'Anywhere you were tempted to add a fixed Wait before a browser step, use this node instead.',
      },
      {
        key: 'n3',
        title: 'Timeout field',
        text: 'The longest acceptable wait. Exceeding it fails the step with the selector in the message.',
      },
    ],
  });

  const screenshot = documented({
    id: 'fs_ref_browser_screenshot',
    name: 'Screenshot',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Reach the state',
        text: 'Shoot something worth keeping',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open tables',
            config: { url: 'https://the-internet.herokuapp.com/tables', width: 1200, height: 800 },
          },
          { key: 'wait', kind: 'browser-wait-for', name: 'Wait for table', config: { selector: '#table1', timeoutMs: 8000 } },
        ],
      },
      {
        key: 'p2',
        title: '2 · Screenshot',
        text: 'Captures the current page into the run',
        steps: [{ key: 'shot', kind: 'browser-screenshot', name: 'Shoot the table', config: { name: 'ref-tables' } }],
      },
      {
        key: 'p3',
        title: '3 · Shoot again after a change',
        text: 'Before and after images make diffs obvious',
        steps: [
          { key: 'sort', kind: 'browser-click', name: 'Sort by last name', config: { selector: '#table1 thead tr th:nth-child(1)' } },
          { key: 'shot2', kind: 'browser-screenshot', name: 'Shoot sorted', config: { name: 'ref-tables-sorted' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Screenshot · visual evidence',
        text: 'Captures the page and attaches it to the run history under the name you give the node.',
      },
      {
        key: 'n2',
        title: 'Name field',
        text: 'Keep names stable across runs so the same shot is easy to compare between executions.',
      },
    ],
  });

  const evaluate = documented({
    id: 'fs_ref_browser_eval',
    name: 'Run script',
    folderId: F.browser,
    phases: [
      {
        key: 'p1',
        title: '1 · Open a page',
        text: 'The script runs in this page context',
        steps: [
          {
            key: 'open',
            kind: 'browser-open',
            name: 'Open checkboxes',
            config: { url: 'https://the-internet.herokuapp.com/checkboxes', width: 1100, height: 800 },
          },
        ],
      },
      {
        key: 'p2',
        title: '2 · Run script',
        text: 'Return a value, or throw to fail the step',
        steps: [
          {
            key: 'count',
            kind: 'browser-eval',
            name: 'Count the boxes',
            config: { script: 'document.querySelectorAll("#checkboxes input").length' },
          },
          {
            key: 'guard',
            kind: 'browser-eval',
            name: 'Fail if empty',
            config: {
              script:
                '(() => { const n = document.querySelectorAll("#checkboxes input").length; if (n < 2) throw new Error("expected 2 boxes, saw " + n); return n; })()',
            },
          },
        ],
      },
      {
        key: 'p3',
        title: '3 · Keep the result',
        text: 'The returned value lands in the eval variable',
        steps: [
          { key: 'store', kind: 'set-var', name: 'Store count', config: { name: 'boxCount', value: '{{eval}}' } },
          { key: 'check', kind: 'assert-json', name: 'Count stored', config: { expression: 'vars.boxCount != null' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Run script · the escape hatch',
        text: 'Evaluates JavaScript inside the page when no dedicated node can express what you need to check.',
      },
      {
        key: 'n2',
        title: 'Return and throw',
        text: 'The returned value is available as {{eval}}. Throwing an error fails the step with your message.',
      },
      {
        key: 'n3',
        title: 'Use it sparingly',
        text: 'Scripts hide intent from the canvas. Reach for Click, Type, and the Validate nodes first.',
      },
    ],
  });

  return [open, click, type, select, hover, press, waitFor, screenshot, evaluate];
}

function buildDeviceReferenceScenarios(): FlowScenario[] {
  const start = documented({
    id: 'fs_ref_device_start',
    name: 'Start Device',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Open the home screen',
        text: 'Required before every other device step',
        steps: [
          {
            key: 'boot',
            kind: 'device-start',
            name: 'Start Device',
            config: { deviceId: '', deviceName: '' },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Start Device · first on the path',
        text: 'Pick a device from the Emulator sidebar. Empty uses the current Emulator selection. The run starts the AVD if needed and presses Home so you begin on the launcher.',
      },
      {
        key: 'n2',
        title: 'Stops when the run ends',
        text: 'Finish, failure, and cancel all stop the emulator that this step started for the run.',
      },
    ],
  });
  const launch = documented({
    id: 'fs_ref_device_launch',
    name: 'Launch app',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Launch the package',
        text: 'Starts the launcher activity',
        steps: [
          {
            key: 'boot',
            kind: 'device-start',
            name: 'Start Device',
            config: { deviceId: '', deviceName: '' },
          },
          {
            key: 'launch',
            kind: 'device-launch',
            name: 'Launch package',
            config: {
              packageName: 'org.mozilla.fennec_fdroid',
              activity: '',
              clearSession: false,
              clearData: false,
            },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Launch app · am start or monkey',
        text: 'With an activity, Testrix uses am start -n. Without one, it launches the package’s LAUNCHER activity through monkey.',
      },
      {
        key: 'n2',
        title: 'Clear previous session',
        text: 'When checked, Testrix runs am force-stop on the package before launch so any warm process is ended without wiping stored data.',
      },
      {
        key: 'n3',
        title: 'Clear data',
        text: 'When checked, the package is reset with pm clear before launch so the run starts from a clean profile. Clear data takes precedence over Clear previous session.',
      },
    ],
  });
  const tap = documented({
    id: 'fs_ref_device_tap',
    name: 'Device tap',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Tap a hierarchy node',
        text: 'Dumps the UI tree, then taps the bounds center',
        steps: [
          {
            key: 'boot',
            kind: 'device-start',
            name: 'Start Device',
            config: { deviceId: '', deviceName: '' },
          },
          { key: 'tap', kind: 'device-tap', name: 'Tap Save', config: { selector: 'text=Save' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Tap · first matching node',
        text: 'Selectors accept text=Save, id=org.app:id/ok, or desc=Close. A bare string is treated as visible text.',
      },
      {
        key: 'n2',
        title: 'Pick on device',
        text: 'Use Pick beside the selector when the emulator is already running. Turn on Previous to run Launch / Wait steps before Pick. Prefer resource-id when the dump has one. Tap, Type, Wait, and Validate use Timeout (ms) to retry until the element appears.',
      },
    ],
  });
  const type = documented({
    id: 'fs_ref_device_type',
    name: 'Device type',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Focus and type',
        text: 'Taps the field, then sends input text',
        steps: [
          {
            key: 'type',
            kind: 'device-type',
            name: 'Type email',
            config: { selector: 'id=org.app:id/email', text: 'user@example.test', clearFirst: true },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Type · ADB input text',
        text: 'Focuses the selector first, optionally sends Delete to clear, then types through adb input text.',
      },
      {
        key: 'n2',
        title: 'Spaces become %s',
        text: 'The desktop host escapes spaces and shell characters so the typed value matches what you wrote.',
      },
    ],
  });
  const press = documented({
    id: 'fs_ref_device_press',
    name: 'Device press key',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Send a keyevent',
        text: 'BACK, HOME, ENTER, or a numeric keycode',
        steps: [{ key: 'press', kind: 'device-press', name: 'Press BACK', config: { key: 'BACK' } }],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Press key · Android keyevent',
        text: 'Sends BACK, HOME, ENTER, DEL, TAB, ESCAPE, MENU, APP_SWITCH, volume, power, or a raw numeric keycode.',
      },
      {
        key: 'n2',
        title: 'Not a browser key',
        text: 'This is adb input keyevent, not a DOM keydown. Use the Browser Press key node for web pages.',
      },
    ],
  });
  const swipe = documented({
    id: 'fs_ref_device_swipe',
    name: 'Device swipe',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Swipe the screen',
        text: 'From one point to another in milliseconds',
        steps: [
          {
            key: 'swipe',
            kind: 'device-swipe',
            name: 'Swipe up',
            config: { x1: 200, y1: 800, x2: 200, y2: 200, durationMs: 300 },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Swipe · pixel coordinates',
        text: 'Coordinates are device pixels. Start near the bottom and swipe toward the top to scroll a list up.',
      },
      {
        key: 'n2',
        title: 'Duration',
        text: 'Shorter durations feel like a flick. Keep at least 50 ms so the emulator registers the gesture.',
      },
    ],
  });
  const waitFor = documented({
    id: 'fs_ref_device_wait',
    name: 'Device wait for element',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Wait for a node',
        text: 'Polls uiautomator dump until it matches',
        steps: [
          {
            key: 'wait',
            kind: 'device-wait-for',
            name: 'Wait for Save',
            config: { selector: 'text=Save', timeoutMs: 8000 },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Wait for element · hierarchy poll',
        text: 'Dumps the UI tree until a node matches the selector or the timeout expires, then fails with the last miss.',
      },
      {
        key: 'n2',
        title: 'Use before Tap',
        text: 'Start the app, wait for a label, then tap. That avoids racing the first activity draw.',
      },
    ],
  });
  const screenshot = documented({
    id: 'fs_ref_device_shot',
    name: 'Device screenshot',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Capture the screen',
        text: 'Stores a PNG in a flow variable',
        steps: [
          { key: 'shot', kind: 'device-screenshot', name: 'Shoot device', config: { name: 'device' } },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Screenshot · screencap -p',
        text: 'Captures the device framebuffer and stores it as vars[screenshot:name] as a data URL.',
      },
      {
        key: 'n2',
        title: 'Name field',
        text: 'Leave the name empty to use screenshot:device. Keep names stable if you compare shots later.',
      },
    ],
  });
  const assertText = documented({
    id: 'fs_ref_device_text',
    name: 'Device validate text',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Check node text',
        text: 'Compares text or content-desc',
        steps: [
          {
            key: 'assert',
            kind: 'device-assert-text',
            name: 'Save is visible',
            config: { selector: 'id=org.app:id/save', match: 'contains', expected: 'Save' },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Validate text · hierarchy string',
        text: 'Reads the first matching node’s text or content-desc and compares with contains, equals, or regex.',
      },
      {
        key: 'n2',
        title: 'Same selector language',
        text: 'Use the same text=, id=, and desc= prefixes as Tap so the assert targets the same control.',
      },
    ],
  });
  const assertVisible = documented({
    id: 'fs_ref_device_visible',
    name: 'Device validate visible',
    folderId: F.device,
    phases: [
      {
        key: 'p1',
        title: '1 · Assert the node exists',
        text: 'Fails if the dump has no match',
        steps: [
          {
            key: 'assert',
            kind: 'device-assert-visible',
            name: 'Email field exists',
            config: { selector: 'id=org.app:id/email' },
          },
        ],
      },
    ],
    notes: [
      {
        key: 'n1',
        title: 'Validate visible · node is in the dump',
        text: 'Passes when uiautomator can see the selector. It does not check that the control is on screen after a scroll.',
      },
      {
        key: 'n2',
        title: 'Pair with Wait for',
        text: 'Wait for element retries. Validate visible checks once. Put Wait first when the activity is still drawing.',
      },
    ],
  });
  return [start, launch, tap, type, press, swipe, waitFor, screenshot, assertText, assertVisible];
}

/** Flow with one focused, documented scenario for every node kind. */
export function buildNodeReferenceFlow(): ServiceTreeNode<FlowArtifactFields> {
  const scenarios = [
    ...buildCanvasScenarios(),
    ...buildControlReferenceScenarios(),
    ...buildDataReferenceScenarios(),
    ...buildValidationReferenceScenarios(),
    ...buildBrowserReferenceScenarios(),
    ...(FLOW_DEVICE_NODES_ENABLED ? buildDeviceReferenceScenarios() : []),
  ];

  return flow(
    TUTORIAL_NODE_REFERENCE_FLOW_ID,
    'Node reference',
    [
      folder(F.canvas, 'Canvas'),
      folder(F.control, 'Control'),
      folder(F.data, 'API and data'),
      folder(F.validation, 'Validation'),
      folder(F.browser, 'Browser'),
      ...(FLOW_DEVICE_NODES_ENABLED ? [folder(F.device, 'Device')] : []),
    ],
    scenarios,
    {
      description: 'One documented scenario per node kind, grouped the same way as the node palette.',
      tags: ['tutorial', 'reference', 'nodes'],
      docs: [
        'Every scenario follows the same shape: Group frames hold the steps, and String notes below the lane explain what the node does, which fields matter, and which ports it exposes.',
        'API steps hit https://httpbin.org and browser steps hit https://the-internet.herokuapp.com — no environment variables required.',
        'Database query ships disabled because the tutorial has no connection id. Pick one of your connections, then enable the step.',
      ].join('\n\n'),
    },
  );
}

// ---------------------------------------------------------------------------
// Control flow — branching, loops, and composition
// ---------------------------------------------------------------------------

const C = CONTROL_FLOW_FOLDERS;

function buildBranchScenarios(): FlowScenario[] {
  const ifElse = (() => {
    const id = 'fs_ctl_if_else';
    const probe = mk(`${id}_probe`, 'request', 'GET /status/200', 0, 150, {
      method: 'GET',
      url: 'https://httpbin.org/status/200',
      body: '',
    });
    const gate = mk(`${id}_if`, 'if', 'Status is 200?', 320, 150, { condition: 'status == 200' });
    const happy = mk(`${id}_happy`, 'set-var', 'Happy path', 640, 0, { name: 'path', value: 'happy' });
    const sad = mk(`${id}_sad`, 'set-var', 'Sad path', 640, 300, { name: 'path', value: 'sad' });
    const happyCheck = mk(`${id}_happy_ok`, 'assert-json', 'Body present', 960, 0, { expression: 'body != null' });
    const sadCheck = mk(`${id}_sad_ok`, 'wait', 'Cool down', 960, 300, { waitMs: 200 });
    return handmade({
      id,
      name: 'Branching · If and Else',
      folderId: C.branch,
      nodes: [probe, gate, happy, sad, happyCheck, sadCheck],
      edges: [
        link(probe.id, gate.id),
        link(gate.id, happy.id, 'then', 'then · condition true'),
        link(gate.id, sad.id, 'else', 'else · condition false'),
        link(happy.id, happyCheck.id),
        link(sad.id, sadCheck.id),
      ],
      entry: [probe.id],
      exits: [
        { id: happyCheck.id, port: 'next' },
        { id: sadCheck.id, port: 'next' },
      ],
      noteY: 430,
      notes: [
        {
          key: 'n1',
          title: 'One condition, two ports',
          text: 'If evaluates its condition once. The Then subtree or the Else subtree runs — never both.',
        },
        {
          key: 'n2',
          title: 'Both ports may reach End',
          text: 'Here each branch finishes on its own. Whichever one ran carries the run through to End.',
        },
        {
          key: 'n3',
          title: 'Label your wires',
          text: 'Edges carry an optional name. Labelling then and else makes a dense branch readable at a glance.',
        },
      ],
    });
  })();

  const branchJoin = (() => {
    const id = 'fs_ctl_branch_join';
    const seed = mk(`${id}_seed`, 'set-var', 'Pick a role', 0, 150, { name: 'role', value: 'admin' });
    const gate = mk(`${id}_if`, 'if', 'Is admin?', 320, 150, { condition: 'vars.role == "admin"' });
    const admin = mk(`${id}_admin`, 'request', 'GET admin data', 640, 0, {
      method: 'GET',
      url: 'https://httpbin.org/get?scope=admin',
      body: '',
    });
    const guest = mk(`${id}_guest`, 'request', 'GET public data', 640, 300, {
      method: 'GET',
      url: 'https://httpbin.org/get?scope=public',
      body: '',
    });
    const join = mk(`${id}_join`, 'join', 'Join · continue once', 960, 150);
    const after = mk(`${id}_after`, 'assert-status', 'Whatever ran was 200', 1280, 150, { expected: 200 });
    return handmade({
      id,
      name: 'Branch and rejoin',
      folderId: C.branch,
      nodes: [seed, gate, admin, guest, join, after],
      edges: [
        link(seed.id, gate.id),
        link(gate.id, admin.id, 'then', 'then'),
        link(gate.id, guest.id, 'else', 'else'),
        link(admin.id, join.id),
        link(guest.id, join.id),
        link(join.id, after.id),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 430,
      notes: [
        {
          key: 'n1',
          title: 'Rejoin after a decision',
          text: 'Join lets the shared tail live in one place instead of being copied into both branches.',
        },
        {
          key: 'n2',
          title: 'It does not wait for the skipped side',
          text: 'Only the branch that actually ran reaches Join, so the graph continues as soon as it arrives.',
        },
        {
          key: 'n3',
          title: 'Change the seed to flip it',
          text: 'Set role to anything other than admin and the Else branch runs instead. The tail is unchanged.',
        },
      ],
    });
  })();

  const parallel = (() => {
    const id = 'fs_ctl_parallel';
    const api = mk(`${id}_api`, 'request', 'Lane A · API', 0, 0, { method: 'GET', url: 'https://httpbin.org/get', body: '' });
    const apiOk = mk(`${id}_api_ok`, 'assert-status', 'A is 200', 320, 0, { expected: 200 });
    const uuid = mk(`${id}_uuid`, 'request', 'Lane B · UUID', 0, 150, { method: 'GET', url: 'https://httpbin.org/uuid', body: '' });
    const uuidGrab = mk(`${id}_uuid_grab`, 'capture', 'Capture uuid', 320, 150, {
      rules: JSON.stringify([{ kind: 'json', path: 'uuid', name: 'uuid' }]),
    });
    const slow = mk(`${id}_slow`, 'request', 'Lane C · slow', 0, 300, {
      method: 'GET',
      url: 'https://httpbin.org/delay/1',
      body: '',
    });
    const slowOk = mk(`${id}_slow_ok`, 'assert-status', 'C is 200', 320, 300, { expected: 200 });
    const join = mk(`${id}_join`, 'join', 'Join · all three', 640, 150);
    const after = mk(`${id}_after`, 'assert-json', 'UUID captured', 960, 150, { expression: 'uuid != null' });
    return handmade({
      id,
      name: 'Parallel split and join',
      folderId: C.branch,
      nodes: [api, apiOk, uuid, uuidGrab, slow, slowOk, join, after],
      edges: [
        link(api.id, apiOk.id),
        link(uuid.id, uuidGrab.id),
        link(slow.id, slowOk.id),
        link(apiOk.id, join.id),
        link(uuidGrab.id, join.id),
        link(slowOk.id, join.id),
        link(join.id, after.id),
      ],
      entry: [api.id, uuid.id, slow.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 430,
      notes: [
        {
          key: 'n1',
          title: 'Splitting needs no node',
          text: 'Wiring Start to three nodes starts three lanes at once. Parallelism is just graph shape.',
        },
        {
          key: 'n2',
          title: 'Join is the barrier',
          text: 'It waits for every incoming lane, so the slow delay lane decides when the tail begins.',
        },
        {
          key: 'n3',
          title: 'Independent work only',
          text: 'Lanes share flow variables. Keep concurrent branches from writing the same names.',
        },
      ],
    });
  })();

  const nestedBranch = (() => {
    const id = 'fs_ctl_nested_if';
    const call = mk(`${id}_call`, 'request', 'GET /status/200', 0, 150, {
      method: 'GET',
      url: 'https://httpbin.org/status/200',
      body: '',
    });
    const outer = mk(`${id}_outer`, 'if', 'Reachable?', 320, 150, { condition: 'status != null' });
    const inner = mk(`${id}_inner`, 'if', 'Successful?', 640, 0, { condition: 'status < 400' });
    const ok = mk(`${id}_ok`, 'set-var', 'State · healthy', 960, -110, { name: 'state', value: 'healthy' });
    const failed = mk(`${id}_failed`, 'set-var', 'State · failing', 960, 110, { name: 'state', value: 'failing' });
    const down = mk(`${id}_down`, 'set-var', 'State · unreachable', 640, 300, { name: 'state', value: 'unreachable' });
    const join = mk(`${id}_join`, 'join', 'Join · one state', 1280, 150);
    const check = mk(`${id}_check`, 'assert-json', 'State decided', 1600, 150, { expression: 'vars.state != null' });
    return handmade({
      id,
      name: 'Nested If · three outcomes',
      folderId: C.branch,
      nodes: [call, outer, inner, ok, failed, down, join, check],
      edges: [
        link(call.id, outer.id),
        link(outer.id, inner.id, 'then', 'then · got a response'),
        link(outer.id, down.id, 'else', 'else · no response'),
        link(inner.id, ok.id, 'then', 'then · 2xx or 3xx'),
        link(inner.id, failed.id, 'else', 'else · 4xx or 5xx'),
        link(ok.id, join.id),
        link(failed.id, join.id),
        link(down.id, join.id),
        link(join.id, check.id),
      ],
      entry: [call.id],
      exits: [{ id: check.id, port: 'next' }],
      noteY: 430,
      notes: [
        {
          key: 'n1',
          title: 'Chain If for more than two paths',
          text: 'An If on the Then port of another If gives three outcomes without any special multi-way node.',
        },
        {
          key: 'n2',
          title: 'Every path writes the same variable',
          text: 'Each leaf sets state, so the tail after Join can treat all three outcomes uniformly.',
        },
        {
          key: 'n3',
          title: 'One Join closes them all',
          text: 'Join accepts any number of incoming wires. All three leaves land on the same barrier.',
        },
      ],
    });
  })();

  return [ifElse, branchJoin, parallel, nestedBranch];
}

function buildLoopScenarios(): FlowScenario[] {
  const forEach = (() => {
    const id = 'fs_ctl_for_each';
    const seed = mk(`${id}_seed`, 'set-var', 'Endpoints to hit', 0, 40, {
      name: 'paths',
      value: '["get","uuid","headers"]',
    });
    const loop = mk(`${id}_each`, 'for-each', 'For each path', 320, 40, { items: 'paths' });
    const call = mk(`${id}_call`, 'request', 'GET /{{item}}', 0, 0, {
      method: 'GET',
      url: 'https://httpbin.org/{{item}}',
      body: '',
    }, loop.id);
    const ok = mk(`${id}_ok`, 'assert-status', 'Each is 200', IN_COL, 0, { expected: 200 }, loop.id);
    const after = mk(`${id}_after`, 'set-var', 'All paths done', 900, 40, { name: 'sweep', value: 'complete' });
    return handmade({
      id,
      name: 'For each over a list',
      folderId: C.loop,
      nodes: [seed, loop, call, ok, after],
      edges: [
        link(seed.id, loop.id),
        link(loop.id, call.id, 'body', 'body · once per item'),
        link(call.id, ok.id),
        link(loop.id, after.id, 'done', 'done · after the last item'),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 320,
      notes: [
        {
          key: 'n1',
          title: 'Body and Done are different',
          text: 'Body fires once per item. Done fires a single time when the list is exhausted.',
        },
        {
          key: 'n2',
          title: 'Iterations are sequential',
          text: 'Item two starts after item one finishes, so a capture from one pass is gone by the next.',
        },
        {
          key: 'n3',
          title: 'Data rows are the alternative',
          text: 'Use For each inside one run. Use the Data tab to run the whole graph once per row instead.',
        },
      ],
    });
  })();

  const forEachIf = (() => {
    const id = 'fs_ctl_for_each_if';
    const seed = mk(`${id}_seed`, 'set-var', 'Status codes', 0, 60, { name: 'codes', value: '["200","404","500"]' });
    const loop = mk(`${id}_each`, 'for-each', 'For each code', 320, 60, { items: 'codes' });
    const call = mk(`${id}_call`, 'request', 'GET /status/{{item}}', 0, 0, {
      method: 'GET',
      url: 'https://httpbin.org/status/{{item}}',
      body: '',
    }, loop.id);
    const gate = mk(`${id}_if`, 'if', 'Was it 2xx?', IN_COL, 0, { condition: 'status < 300' }, loop.id);
    const good = mk(`${id}_good`, 'set-var', 'Note success', 0, IN_ROW, { name: 'lastOk', value: '{{item}}' }, loop.id);
    const bad = mk(`${id}_bad`, 'set-var', 'Note failure', IN_COL, IN_ROW, { name: 'lastBad', value: '{{item}}' }, loop.id);
    const after = mk(`${id}_after`, 'assert-json', 'Sweep recorded', 900, 60, { expression: 'vars.lastBad != null' });
    return handmade({
      id,
      name: 'For each with a nested If',
      folderId: C.loop,
      nodes: [seed, loop, call, gate, good, bad, after],
      edges: [
        link(seed.id, loop.id),
        link(loop.id, call.id, 'body', 'body'),
        link(call.id, gate.id),
        link(gate.id, good.id, 'then', 'then'),
        link(gate.id, bad.id, 'else', 'else'),
        link(loop.id, after.id, 'done', 'done'),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 360,
      notes: [
        {
          key: 'n1',
          title: 'Branching inside a loop',
          text: 'The If lives in the loop scope, so it is evaluated fresh on every iteration.',
        },
        {
          key: 'n2',
          title: 'A status matrix in one scenario',
          text: 'Three codes, one graph. Add entries to the list and the sweep grows without new nodes.',
        },
        {
          key: 'n3',
          title: 'Assert after Done',
          text: 'Checks that need the whole sweep belong on the Done port, not inside the body.',
        },
      ],
    });
  })();

  const whileLoop = (() => {
    const id = 'fs_ctl_while';
    const seed = mk(`${id}_seed`, 'set-var', 'Not ready yet', 0, 40, { name: 'ready', value: 'no' });
    const loop = mk(`${id}_while`, 'while', 'While not ready', 320, 40, {
      condition: 'vars.ready == "no"',
      maxIterations: 3,
    });
    const poll = mk(`${id}_poll`, 'request', 'Poll status', 0, 0, {
      method: 'GET',
      url: 'https://httpbin.org/get?poll=1',
      body: '',
    }, loop.id);
    const flip = mk(`${id}_flip`, 'set-var', 'Mark ready', IN_COL, 0, { name: 'ready', value: 'yes' }, loop.id);
    const after = mk(`${id}_after`, 'assert-json', 'Ready before End', 900, 40, { expression: 'vars.ready == "yes"' });
    return handmade({
      id,
      name: 'While · poll until ready',
      folderId: C.loop,
      nodes: [seed, loop, poll, flip, after],
      edges: [
        link(seed.id, loop.id),
        link(loop.id, poll.id, 'body', 'body · while true'),
        link(poll.id, flip.id),
        link(loop.id, after.id, 'done', 'done · condition false'),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 320,
      notes: [
        {
          key: 'n1',
          title: 'Condition first, body second',
          text: 'The test runs before each pass, so a condition that is false immediately skips the body entirely.',
        },
        {
          key: 'n2',
          title: 'The body must make progress',
          text: 'Something inside has to change the condition. Here the last step flips ready to yes.',
        },
        {
          key: 'n3',
          title: 'Max iterations is the seat belt',
          text: 'Even a buggy condition stops after the cap, so a broken flow cannot hang the run forever.',
        },
      ],
    });
  })();

  const retry = (() => {
    const id = 'fs_ctl_retry';
    const block = mk(`${id}_retry`, 'retry', 'Retry up to 3 times', 0, 40, { attempts: 3 });
    const pause = mk(`${id}_pause`, 'wait', 'Back off', 0, 0, { waitMs: 300 }, block.id);
    const call = mk(`${id}_call`, 'request', 'GET /delay/1', IN_COL, 0, {
      method: 'GET',
      url: 'https://httpbin.org/delay/1',
      body: '',
    }, block.id);
    const ok = mk(`${id}_ok`, 'assert-status', 'Must be 200', 0, IN_ROW, { expected: 200 }, block.id);
    const after = mk(`${id}_after`, 'set-var', 'Stable', 640, 40, { name: 'stable', value: 'yes' });
    return handmade({
      id,
      name: 'Retry with backoff',
      folderId: C.loop,
      nodes: [block, pause, call, ok, after],
      edges: [
        link(block.id, pause.id, 'body', 'body · one attempt'),
        link(pause.id, call.id),
        link(call.id, ok.id),
        link(block.id, after.id, 'done', 'done · first success'),
      ],
      entry: [block.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 360,
      notes: [
        {
          key: 'n1',
          title: 'The assertion is inside',
          text: 'Retry repeats when any body step fails, so the check must sit in the body for retrying to mean anything.',
        },
        {
          key: 'n2',
          title: 'Backoff is just a Wait',
          text: 'A Wait at the top of the body spaces the attempts out instead of hammering the service.',
        },
        {
          key: 'n3',
          title: 'Retry is not a loop',
          text: 'A passing body runs once. Only failure causes another attempt, up to the configured count.',
        },
      ],
    });
  })();

  const nested = (() => {
    const id = 'fs_ctl_nested_loop';
    const seed = mk(`${id}_seed`, 'set-var', 'Regions', 0, 40, { name: 'regions', value: '["eu","us"]' });
    const loop = mk(`${id}_each`, 'for-each', 'For each region', 320, 40, { items: 'regions' });
    const block = mk(`${id}_retry`, 'retry', 'Retry region', 0, 0, { attempts: 2 }, loop.id);
    const call = mk(`${id}_call`, 'request', 'GET ?region={{item}}', 0, 0, {
      method: 'GET',
      url: 'https://httpbin.org/get?region={{item}}',
      body: '',
    }, block.id);
    const ok = mk(`${id}_ok`, 'assert-status', 'Region is up', 0, IN_ROW, { expected: 200 }, block.id);
    const mark = mk(`${id}_mark`, 'set-var', 'Record region', IN_COL, 0, { name: 'lastRegion', value: '{{item}}' }, loop.id);
    const after = mk(`${id}_after`, 'assert-json', 'All regions swept', 900, 40, { expression: 'vars.lastRegion != null' });
    return handmade({
      id,
      name: 'Nested · For each around Retry',
      folderId: C.loop,
      nodes: [seed, loop, block, call, ok, mark, after],
      edges: [
        link(seed.id, loop.id),
        link(loop.id, block.id, 'body', 'per region'),
        link(block.id, call.id, 'body', 'attempt'),
        link(call.id, ok.id),
        link(block.id, mark.id, 'done', 'region ok'),
        link(loop.id, after.id, 'done', 'all regions'),
      ],
      entry: [seed.id],
      exits: [{ id: after.id, port: 'next' }],
      noteY: 400,
      notes: [
        {
          key: 'n1',
          title: 'Containers nest',
          text: 'A Retry inside a For each body gives per-item resilience: one flaky region does not fail the sweep.',
        },
        {
          key: 'n2',
          title: 'Read the ports inside out',
          text: 'Retry Done continues within the current iteration. For each Done runs after every region is finished.',
        },
        {
          key: 'n3',
          title: 'Keep nesting shallow',
          text: 'Two levels stay readable. Deeper than that, move the inner block into its own flow and use Run flow.',
        },
      ],
    });
  })();

  return [forEach, forEachIf, whileLoop, retry, nested];
}

function buildComposeScenarios(): FlowScenario[] {
  const grouping = (() => {
    const id = 'fs_ctl_groups';
    const arrange = mk(`${id}_f1`, 'group', 'Arrange', 0, 0, {
      text: 'Set up the data this scenario needs',
      width: FRAME_PAD_X * 2 + IN_COL + NODE_W,
      height: FRAME_HEAD + NODE_H + FRAME_PAD_Y,
    });
    const a1 = mk(`${id}_a1`, 'set-var', 'Set tenant', 0, 0, { name: 'tenant', value: 'acme' }, arrange.id);
    const a2 = mk(`${id}_a2`, 'set-var', 'Set plan', IN_COL, 0, { name: 'plan', value: 'pro' }, arrange.id);

    const act = mk(`${id}_f2`, 'group', 'Act', 606, 0, {
      text: 'The behaviour under test',
      width: FRAME_PAD_X * 2 + IN_COL + NODE_W,
      height: FRAME_HEAD + NODE_H + FRAME_PAD_Y,
    });
    const b1 = mk(`${id}_b1`, 'request', 'POST signup', 0, 0, {
      method: 'POST',
      url: 'https://httpbin.org/post',
      body: '{"tenant":"{{tenant}}","plan":"{{plan}}"}',
    }, act.id);
    const b2 = mk(`${id}_b2`, 'capture', 'Capture echo', IN_COL, 0, {
      rules: JSON.stringify([{ kind: 'json', path: 'json.tenant', name: 'echoedTenant' }]),
    }, act.id);

    const assertFrame = mk(`${id}_f3`, 'group', 'Assert', 1212, 0, {
      text: 'Everything we promised the reader',
      width: FRAME_PAD_X * 2 + IN_COL + NODE_W,
      height: FRAME_HEAD + NODE_H + FRAME_PAD_Y,
    });
    const c1 = mk(`${id}_c1`, 'assert-status', 'Signup 200', 0, 0, { expected: 200 }, assertFrame.id);
    const c2 = mk(`${id}_c2`, 'assert-json', 'Tenant echoed', IN_COL, 0, {
      expression: "echoedTenant == 'acme'",
    }, assertFrame.id);

    return handmade({
      id,
      name: 'Group frames as documentation',
      folderId: C.compose,
      nodes: [arrange, a1, a2, act, b1, b2, assertFrame, c1, c2],
      edges: [
        link(a1.id, a2.id),
        link(a2.id, b1.id),
        link(b1.id, b2.id),
        link(b2.id, c1.id),
        link(c1.id, c2.id),
      ],
      entry: [a1.id],
      exits: [{ id: c2.id, port: 'next' }],
      noteY: 260,
      notes: [
        {
          key: 'n1',
          title: 'Arrange, act, assert',
          text: 'Three Group frames turn a flat chain of six steps into a story a reviewer can scan in seconds.',
        },
        {
          key: 'n2',
          title: 'Frames never change behaviour',
          text: 'Wires cross frame borders freely and execution order is exactly what the edges say it is.',
        },
        {
          key: 'n3',
          title: 'Name and caption',
          text: 'The frame name is the heading on the canvas, and the Text field is the caption under it.',
        },
      ],
    });
  })();

  const grandTour = (() => {
    const id = 'fs_ctl_tour';
    const seed = mk(`${id}_seed`, 'set-var', 'Seed regions', 0, 150, { name: 'regions', value: '["eu","us"]' });
    const loop = mk(`${id}_each`, 'for-each', 'For each region', 320, 150, { items: 'regions' });
    const retry = mk(`${id}_retry`, 'retry', 'Retry region', 0, 0, { attempts: 2 }, loop.id);
    const call = mk(`${id}_call`, 'request', 'GET ?region={{item}}', 0, 0, {
      method: 'GET',
      url: 'https://httpbin.org/get?region={{item}}',
      body: '',
    }, retry.id);
    const ok = mk(`${id}_ok`, 'assert-status', 'Region is 200', IN_COL, 0, { expected: 200 }, loop.id);

    const sweepDone = mk(`${id}_sweep`, 'set-var', 'Sweep complete', 900, 150, { name: 'sweep', value: 'done' });
    const gate = mk(`${id}_if`, 'if', 'Any EU region?', 1220, 150, { condition: 'vars.sweep == "done"' });
    const eu = mk(`${id}_eu`, 'set-var', 'GDPR checks', 1540, 30, { name: 'gdpr', value: 'required' });
    const other = mk(`${id}_other`, 'wait', 'Skip extras', 1540, 280, { waitMs: 80 });
    const audit = mk(`${id}_audit`, 'request', 'POST audit (parallel)', 900, 420, {
      method: 'POST',
      url: 'https://httpbin.org/post',
      body: '{"event":"sweep"}',
    });
    const join = mk(`${id}_join`, 'join', 'Join · branch and audit', 1860, 150);
    const final = mk(`${id}_final`, 'assert-json', 'Sweep recorded', 2180, 150, { expression: 'vars.sweep == "done"' });

    return handmade({
      id,
      name: 'Grand tour · every control node',
      folderId: C.compose,
      nodes: [seed, loop, retry, call, ok, sweepDone, gate, eu, other, audit, join, final],
      edges: [
        link(seed.id, loop.id),
        link(loop.id, retry.id, 'body', 'per region'),
        link(retry.id, call.id, 'body', 'attempt'),
        link(retry.id, ok.id, 'done', 'region ok'),
        link(loop.id, sweepDone.id, 'done', 'all regions'),
        link(sweepDone.id, gate.id),
        link(gate.id, eu.id, 'then', 'then'),
        link(gate.id, other.id, 'else', 'else'),
        link(seed.id, audit.id, 'next', 'parallel lane'),
        link(eu.id, join.id),
        link(other.id, join.id),
        link(audit.id, join.id),
        link(join.id, final.id),
      ],
      entry: [seed.id],
      exits: [{ id: final.id, port: 'next' }],
      noteY: 560,
      notes: [
        {
          key: 'n1',
          title: 'Everything at once',
          text: 'Sequence, a parallel lane, For each, Retry, If and Else, and a Join barrier in one readable graph.',
        },
        {
          key: 'n2',
          title: 'Two lanes leave the seed',
          text: 'The region sweep and the audit call run side by side because both are wired from the same node.',
        },
        {
          key: 'n3',
          title: 'Join gates the ending',
          text: 'The final assertion waits for both the sweep and the audit, so the run cannot finish early.',
        },
      ],
    });
  })();

  const dataRows = (() => {
    const id = 'fs_ctl_data_rows';
    const call = mk(`${id}_call`, 'request', 'GET /status/{{code}}', 0, 40, {
      method: 'GET',
      url: 'https://httpbin.org/status/{{code}}',
      body: '',
    });
    const gate = mk(`${id}_if`, 'if', 'Row expects success?', 320, 40, { condition: '{{code}} < 300' });
    const good = mk(`${id}_good`, 'assert-json', 'Matches the row', 640, -70, { expression: 'status == {{code}}' });
    const bad = mk(`${id}_bad`, 'assert-json', 'Failure is expected', 640, 150, { expression: 'status == {{code}}' });
    const join = mk(`${id}_join`, 'join', 'Join', 960, 40);
    return handmade({
      id,
      name: 'Data rows drive the branch',
      folderId: C.compose,
      nodes: [call, gate, good, bad, join],
      edges: [
        link(call.id, gate.id),
        link(gate.id, good.id, 'then', 'then'),
        link(gate.id, bad.id, 'else', 'else'),
        link(good.id, join.id),
        link(bad.id, join.id),
      ],
      entry: [call.id],
      exits: [{ id: join.id, port: 'next' }],
      noteY: 280,
      data: {
        enabled: true,
        columns: ['code', 'label'],
        rows: [
          { code: '200', label: 'ok' },
          { code: '404', label: 'missing' },
          { code: '500', label: 'server error' },
        ],
      },
      notes: [
        {
          key: 'n1',
          title: 'Open the Data tab',
          text: 'Three rows are already filled in. The whole graph runs once per row, with {{code}} bound each time.',
        },
        {
          key: 'n2',
          title: 'Rows can pick the branch',
          text: 'The If condition reads the row value, so the same graph takes a different path per row.',
        },
        {
          key: 'n3',
          title: 'Rows versus For each',
          text: 'Data rows re-run the entire scenario. For each repeats only the body inside a single run.',
        },
      ],
    });
  })();

  return [grouping, grandTour, dataRows];
}

/** Flow that teaches branching, loops, and how the control nodes compose. */
export function buildControlFlowFlow(): ServiceTreeNode<FlowArtifactFields> {
  return flow(
    TUTORIAL_CONTROL_FLOW_FLOW_ID,
    'Control flow',
    [
      folder(C.branch, 'Branching'),
      folder(C.loop, 'Loops and retries'),
      folder(C.compose, 'Putting it together'),
    ],
    [...buildBranchScenarios(), ...buildLoopScenarios(), ...buildComposeScenarios()],
    {
      description: 'Branching, parallel lanes, loops, retries, and Join — each with labelled wires and notes.',
      tags: ['tutorial', 'control', 'branching'],
      docs: [
        'Wires are labelled, so you can read then, else, body, and done straight off the canvas.',
        'Splitting is graph shape, not a node: wire one output to several nodes and they run at the same time. Join is what brings them back together.',
        'Body and Done are the two ports every container exposes. Body is the repeated work, Done is what happens once the container is finished.',
      ].join('\n\n'),
    },
  );
}

/** Tutorial â†’ Basics folder: node reference plus the control-flow walkthrough. */
export function buildBasicsFolder(): ServiceFolderNode<FlowArtifactFields> {
  return {
    kind: 'folder',
    id: TUTORIAL_BASICS_FOLDER_ID,
    name: 'Basics',
    updatedAt: STAMP,
    children: [buildNodeReferenceFlow(), buildControlFlowFlow()],
  };
}
