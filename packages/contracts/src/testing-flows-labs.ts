import {
  emptyFlowGraphNode,
  wireFlowScenarioTerminals,
  type FlowGraphEdge,
  type FlowGraphNode,
  type FlowNodeConfigValue,
  type FlowNodeKind,
  type FlowPort,
  type FlowScenario,
  type FlowScenarioData,
} from './flow-graph';

const COL = 280;
const ROW = 160;

type Config = Readonly<Record<string, FlowNodeConfigValue>>;

interface Step {
  readonly kind: FlowNodeKind;
  readonly name: string;
  readonly config?: Config;
  readonly parentId?: string | null;
}

function n(
  id: string,
  kind: FlowNodeKind,
  name: string,
  x: number,
  y: number,
  config: Config = {},
  parentId: string | null = null,
): FlowGraphNode {
  const base = emptyFlowGraphNode(kind, { x, y }, parentId);
  return { ...base, id, name, config: { ...base.config, ...config } };
}

function e(id: string, from: string, to: string, fromPort: FlowPort = 'next'): FlowGraphEdge {
  return { id, from, fromPort, to };
}

function arrange(scenario: FlowScenario): FlowScenario {
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
  const lane = new Map<number, number>();
  const nodes = scenario.nodes.map((item) => {
    if (item.parentId) {
      const parent = scenario.nodes.find((candidate) => candidate.id === item.parentId);
      return {
        ...item,
        x: 40 + (item.x % COL),
        y: 80 + (item.y % ROW),
        parentId: parent?.id ?? item.parentId,
      };
    }
    const d = depth.get(item.id) ?? 0;
    const row = lane.get(d) ?? 0;
    lane.set(d, row + 1);
    return { ...item, x: 80 + d * COL, y: 80 + row * ROW };
  });
  return { ...scenario, nodes };
}

function scenario(
  id: string,
  name: string,
  nodes: FlowGraphNode[],
  edges: FlowGraphEdge[],
  data?: FlowScenarioData,
): FlowScenario {
  return wireFlowScenarioTerminals(
    arrange({
      id,
      name,
      enabled: true,
      folderId: null,
      nodes,
      edges,
      data: data ?? { enabled: false, columns: [], rows: [] },
    }),
  );
}

function chain(prefix: string, steps: readonly Step[]): { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] } {
  const nodes: FlowGraphNode[] = [];
  const edges: FlowGraphEdge[] = [];
  let prev: string | null = null;
  steps.forEach((step, index) => {
    const id = `${prefix}_${index + 1}`;
    nodes.push(n(id, step.kind, step.name, index * COL, 0, step.config ?? {}, step.parentId ?? null));
    if (prev && !step.parentId)
      edges.push(e(`e_${prefix}_${index}`, prev, id));
    if (!step.parentId)
      prev = id;
  });
  return { nodes, edges };
}

