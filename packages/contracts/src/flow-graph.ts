import { z } from 'zod';

import { newEntityId } from './entity-id';

/** Every node kind a scenario graph can hold. */
export const flowNodeKindSchema = z.enum([
  'start',
  'end',
  'browser-open',
  'browser-click',
  'browser-type',
  'browser-select',
  'browser-hover',
  'browser-press',
  'browser-wait-for',
  'browser-screenshot',
  'browser-eval',
  'device-start',
  'device-install',
  'device-launch',
  'device-tap',
  'device-type',
  'device-press',
  'device-swipe',
  'device-wait-for',
  'device-screenshot',
  'device-assert-text',
  'device-assert-visible',
  'assert-text',
  'assert-visible',
  'assert-url',
  'assert-status',
  'assert-json',
  'request',
  'database',
  'set-var',
  'capture',
  'cache',
  'http-listener',
  'http-interceptor',
  'http-validate',
  'if',
  'for-each',
  'while',
  'retry',
  'group',
  'wait',
  'join',
  'trigger',
  'manual',
  'note',
]);

export type FlowNodeKind = z.infer<typeof flowNodeKindSchema>;

export const flowPortSchema = z.enum(['next', 'then', 'else', 'body', 'done']);

export type FlowPort = z.infer<typeof flowPortSchema>;

export type FlowNodeConfigValue = string | number | boolean;

export interface FlowGraphNode {
  readonly id: string;
  readonly kind: FlowNodeKind;
  readonly name: string;
  readonly enabled: boolean;
  readonly x: number;
  readonly y: number;
  /** Set when the node lives inside a loop, retry, or group container. */
  readonly parentId: string | null;
  readonly config: Readonly<Record<string, FlowNodeConfigValue>>;
}

export interface FlowGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly fromPort: FlowPort;
  readonly to: string;
  /** Optional documentation label shown on the canvas. */
  readonly name?: string;
}

export interface FlowScenarioData {
  readonly enabled: boolean;
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
}

export interface FlowScenario {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  /** Folder this scenario lives in; null = root of the scenario sidebar. */
  readonly folderId: string | null;
  readonly nodes: readonly FlowGraphNode[];
  readonly edges: readonly FlowGraphEdge[];
  readonly data: FlowScenarioData;
}

/** Organizational folder in the flow scenario sidebar (does not run). */
export interface FlowScenarioFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export function newFlowScenarioFolderId(_now = Date.now()): string {
  return newEntityId();
}

export function emptyFlowScenarioFolder(name = 'New folder', parentId: string | null = null): FlowScenarioFolder {
  return {
    id: newFlowScenarioFolderId(),
    name,
    parentId,
  };
}

export const FLOW_SCENARIO_MAX_ROWS = 200;
export const FLOW_LOOP_MAX_ITERATIONS = 100;

/** Kinds that own a nested execution sub-scope through `parentId` (body/done ports). */
export const FLOW_CONTAINER_KINDS: readonly FlowNodeKind[] = ['for-each', 'while', 'retry'];

/** Docs-only frames: nest children for layout, no ports, skipped at run time. */
export const FLOW_FRAME_KINDS: readonly FlowNodeKind[] = ['group'];

export const FLOW_FRAME_MIN_WIDTH = 200;
export const FLOW_FRAME_MIN_HEIGHT = 120;
export const FLOW_FRAME_DEFAULT_WIDTH = 280;
export const FLOW_FRAME_DEFAULT_HEIGHT = 160;

export function isFlowContainerKind(kind: FlowNodeKind): boolean {
  return FLOW_CONTAINER_KINDS.includes(kind);
}

export function isFlowFrameKind(kind: FlowNodeKind): boolean {
  return FLOW_FRAME_KINDS.includes(kind);
}

/** True when the kind nests children via `parentId` (loops or docs frames). */
export function isFlowNestKind(kind: FlowNodeKind): boolean {
  return isFlowContainerKind(kind) || isFlowFrameKind(kind);
}

/** Kinds that drive the shared browser session. */
export const FLOW_BROWSER_KINDS: readonly FlowNodeKind[] = [
  'browser-open',
  'browser-click',
  'browser-type',
  'browser-select',
  'browser-hover',
  'browser-press',
  'browser-wait-for',
  'browser-screenshot',
  'browser-eval',
  'assert-text',
  'assert-visible',
  'assert-url',
];

export function isFlowBrowserKind(kind: FlowNodeKind): boolean {
  return FLOW_BROWSER_KINDS.includes(kind);
}

/** Kinds that drive an Android device through ADB. */
export const FLOW_DEVICE_KINDS: readonly FlowNodeKind[] = [
  'device-start',
  'device-launch',
  'device-tap',
  'device-type',
  'device-press',
  'device-swipe',
  'device-wait-for',
  'device-screenshot',
  'device-assert-text',
  'device-assert-visible',
];

export function isFlowDeviceKind(kind: FlowNodeKind): boolean {
  return FLOW_DEVICE_KINDS.includes(kind);
}

