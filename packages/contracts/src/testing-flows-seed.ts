import {
  emptyFlowGraphNode,
  FLOW_DEVICE_NODES_ENABLED,
  type FlowGraphEdge,
  type FlowGraphNode,
  type FlowNodeConfigValue,
  type FlowNodeKind,
  type FlowPort,
  type FlowScenario,
  type FlowScenarioData,
  wireFlowScenarioTerminals,
} from './flow-graph';
import type { FlowArtifactFields, FlowsFile } from './flows-file';
import { CONFIG_SCHEMA_VERSION } from './settings';
import type { ServiceFolderNode, ServiceTreeNode } from './service-tree';
import { buildBasicsFolder } from './testing-flows-basics';
import { buildApiLabScenarios, buildE2eLabScenarios } from './testing-flows-labs';

const STAMP = '2026-09-19T12:00:00.000Z';
const COL_X = 280;
const ROW_Y = 200;

export const TUTORIAL_FOLDER_ID = 'folder_tutorial';
export const TUTORIAL_API_FOLDER_ID = 'folder_tutorial_api';
export const TUTORIAL_E2E_FOLDER_ID = 'folder_tutorial_e2e';
export const TUTORIAL_DEVICE_FOLDER_ID = 'folder_tutorial_device';

export const TUTORIAL_API_SIMPLE_FLOW_ID = 'flow_tutorial_api_simple';
export const TUTORIAL_API_ADVANCED_FLOW_ID = 'flow_tutorial_api_advanced';
export const TUTORIAL_API_COMPLEX_FLOW_ID = 'flow_tutorial_api_complex';
export const TUTORIAL_E2E_SIMPLE_FLOW_ID = 'flow_tutorial_e2e_simple';
export const TUTORIAL_E2E_ADVANCED_FLOW_ID = 'flow_tutorial_e2e_advanced';
export const TUTORIAL_E2E_COMPLEX_FLOW_ID = 'flow_tutorial_e2e_complex';
export const TUTORIAL_DEVICE_SIMPLE_FLOW_ID = 'flow_tutorial_device_simple';
export const TUTORIAL_DEVICE_ADVANCED_FLOW_ID = 'flow_tutorial_device_advanced';
export const TUTORIAL_DEVICE_COMPLEX_FLOW_ID = 'flow_tutorial_device_complex';

/** @deprecated Use TUTORIAL_API_SIMPLE_FLOW_ID */
export const TUTORIAL_API_FLOW_ID = TUTORIAL_API_SIMPLE_FLOW_ID;
/** @deprecated Use TUTORIAL_E2E_SIMPLE_FLOW_ID */
export const TUTORIAL_E2E_FLOW_ID = TUTORIAL_E2E_SIMPLE_FLOW_ID;

const SHOWCASE_SCENARIO_TARGET = 50;

type Config = Readonly<Record<string, FlowNodeConfigValue>>;

interface SeedNode {
  readonly id: string;
  readonly kind: FlowNodeKind;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly parentId?: string | null;
  readonly config?: Config;
  readonly enabled?: boolean;
}

interface SeedEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly fromPort?: FlowPort;
}

function node(spec: SeedNode): FlowGraphNode {
  const base = emptyFlowGraphNode(spec.kind, { x: spec.x, y: spec.y }, spec.parentId ?? null);
  return {
    ...base,
    id: spec.id,
    name: spec.name,
    enabled: spec.enabled !== false,
    config: { ...base.config, ...(spec.config ?? {}) },
  };
}

function edge(spec: SeedEdge): FlowGraphEdge {
  return {
    id: spec.id,
    from: spec.from,
    fromPort: spec.fromPort ?? 'next',
    to: spec.to,
  };
}

function chain(
  prefix: string,
  startX: number,
  laneY: number,
  steps: readonly { readonly kind: FlowNodeKind; readonly name: string; readonly config?: Config }[],
  parentId: string | null = null,
): { readonly nodes: FlowGraphNode[]; readonly edges: FlowGraphEdge[]; readonly lastId: string | null; readonly firstId: string | null } {
  const nodes: FlowGraphNode[] = [];
  const edges: FlowGraphEdge[] = [];
  let prev: string | null = null;
  steps.forEach((step, index) => {
    const id = `${prefix}_${index + 1}`;
    nodes.push(
      node({
        id,
        kind: step.kind,
        name: step.name,
        x: startX + index * COL_X,
        y: laneY,
        parentId,
        config: step.config,
      }),
    );
    if (prev)
      edges.push(edge({ id: `e_${prefix}_${index}`, from: prev, to: id }));
    prev = id;
  });
  return { nodes, edges, lastId: prev, firstId: nodes[0]?.id ?? null };
}

function arrangeScenario(scenario: FlowScenario): FlowScenario {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const item of scenario.nodes) {
    incoming.set(item.id, []);
    outgoing.set(item.id, []);
  }
  for (const item of scenario.edges) {
    incoming.get(item.to)?.push(item.from);
    outgoing.get(item.from)?.push(item.to);
  }

  const depth = new Map<string, number>();
  const roots = scenario.nodes.filter((item) => (incoming.get(item.id)?.length ?? 0) === 0 && !item.parentId);
  const queue = roots.map((item) => item.id);
  for (const id of queue)
    depth.set(id, 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const nextDepth = (depth.get(id) ?? 0) + 1;
    for (const child of outgoing.get(id) ?? []) {
      const current = depth.get(child);
      if (current === undefined || nextDepth > current) {
        depth.set(child, nextDepth);
        queue.push(child);
      }
    }
  }

  const byDepth = new Map<number, string[]>();
  for (const item of scenario.nodes) {
    if (item.parentId)
      continue;
    const d = depth.get(item.id) ?? 0;
    const list = byDepth.get(d) ?? [];
    list.push(item.id);
    byDepth.set(d, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    ids.forEach((id, row) => {
      positions.set(id, { x: 80 + d * COL_X, y: 80 + row * ROW_Y });
    });
  }

  const nodes = scenario.nodes.map((item) => {
    if (item.parentId) {
      const parent = positions.get(item.parentId) ?? { x: item.x, y: item.y };
      return { ...item, x: parent.x + 40, y: parent.y + 72 };
    }
    const pos = positions.get(item.id);
    return pos ? { ...item, x: pos.x, y: pos.y } : item;
  });

  return { ...scenario, nodes };
}

function scenario(
  id: string,
  name: string,
  nodes: readonly FlowGraphNode[],
  edges: readonly FlowGraphEdge[],
  data: FlowScenarioData = { enabled: false, columns: [], rows: [] },
  enabled = true,
): FlowScenario {
  return wireFlowScenarioTerminals(
    arrangeScenario({ id, name, enabled, folderId: null, nodes: [...nodes], edges: [...edges], data }),
  );
}

function artifact(
  id: string,
  name: string,
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
    scenarioFolders: extra.scenarioFolders ?? [],
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
  children: ServiceTreeNode<FlowArtifactFields>[],
): ServiceFolderNode<FlowArtifactFields> {
  return { kind: 'folder', id, name, updatedAt: STAMP, children };
}