/** Extra API labs beyond the curated showcase scenarios (fills to 50 total). */
export function buildApiLabScenarios(existingCount: number): FlowScenario[] {
  const need = Math.max(0, 50 - existingCount);
  const out: FlowScenario[] = [];
  const statuses = [200, 201, 204, 301, 302, 400, 401, 403, 404, 418, 429, 500, 502, 503];
  const methods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'> = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  for (let i = 0; i < need; i += 1) {
    const n0 = i + 1;
    const id = `fs_api_lab_${String(n0).padStart(2, '0')}`;
    const pattern = i % 8;

    if (pattern === 0) {
      const code = statuses[i % statuses.length]!;
      const built = chain(id, [
        { kind: 'note', name: `Status ${code}`, config: { text: `Assert httpbin /status/${code}` } },
        { kind: 'set-var', name: 'Expect', config: { name: 'expectStatus', value: String(code) } },
        { kind: 'request', name: `GET /status/${code}`, config: { method: 'GET', url: `https://httpbin.org/status/${code}`, body: '' } },
        { kind: 'assert-status', name: `Status ${code}`, config: { expected: code } },
        { kind: 'assert-json', name: 'Status var', config: { expression: 'status != null' } },
        { kind: 'wait', name: 'Settle', config: { waitMs: 50 } },
      ]);
      out.push(scenario(id, `Status lab ${code}`, built.nodes, built.edges));
      continue;
    }

    if (pattern === 1) {
      const method = methods[i % methods.length]!;
      const built = chain(id, [
        { kind: 'request', name: `${method} /anything`, config: { method, url: 'https://httpbin.org/anything', body: method === 'GET' ? '' : '{"lab":true}' } },
        { kind: 'assert-status', name: 'OK', config: { expected: 200 } },
        { kind: 'assert-json', name: 'Method echo', config: { expression: 'body.method != null' } },
        { kind: 'set-var', name: 'Store method', config: { name: 'lastMethod', value: method } },
        { kind: 'cache', name: 'Cache once', config: { key: `method-${method}` } },
      ]);
      out.push(scenario(id, `${method} anything`, built.nodes, built.edges));
      continue;
    }

    if (pattern === 2) {
      const seed = n(`${id}_seed`, 'set-var', 'Seed items', 0, 0, { name: 'items', value: '["a","b","c"]' });
      const each = n(`${id}_each`, 'for-each', 'For each', COL, 0, { items: 'items' });
      const req = n(`${id}_req`, 'request', 'Echo item', 40, 90, { method: 'GET', url: 'https://httpbin.org/get?q={{item}}', body: '' }, each.id);
      const assert = n(`${id}_ok`, 'assert-status', 'Item 200', COL * 2, 0, { expected: 200 });
      const done = n(`${id}_done`, 'set-var', 'Loop done', COL * 3, 0, { name: 'loopDone', value: '1' });
      out.push(
        scenario(id, `For-each echo ${n0}`, [seed, each, req, assert, done], [
          e(`e_${id}_1`, seed.id, each.id),
          e(`e_${id}_2`, each.id, req.id, 'body'),
          e(`e_${id}_3`, each.id, assert.id, 'done'),
          e(`e_${id}_4`, assert.id, done.id),
        ]),
      );
      continue;
    }

    if (pattern === 3) {
      const req = n(`${id}_req`, 'request', 'Probe', 0, 80, { method: 'GET', url: 'https://httpbin.org/status/200', body: '' });
      const gate = n(`${id}_if`, 'if', 'OK?', COL, 80, { condition: 'status == 200' });
      const thenSet = n(`${id}_then`, 'set-var', 'Then path', COL * 2, 0, { name: 'path', value: 'then' });
      const elseSet = n(`${id}_else`, 'set-var', 'Else path', COL * 2, 160, { name: 'path', value: 'else' });
      const join = n(`${id}_join`, 'join', 'Join', COL * 3, 80);
      const check = n(`${id}_val`, 'assert-json', 'Path set', COL * 4, 80, { expression: 'vars.path != null' });
      out.push(
        scenario(id, `Branch join ${n0}`, [req, gate, thenSet, elseSet, join, check], [
          e(`e_${id}_1`, req.id, gate.id),
          e(`e_${id}_2`, gate.id, thenSet.id, 'then'),
          e(`e_${id}_3`, gate.id, elseSet.id, 'else'),
          e(`e_${id}_4`, thenSet.id, join.id),
          e(`e_${id}_5`, elseSet.id, join.id),
          e(`e_${id}_6`, join.id, check.id),
        ]),
      );
      continue;
    }

    if (pattern === 4) {
      const retry = n(`${id}_retry`, 'retry', 'Retry delay', 0, 40, { attempts: 3 });
      const wait = n(`${id}_wait`, 'wait', 'Backoff', 40, 90, { waitMs: 80 }, retry.id);
      const req = n(`${id}_req`, 'request', 'GET /delay/1', COL, 40, { method: 'GET', url: 'https://httpbin.org/delay/1', body: '' });
      const ok = n(`${id}_ok`, 'assert-status', '200', COL * 2, 40, { expected: 200 });
      const url = n(`${id}_url`, 'assert-json', 'Has url', COL * 3, 40, { expression: 'body.url != null' });
      out.push(
        scenario(id, `Retry delay ${n0}`, [retry, wait, req, ok, url], [
          e(`e_${id}_1`, retry.id, wait.id, 'body'),
          e(`e_${id}_2`, retry.id, req.id, 'done'),
          e(`e_${id}_3`, req.id, ok.id),
          e(`e_${id}_4`, ok.id, url.id),
        ]),
      );
      continue;
    }

    if (pattern === 5) {
      const a = n(`${id}_a`, 'request', 'Lane A', 0, 0, { method: 'GET', url: 'https://httpbin.org/get?lane=a', body: '' });
      const b = n(`${id}_b`, 'request', 'Lane B', 0, 160, { method: 'GET', url: 'https://httpbin.org/get?lane=b', body: '' });
      const c = n(`${id}_c`, 'request', 'Lane C', 0, 320, { method: 'GET', url: 'https://httpbin.org/uuid', body: '' });
      const ja = n(`${id}_ja`, 'assert-status', 'A 200', COL, 0, { expected: 200 });
      const jb = n(`${id}_jb`, 'assert-status', 'B 200', COL, 160, { expected: 200 });
      const jc = n(`${id}_jc`, 'assert-status', 'C 200', COL, 320, { expected: 200 });
      const join = n(`${id}_join`, 'join', 'Join 3', COL * 2, 160);
      const done = n(`${id}_done`, 'set-var', 'Parallel done', COL * 3, 160, { name: 'parallel', value: 'ok' });
      out.push(
        scenario(id, `Parallel fan-in ${n0}`, [a, b, c, ja, jb, jc, join, done], [
          e(`e_${id}_1`, a.id, ja.id),
          e(`e_${id}_2`, b.id, jb.id),
          e(`e_${id}_3`, c.id, jc.id),
          e(`e_${id}_4`, ja.id, join.id),
          e(`e_${id}_5`, jb.id, join.id),
          e(`e_${id}_6`, jc.id, join.id),
          e(`e_${id}_7`, join.id, done.id),
        ]),
      );
      continue;
    }

    if (pattern === 6) {
      const built = chain(id, [
        { kind: 'set-var', name: 'Token', config: { name: 'token', value: 'lab-token' } },
        { kind: 'request', name: 'Bearer headers', config: { method: 'GET', url: 'https://httpbin.org/headers', body: '' } },
        { kind: 'assert-status', name: '200', config: { expected: 200 } },
        { kind: 'assert-json', name: 'Has headers', config: { expression: 'body.headers != null' } },
        { kind: 'http-listener', name: 'Listen', config: { stage: 'response', url: '/headers', waitMs: 100 } },
        { kind: 'wait', name: 'Pause', config: { waitMs: 40 } },
        { kind: 'manual', name: 'Review headers', config: { prompt: 'Confirm headers look right' } },
      ]);
      out.push(scenario(id, `Headers pipeline ${n0}`, built.nodes, built.edges));
      continue;
    }

    const whileNode = n(`${id}_while`, 'while', 'While false', 0, 40, { condition: 'false', maxIterations: 3 });
    const body = n(`${id}_body`, 'wait', 'Body wait', 40, 90, { waitMs: 30 }, whileNode.id);
    const after = n(`${id}_after`, 'request', 'After while', COL, 40, { method: 'GET', url: 'https://httpbin.org/get', body: '' });
    const ok = n(`${id}_ok`, 'assert-status', '200', COL * 2, 40, { expected: 200 });
    const note = n(`${id}_note`, 'note', 'While skipped', COL * 3, 40, { text: 'Condition false — body never runs' });
    out.push(
      scenario(
        id,
        `While + after ${n0}`,
        [whileNode, body, after, ok, note],
        [
          e(`e_${id}_1`, whileNode.id, body.id, 'body'),
          e(`e_${id}_2`, whileNode.id, after.id, 'done'),
          e(`e_${id}_3`, after.id, ok.id),
          e(`e_${id}_4`, ok.id, note.id),
        ],
        {
          enabled: i % 3 === 0,
          columns: ['tag'],
          rows: [{ tag: `lab-${n0}` }, { tag: `lab-${n0}-b` }],
        },
      ),
    );
  }

  return out;
}