/** When true, Device nodes appear in the palette, tutorials, and Add-node. */
export const FLOW_DEVICE_NODES_ENABLED = true;

/** Fixed Start / End wall terminals (Resolve-style). */
export function isFlowTerminalKind(kind: FlowNodeKind): boolean {
  return kind === 'start' || kind === 'end';
}

/** Output ports a node exposes, in render order. */
export function flowNodePorts(kind: FlowNodeKind): readonly FlowPort[] {
  if (kind === 'if')
    return ['then', 'else'];
  if (isFlowContainerKind(kind))
    return ['body', 'done'];
  if (kind === 'note' || kind === 'end' || isFlowFrameKind(kind))
    return [];
  return ['next'];
}

export interface FlowNodeDescriptor {
  readonly kind: FlowNodeKind;
  readonly label: string;
  readonly chip: string;
  readonly hint: string;
  readonly group: 'browser' | 'device' | 'assert' | 'data' | 'control' | 'canvas';
}

const DESCRIPTORS: readonly FlowNodeDescriptor[] = [
  { kind: 'start', label: 'Start', chip: 'IN', hint: 'Fixed entry. Every run begins here.', group: 'canvas' },
  { kind: 'end', label: 'End', chip: 'OUT', hint: 'Fixed exit. Every path finishes here.', group: 'canvas' },
  { kind: 'browser-open', label: 'Open browser', chip: 'OPEN', hint: 'Launch a window and load a URL.', group: 'browser' },
  { kind: 'browser-click', label: 'Click', chip: 'CLICK', hint: 'Click the element a selector matches.', group: 'browser' },
  { kind: 'browser-type', label: 'Type', chip: 'TYPE', hint: 'Type text into an input.', group: 'browser' },
  { kind: 'browser-select', label: 'Select option', chip: 'SELECT', hint: 'Pick a value in a select element.', group: 'browser' },
  { kind: 'browser-hover', label: 'Hover', chip: 'HOVER', hint: 'Move the pointer over an element.', group: 'browser' },
  { kind: 'browser-press', label: 'Press key', chip: 'KEY', hint: 'Send a key to the focused element.', group: 'browser' },
  { kind: 'browser-wait-for', label: 'Wait for element', chip: 'WAIT EL', hint: 'Block until a selector appears.', group: 'browser' },
  { kind: 'browser-screenshot', label: 'Screenshot', chip: 'SHOT', hint: 'Capture the current page.', group: 'browser' },
  { kind: 'browser-eval', label: 'Run script', chip: 'EVAL', hint: 'Evaluate JavaScript in the page.', group: 'browser' },
  { kind: 'device-start', label: 'Start Device', chip: 'DEVICE', hint: 'Start the selected Emulator device (or reuse it). Required before other device steps. Timeout waits for adb online. The run stops the device only when this step started it.', group: 'device' },
  { kind: 'device-launch', label: 'Launch app', chip: 'LAUNCH', hint: 'Start a package on the selected device. Timeout bounds the ADB launch call.', group: 'device' },
  { kind: 'device-tap', label: 'Tap', chip: 'TAP', hint: 'Tap the first hierarchy node a selector matches. Retries until Timeout.', group: 'device' },
  { kind: 'device-type', label: 'Type', chip: 'TYPE', hint: 'Focus a field and type text through ADB. Retries the selector until Timeout.', group: 'device' },
  { kind: 'device-press', label: 'Press key', chip: 'KEY', hint: 'Send a keyevent such as BACK or HOME. Timeout bounds the ADB call.', group: 'device' },
  { kind: 'device-swipe', label: 'Swipe', chip: 'SWIPE', hint: 'Swipe between two points on the device. Timeout bounds the ADB call.', group: 'device' },
  { kind: 'device-wait-for', label: 'Wait for element', chip: 'WAIT EL', hint: 'Block until a hierarchy node appears, up to Timeout.', group: 'device' },
  { kind: 'device-screenshot', label: 'Screenshot', chip: 'SHOT', hint: 'Capture the device screen into a flow variable. Timeout bounds screencap.', group: 'device' },
  { kind: 'device-assert-text', label: 'Validate text', chip: 'TEXT', hint: 'Validates hierarchy node text. Retries until Timeout.', group: 'device' },
  { kind: 'device-assert-visible', label: 'Validate visible', chip: 'VISIBLE', hint: 'Validates that a hierarchy node is on screen. Retries until Timeout.', group: 'device' },
  { kind: 'assert-text', label: 'Validate html text', chip: 'TEXT', hint: 'Validates the previous connected page step against element text.', group: 'assert' },
  { kind: 'assert-visible', label: 'Validate visible', chip: 'VISIBLE', hint: 'Validates the previous connected page step: element is on screen.', group: 'assert' },
  { kind: 'assert-url', label: 'Validate URL', chip: 'URL', hint: 'Validates the previous connected page step against the URL (waits for redirects).', group: 'assert' },
  { kind: 'assert-status', label: 'Validate status', chip: 'STATUS', hint: 'Validates the previous connected node�s HTTP status. After Listen/Intercept, waits for that hit first.', group: 'assert' },
  { kind: 'assert-json', label: 'Validate value', chip: 'VALUE', hint: 'Validates the previous connected node�s response or variables. After Listen/Intercept, waits for that hit first.', group: 'assert' },
  { kind: 'request', label: 'HTTP request', chip: 'HTTP', hint: 'Call an API with params, headers, and body. Host needs no https:// — scheme is filled automatically.', group: 'data' },
  { kind: 'database', label: 'Database query', chip: 'SQL', hint: 'Run SQL against a saved connection. Results land in status/body/rowCount and first-row columns as variables.', group: 'data' },
  { kind: 'set-var', label: 'Set variable', chip: 'SET', hint: 'Write a value later steps read as {{name}}, including a request URL.', group: 'data' },
  {
    kind: 'capture',
    label: 'Capture',
    chip: 'CAPTURE',
    hint: 'Store body, JSON fields, or headers from the last HTTP exchange into variables.',
    group: 'data',
  },
  { kind: 'cache', label: 'Cache once', chip: 'CACHE', hint: 'Run the branch only the first time.', group: 'data' },
  { kind: 'http-listener', label: 'HTTP listener', chip: 'LISTEN', hint: 'Observe matching emulator (MITM) or browser HTTP. Wire Validate after it. Does not change traffic.', group: 'data' },
  { kind: 'http-interceptor', label: 'HTTP interceptor', chip: 'INTERCEPT', hint: 'Match emulator HTTP via MITM, then passthrough (edit headers/body), mock, or block. Wire Validate after it.', group: 'data' },
  {
    kind: 'http-validate',
    label: 'Validate HTTP',
    chip: 'HTTP',
    hint: 'Validates the previous connected Listen/Intercept/Request: waits for the hit if needed, then asserts status.',
    group: 'data',
  },
  { kind: 'if', label: 'If', chip: 'IF', hint: 'Take the Then or Else port.', group: 'control' },
  { kind: 'for-each', label: 'For each', chip: 'EACH', hint: 'Repeat the body once per item.', group: 'control' },
  { kind: 'while', label: 'While', chip: 'WHILE', hint: 'Repeat the body while a condition holds.', group: 'control' },
  { kind: 'retry', label: 'Retry', chip: 'RETRY', hint: 'Re-run the body when it fails.', group: 'control' },
  { kind: 'wait', label: 'Wait', chip: 'PAUSE', hint: 'Pause before the next node.', group: 'control' },
  { kind: 'join', label: 'Join', chip: 'JOIN', hint: 'Wait for every incoming branch.', group: 'control' },
  { kind: 'trigger', label: 'Run flow', chip: 'FLOW', hint: 'Execute another flow.', group: 'control' },
  { kind: 'manual', label: 'Manual step', chip: 'MANUAL', hint: 'Pause for a human to enter text. The value is stored in a flow variable for later steps.', group: 'control' },
  {
    kind: 'group',
    label: 'Group',
    chip: 'GROUP',
    hint: 'Documentation frame only � nest steps inside. No ports and no run logic.',
    group: 'canvas',
  },
  { kind: 'note', label: 'String', chip: 'STR', hint: 'Freeform text on the canvas. Select, move, and delete like any node.', group: 'canvas' },
];