/** API Showcase folder with Simple / Advanced / Complex flows. */
export function buildApiShowcaseFolder(): ServiceFolderNode<FlowArtifactFields> {
  const http = chain('api_http', 80, 80, [
    { kind: 'note', name: 'HTTP lane', config: { text: 'Request + status/JSON asserts' } },
    { kind: 'set-var', name: 'Set base', config: { name: 'base', value: 'https://httpbin.org' } },
    { kind: 'request', name: 'GET /get', config: { method: 'GET', url: 'https://httpbin.org/get', body: '' } },
    { kind: 'assert-status', name: 'Status 200', config: { expected: 200 } },
    { kind: 'assert-json', name: 'Has url', config: { expression: 'body.url != null' } },
  ]);

  const branching = (() => {
    const req = node({
      id: 'api_br_req',
      kind: 'request',
      name: 'GET /status/200',
      x: 80,
      y: 80,
      config: { method: 'GET', url: 'https://httpbin.org/status/200', body: '' },
    });
    const gate = node({
      id: 'api_br_if',
      kind: 'if',
      name: 'OK?',
      x: 360,
      y: 80,
      config: { condition: 'status == 200' },
    });
    const ok = node({
      id: 'api_br_ok',
      kind: 'set-var',
      name: 'Mark ok',
      x: 640,
      y: 0,
      config: { name: 'branch', value: 'then' },
    });
    const bad = node({
      id: 'api_br_bad',
      kind: 'set-var',
      name: 'Mark else',
      x: 640,
      y: 160,
      config: { name: 'branch', value: 'else' },
    });
    const join = node({ id: 'api_br_join', kind: 'join', name: 'Join', x: 920, y: 80 });
    const wait = node({
      id: 'api_br_wait',
      kind: 'wait',
      name: 'Pause',
      x: 1200,
      y: 80,
      config: { waitMs: 100 },
    });
    return {
      nodes: [req, gate, ok, bad, join, wait],
      edges: [
        edge({ id: 'e_api_br_1', from: req.id, to: gate.id }),
        edge({ id: 'e_api_br_2', from: gate.id, to: ok.id, fromPort: 'then' }),
        edge({ id: 'e_api_br_3', from: gate.id, to: bad.id, fromPort: 'else' }),
        edge({ id: 'e_api_br_4', from: ok.id, to: join.id }),
        edge({ id: 'e_api_br_5', from: bad.id, to: join.id }),
        edge({ id: 'e_api_br_6', from: join.id, to: wait.id }),
      ],
    };
  })();

  const loops = (() => {
    const each = node({
      id: 'api_lp_each',
      kind: 'for-each',
      name: 'For each item',
      x: 80,
      y: 80,
      config: { items: 'items' },
    });
    const bodyReq = node({
      id: 'api_lp_body',
      kind: 'request',
      name: 'Echo item',
      x: 40,
      y: 100,
      parentId: each.id,
      config: { method: 'GET', url: 'https://httpbin.org/get?item={{item}}', body: '' },
    });
    const afterEach = node({
      id: 'api_lp_done',
      kind: 'set-var',
      name: 'After each',
      x: 360,
      y: 80,
      config: { name: 'eachDone', value: '1' },
    });
    const loop = node({
      id: 'api_lp_while',
      kind: 'while',
      name: 'While false',
      x: 640,
      y: 80,
      config: { condition: 'false', maxIterations: 2 },
    });
    const whileBody = node({
      id: 'api_lp_while_body',
      kind: 'wait',
      name: 'While body',
      x: 40,
      y: 100,
      parentId: loop.id,
      config: { waitMs: 50 },
    });
    const retry = node({
      id: 'api_lp_retry',
      kind: 'retry',
      name: 'Retry once',
      x: 920,
      y: 80,
      config: { attempts: 2 },
    });
    const retryBody = node({
      id: 'api_lp_retry_body',
      kind: 'request',
      name: 'Flaky GET',
      x: 40,
      y: 100,
      parentId: retry.id,
      config: { method: 'GET', url: 'https://httpbin.org/get', body: '' },
    });
    const cache = node({
      id: 'api_lp_cache',
      kind: 'cache',
      name: 'Cache key',
      x: 1200,
      y: 80,
      config: { key: 'tutorial-once' },
    });
    const db = node({
      id: 'api_lp_db',
      kind: 'database',
      name: 'SQL (optional)',
      x: 1480,
      y: 80,
      enabled: false,
      config: { connectionId: '', query: 'SELECT 1' },
    });
    const seedItems = node({
      id: 'api_lp_items',
      kind: 'set-var',
      name: 'Seed items',
      x: 80,
      y: 0,
      config: { name: 'items', value: '["a","b"]' },
    });
    return {
      nodes: [seedItems, each, bodyReq, afterEach, loop, whileBody, retry, retryBody, cache, db],
      edges: [
        edge({ id: 'e_api_lp_0', from: seedItems.id, to: each.id }),
        edge({ id: 'e_api_lp_1', from: each.id, to: bodyReq.id, fromPort: 'body' }),
        edge({ id: 'e_api_lp_2', from: each.id, to: afterEach.id, fromPort: 'done' }),
        edge({ id: 'e_api_lp_3', from: afterEach.id, to: loop.id }),
        edge({ id: 'e_api_lp_4', from: loop.id, to: whileBody.id, fromPort: 'body' }),
        edge({ id: 'e_api_lp_5', from: loop.id, to: retry.id, fromPort: 'done' }),
        edge({ id: 'e_api_lp_6', from: retry.id, to: retryBody.id, fromPort: 'body' }),
        edge({ id: 'e_api_lp_7', from: retry.id, to: cache.id, fromPort: 'done' }),
        edge({ id: 'e_api_lp_8', from: cache.id, to: db.id }),
      ],
    };
  })();

  const traffic = chain('api_tr', 80, 80, [
    {
      kind: 'http-listener',
      name: 'Listen',
      config: { stage: 'response', method: '*', match: 'contains', url: '/tutorial', waitMs: 200 },
    },
    { kind: 'http-validate', name: 'Validate listen', config: { expected: 200 } },
    {
      kind: 'http-interceptor',
      name: 'Intercept',
      config: {
        stage: 'request',
        method: '*',
        match: 'contains',
        url: '/tutorial',
        waitMs: 200,
        action: 'passthrough',
        setHeaders: '[]',
        removeHeaders: '[]',
        setBody: '',
        bodyMode: 'json',
        mockStatus: 200,
        mockBody: '{\n}\n',
      },
    },
    { kind: 'http-validate', name: 'Validate intercept', config: { expected: 200 } },
    { kind: 'manual', name: 'Manual check', config: { prompt: 'Confirm mock traffic if used' } },
    { kind: 'trigger', name: 'Run self (noop id)', config: { flowId: TUTORIAL_API_SIMPLE_FLOW_ID } },
  ]);

  const statusMatrix = (() => {
    const seed = node({
      id: 'api_st_codes',
      kind: 'set-var',
      name: 'Status codes',
      x: 80,
      y: 80,
      config: { name: 'codes', value: '["200","404","500"]' },
    });
    const each = node({
      id: 'api_st_each',
      kind: 'for-each',
      name: 'Each code',
      x: 360,
      y: 80,
      config: { items: 'codes' },
    });
    const req = node({
      id: 'api_st_req',
      kind: 'request',
      name: 'GET /status/{{item}}',
      x: 40,
      y: 100,
      parentId: each.id,
      config: { method: 'GET', url: 'https://httpbin.org/status/{{item}}', body: '' },
    });
    const gate = node({
      id: 'api_st_if',
      kind: 'if',
      name: 'Was 200?',
      x: 320,
      y: 100,
      parentId: each.id,
      config: { condition: 'status == 200' },
    });
    const ok = node({
      id: 'api_st_ok',
      kind: 'set-var',
      name: 'Mark ok',
      x: 600,
      y: 20,
      parentId: each.id,
      config: { name: 'lastOk', value: 'yes' },
    });
    const bad = node({
      id: 'api_st_bad',
      kind: 'set-var',
      name: 'Mark err',
      x: 600,
      y: 180,
      parentId: each.id,
      config: { name: 'lastOk', value: 'no' },
    });
    const done = node({
      id: 'api_st_done',
      kind: 'note',
      name: 'Matrix done',
      x: 720,
      y: 80,
      config: { text: 'for-each body: request â†’ if â†’ set-var (per status code)' },
    });
    return {
      nodes: [seed, each, req, gate, ok, bad, done],
      edges: [
        edge({ id: 'e_api_st_1', from: seed.id, to: each.id }),
        edge({ id: 'e_api_st_2', from: each.id, to: req.id, fromPort: 'body' }),
        edge({ id: 'e_api_st_3', from: req.id, to: gate.id }),
        edge({ id: 'e_api_st_4', from: gate.id, to: ok.id, fromPort: 'then' }),
        edge({ id: 'e_api_st_5', from: gate.id, to: bad.id, fromPort: 'else' }),
        edge({ id: 'e_api_st_6', from: each.id, to: done.id, fromPort: 'done' }),
      ],
    };
  })();

  const delayLab = (() => {
    const note = node({
      id: 'api_dl_note',
      kind: 'note',
      name: 'Flaky lab',
      x: 80,
      y: 80,
      config: { text: 'Retry wraps a delayed httpbin call, then caches the result key' },
    });
    const retry = node({
      id: 'api_dl_retry',
      kind: 'retry',
      name: 'Retry delay',
      x: 360,
      y: 80,
      config: { attempts: 3 },
    });
    const req = node({
      id: 'api_dl_req',
      kind: 'request',
      name: 'GET /delay/1',
      x: 40,
      y: 100,
      parentId: retry.id,
      config: { method: 'GET', url: 'https://httpbin.org/delay/1', body: '' },
    });
    const status = node({
      id: 'api_dl_status',
      kind: 'assert-status',
      name: 'Status 200',
      x: 640,
      y: 80,
      config: { expected: 200 },
    });
    const cache = node({
      id: 'api_dl_cache',
      kind: 'cache',
      name: 'Cache delay',
      x: 920,
      y: 80,
      config: { key: 'tutorial-delay-once' },
    });
    const json = node({
      id: 'api_dl_json',
      kind: 'assert-json',
      name: 'Has url',
      x: 1200,
      y: 80,
      config: { expression: 'body.url != null' },
    });
    return {
      nodes: [note, retry, req, status, cache, json],
      edges: [
        edge({ id: 'e_api_dl_1', from: note.id, to: retry.id }),
        edge({ id: 'e_api_dl_2', from: retry.id, to: req.id, fromPort: 'body' }),
        edge({ id: 'e_api_dl_3', from: retry.id, to: status.id, fromPort: 'done' }),
        edge({ id: 'e_api_dl_4', from: status.id, to: cache.id }),
        edge({ id: 'e_api_dl_5', from: cache.id, to: json.id }),
      ],
    };
  })();

  const methodMatrix = (() => {
    const seed = node({
      id: 'api_mm_methods',
      kind: 'set-var',
      name: 'HTTP methods',
      x: 80,
      y: 80,
      config: { name: 'methods', value: '["get","post","put","patch","delete"]' },
    });
    const each = node({
      id: 'api_mm_each',
      kind: 'for-each',
      name: 'Each method',
      x: 360,
      y: 80,
      config: { items: 'methods' },
    });
    const req = node({
      id: 'api_mm_req',
      kind: 'request',
      name: '{{item}} /{{item}}',
      x: 40,
      y: 100,
      parentId: each.id,
      config: {
        method: '{{item}}',
        url: 'https://httpbin.org/{{item}}',
        body: '{"from":"tutorial"}',
      },
    });
    const status = node({
      id: 'api_mm_status',
      kind: 'assert-status',
      name: 'Expect 200',
      x: 320,
      y: 100,
      parentId: each.id,
      config: { expected: 200 },
    });
    const note = node({
      id: 'api_mm_done',
      kind: 'note',
      name: 'Methods done',
      x: 720,
      y: 80,
      config: { text: 'Data-driven verbs against matching httpbin routes' },
    });
    return {
      nodes: [seed, each, req, status, note],
      edges: [
        edge({ id: 'e_api_mm_1', from: seed.id, to: each.id }),
        edge({ id: 'e_api_mm_2', from: each.id, to: req.id, fromPort: 'body' }),
        edge({ id: 'e_api_mm_3', from: req.id, to: status.id }),
        edge({ id: 'e_api_mm_4', from: each.id, to: note.id, fromPort: 'done' }),
      ],
    };
  })();

  const chainedPipeline = chain('api_ch', 80, 80, [
    {
      kind: 'note',
      name: 'Chained pipeline',
      config: { text: 'POST echo â†’ capture json â†’ set-var â†’ GET with query â†’ assert' },
    },
    {
      kind: 'request',
      name: 'POST /post',
      config: {
        method: 'POST',
        url: 'https://httpbin.org/post',
        body: '{"tutorial":"chained","n":42}',
      },
    },
    { kind: 'assert-status', name: 'POST 200', config: { expected: 200 } },
    {
      kind: 'capture',
      name: 'Capture tutorial field',
      config: {
        rules: JSON.stringify([{ kind: 'json', path: 'json.tutorial', name: 'echoedTutorial' }]),
      },
    },
    { kind: 'assert-json', name: 'Captured tutorial', config: { expression: "echoedTutorial == 'chained'" } },
    { kind: 'set-var', name: 'Store marker', config: { name: 'marker', value: 'testrix-chain' } },
    {
      kind: 'request',
      name: 'GET with marker',
      config: { method: 'GET', url: 'https://httpbin.org/get?marker={{marker}}', body: '' },
    },
    { kind: 'assert-status', name: 'GET 200', config: { expected: 200 } },
    {
      kind: 'assert-json',
      name: 'Query echoed',
      config: { expression: 'body.args != null' },
    },
    { kind: 'cache', name: 'Cache chain', config: { key: 'tutorial-chain' } },
  ]);

  const captureJson = (() => {
    const lane = chain('api_cap_json', 80, 80, [
      {
        kind: 'request',
        name: 'GET /json',
        config: { method: 'GET', url: 'https://httpbin.org/json', body: '' },
      },
      { kind: 'assert-status', name: 'Status 200', config: { expected: 200 } },
      {
        kind: 'capture',
        name: 'Capture author',
        config: {
          rules: JSON.stringify([{ kind: 'json', path: 'slideshow.author', name: 'author' }]),
        },
      },
      {
        kind: 'assert-json',
        name: 'Author captured',
        config: { expression: "author == 'Yours Truly'" },
      },
    ]);
    const note = node({
      id: 'api_cap_json_note',
      kind: 'note',
      name: 'Capture JSON',
      x: 80,
      y: -40,
      config: {
        text: 'Same pattern as Redis OTP — path into array/object, store as {{var}}.',
      },
    });
    return { nodes: [...lane.nodes, note], edges: lane.edges };
  })();

  const captureHeader = (() => {
    const lane = chain('api_cap_hdr', 80, 80, [
      {
        kind: 'request',
        name: 'GET response-headers',
        config: {
          method: 'GET',
          url: 'https://httpbin.org/response-headers?Authorization=Bearer%20tutorial-jwt',
          body: '',
        },
      },
      { kind: 'assert-status', name: 'Status 200', config: { expected: 200 } },
      {
        kind: 'capture',
        name: 'Capture Authorization',
        config: {
          rules: JSON.stringify([
            { kind: 'header', path: 'authorization', name: 'token' },
            { kind: 'status', path: '', name: 'lastStatus' },
          ]),
        },
      },
      {
        kind: 'assert-json',
        name: 'Token captured',
        config: { expression: "token == 'Bearer tutorial-jwt'" },
      },
    ]);
    const note = node({
      id: 'api_cap_hdr_note',
      kind: 'note',
      name: 'Capture header',
      x: 80,
      y: -40,
      config: { text: 'Cache JWTs / custom headers from the last exchange.' },
    });
    return { nodes: [...lane.nodes, note], edges: lane.edges };
  })();

  const captureMulti = (() => {
    const lane = chain('api_cap_multi', 80, 80, [
      {
        kind: 'request',
        name: 'POST /post',
        config: {
          method: 'POST',
          url: 'https://httpbin.org/post',
          body: '{"marker":"testrix-capture"}',
        },
      },
      { kind: 'assert-status', name: 'Status 200', config: { expected: 200 } },
      {
        kind: 'capture',
        name: 'Capture three ways',
        config: {
          rules: JSON.stringify([
            { kind: 'body', path: '', name: 'echoBody' },
            { kind: 'json', path: 'json.marker', name: 'marker' },
            { kind: 'header', path: 'content-type', name: 'contentType' },
          ]),
        },
      },
      {
        kind: 'assert-json',
        name: 'Marker captured',
        config: { expression: "marker == 'testrix-capture'" },
      },
      {
        kind: 'set-var',
        name: 'Reuse marker',
        config: { name: 'reused', value: '{{marker}}' },
      },
    ]);
    const note = node({
      id: 'api_cap_multi_note',
      kind: 'note',
      name: 'Capture multi-rule',
      x: 80,
      y: -40,
      config: { text: 'One Capture node — body, JSON path, and header together.' },
    });
    return { nodes: [...lane.nodes, note], edges: lane.edges };
  })();

  const nestedRetryLoop = (() => {
    const seed = node({
      id: 'api_nr_seed',
      kind: 'set-var',
      name: 'Paths',
      x: 80,
      y: 80,
      config: { name: 'paths', value: '["get","uuid","headers"]' },
    });
    const each = node({
      id: 'api_nr_each',
      kind: 'for-each',
      name: 'Each path',
      x: 360,
      y: 80,
      config: { items: 'paths' },
    });
    const retry = node({
      id: 'api_nr_retry',
      kind: 'retry',
      name: 'Retry path',
      x: 40,
      y: 100,
      parentId: each.id,
      config: { attempts: 2 },
    });
    const req = node({
      id: 'api_nr_req',
      kind: 'request',
      name: 'GET /{{item}}',
      x: 40,
      y: 100,
      parentId: retry.id,
      config: { method: 'GET', url: 'https://httpbin.org/{{item}}', body: '' },
    });
    const status = node({
      id: 'api_nr_status',
      kind: 'assert-status',
      name: 'OK',
      x: 320,
      y: 100,
      parentId: each.id,
      config: { expected: 200 },
    });
    const after = node({
      id: 'api_nr_after',
      kind: 'set-var',
      name: 'Last path',
      x: 720,
      y: 80,
      config: { name: 'lastPath', value: '{{item}}' },
    });
    return {
      nodes: [seed, each, retry, req, status, after],
      edges: [
        edge({ id: 'e_api_nr_1', from: seed.id, to: each.id }),
        edge({ id: 'e_api_nr_2', from: each.id, to: retry.id, fromPort: 'body' }),
        edge({ id: 'e_api_nr_3', from: retry.id, to: req.id, fromPort: 'body' }),
        edge({ id: 'e_api_nr_4', from: retry.id, to: status.id, fromPort: 'done' }),
        edge({ id: 'e_api_nr_5', from: each.id, to: after.id, fromPort: 'done' }),
      ],
    };
  })();

  const dataStatusCodes = (() => {
    const lane = chain('api_data_st', 80, 80, [
      {
        kind: 'request',
        name: 'GET /status/{{code}}',
        config: { method: 'GET', url: 'https://httpbin.org/status/{{code}}', body: '' },
      },
      {
        kind: 'assert-json',
        name: 'Status matches row',
        config: { expression: 'status == {{code}}' },
      },
    ]);
    const note = node({
      id: 'api_data_st_note',
      kind: 'note',
      name: 'Data rows',
      x: 80,
      y: -40,
      config: {
        text: 'Open the Data tab. Each row supplies {{code}}; the graph runs once per row.',
      },
    });
    return { nodes: [...lane.nodes, note], edges: lane.edges };
  })();

  const dataQueryEcho = (() => {
    const lane = chain('api_data_q', 80, 80, [
      {
        kind: 'request',
        name: 'GET with marker',
        config: { method: 'GET', url: 'https://httpbin.org/get?marker={{marker}}', body: '' },
      },
      { kind: 'assert-status', name: 'Status 200', config: { expected: 200 } },
      {
        kind: 'capture',
        name: 'Capture marker',
        config: {
          rules: JSON.stringify([{ kind: 'json', path: 'args.marker', name: 'got' }]),
        },
      },
      {
        kind: 'assert-json',
        name: 'Marker echoed',
        config: { expression: "got == '{{marker}}'" },
      },
    ]);
    const note = node({
      id: 'api_data_q_note',
      kind: 'note',
      name: 'Data + Capture',
      x: 80,
      y: -40,
      config: {
        text: 'Data columns feed {{marker}}; Capture reads the echo back into {{got}}.',
      },
    });
    return { nodes: [...lane.nodes, note], edges: lane.edges };
  })();

  const dataPostBodies = (() => {
    const lane = chain('api_data_post', 80, 80, [
      {
        kind: 'request',
        name: 'POST product row',
        config: {
          method: 'POST',
          url: 'https://httpbin.org/post',
          body: '{"product":"{{product}}","qty":{{qty}}}',
        },
      },
      { kind: 'assert-status', name: 'Status 200', config: { expected: 200 } },
      {
        kind: 'capture',
        name: 'Capture product',
        config: {
          rules: JSON.stringify([{ kind: 'json', path: 'json.product', name: 'posted' }]),
        },
      },
      {
        kind: 'assert-json',
        name: 'Product posted',
        config: { expression: "posted == '{{product}}'" },
      },
    ]);
    const note = node({
      id: 'api_data_post_note',
      kind: 'note',
      name: 'Data POST bodies',
      x: 80,
      y: -40,
      config: {
        text: 'Each Data row fills {{product}} and {{qty}} in the POST body.',
      },
    });
    return { nodes: [...lane.nodes, note], edges: lane.edges };
  })();

  const simple: FlowScenario[] = [
    scenario('fs_api_http', 'HTTP request', http.nodes, http.edges),
    scenario('fs_api_capture_json', 'Capture JSON field', captureJson.nodes, captureJson.edges),
    scenario('fs_api_capture_header', 'Capture header', captureHeader.nodes, captureHeader.edges),
    scenario(
      'fs_api_data_status',
      'Data rows: status codes',
      dataStatusCodes.nodes,
      dataStatusCodes.edges,
      {
        enabled: true,
        columns: ['code'],
        rows: [{ code: '200' }, { code: '404' }, { code: '500' }],
      },
    ),
  ];

  const advanced: FlowScenario[] = [
    scenario('fs_api_branch', 'Branching', branching.nodes, branching.edges),
    scenario('fs_api_loops', 'Loops and data', loops.nodes, loops.edges),
    scenario('fs_api_delay', 'Delay + retry lab', delayLab.nodes, delayLab.edges),
    scenario('fs_api_methods', 'Method matrix', methodMatrix.nodes, methodMatrix.edges),
    scenario('fs_api_capture_chain', 'Capture multi-rule', captureMulti.nodes, captureMulti.edges),
    scenario(
      'fs_api_data_query',
      'Data rows: query + capture',
      dataQueryEcho.nodes,
      dataQueryEcho.edges,
      {
        enabled: true,
        columns: ['marker'],
        rows: [{ marker: 'alpha' }, { marker: 'beta' }, { marker: 'gamma' }],
      },
    ),
    scenario(
      'fs_api_data_post',
      'Data rows: POST bodies',
      dataPostBodies.nodes,
      dataPostBodies.edges,
      {
        enabled: true,
        columns: ['product', 'qty'],
        rows: [
          { product: 'sku-1', qty: '2' },
          { product: 'sku-2', qty: '5' },
          { product: 'sku-3', qty: '1' },
        ],
      },
    ),
  ];

  const complexCurated: FlowScenario[] = [
    scenario('fs_api_traffic', 'Listeners and trigger', traffic.nodes, traffic.edges),
    scenario('fs_api_status', 'Status matrix', statusMatrix.nodes, statusMatrix.edges),
    scenario('fs_api_chain', 'Chained pipeline', chainedPipeline.nodes, chainedPipeline.edges),
    scenario('fs_api_nested', 'Nested retry loop', nestedRetryLoop.nodes, nestedRetryLoop.edges),
  ];

  const curatedCount = simple.length + advanced.length + complexCurated.length;
  const complex = [...complexCurated, ...buildApiLabScenarios(curatedCount)];

  return folder(TUTORIAL_API_FOLDER_ID, 'API Showcase', [
    artifact(TUTORIAL_API_SIMPLE_FLOW_ID, 'Simple examples', simple, {
      description: 'Straight-line HTTP, Capture, and Data-row starters against httpbin.',
      tags: ['tutorial', 'api', 'simple'],
      docs: 'Requests use https://httpbin.org. Open Data on status-code rows. Capture stores JSON paths and headers into {{variables}}.',
    }),
    artifact(TUTORIAL_API_ADVANCED_FLOW_ID, 'Advanced examples', advanced, {
      description: 'Branches, loops, retries, Capture multi-rule, and Data-driven queries/POSTs.',
      tags: ['tutorial', 'api', 'advanced'],
      docs: 'Covers if / for-each / while / retry / cache plus Capture and Data tab patterns.',
    }),
    artifact(TUTORIAL_API_COMPLEX_FLOW_ID, 'Complex examples', complex, {
      description: `Listeners, matrices, nested control, and labs (about ${SHOWCASE_SCENARIO_TARGET} API scenarios across Simple–Complex).`,
      tags: ['tutorial', 'api', 'complex'],
      docs: 'http-listener, interceptor, trigger, join-style pipelines, and remaining httpbin labs.',
    }),
  ]);
}