/** Extra E2E labs beyond the curated showcase scenarios (fills to 50 total). */
export function buildE2eLabScenarios(existingCount: number): FlowScenario[] {
  const need = Math.max(0, 50 - existingCount);
  const out: FlowScenario[] = [];

  const pages: Array<{ name: string; path: string; assert: string; selector: string }> = [
    { name: 'Checkboxes', path: 'checkboxes', assert: 'Checkboxes', selector: 'form#checkboxes' },
    { name: 'Dropdown', path: 'dropdown', assert: 'Dropdown List', selector: '#dropdown' },
    { name: 'Inputs', path: 'inputs', assert: 'Inputs', selector: 'input[type="number"]' },
    { name: 'Hovers', path: 'hovers', assert: 'Hovers', selector: '.figure' },
    { name: 'Add/Remove', path: 'add_remove_elements/', assert: 'Add/Remove Elements', selector: 'button[onclick="addElement()"]' },
    { name: 'Dynamic', path: 'dynamic_controls', assert: 'Dynamic Controls', selector: '#checkbox' },
    { name: 'Disappear', path: 'disappearing_elements', assert: 'Disappearing Elements', selector: 'ul li a' },
    { name: 'Tables', path: 'tables', assert: 'Data Tables', selector: '#table1' },
    { name: 'Status codes', path: 'status_codes', assert: 'Status Codes', selector: 'ul li a' },
    { name: 'Redirect', path: 'redirector', assert: 'Redirection', selector: 'a' },
    { name: 'Forgot', path: 'forgot_password', assert: 'Forgot Password', selector: '#email' },
    { name: 'Key presses', path: 'key_presses', assert: 'Key Presses', selector: '#target' },
    { name: 'Form auth', path: 'login', assert: 'Login Page', selector: '#username' },
    { name: 'AB test', path: 'abtest', assert: 'A/B Test', selector: 'h3' },
    { name: 'Floating menu', path: 'floating_menu', assert: 'Floating Menu', selector: '#menu' },
  ];

  for (let i = 0; i < need; i += 1) {
    const n0 = i + 1;
    const id = `fs_e2e_lab_${String(n0).padStart(2, '0')}`;
    const pattern = i % 7;
    const page = pages[i % pages.length]!;

    if (pattern === 0) {
      const built = chain(id, [
        { kind: 'browser-open', name: `Open ${page.name}`, config: { url: `https://the-internet.herokuapp.com/${page.path}`, width: 1100, height: 800 } },
        { kind: 'browser-wait-for', name: 'Wait root', config: { selector: page.selector, timeoutMs: 8000 } },
        { kind: 'assert-text', name: 'Heading', config: { selector: 'h3', match: 'contains', expected: page.assert } },
        { kind: 'assert-visible', name: 'Target visible', config: { selector: page.selector } },
        { kind: 'browser-screenshot', name: 'Shot', config: { name: `lab-${page.path.replace(/\W+/g, '-')}` } },
      ]);
      out.push(scenario(id, `${page.name} smoke`, built.nodes, built.edges));
      continue;
    }

    if (pattern === 1) {
      const built = chain(id, [
        { kind: 'browser-open', name: 'Open login', config: { url: 'https://the-internet.herokuapp.com/login', width: 1200, height: 800 } },
        { kind: 'browser-type', name: 'User', config: { selector: '#username', text: 'tomsmith', clearFirst: true } },
        { kind: 'browser-type', name: 'Pass', config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true } },
        { kind: 'browser-click', name: 'Submit', config: { selector: 'button[type="submit"]' } },
        { kind: 'assert-url', name: 'Secure', config: { match: 'contains', expected: '/secure' } },
        { kind: 'browser-click', name: 'Logout', config: { selector: 'a.button' } },
        { kind: 'assert-url', name: 'Back login', config: { match: 'contains', expected: '/login' } },
      ]);
      out.push(scenario(id, `Login roundtrip ${n0}`, built.nodes, built.edges));
      continue;
    }

    if (pattern === 2) {
      const open = n(`${id}_open`, 'browser-open', 'Home', 0, 80, { url: 'https://the-internet.herokuapp.com/', width: 1100, height: 800 });
      const gate = n(`${id}_if`, 'if', 'Continue?', COL, 80, { condition: 'true' });
      const thenClick = n(`${id}_then`, 'browser-click', `Open ${page.name}`, COL * 2, 0, { selector: `a[href="/${page.path.replace(/\/$/, '')}"]` });
      const elseWait = n(`${id}_else`, 'wait', 'Skip', COL * 2, 160, { waitMs: 40 });
      const join = n(`${id}_join`, 'join', 'Join', COL * 3, 80);
      const shot = n(`${id}_shot`, 'browser-screenshot', 'After branch', COL * 4, 80, { name: `branch-${n0}` });
      out.push(
        scenario(id, `Branch to ${page.name}`, [open, gate, thenClick, elseWait, join, shot], [
          e(`e_${id}_1`, open.id, gate.id),
          e(`e_${id}_2`, gate.id, thenClick.id, 'then'),
          e(`e_${id}_3`, gate.id, elseWait.id, 'else'),
          e(`e_${id}_4`, thenClick.id, join.id),
          e(`e_${id}_5`, elseWait.id, join.id),
          e(`e_${id}_6`, join.id, shot.id),
        ]),
      );
      continue;
    }

    if (pattern === 3) {
      const retry = n(`${id}_retry`, 'retry', 'Retry wait', 0, 40, { attempts: 3 });
      const open = n(`${id}_open`, 'browser-open', `Open ${page.name}`, 40, 90, { url: `https://the-internet.herokuapp.com/${page.path}`, width: 1100, height: 800 }, retry.id);
      const wait = n(`${id}_wait`, 'browser-wait-for', 'Wait el', COL, 40, { selector: page.selector, timeoutMs: 6000 });
      const visible = n(`${id}_vis`, 'assert-visible', 'Visible', COL * 2, 40, { selector: page.selector });
      out.push(
        scenario(id, `Retry open ${page.name}`, [retry, open, wait, visible], [
          e(`e_${id}_1`, retry.id, open.id, 'body'),
          e(`e_${id}_2`, retry.id, wait.id, 'done'),
          e(`e_${id}_3`, wait.id, visible.id),
        ]),
      );
      continue;
    }

    if (pattern === 4) {
      const a = n(`${id}_a`, 'browser-open', 'Window A', 0, 0, { url: `https://the-internet.herokuapp.com/${page.path}`, width: 900, height: 700 });
      const b = n(`${id}_b`, 'browser-open', 'Window B', 0, 180, { url: 'https://the-internet.herokuapp.com/', width: 900, height: 700 });
      const wa = n(`${id}_wa`, 'browser-wait-for', 'Wait A', COL, 0, { selector: page.selector, timeoutMs: 8000 });
      const wb = n(`${id}_wb`, 'assert-visible', 'Home links', COL, 180, { selector: 'ul li a', timeoutMs: 8000 });
      const join = n(`${id}_join`, 'join', 'Both ready', COL * 2, 80);
      const note = n(`${id}_note`, 'note', 'Parallel windows', COL * 3, 80, { text: 'Two browser lanes fan out from Start' });
      out.push(
        scenario(id, `Parallel windows ${n0}`, [a, b, wa, wb, join, note], [
          e(`e_${id}_1`, a.id, wa.id),
          e(`e_${id}_2`, b.id, wb.id),
          e(`e_${id}_3`, wa.id, join.id),
          e(`e_${id}_4`, wb.id, join.id),
          e(`e_${id}_5`, join.id, note.id),
        ]),
      );
      continue;
    }

    if (pattern === 5) {
      const built = chain(id, [
        { kind: 'browser-open', name: 'Dropdown', config: { url: 'https://the-internet.herokuapp.com/dropdown', width: 1100, height: 800 } },
        { kind: 'browser-select', name: 'Option 1', config: { selector: '#dropdown', value: '1' } },
        { kind: 'browser-select', name: 'Option 2', config: { selector: '#dropdown', value: '2' } },
        { kind: 'browser-hover', name: 'Hover h3', config: { selector: 'h3' } },
        { kind: 'browser-press', name: 'Escape', config: { selector: '#dropdown', key: 'Escape' } },
        { kind: 'browser-eval', name: 'Read value', config: { script: 'document.querySelector("#dropdown").value' } },
        { kind: 'set-var', name: 'Store', config: { name: 'dropdownValue', value: '{{eval}}' } },
        { kind: 'assert-json', name: 'Has value', config: { expression: 'vars.dropdownValue != null' } },
      ]);
      out.push(scenario(id, `Dropdown deep ${n0}`, built.nodes, built.edges));
      continue;
    }

    const built = chain(id, [
      { kind: 'browser-open', name: 'Quest start', config: { url: 'https://the-internet.herokuapp.com/', width: 1200, height: 800 } },
      { kind: 'browser-click', name: 'Form auth', config: { selector: 'a[href="/login"]' } },
      { kind: 'browser-wait-for', name: 'Login form', config: { selector: '#username', timeoutMs: 8000 } },
      { kind: 'browser-type', name: 'User', config: { selector: '#username', text: 'tomsmith', clearFirst: true } },
      { kind: 'browser-type', name: 'Pass', config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true } },
      { kind: 'browser-click', name: 'Login', config: { selector: 'button[type="submit"]' } },
      { kind: 'assert-url', name: 'Secure', config: { match: 'contains', expected: '/secure' } },
      { kind: 'browser-click', name: 'Logout', config: { selector: 'a.button' } },
      { kind: 'browser-open', name: `Visit ${page.name}`, config: { url: `https://the-internet.herokuapp.com/${page.path}`, width: 1100, height: 800 } },
      { kind: 'assert-visible', name: 'Landed', config: { selector: page.selector } },
      { kind: 'browser-screenshot', name: 'Quest shot', config: { name: `quest-${n0}` } },
    ]);
    out.push(scenario(id, `Multi-page quest ${n0}`, built.nodes, built.edges));
  }

  return out;
}