export const FLOW_NODE_DESCRIPTORS = DESCRIPTORS;

const DESCRIPTOR_BY_KIND = new Map(DESCRIPTORS.map((item) => [item.kind, item]));

export function flowNodeDescriptor(kind: FlowNodeKind): FlowNodeDescriptor {
  return DESCRIPTOR_BY_KIND.get(kind) ?? DESCRIPTORS[0]!;
}

export function flowNodeLabel(node: FlowGraphNode): string {
  return node.name.trim() || flowNodeDescriptor(node.kind).label;
}

export interface FlowNodeGroup {
  readonly id: FlowNodeDescriptor['group'];
  readonly label: string;
  readonly nodes: readonly FlowNodeDescriptor[];
}

const GROUP_LABELS: Record<FlowNodeDescriptor['group'], string> = {
  browser: 'Browser',
  device: 'Device',
  assert: 'Validation',
  data: 'API and data',
  control: 'Control',
  canvas: 'Canvas',
};

export const FLOW_NODE_GROUPS: readonly FlowNodeGroup[] = (
  ['browser', 'device', 'assert', 'data', 'control', 'canvas'] as const
)
  .filter((id) => FLOW_DEVICE_NODES_ENABLED || id !== 'device')
  .map((id) => ({
    id,
    label: GROUP_LABELS[id],
    // Start/End are fixed terminals � not insertable from the palette.
    nodes: DESCRIPTORS.filter((item) => item.group === id && !isFlowTerminalKind(item.kind)),
  }));