/** @deprecated Prefer buildApiShowcaseFolder */
export function buildApiShowcaseFlow(): ServiceTreeNode<FlowArtifactFields> {
  return buildApiShowcaseFolder();
}

/** E2E Showcase folder with Simple / Advanced / Complex flows. */
export function buildE2eShowcaseFolder(): ServiceFolderNode<FlowArtifactFields> {
  const login = chain('e2e_login', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Open The Internet',
      config: { url: 'https://the-internet.herokuapp.com/login', width: 1200, height: 800 },
    },
    { kind: 'browser-wait-for', name: 'Wait username', config: { selector: '#username', timeoutMs: 8000 } },
    { kind: 'browser-type', name: 'Username', config: { selector: '#username', text: 'tomsmith', clearFirst: true } },
    { kind: 'browser-type', name: 'Password', config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true } },
    { kind: 'browser-click', name: 'Login', config: { selector: 'button[type="submit"]' } },
    { kind: 'assert-url', name: 'Secure URL', config: { match: 'contains', expected: '/secure' } },
    { kind: 'assert-text', name: 'Flash ok', config: { selector: '#flash', match: 'contains', expected: 'You logged into a secure area!' } },
    { kind: 'assert-visible', name: 'Logout visible', config: { selector: 'a.button' } },
    { kind: 'browser-screenshot', name: 'Shot secure', config: { name: 'tutorial-secure' } },
  ]);

  const interactions = chain('e2e_ix', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Dropdown page',
      config: { url: 'https://the-internet.herokuapp.com/dropdown', width: 1100, height: 800 },
    },
    { kind: 'browser-select', name: 'Pick option 2', config: { selector: '#dropdown', value: '2' } },
    { kind: 'browser-hover', name: 'Hover heading', config: { selector: 'h3' } },
    { kind: 'browser-press', name: 'Tab', config: { selector: '#dropdown', key: 'Tab' } },
    {
      kind: 'browser-eval',
      name: 'Read title',
      config: { script: 'document.title' },
    },
    { kind: 'set-var', name: 'Store title', config: { name: 'pageTitle', value: '{{eval}}' } },
    { kind: 'note', name: 'Interaction lane', config: { text: 'Select, hover, key, eval' } },
  ]);

  const control = (() => {
    const open = node({
      id: 'e2e_ctl_open',
      kind: 'browser-open',
      name: 'Open home',
      x: 80,
      y: 80,
      config: { url: 'https://the-internet.herokuapp.com/', width: 1100, height: 800 },
    });
    const gate = node({
      id: 'e2e_ctl_if',
      kind: 'if',
      name: 'Has A/B?',
      x: 360,
      y: 80,
      config: { condition: 'true' },
    });
    const thenClick = node({
      id: 'e2e_ctl_then',
      kind: 'browser-click',
      name: 'Open A/B',
      x: 640,
      y: 0,
      config: { selector: 'a[href="/abtest"]' },
    });
    const elseWait = node({
      id: 'e2e_ctl_else',
      kind: 'wait',
      name: 'Skip wait',
      x: 640,
      y: 160,
      config: { waitMs: 50 },
    });
    const join = node({ id: 'e2e_ctl_join', kind: 'join', name: 'Join', x: 920, y: 80 });
    const group = node({
      id: 'e2e_ctl_group',
      kind: 'group',
      name: 'Prep shot',
      x: 1200,
      y: 40,
      config: { text: 'Docs frame only' },
    });
    const groupWait = node({
      id: 'e2e_ctl_group_wait',
      kind: 'wait',
      name: 'Brief pause',
      x: 40,
      y: 80,
      parentId: group.id,
      config: { waitMs: 50 },
    });
    const retry = node({
      id: 'e2e_ctl_retry',
      kind: 'retry',
      name: 'Retry shot',
      x: 1480,
      y: 80,
      config: { attempts: 2 },
    });
    const shot = node({
      id: 'e2e_ctl_shot',
      kind: 'browser-screenshot',
      name: 'Home shot',
      x: 40,
      y: 100,
      parentId: retry.id,
      config: { name: 'tutorial-home' },
    });
    const manual = node({
      id: 'e2e_ctl_manual',
      kind: 'manual',
      name: 'Human check',
      x: 1760,
      y: 80,
      config: { prompt: 'Confirm the browser window looked correct' },
    });
    return {
      nodes: [open, gate, thenClick, elseWait, join, group, groupWait, retry, shot, manual],
      edges: [
        edge({ id: 'e_e2e_ctl_1', from: open.id, to: gate.id }),
        edge({ id: 'e_e2e_ctl_2', from: gate.id, to: thenClick.id, fromPort: 'then' }),
        edge({ id: 'e_e2e_ctl_3', from: gate.id, to: elseWait.id, fromPort: 'else' }),
        edge({ id: 'e_e2e_ctl_4', from: thenClick.id, to: join.id }),
        edge({ id: 'e_e2e_ctl_5', from: elseWait.id, to: join.id }),
        edge({ id: 'e_e2e_ctl_6', from: join.id, to: groupWait.id }),
        edge({ id: 'e_e2e_ctl_6c', from: groupWait.id, to: retry.id }),
        edge({ id: 'e_e2e_ctl_7', from: retry.id, to: shot.id, fromPort: 'body' }),
        edge({ id: 'e_e2e_ctl_8', from: retry.id, to: manual.id, fromPort: 'done' }),
      ],
    };
  })();

  const dynamic = chain('e2e_dyn', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Dynamic controls',
      config: { url: 'https://the-internet.herokuapp.com/dynamic_controls', width: 1100, height: 800 },
    },
    { kind: 'browser-wait-for', name: 'Wait checkbox', config: { selector: '#checkbox', timeoutMs: 8000 } },
    { kind: 'browser-click', name: 'Remove checkbox', config: { selector: 'button[onclick="swapCheckbox()"]' } },
    { kind: 'browser-wait-for', name: 'Wait gone', config: { selector: '#message', timeoutMs: 8000 } },
    { kind: 'assert-text', name: 'Gone message', config: { selector: '#message', match: 'contains', expected: "It's gone!" } },
    { kind: 'browser-click', name: 'Enable input', config: { selector: 'button[onclick="swapInput()"]' } },
    { kind: 'browser-wait-for', name: 'Wait input', config: { selector: 'input[type="text"]:not([disabled])', timeoutMs: 8000 } },
    { kind: 'browser-type', name: 'Type enabled', config: { selector: 'input[type="text"]', text: 'testrix', clearFirst: true } },
    { kind: 'browser-screenshot', name: 'Shot dynamic', config: { name: 'tutorial-dynamic' } },
  ]);

  const hovers = chain('e2e_hov', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Hovers page',
      config: { url: 'https://the-internet.herokuapp.com/hovers', width: 1100, height: 800 },
    },
    { kind: 'browser-hover', name: 'Hover figure 1', config: { selector: '.figure' } },
    { kind: 'browser-wait-for', name: 'Wait caption', config: { selector: '.figcaption a', timeoutMs: 4000 } },
    { kind: 'browser-click', name: 'View profile', config: { selector: '.figcaption a' } },
    { kind: 'assert-url', name: 'Users URL', config: { match: 'contains', expected: '/users/' } },
    { kind: 'browser-screenshot', name: 'Shot hover', config: { name: 'tutorial-hover' } },
  ]);

  const addRemove = chain('e2e_add', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Add/remove',
      config: { url: 'https://the-internet.herokuapp.com/add_remove_elements/', width: 1100, height: 800 },
    },
    { kind: 'browser-click', name: 'Add once', config: { selector: 'button[onclick="addElement()"]' } },
    { kind: 'browser-click', name: 'Add twice', config: { selector: 'button[onclick="addElement()"]' } },
    { kind: 'assert-visible', name: 'Delete shown', config: { selector: '.added-manually' } },
    {
      kind: 'browser-eval',
      name: 'Count deletes',
      config: {
        script:
          '(() => { const n = document.querySelectorAll(".added-manually").length; if (n < 2) throw new Error("expected 2 delete buttons, saw " + n); return n; })()',
      },
    },
    { kind: 'browser-click', name: 'Delete one', config: { selector: '.added-manually' } },
    { kind: 'note', name: 'Add/remove lane', config: { text: 'Click Add twice, assert, delete one' } },
  ]);

  const checkboxes = chain('e2e_cb', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Checkboxes',
      config: { url: 'https://the-internet.herokuapp.com/checkboxes', width: 1100, height: 800 },
    },
    { kind: 'browser-wait-for', name: 'Wait form', config: { selector: '#checkboxes', timeoutMs: 8000 } },
    {
      kind: 'browser-click',
      name: 'Toggle first',
      config: { selector: '#checkboxes input[type="checkbox"]:nth-of-type(1)' },
    },
    {
      kind: 'browser-eval',
      name: 'Count checked',
      config: {
        script:
          '(() => { const n = document.querySelectorAll("#checkboxes input:checked").length; if (n < 1) throw new Error("expected a checked box"); return n; })()',
      },
    },
    { kind: 'browser-screenshot', name: 'Shot checks', config: { name: 'tutorial-checkboxes' } },
  ]);

  const inputsLab = chain('e2e_in', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Inputs page',
      config: { url: 'https://the-internet.herokuapp.com/inputs', width: 1100, height: 800 },
    },
    { kind: 'browser-wait-for', name: 'Wait number', config: { selector: 'input[type="number"]', timeoutMs: 8000 } },
    {
      kind: 'browser-type',
      name: 'Type 7',
      config: { selector: 'input[type="number"]', text: '7', clearFirst: true },
    },
    { kind: 'browser-press', name: 'Arrow up', config: { selector: 'input[type="number"]', key: 'ArrowUp' } },
    {
      kind: 'browser-eval',
      name: 'Value bumped',
      config: {
        script:
          '(() => { const el = document.querySelector(\'input[type="number"]\'); const v = Number(el && el.value); if (!(v >= 7)) throw new Error("expected >= 7, saw " + v); return v; })()',
      },
    },
    { kind: 'note', name: 'Inputs lane', config: { text: 'Type + key press on number input' } },
  ]);

  const disappearing = chain('e2e_dis', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Disappearing',
      config: { url: 'https://the-internet.herokuapp.com/disappearing_elements', width: 1100, height: 800 },
    },
    { kind: 'browser-wait-for', name: 'Wait menu', config: { selector: 'ul li a', timeoutMs: 8000 } },
    {
      kind: 'browser-eval',
      name: 'Menu count',
      config: {
        script:
          '(() => { const n = document.querySelectorAll("ul li").length; if (n < 1) throw new Error("no menu items"); return n; })()',
      },
    },
    { kind: 'assert-visible', name: 'Home link', config: { selector: 'a[href="/"]' } },
    { kind: 'browser-screenshot', name: 'Shot menu', config: { name: 'tutorial-disappear' } },
  ]);

  const tables = chain('e2e_tbl', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Tables',
      config: { url: 'https://the-internet.herokuapp.com/tables', width: 1200, height: 800 },
    },
    { kind: 'browser-wait-for', name: 'Wait table', config: { selector: '#table1', timeoutMs: 8000 } },
    {
      kind: 'browser-eval',
      name: 'Count rows',
      config: {
        script:
          '(() => { const n = document.querySelectorAll("#table1 tbody tr").length; if (n < 3) throw new Error("expected rows, saw " + n); return n; })()',
      },
    },
    { kind: 'browser-click', name: 'Sort last name', config: { selector: '#table1 thead tr th:nth-child(1)' } },
    { kind: 'assert-visible', name: 'Table still there', config: { selector: '#table1 tbody tr' } },
    { kind: 'browser-screenshot', name: 'Shot table', config: { name: 'tutorial-tables' } },
  ]);

  const sessionRoundtrip = chain('e2e_sess', 80, 80, [
    {
      kind: 'browser-open',
      name: 'Login',
      config: { url: 'https://the-internet.herokuapp.com/login', width: 1200, height: 800 },
    },
    { kind: 'browser-type', name: 'User', config: { selector: '#username', text: 'tomsmith', clearFirst: true } },
    {
      kind: 'browser-type',
      name: 'Pass',
      config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true },
    },
    { kind: 'browser-click', name: 'Submit', config: { selector: 'button[type="submit"]' } },
    { kind: 'assert-url', name: 'Secure', config: { match: 'contains', expected: '/secure' } },
    { kind: 'browser-click', name: 'Logout', config: { selector: 'a.button' } },
    { kind: 'assert-url', name: 'Back login', config: { match: 'contains', expected: '/login' } },
    { kind: 'assert-text', name: 'Logged out flash', config: { selector: '#flash', match: 'contains', expected: 'logged out' } },
    { kind: 'browser-type', name: 'User again', config: { selector: '#username', text: 'tomsmith', clearFirst: true } },
    {
      kind: 'browser-type',
      name: 'Pass again',
      config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true },
    },
    { kind: 'browser-click', name: 'Login again', config: { selector: 'button[type="submit"]' } },
    { kind: 'assert-url', name: 'Secure again', config: { match: 'contains', expected: '/secure' } },
    { kind: 'browser-screenshot', name: 'Shot session', config: { name: 'tutorial-session' } },
  ]);

  const gauntlet = (() => {
    const open = node({
      id: 'e2e_g_open',
      kind: 'browser-open',
      name: 'Start home',
      x: 80,
      y: 120,
      config: { url: 'https://the-internet.herokuapp.com/', width: 1200, height: 800 },
    });
    const toLogin = node({
      id: 'e2e_g_login_link',
      kind: 'browser-click',
      name: 'Form Auth link',
      x: 360,
      y: 120,
      config: { selector: 'a[href="/login"]' },
    });
    const user = node({
      id: 'e2e_g_user',
      kind: 'browser-type',
      name: 'Username',
      x: 640,
      y: 120,
      config: { selector: '#username', text: 'tomsmith', clearFirst: true },
    });
    const pass = node({
      id: 'e2e_g_pass',
      kind: 'browser-type',
      name: 'Password',
      x: 920,
      y: 120,
      config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true },
    });
    const login = node({
      id: 'e2e_g_login',
      kind: 'browser-click',
      name: 'Login',
      x: 1200,
      y: 120,
      config: { selector: 'button[type="submit"]' },
    });
    const secure = node({
      id: 'e2e_g_secure',
      kind: 'assert-url',
      name: 'On secure',
      x: 1480,
      y: 120,
      config: { match: 'contains', expected: '/secure' },
    });
    const logout = node({
      id: 'e2e_g_logout',
      kind: 'browser-click',
      name: 'Logout',
      x: 1760,
      y: 120,
      config: { selector: 'a.button' },
    });
    const home = node({
      id: 'e2e_g_home',
      kind: 'browser-open',
      name: 'Home again',
      x: 2040,
      y: 120,
      config: { url: 'https://the-internet.herokuapp.com/', width: 1200, height: 800 },
    });
    const gate = node({
      id: 'e2e_g_if',
      kind: 'if',
      name: 'Visit dropdown?',
      x: 2320,
      y: 120,
      config: { condition: 'true' },
    });
    const dropLink = node({
      id: 'e2e_g_drop',
      kind: 'browser-click',
      name: 'Dropdown',
      x: 2600,
      y: 40,
      config: { selector: 'a[href="/dropdown"]' },
    });
    const select = node({
      id: 'e2e_g_sel',
      kind: 'browser-select',
      name: 'Option 2',
      x: 2880,
      y: 40,
      config: { selector: '#dropdown', value: '2' },
    });
    const skip = node({
      id: 'e2e_g_skip',
      kind: 'wait',
      name: 'Skip branch',
      x: 2600,
      y: 200,
      config: { waitMs: 50 },
    });
    const join = node({ id: 'e2e_g_join', kind: 'join', name: 'Join', x: 3160, y: 120 });
    const dyn = node({
      id: 'e2e_g_dyn',
      kind: 'browser-open',
      name: 'Dynamic loading',
      x: 3440,
      y: 120,
      config: { url: 'https://the-internet.herokuapp.com/dynamic_loading/2', width: 1200, height: 800 },
    });
    const start = node({
      id: 'e2e_g_start',
      kind: 'browser-click',
      name: 'Start',
      x: 3720,
      y: 120,
      config: { selector: '#start button' },
    });
    const retry = node({
      id: 'e2e_g_retry',
      kind: 'retry',
      name: 'Wait finish',
      x: 4000,
      y: 120,
      config: { attempts: 4 },
    });
    const waitFinish = node({
      id: 'e2e_g_wait',
      kind: 'browser-wait-for',
      name: 'Hello',
      x: 40,
      y: 100,
      parentId: retry.id,
      config: { selector: '#finish', timeoutMs: 12000 },
    });
    const text = node({
      id: 'e2e_g_text',
      kind: 'assert-text',
      name: 'Hello World',
      x: 4280,
      y: 120,
      config: { selector: '#finish', match: 'contains', expected: 'Hello World!' },
    });
    const shot = node({
      id: 'e2e_g_shot',
      kind: 'browser-screenshot',
      name: 'Gauntlet shot',
      x: 4560,
      y: 120,
      config: { name: 'tutorial-gauntlet' },
    });
    return {
      nodes: [
        open, toLogin, user, pass, login, secure, logout, home, gate, dropLink, select, skip, join,
        dyn, start, retry, waitFinish, text, shot,
      ],
      edges: [
        edge({ id: 'e_e2e_g_1', from: open.id, to: toLogin.id }),
        edge({ id: 'e_e2e_g_2', from: toLogin.id, to: user.id }),
        edge({ id: 'e_e2e_g_3', from: user.id, to: pass.id }),
        edge({ id: 'e_e2e_g_4', from: pass.id, to: login.id }),
        edge({ id: 'e_e2e_g_5', from: login.id, to: secure.id }),
        edge({ id: 'e_e2e_g_6', from: secure.id, to: logout.id }),
        edge({ id: 'e_e2e_g_7', from: logout.id, to: home.id }),
        edge({ id: 'e_e2e_g_8', from: home.id, to: gate.id }),
        edge({ id: 'e_e2e_g_9', from: gate.id, to: dropLink.id, fromPort: 'then' }),
        edge({ id: 'e_e2e_g_10', from: gate.id, to: skip.id, fromPort: 'else' }),
        edge({ id: 'e_e2e_g_11', from: dropLink.id, to: select.id }),
        edge({ id: 'e_e2e_g_12', from: select.id, to: join.id }),
        edge({ id: 'e_e2e_g_13', from: skip.id, to: join.id }),
        edge({ id: 'e_e2e_g_14', from: join.id, to: dyn.id }),
        edge({ id: 'e_e2e_g_15', from: dyn.id, to: start.id }),
        edge({ id: 'e_e2e_g_16', from: start.id, to: retry.id }),
        edge({ id: 'e_e2e_g_17', from: retry.id, to: waitFinish.id, fromPort: 'body' }),
        edge({ id: 'e_e2e_g_18', from: retry.id, to: text.id, fromPort: 'done' }),
        edge({ id: 'e_e2e_g_19', from: text.id, to: shot.id }),
      ],
    };
  })();

  const quest = (() => {
    const open = node({
      id: 'e2e_q_open',
      kind: 'browser-open',
      name: 'Start login',
      x: 80,
      y: 120,
      config: { url: 'https://the-internet.herokuapp.com/login', width: 1200, height: 800 },
    });
    const user = node({
      id: 'e2e_q_user',
      kind: 'browser-type',
      name: 'Username',
      x: 360,
      y: 120,
      config: { selector: '#username', text: 'tomsmith', clearFirst: true },
    });
    const pass = node({
      id: 'e2e_q_pass',
      kind: 'browser-type',
      name: 'Password',
      x: 640,
      y: 120,
      config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true },
    });
    const login = node({
      id: 'e2e_q_login',
      kind: 'browser-click',
      name: 'Login',
      x: 920,
      y: 120,
      config: { selector: 'button[type="submit"]' },
    });
    const secure = node({
      id: 'e2e_q_secure',
      kind: 'assert-url',
      name: 'On secure',
      x: 1200,
      y: 120,
      config: { match: 'contains', expected: '/secure' },
    });
    const home = node({
      id: 'e2e_q_home',
      kind: 'browser-open',
      name: 'Back home',
      x: 1480,
      y: 120,
      config: { url: 'https://the-internet.herokuapp.com/', width: 1200, height: 800 },
    });
    const gate = node({
      id: 'e2e_q_if',
      kind: 'if',
      name: 'Open dropdown?',
      x: 1760,
      y: 120,
      config: { condition: 'true' },
    });
    const drop = node({
      id: 'e2e_q_drop',
      kind: 'browser-click',
      name: 'Dropdown link',
      x: 2040,
      y: 40,
      config: { selector: 'a[href="/dropdown"]' },
    });
    const select = node({
      id: 'e2e_q_sel',
      kind: 'browser-select',
      name: 'Option 1',
      x: 2320,
      y: 40,
      config: { selector: '#dropdown', value: '1' },
    });
    const skip = node({
      id: 'e2e_q_skip',
      kind: 'wait',
      name: 'Skip',
      x: 2040,
      y: 200,
      config: { waitMs: 50 },
    });
    const join = node({ id: 'e2e_q_join', kind: 'join', name: 'Join paths', x: 2600, y: 120 });
    const loading = node({
      id: 'e2e_q_load',
      kind: 'browser-open',
      name: 'Dynamic loading',
      x: 2880,
      y: 120,
      config: { url: 'https://the-internet.herokuapp.com/dynamic_loading/1', width: 1200, height: 800 },
    });
    const start = node({
      id: 'e2e_q_start',
      kind: 'browser-click',
      name: 'Start',
      x: 3160,
      y: 120,
      config: { selector: '#start button' },
    });
    const retry = node({
      id: 'e2e_q_retry',
      kind: 'retry',
      name: 'Wait finish',
      x: 3440,
      y: 120,
      config: { attempts: 3 },
    });
    const waitFinish = node({
      id: 'e2e_q_wait',
      kind: 'browser-wait-for',
      name: 'Hello world',
      x: 40,
      y: 100,
      parentId: retry.id,
      config: { selector: '#finish', timeoutMs: 10000 },
    });
    const assertFinish = node({
      id: 'e2e_q_text',
      kind: 'assert-text',
      name: 'Hello text',
      x: 3720,
      y: 120,
      config: { selector: '#finish', match: 'contains', expected: 'Hello World!' },
    });
    const shot = node({
      id: 'e2e_q_shot',
      kind: 'browser-screenshot',
      name: 'Quest shot',
      x: 4000,
      y: 120,
      config: { name: 'tutorial-quest' },
    });
    return {
      nodes: [
        open, user, pass, login, secure, home, gate, drop, select, skip, join,
        loading, start, retry, waitFinish, assertFinish, shot,
      ],
      edges: [
        edge({ id: 'e_e2e_q_1', from: open.id, to: user.id }),
        edge({ id: 'e_e2e_q_2', from: user.id, to: pass.id }),
        edge({ id: 'e_e2e_q_3', from: pass.id, to: login.id }),
        edge({ id: 'e_e2e_q_4', from: login.id, to: secure.id }),
        edge({ id: 'e_e2e_q_5', from: secure.id, to: home.id }),
        edge({ id: 'e_e2e_q_6', from: home.id, to: gate.id }),
        edge({ id: 'e_e2e_q_7', from: gate.id, to: drop.id, fromPort: 'then' }),
        edge({ id: 'e_e2e_q_8', from: gate.id, to: skip.id, fromPort: 'else' }),
        edge({ id: 'e_e2e_q_9', from: drop.id, to: select.id }),
        edge({ id: 'e_e2e_q_10', from: select.id, to: join.id }),
        edge({ id: 'e_e2e_q_11', from: skip.id, to: join.id }),
        edge({ id: 'e_e2e_q_12', from: join.id, to: loading.id }),
        edge({ id: 'e_e2e_q_13', from: loading.id, to: start.id }),
        edge({ id: 'e_e2e_q_14', from: start.id, to: retry.id }),
        edge({ id: 'e_e2e_q_15', from: retry.id, to: waitFinish.id, fromPort: 'body' }),
        edge({ id: 'e_e2e_q_16', from: retry.id, to: assertFinish.id, fromPort: 'done' }),
        edge({ id: 'e_e2e_q_17', from: assertFinish.id, to: shot.id }),
      ],
    };
  })();

  const simple: FlowScenario[] = [
    scenario('fs_e2e_login', 'Login happy path', login.nodes, login.edges),
    scenario('fs_e2e_ix', 'Page interactions', interactions.nodes, interactions.edges),
  ];

  const advanced: FlowScenario[] = [
    scenario('fs_e2e_ctl', 'Branch and retry', control.nodes, control.edges),
    scenario('fs_e2e_dyn', 'Dynamic controls', dynamic.nodes, dynamic.edges),
    scenario('fs_e2e_hov', 'Hovers', hovers.nodes, hovers.edges),
    scenario('fs_e2e_add', 'Add / remove elements', addRemove.nodes, addRemove.edges),
    scenario('fs_e2e_cb', 'Checkboxes', checkboxes.nodes, checkboxes.edges),
    scenario('fs_e2e_in', 'Number inputs', inputsLab.nodes, inputsLab.edges),
  ];

  const complexCurated: FlowScenario[] = [
    scenario('fs_e2e_dis', 'Disappearing elements', disappearing.nodes, disappearing.edges),
    scenario('fs_e2e_tbl', 'Sortable tables', tables.nodes, tables.edges),
    scenario('fs_e2e_sess', 'Login / logout roundtrip', sessionRoundtrip.nodes, sessionRoundtrip.edges),
    scenario('fs_e2e_quest', 'Multi-page quest', quest.nodes, quest.edges),
    scenario('fs_e2e_gauntlet', 'End-to-end gauntlet', gauntlet.nodes, gauntlet.edges),
  ];

  const curatedCount = simple.length + advanced.length + complexCurated.length;
  const complex = [...complexCurated, ...buildE2eLabScenarios(curatedCount)];

  return folder(TUTORIAL_E2E_FOLDER_ID, 'E2E Showcase', [
    artifact(TUTORIAL_E2E_SIMPLE_FLOW_ID, 'Simple examples', simple, {
      description: 'Login happy path, page interactions, asserts, and screenshot.',
      tags: ['tutorial', 'e2e', 'simple'],
      docs: 'Uses https://the-internet.herokuapp.com/. Start is fixed on the left border. Use Pick beside any Selector field.',
    }),
    artifact(TUTORIAL_E2E_ADVANCED_FLOW_ID, 'Advanced examples', advanced, {
      description: 'Branch/retry, dynamic controls, checkboxes, inputs, hovers, and add/remove.',
      tags: ['tutorial', 'e2e', 'advanced'],
      docs: 'Browser control-flow and interactive page patterns on The Internet.',
    }),
    artifact(TUTORIAL_E2E_COMPLEX_FLOW_ID, 'Complex examples', complex, {
      description: `Multi-page quests, tables, session roundtrips, and labs (about ${SHOWCASE_SCENARIO_TARGET} E2E scenarios across Simple–Complex).`,
      tags: ['tutorial', 'e2e', 'complex'],
      docs: 'Gauntlet, disappearing elements, parallel-window labs, and remaining The Internet tours.',
    }),
  ]);
}