const DEFAULT_CONFIG: Partial<Record<FlowNodeKind, Readonly<Record<string, FlowNodeConfigValue>>>> = {
  'browser-open': { url: 'http://127.0.0.1/', width: 1100, height: 800 },
  'browser-click': { selector: '' },
  'browser-type': { selector: '', text: '', clearFirst: true },
  'browser-select': { selector: '', value: '' },
  'browser-hover': { selector: '' },
  'browser-press': { selector: '', key: 'Enter' },
  'browser-wait-for': { selector: '', timeoutMs: 5000 },
  'browser-screenshot': { name: '' },
  'browser-eval': { script: '' },
  'device-start': { deviceId: '', deviceName: '', openHome: false, timeoutMs: 90_000 },
  'device-launch': {
    packageName: '',
    activity: '',
    clearSession: false,
    clearData: false,
    timeoutMs: 15_000,
  },
  'device-tap': { selector: '', timeoutMs: 8000 },
  'device-type': { selector: '', text: '', clearFirst: true, timeoutMs: 8000 },
  'device-press': { key: 'BACK', timeoutMs: 5000 },
  'device-swipe': { x1: 200, y1: 800, x2: 200, y2: 200, durationMs: 300, timeoutMs: 5000 },
  'device-wait-for': { selector: '', timeoutMs: 8000 },
  'device-screenshot': { name: '', timeoutMs: 15_000 },
  'device-assert-text': { selector: '', match: 'contains', expected: '', timeoutMs: 8000 },
  'device-assert-visible': { selector: '', timeoutMs: 8000 },
  'assert-text': { selector: '', match: 'contains', expected: '' },
  'assert-visible': { selector: '' },
  'assert-url': { match: 'contains', expected: '', timeoutMs: 5000 },
  'assert-status': { expected: 200 },
  'assert-json': { expression: 'status == 200' },
  request: {
    method: 'GET',
    url: '127.0.0.1/',
    bodyMode: 'none',
    body: '',
    headers: '[]',
    queryParams: '[]',
    pathParams: '[]',
    formRows: '[]',
    graphqlQuery: '',
    graphqlVariables: '{\n}\n',
    graphqlOperation: '',
    binaryName: '',
    binaryType: 'application/octet-stream',
    binaryBase64: '',
  },
  database: { connectionId: '', schema: '', query: 'SELECT 1' },
  'set-var': { name: '', value: '' },
  capture: {
    rules: '[{"kind":"json","path":"replicas[0].entries[0].otp","name":"otp"}]',
  },
  cache: { key: '' },
  'http-listener': {
    stage: 'response',
    method: '*',
    match: 'contains',
    url: '',
    headerName: '',
    headerValue: '',
    bodyContains: '',
    waitMs: 10_000,
  },
  'http-interceptor': {
    stage: 'request',
    method: '*',
    match: 'contains',
    url: '',
    headerName: '',
    headerValue: '',
    bodyContains: '',
    waitMs: 10_000,
    action: 'passthrough',
    setHeaders: '[]',
    removeHeaders: '[]',
    setBody: '',
    bodyMode: 'json',
    mockStatus: 200,
    mockBody: '{\n}\n',
  },
  'http-validate': { expected: 200 },
  if: { condition: 'status == 200' },
  'for-each': { items: 'items' },
  while: { condition: 'false', maxIterations: 10 },
  retry: { attempts: 3 },
  group: { text: '', width: FLOW_FRAME_DEFAULT_WIDTH, height: FLOW_FRAME_DEFAULT_HEIGHT },
  wait: { waitMs: 250 },
  trigger: { flowId: '' },
  manual: { prompt: 'Enter a value to continue', variable: 'manual', placeholder: '' },
  note: { text: '' },
  start: {},
  end: {},
};

export function newFlowNodeId(_now = Date.now()): string {
  return newEntityId();
}

export function newFlowEdgeId(_now = Date.now()): string {
  return newEntityId();
}

export function newFlowScenarioId(_now = Date.now()): string {
  return newEntityId();
}

export function emptyFlowGraphNode(
  kind: FlowNodeKind,
  position: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
  parentId: string | null = null,
): FlowGraphNode {
  return {
    id: newFlowNodeId(),
    kind,
    name: '',
    enabled: true,
    x: position.x,
    y: position.y,
    parentId,
    config: { ...(DEFAULT_CONFIG[kind] ?? {}) },
  };
}

export function emptyFlowScenario(name = 'Main scenario'): FlowScenario {
  return ensureFlowScenarioTerminals({
    id: newFlowScenarioId(),
    name,
    enabled: true,
    folderId: null,
    nodes: [],
    edges: [],
    data: { enabled: false, columns: [], rows: [] },
  });
}

/**
 * Ensures every scenario has fixed Start and End wall terminals.
 * Start/End are never optional. No automatic Start?End wire � the user connects steps.
 */
export function ensureFlowScenarioTerminals<T extends FlowScenario>(scenario: T): T {
  let nodes = [...scenario.nodes];
  let edges = [...scenario.edges];

  let start = nodes.find((node) => node.kind === 'start' && node.parentId === null) ?? null;
  if (!start) {
    start = { ...emptyFlowGraphNode('start', { x: 40, y: 100 }), name: 'Start' };
    nodes = [start, ...nodes];
  } else if (!start.name.trim()) {
    nodes = nodes.map((node) => (node.id === start!.id ? { ...node, name: 'Start' } : node));
    start = nodes.find((node) => node.id === start!.id) ?? start;
  }

  let end = nodes.find((node) => node.kind === 'end' && node.parentId === null) ?? null;
  if (!end) {
    const maxX = nodes.reduce((max, node) => Math.max(max, node.x), 0);
    end = { ...emptyFlowGraphNode('end', { x: Math.max(maxX + 280, 360), y: 100 }), name: 'End' };
    nodes = [...nodes, end];
  } else if (!end.name.trim()) {
    nodes = nodes.map((node) => (node.id === end!.id ? { ...node, name: 'End' } : node));
    end = nodes.find((node) => node.id === end!.id) ?? end;
  }

  // Drop the old empty-graph bypass so Start and End stand alone until the user wires steps.
  const hasActionable = nodes.some(
    (node) =>
      node.parentId === null &&
      !isFlowTerminalKind(node.kind) &&
      node.kind !== 'note' &&
      !isFlowFrameKind(node.kind),
  );
  if (!hasActionable)
    edges = edges.filter((edge) => !(edge.from === start.id && edge.to === end.id));

  return { ...scenario, nodes, edges };
}

/**
 * Wires orphan top-level roots into Start and leaves into End (Resolve-style).
 * Used when seeding tutorials or inserting templates � not on every parse.
 */
export function wireFlowScenarioTerminals<T extends FlowScenario>(scenario: T): T {
  const ensured = ensureFlowScenarioTerminals(scenario);
  let edges = [...ensured.edges];
  const nodes = ensured.nodes;
  const start = nodes.find((node) => node.kind === 'start' && node.parentId === null)!;
  const end = nodes.find((node) => node.kind === 'end' && node.parentId === null)!;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const topLevel = nodes.filter((node) => node.parentId === null);
  const topIds = new Set(topLevel.map((node) => node.id));

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of topIds) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const item of edges) {
    if (!topIds.has(item.from) || !topIds.has(item.to))
      continue;
    incoming.get(item.to)?.push(item.from);
    outgoing.get(item.from)?.push(item.to);
  }

  const isActionable = (id: string): boolean => {
    const item = byId.get(id);
    return !!item && !isFlowTerminalKind(item.kind) && item.kind !== 'note' && !isFlowFrameKind(item.kind);
  };

  const hasActionableAncestor = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id))
      return false;
    seen.add(id);
    for (const from of incoming.get(id) ?? []) {
      const item = byId.get(from);
      if (!item || isFlowTerminalKind(item.kind))
        continue;
      if (item.kind === 'note') {
        if (hasActionableAncestor(from, seen))
          return true;
        continue;
      }
      return true;
    }
    return false;
  };

  const hasActionableDescendant = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id))
      return false;
    seen.add(id);
    for (const to of outgoing.get(id) ?? []) {
      const item = byId.get(to);
      if (!item || isFlowTerminalKind(item.kind))
        continue;
      if (item.kind === 'note') {
        if (hasActionableDescendant(to, seen))
          return true;
        continue;
      }
      return true;
    }
    return false;
  };

  for (const item of topLevel) {
    if (!isActionable(item.id))
      continue;
    if (hasActionableAncestor(item.id))
      continue;
    if (edges.some((edge) => edge.from === start.id && edge.to === item.id))
      continue;
    edges.push({ id: newFlowEdgeId(), from: start.id, fromPort: 'next', to: item.id });
  }

  for (const item of topLevel) {
    if (!isActionable(item.id))
      continue;
    if (hasActionableDescendant(item.id))
      continue;
    const ports = flowNodePorts(item.kind);
    const port: FlowPort = ports.includes('done') ? 'done' : ports.includes('next') ? 'next' : ports[0]!;
    if (!port)
      continue;
    if (edges.some((edge) => edge.from === item.id && edge.to === end.id))
      continue;
    edges.push({ id: newFlowEdgeId(), from: item.id, fromPort: port, to: end.id });
  }

  const startFeedsAction = edges.some((edge) => edge.from === start.id && isActionable(edge.to));
  if (startFeedsAction)
    edges = edges.filter((edge) => !(edge.from === start.id && edge.to === end.id));

  return { ...ensured, edges };
}

/** True when End is reachable from Start by following graph edges. */
export function flowHasStartToEndPath(scenario: Pick<FlowScenario, 'nodes' | 'edges'>): boolean {
  const start = scenario.nodes.find((node) => node.kind === 'start' && node.parentId === null);
  const end = scenario.nodes.find((node) => node.kind === 'end' && node.parentId === null);
  if (!start || !end)
    return false;

  const outgoing = new Map<string, string[]>();
  for (const edge of scenario.edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }

  const seen = new Set<string>();
  const stack = [start.id];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === end.id)
      return true;
    if (seen.has(id))
      continue;
    seen.add(id);
    for (const next of outgoing.get(id) ?? [])
      stack.push(next);
  }
  return false;
}