/** @deprecated Prefer buildE2eShowcaseFolder */
export function buildE2eShowcaseFlow(): ServiceTreeNode<FlowArtifactFields> {
  return buildE2eShowcaseFolder();
}

/**
 * Device Showcase — Start / Launch / Tap / Wait / Assert against the emulator.
 * Uses Settings (`com.android.settings`) so a stock AVD can run without sideloading.
 */
export function buildDeviceShowcaseFolder(): ServiceFolderNode<FlowArtifactFields> {
  const bootLaunch = chain('dev_boot', 80, 80, [
    {
      kind: 'device-start',
      name: 'Start Device',
      config: { deviceId: '', deviceName: '', openHome: false },
    },
    {
      kind: 'device-launch',
      name: 'Open Settings',
      config: {
        packageName: 'com.android.settings',
        activity: '',
        clearSession: false,
        clearData: false,
      },
    },
    {
      kind: 'device-wait-for',
      name: 'Wait Settings',
      config: { selector: 'text=Settings', timeoutMs: 12000 },
    },
    { kind: 'device-screenshot', name: 'Shot settings', config: { name: 'tutorial-settings' } },
  ]);

  const tapAssert = chain('dev_tap', 80, 80, [
    {
      kind: 'device-start',
      name: 'Start Device',
      config: { deviceId: '', deviceName: '', openHome: false },
    },
    {
      kind: 'device-launch',
      name: 'Open Settings',
      config: {
        packageName: 'com.android.settings',
        activity: '',
        clearSession: false,
        clearData: false,
      },
    },
    {
      kind: 'device-wait-for',
      name: 'Wait Search',
      config: { selector: 'desc=Search settings', timeoutMs: 12000 },
    },
    { kind: 'device-tap', name: 'Tap Search', config: { selector: 'desc=Search settings' } },
    {
      kind: 'device-assert-visible',
      name: 'Search open',
      config: { selector: 'desc=Search settings' },
    },
  ]);

  const typeBack = chain('dev_type', 80, 80, [
    {
      kind: 'device-start',
      name: 'Start Device',
      config: { deviceId: '', deviceName: '', openHome: false },
    },
    {
      kind: 'device-launch',
      name: 'Open Settings',
      config: {
        packageName: 'com.android.settings',
        activity: '',
        clearSession: false,
        clearData: false,
      },
    },
    {
      kind: 'device-wait-for',
      name: 'Wait Search',
      config: { selector: 'desc=Search settings', timeoutMs: 12000 },
    },
    { kind: 'device-tap', name: 'Tap Search', config: { selector: 'desc=Search settings' } },
    {
      kind: 'device-type',
      name: 'Type network',
      config: { selector: '', text: 'network', clearFirst: true },
    },
    { kind: 'device-press', name: 'Back', config: { key: 'BACK' } },
  ]);

  const swipeHome = chain('dev_swipe', 80, 80, [
    {
      kind: 'device-start',
      name: 'Start Device',
      config: { deviceId: '', deviceName: '', openHome: true },
    },
    {
      kind: 'device-swipe',
      name: 'Swipe up',
      config: { x1: 540, y1: 1800, x2: 540, y2: 600, durationMs: 400 },
    },
    { kind: 'device-press', name: 'Home', config: { key: 'HOME' } },
    {
      kind: 'device-assert-visible',
      name: 'Launcher icon',
      config: { selector: 'desc=Settings' },
    },
  ]);

  const assertText = chain('dev_text', 80, 80, [
    {
      kind: 'device-start',
      name: 'Start Device',
      config: { deviceId: '', deviceName: '', openHome: false },
    },
    {
      kind: 'device-launch',
      name: 'Open Settings',
      config: {
        packageName: 'com.android.settings',
        activity: '',
        clearSession: false,
        clearData: false,
      },
    },
    {
      kind: 'device-wait-for',
      name: 'Wait title',
      config: { selector: 'text=Settings', timeoutMs: 12000 },
    },
    {
      kind: 'device-assert-text',
      name: 'Title contains',
      config: { selector: 'text=Settings', match: 'contains', expected: 'Settings' },
    },
  ]);

  const gauntlet = chain('dev_gauntlet', 80, 80, [
    {
      kind: 'device-start',
      name: 'Start Device',
      config: { deviceId: '', deviceName: '', openHome: false },
    },
    {
      kind: 'device-launch',
      name: 'Open Settings',
      config: {
        packageName: 'com.android.settings',
        activity: '',
        clearSession: false,
        clearData: false,
      },
    },
    {
      kind: 'device-wait-for',
      name: 'Wait Settings',
      config: { selector: 'text=Settings', timeoutMs: 12000 },
    },
    {
      kind: 'device-assert-visible',
      name: 'Settings visible',
      config: { selector: 'text=Settings' },
    },
    {
      kind: 'device-swipe',
      name: 'Scroll list',
      config: { x1: 540, y1: 1600, x2: 540, y2: 700, durationMs: 350 },
    },
    { kind: 'device-press', name: 'Back', config: { key: 'BACK' } },
    { kind: 'device-press', name: 'Home', config: { key: 'HOME' } },
    { kind: 'device-screenshot', name: 'Shot home', config: { name: 'tutorial-device-home' } },
  ]);

  const simple: FlowScenario[] = [
    scenario('fs_dev_boot', 'Start and open Settings', bootLaunch.nodes, bootLaunch.edges),
    scenario('fs_dev_tap', 'Tap and validate', tapAssert.nodes, tapAssert.edges),
  ];

  const advanced: FlowScenario[] = [
    scenario('fs_dev_type', 'Type and Back', typeBack.nodes, typeBack.edges),
    scenario('fs_dev_swipe', 'Swipe and Home', swipeHome.nodes, swipeHome.edges),
    scenario('fs_dev_text', 'Validate text', assertText.nodes, assertText.edges),
  ];

  const complex: FlowScenario[] = [
    scenario('fs_dev_gauntlet', 'Settings gauntlet', gauntlet.nodes, gauntlet.edges),
  ];

  return folder(TUTORIAL_DEVICE_FOLDER_ID, 'Device Showcase', [
    artifact(TUTORIAL_DEVICE_SIMPLE_FLOW_ID, 'Simple examples', simple, {
      description: 'Start Device, Launch Settings, Wait, Tap, Screenshot.',
      tags: ['tutorial', 'device', 'simple'],
      docs: [
        'Start the emulator from Services → Emulator first (or let Start Device boot it).',
        'These scenarios use com.android.settings, which ships on stock Google APIs images.',
        'Use Pick beside a Selector when the emulator is already running. Turn on Previous to run Launch / Wait steps before Pick.',
      ].join('\n\n'),
    }),
    artifact(TUTORIAL_DEVICE_ADVANCED_FLOW_ID, 'Advanced examples', advanced, {
      description: 'Type, swipe, Back/Home, and text asserts on the device hierarchy.',
      tags: ['tutorial', 'device', 'advanced'],
      docs: 'Selectors use text=, id=, or desc=. Prefer Pick on device for resource-id when available.',
    }),
    artifact(TUTORIAL_DEVICE_COMPLEX_FLOW_ID, 'Complex examples', complex, {
      description: 'Multi-step Settings gauntlet: launch, wait, assert, swipe, keys, screenshot.',
      tags: ['tutorial', 'device', 'complex'],
      docs: 'A longer happy-path exercise of every device action except retired Install APK (use Emulator → APK library for installs).',
    }),
  ]);
}

/** Stable tutorial folders used by the Flows Tutorial button and Testing seed. */
export function buildTutorialFlows(): readonly ServiceTreeNode<FlowArtifactFields>[] {
  return [
    buildBasicsFolder(),
    buildApiShowcaseFolder(),
    buildE2eShowcaseFolder(),
    ...(FLOW_DEVICE_NODES_ENABLED ? [buildDeviceShowcaseFolder()] : []),
  ];
}

/** Counts every graph node across all scenarios in a flows file. */
export function countFlowNodes(file: FlowsFile): number {
  let total = 0;
  const walk = (items: FlowsFile['items']): void => {
    for (const item of items) {
      if (item.kind === 'folder') {
        walk(item.children as FlowsFile['items']);
        continue;
      }
      for (const itemScenario of item.scenarios)
        total += itemScenario.nodes.length;
    }
  };
  walk(file.items);
  return total;
}

/**
 * Testing-workspace Flows seed: Basics + API / E2E / Device showcases.
 */
export function createTestingFlowsFile(): FlowsFile {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: [
      folder(TUTORIAL_FOLDER_ID, 'Tutorial', [...buildTutorialFlows()]),
    ],
  };
}