/**
 * Names a later step can read as `{{name}}`: Set variable, Capture, and Manual step.
 * Disabled nodes are skipped. The first spelling wins when names differ only by case.
 */
export function flowPlaceholderNames(nodes: readonly FlowGraphNode[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string): void => {
    const name = raw.trim();
    if (!name)
      return;
    const key = name.toLowerCase();
    if (seen.has(key))
      return;
    seen.add(key);
    names.push(name);
  };
  for (const node of nodes) {
    if (node.enabled === false)
      continue;
    if (node.kind === 'set-var')
      add(flowConfigString(node, 'name'));
    else if (node.kind === 'manual')
      add(flowConfigString(node, 'variable', 'manual'));
    else if (node.kind === 'capture') {
      for (const name of captureVariableNames(flowConfigString(node, 'rules')))
        add(name);
    }
  }
  return names;
}

function captureVariableNames(raw: string): string[] {
  if (!raw.trim())
    return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed))
      return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object')
        return [];
      const name = (item as { name?: unknown }).name;
      return typeof name === 'string' ? [name] : [];
    });
  } catch {
    return [];
  }
}

export function flowConfigString(node: FlowGraphNode, key: string, fallback = ''): string {
  const value = node.config[key];
  if (typeof value === 'string')
    return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

export function flowConfigNumber(node: FlowGraphNode, key: string, fallback = 0): number {
  const value = node.config[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function flowConfigBoolean(node: FlowGraphNode, key: string, fallback = false): boolean {
  const value = node.config[key];
  if (typeof value === 'boolean')
    return value;
  if (typeof value === 'string')
    return value === 'true';
  return fallback;
}

/** Short line under the node title, describing what it targets. */
export function flowNodeSubtitle(node: FlowGraphNode): string {
  switch (node.kind) {
    case 'browser-open':
      return flowConfigString(node, 'url');
    case 'browser-click':
    case 'browser-hover':
    case 'browser-wait-for':
    case 'assert-visible':
      return flowConfigString(node, 'selector');
    case 'browser-type':
    case 'browser-select':
      return [flowConfigString(node, 'selector'), flowConfigString(node, 'value') || flowConfigString(node, 'text')]
        .filter(Boolean)
        .join(' = ');
    case 'browser-press':
      return flowConfigString(node, 'key');
    case 'device-start':
      return (
        flowConfigString(node, 'deviceName') ||
        (flowConfigString(node, 'deviceId') ? 'home screen' : 'select device')
      );
    case 'device-launch':
      return [flowConfigString(node, 'packageName'), flowConfigString(node, 'activity')].filter(Boolean).join('/');
    case 'device-tap':
    case 'device-wait-for':
    case 'device-assert-visible':
      return flowConfigString(node, 'selector');
    case 'device-type':
      return [flowConfigString(node, 'selector'), flowConfigString(node, 'text')].filter(Boolean).join(' = ');
    case 'device-press':
      return flowConfigString(node, 'key');
    case 'device-swipe':
      return `${flowConfigNumber(node, 'x1')} , ${flowConfigNumber(node, 'y1')} ? ${flowConfigNumber(node, 'x2')} , ${flowConfigNumber(node, 'y2')}`;
    case 'device-screenshot':
      return flowConfigString(node, 'name');
    case 'device-assert-text':
      return [flowConfigString(node, 'selector'), flowConfigString(node, 'match'), flowConfigString(node, 'expected')]
        .filter(Boolean)
        .join(' ');
    case 'assert-text':
      return [flowConfigString(node, 'selector'), flowConfigString(node, 'match'), flowConfigString(node, 'expected')]
        .filter(Boolean)
        .join(' ');
    case 'assert-url':
      return [flowConfigString(node, 'match'), flowConfigString(node, 'expected')].filter(Boolean).join(' ');
    case 'assert-status':
    case 'http-validate':
      return flowConfigString(node, 'expected');
    case 'assert-json':
      return flowConfigString(node, 'expression');
    case 'request':
      return [flowConfigString(node, 'method'), flowConfigString(node, 'url')].filter(Boolean).join(' ');
    case 'database':
      return flowConfigString(node, 'query');
    case 'set-var':
      return [flowConfigString(node, 'name'), flowConfigString(node, 'value')].filter(Boolean).join(' = ');
    case 'capture': {
      try {
        const rules = JSON.parse(flowConfigString(node, 'rules', '[]')) as unknown;
        if (Array.isArray(rules) && rules.length > 0) {
          const first = rules[0] as { kind?: string; name?: string; path?: string };
          const label = first.path ? `${first.kind ?? 'json'} ${first.path}` : (first.kind ?? 'capture');
          return rules.length === 1 ? `${label} ? ${first.name ?? ''}` : `${rules.length} rules`;
        }
      } catch {
        /* use fallback */
      }
      return 'capture';
    }
    case 'http-listener':
    case 'http-interceptor': {
      const method = flowConfigString(node, 'method', '*');
      const match = flowConfigString(node, 'match', 'contains');
      const url = flowConfigString(node, 'url');
      const bits = [
        method && method !== '*' ? method.toUpperCase() : '',
        match !== 'contains' ? match : '',
        url,
      ].filter(Boolean);
      return bits.join(' · ');
    }
    case 'if':
    case 'while':
      return flowConfigString(node, 'condition');
    case 'for-each':
      return flowConfigString(node, 'items');
    case 'retry':
      return `${flowConfigNumber(node, 'attempts', 3)} attempts`;
    case 'group':
    case 'note':
      return flowConfigString(node, 'text');
    case 'wait':
      return `${flowConfigNumber(node, 'waitMs', 250)} ms`;
    case 'trigger':
      return flowConfigString(node, 'flowId');
    case 'manual': {
      const variable = flowConfigString(node, 'variable', 'manual') || 'manual';
      const prompt = flowConfigString(node, 'prompt');
      return prompt ? `${variable} · ${prompt}` : variable;
    }
    default:
      return '';
  }
}

export function flowScenarioNodesInScope(
  scenario: Pick<FlowScenario, 'nodes'>,
  parentId: string | null,
): readonly FlowGraphNode[] {
  return scenario.nodes.filter((node) => node.parentId === parentId);
}

/**
 * Execution scope for a node: docs frames are transparent, so nested steps still
 * run with the outer graph (or inside a real loop/retry parent).
 */
export function flowExecutionScopeId(
  scenario: Pick<FlowScenario, 'nodes'>,
  nodeOrId: string | Pick<FlowGraphNode, 'parentId'>,
): string | null {
  let parentId =
    typeof nodeOrId === 'string'
      ? scenario.nodes.find((item) => item.id === nodeOrId)?.parentId ?? null
      : nodeOrId.parentId;
  while (parentId) {
    const parent = scenario.nodes.find((item) => item.id === parentId);
    if (!parent)
      return parentId;
    if (isFlowFrameKind(parent.kind)) {
      parentId = parent.parentId;
      continue;
    }
    return parent.id;
  }
  return null;
}

export function findFlowGraphNode(
  scenario: Pick<FlowScenario, 'nodes'>,
  id: string,
): FlowGraphNode | null {
  return scenario.nodes.find((node) => node.id === id) ?? null;
}

export interface FlowRunPlanStep {
  /** Nodes in this wave start at the same time. */
  readonly wave: number;
  readonly nodeId: string;
  readonly waitsFor: readonly string[];
}

export interface FlowRunPlan {
  readonly scopeId: string | null;
  readonly roots: readonly string[];
  readonly steps: readonly FlowRunPlanStep[];
  /** Nodes inside a cycle, which the scheduler refuses to start. */
  readonly blocked: readonly string[];
}

/**
 * Orders one scope of a scenario into concurrency waves.
 * A node waits for every enabled predecessor, so a split fans out and a join blocks.
 */
export function buildFlowRunPlan(
  scenario: Pick<FlowScenario, 'nodes' | 'edges'>,
  scopeId: string | null = null,
): FlowRunPlan {
  const scope = scenario.nodes.filter((node) => {
    if (node.kind === 'note' || isFlowFrameKind(node.kind))
      return false;
    return flowExecutionScopeId(scenario, node) === scopeId;
  });
  const ids = new Set(scope.map((node) => node.id));
  const enabled = new Set(scope.filter((node) => node.enabled).map((node) => node.id));
  const edges = scenario.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const id of ids) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of edges) {
    if (!enabled.has(edge.from) || !enabled.has(edge.to))
      continue;
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const pending = new Map<string, number>();
  for (const id of enabled)
    pending.set(id, incoming.get(id)?.length ?? 0);

  const roots = scope.filter((node) => enabled.has(node.id) && (pending.get(node.id) ?? 0) === 0).map((node) => node.id);
  const steps: FlowRunPlanStep[] = [];
  let frontier = roots;
  let wave = 0;
  const settled = new Set<string>();

  while (frontier.length > 0) {
    for (const id of frontier) {
      settled.add(id);
      steps.push({ wave, nodeId: id, waitsFor: incoming.get(id) ?? [] });
    }
    const next: string[] = [];
    for (const id of frontier) {
      for (const target of outgoing.get(id) ?? []) {
        const left = (pending.get(target) ?? 0) - 1;
        pending.set(target, left);
        if (left === 0 && !settled.has(target))
          next.push(target);
      }
    }
    frontier = [...new Set(next)];
    wave += 1;
  }

  const blocked = [...enabled].filter((id) => !settled.has(id));
  return { scopeId, roots, steps, blocked };
}

/** One-based execution index per node, used for canvas badges. */
export function flowRunOrderIndex(
  scenario: Pick<FlowScenario, 'nodes' | 'edges'>,
): Readonly<Record<string, number>> {
  const order: Record<string, number> = {};
  let counter = 1;
  const walk = (scopeId: string | null): void => {
    const plan = buildFlowRunPlan(scenario, scopeId);
    for (const step of plan.steps) {
      order[step.nodeId] = counter;
      counter += 1;
      const node = scenario.nodes.find((item) => item.id === step.nodeId);
      if (node && isFlowContainerKind(node.kind))
        walk(node.id);
    }
  };
  walk(null);
  return order;
}

/** Counts enabled, runnable nodes across every scope. */
export function countFlowScenarioNodes(scenario: Pick<FlowScenario, 'nodes' | 'edges'>): number {
  return scenario.nodes.filter(
    (node) =>
      node.enabled &&
      node.kind !== 'note' &&
      !isFlowFrameKind(node.kind) &&
      !isFlowTerminalKind(node.kind),
  ).length;
}

export function flowScenarioRunCount(scenario: FlowScenario): number {
  if (!scenario.data.enabled || scenario.data.rows.length === 0)
    return 1;
  return Math.min(scenario.data.rows.length, FLOW_SCENARIO_MAX_ROWS);
}

function parseConfig(raw: unknown): Record<string, FlowNodeConfigValue> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {};
  const out: Record<string, FlowNodeConfigValue> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      out[key] = value;
  }
  return out;
}

export function parseFlowGraphNode(raw: unknown): FlowGraphNode | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const kind = flowNodeKindSchema.safeParse(source['kind']);
  if (!kind.success)
    return null;
  return {
    id: typeof source['id'] === 'string' && source['id'] ? source['id'] : newFlowNodeId(),
    kind: kind.data,
    name: typeof source['name'] === 'string' ? source['name'] : '',
    enabled: source['enabled'] !== false,
    x: typeof source['x'] === 'number' ? source['x'] : 0,
    y: typeof source['y'] === 'number' ? source['y'] : 0,
    parentId: typeof source['parentId'] === 'string' && source['parentId'] ? source['parentId'] : null,
    config: { ...(DEFAULT_CONFIG[kind.data] ?? {}), ...parseConfig(source['config']) },
  };
}

export function parseFlowGraphEdge(raw: unknown): FlowGraphEdge | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const from = typeof source['from'] === 'string' ? source['from'] : '';
  const to = typeof source['to'] === 'string' ? source['to'] : '';
  if (!from || !to)
    return null;
  const port = flowPortSchema.safeParse(source['fromPort']);
  const name = typeof source['name'] === 'string' ? source['name'].trim() : '';
  return {
    id: typeof source['id'] === 'string' && source['id'] ? source['id'] : newFlowEdgeId(),
    from,
    fromPort: port.success ? port.data : 'next',
    to,
    ...(name ? { name } : {}),
  };
}

function parseScenarioData(raw: unknown): FlowScenarioData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { enabled: false, columns: [], rows: [] };
  const source = raw as Record<string, unknown>;
  const columns = Array.isArray(source['columns'])
    ? source['columns'].filter((item): item is string => typeof item === 'string')
    : [];
  const rows = Array.isArray(source['rows'])
    ? source['rows']
        .slice(0, FLOW_SCENARIO_MAX_ROWS)
        .map((row) => {
          const out: Record<string, string> = {};
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            for (const [key, value] of Object.entries(row as Record<string, unknown>))
              out[key] = typeof value === 'string' ? value : String(value ?? '');
          }
          return out;
        })
    : [];
  return { enabled: source['enabled'] === true, columns, rows };
}

export function parseFlowScenario(raw: unknown): FlowScenario | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const nodes = Array.isArray(source['nodes'])
    ? source['nodes'].map(parseFlowGraphNode).filter((node): node is FlowGraphNode => node !== null)
    : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(source['edges'])
    ? source['edges']
        .map(parseFlowGraphEdge)
        .filter((edge): edge is FlowGraphEdge => edge !== null && nodeIds.has(edge.from) && nodeIds.has(edge.to))
    : [];
  return ensureFlowScenarioTerminals({
    id: typeof source['id'] === 'string' && source['id'] ? source['id'] : newFlowScenarioId(),
    name: typeof source['name'] === 'string' && source['name'] ? source['name'] : 'Scenario',
    enabled: source['enabled'] !== false,
    folderId: typeof source['folderId'] === 'string' && source['folderId'] ? source['folderId'] : null,
    nodes: nodes.map((node) => (node.parentId && !nodeIds.has(node.parentId) ? { ...node, parentId: null } : node)),
    edges,
    data: parseScenarioData(source['data']),
  });
}

export function parseFlowScenarioFolder(raw: unknown): FlowScenarioFolder | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source['id'] === 'string' && source['id'] ? source['id'] : '';
  if (!id)
    return null;
  return {
    id,
    name: typeof source['name'] === 'string' && source['name'] ? source['name'] : 'Folder',
    parentId: typeof source['parentId'] === 'string' && source['parentId'] ? source['parentId'] : null,
  };
}
