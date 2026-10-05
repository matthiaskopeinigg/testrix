import {
  emptyFlowGraphNode,
  ensureFlowScenarioTerminals,
  isFlowTerminalKind,
  newFlowEdgeId,
  newFlowNodeId,
  newFlowTemplateId,
  normalizeFlowTemplateTags,
  type FlowGraphEdge,
  type FlowGraphNode,
  type FlowGraphTemplate,
  type FlowGraphTemplateLink,
  type FlowGraphTemplateStep,
  type FlowNodeConfigValue,
} from '@testrix/contracts';

import type { FlowGraph } from './flow-graph-model';

export type { FlowGraphTemplate, FlowGraphTemplateLink, FlowGraphTemplateStep };

export const FLOW_GRAPH_TEMPLATES: readonly FlowGraphTemplate[] = [
  {
    id: 'http-assert',
    name: 'HTTP + status assert',
    hint: 'GET request then expect 200.',
    tags: ['api'],
    builtin: true,
    steps: [
      { key: 'req', kind: 'request', name: 'HTTP request', x: 0, y: 0, config: { method: 'GET', url: 'https://httpbin.org/get', body: '' } },
      { key: 'ok', kind: 'assert-status', name: 'Status 200', x: 280, y: 0, config: { expected: 200 } },
    ],
    links: [{ from: 'req', to: 'ok' }],
  },
  {
    id: 'login-form',
    name: 'Login form',
    hint: 'Type credentials, click, assert URL.',
    tags: ['browser'],
    builtin: true,
    steps: [
      { key: 'open', kind: 'browser-open', name: 'Open login', x: 0, y: 0, config: { url: 'https://the-internet.herokuapp.com/login', width: 1200, height: 800 } },
      { key: 'user', kind: 'browser-type', name: 'Username', x: 280, y: 0, config: { selector: '#username', text: 'tomsmith', clearFirst: true } },
      { key: 'pass', kind: 'browser-type', name: 'Password', x: 560, y: 0, config: { selector: '#password', text: 'SuperSecretPassword!', clearFirst: true } },
      { key: 'click', kind: 'browser-click', name: 'Submit', x: 840, y: 0, config: { selector: 'button[type="submit"]' } },
      { key: 'url', kind: 'assert-url', name: 'Landed', x: 1120, y: 0, config: { match: 'contains', expected: '/secure' } },
    ],
    links: [
      { from: 'open', to: 'user' },
      { from: 'user', to: 'pass' },
      { from: 'pass', to: 'click' },
      { from: 'click', to: 'url' },
    ],
  },
  {
    id: 'if-else',
    name: 'If / else branch',
    hint: 'Condition with Then and Else arms.',
    tags: ['control'],
    builtin: true,
    steps: [
      { key: 'gate', kind: 'if', name: 'If', x: 0, y: 40, config: { condition: 'status == 200' } },
      { key: 'then', kind: 'set-var', name: 'Then', x: 280, y: 0, config: { name: 'branch', value: 'then' } },
      { key: 'else', kind: 'set-var', name: 'Else', x: 280, y: 120, config: { name: 'branch', value: 'else' } },
      { key: 'join', kind: 'join', name: 'Join', x: 560, y: 40 },
    ],
    links: [
      { from: 'gate', to: 'then', fromPort: 'then' },
      { from: 'gate', to: 'else', fromPort: 'else' },
      { from: 'then', to: 'join' },
      { from: 'else', to: 'join' },
    ],
  },
  {
    id: 'for-each',
    name: 'For-each body',
    hint: 'Loop container with one body step.',
    tags: ['control'],
    builtin: true,
    steps: [
      { key: 'each', kind: 'for-each', name: 'For each', x: 0, y: 0, config: { items: 'items' } },
      { key: 'body', kind: 'request', name: 'Body request', x: 40, y: 80, parentKey: 'each', config: { method: 'GET', url: 'https://httpbin.org/get', body: '' } },
      { key: 'done', kind: 'wait', name: 'After loop', x: 280, y: 0, config: { waitMs: 100 } },
    ],
    links: [
      { from: 'each', to: 'body', fromPort: 'body' },
      { from: 'each', to: 'done', fromPort: 'done' },
    ],
  },
  {
    id: 'group',
    name: 'Group frame',
    hint: 'Empty documentation frame — nest steps inside.',
    tags: ['control'],
    builtin: true,
    steps: [
      { key: 'group', kind: 'group', name: 'Group', x: 0, y: 0, config: { text: '' } },
    ],
    links: [],
  },
  {
    id: 'wait-retry',
    name: 'Wait + retry',
    hint: 'Retry wrapper around a wait.',
    tags: ['control'],
    builtin: true,
    steps: [
      { key: 'retry', kind: 'retry', name: 'Retry', x: 0, y: 0, config: { attempts: 3 } },
      { key: 'body', kind: 'wait', name: 'Wait body', x: 40, y: 80, parentKey: 'retry', config: { waitMs: 250 } },
      { key: 'done', kind: 'note', name: 'Done', x: 280, y: 0, config: { text: 'Retry finished' } },
    ],
    links: [
      { from: 'retry', to: 'body', fromPort: 'body' },
      { from: 'retry', to: 'done', fromPort: 'done' },
    ],
  },
];

/** Clone a template into the graph at a world origin (top-left of actionable steps). */
export function insertFlowTemplate(
  graph: FlowGraph,
  template: FlowGraphTemplate,
  at: { readonly x: number; readonly y: number },
): { readonly graph: FlowGraph; readonly ids: readonly string[] } {
  const hostHasTerminals = graph.nodes.some((node) => isFlowTerminalKind(node.kind));
  const steps = hostHasTerminals
    ? template.steps.filter((step) => !isFlowTerminalKind(step.kind))
    : template.steps;
  const stepKeys = new Set(steps.map((step) => step.key));
  const links = template.links.filter((link) => stepKeys.has(link.from) && stepKeys.has(link.to));

  const actionable = steps.filter((step) => !isFlowTerminalKind(step.kind));
  const originX = actionable.reduce((min, step) => Math.min(min, step.x), Number.POSITIVE_INFINITY);
  const originY = actionable.reduce((min, step) => Math.min(min, step.y), Number.POSITIVE_INFINITY);
  const baseX = Number.isFinite(originX) ? originX : 0;
  const baseY = Number.isFinite(originY) ? originY : 0;

  const idByKey = new Map<string, string>();
  for (const step of steps)
    idByKey.set(step.key, newFlowNodeId());

  const nodes: FlowGraphNode[] = steps.map((step) => {
    const parentId = step.parentKey ? (idByKey.get(step.parentKey) ?? null) : null;
    const base = emptyFlowGraphNode(
      step.kind,
      { x: at.x + (step.x - baseX), y: at.y + (step.y - baseY) },
      parentId,
    );
    return {
      ...base,
      id: idByKey.get(step.key)!,
      name: step.name,
      config: { ...base.config, ...(step.config ?? {}) },
    };
  });

  const edges: FlowGraphEdge[] = links.map((link) => ({
    id: newFlowEdgeId(),
    from: idByKey.get(link.from)!,
    to: idByKey.get(link.to)!,
    fromPort: link.fromPort ?? 'next',
  }));

  const merged = ensureFlowScenarioTerminals({
    id: 'tmp',
    name: '',
    enabled: true,
    folderId: null,
    nodes: [...graph.nodes, ...nodes],
    edges: [...graph.edges, ...edges],
    data: { enabled: false, columns: [], rows: [] },
  });

  return {
    graph: {
      nodes: merged.nodes,
      edges: merged.edges,
    },
    ids: nodes.filter((node) => !isFlowTerminalKind(node.kind)).map((item) => item.id),
  };
}

/**
 * Builds a canvas graph from a template for editing.
 * Places every stored step (including Start/End) at its absolute coordinates.
 */
export function graphFromFlowTemplate(template: FlowGraphTemplate): FlowGraph {
  if (template.steps.length === 0) {
    const empty = ensureFlowScenarioTerminals({
      id: 'tmp',
      name: '',
      enabled: true,
      folderId: null,
      nodes: [],
      edges: [],
      data: { enabled: false, columns: [], rows: [] },
    });
    return { nodes: empty.nodes, edges: empty.edges };
  }

  const idByKey = new Map<string, string>();
  for (const step of template.steps)
    idByKey.set(step.key, newFlowNodeId());

  const nodes: FlowGraphNode[] = template.steps.map((step) => {
    const parentId = step.parentKey ? (idByKey.get(step.parentKey) ?? null) : null;
    const base = emptyFlowGraphNode(step.kind, { x: step.x, y: step.y }, parentId);
    return {
      ...base,
      id: idByKey.get(step.key)!,
      name: step.name,
      config: { ...base.config, ...(step.config ?? {}) },
    };
  });

  const edges: FlowGraphEdge[] = template.links
    .filter((link) => idByKey.has(link.from) && idByKey.has(link.to))
    .map((link) => ({
      id: newFlowEdgeId(),
      from: idByKey.get(link.from)!,
      to: idByKey.get(link.to)!,
      fromPort: link.fromPort ?? 'next',
    }));

  const merged = ensureFlowScenarioTerminals({
    id: 'tmp',
    name: '',
    enabled: true,
    folderId: null,
    nodes,
    edges,
    data: { enabled: false, columns: [], rows: [] },
  });
  return { nodes: merged.nodes, edges: merged.edges };
}

/**
 * Builds a user template from the current selection.
 * Returns null when the selection is empty or terminals-only.
 * Includes Start/End when they are selected so reopen keeps their positions and wires.
 * Step x/y are absolute canvas coordinates; insertFlowTemplate rebases actionable steps to the drop point.
 */
export function captureFlowTemplate(
  graph: FlowGraph,
  selectedIds: readonly string[],
  options: { readonly name?: string; readonly hint?: string; readonly tags?: readonly string[] } = {},
): FlowGraphTemplate | null {
  const selected = new Set(selectedIds);
  const nodes = graph.nodes.filter((node) => selected.has(node.id));
  const actionable = nodes.filter((node) => !isFlowTerminalKind(node.kind));
  if (actionable.length === 0)
    return null;

  const idSet = new Set(nodes.map((node) => node.id));
  const keyById = new Map<string, string>();
  let actionIndex = 0;
  for (const node of nodes) {
    if (node.kind === 'start' && node.parentId === null)
      keyById.set(node.id, 'start');
    else if (node.kind === 'end' && node.parentId === null)
      keyById.set(node.id, 'end');
    else {
      actionIndex += 1;
      keyById.set(node.id, `n${actionIndex}`);
    }
  }

  const steps: FlowGraphTemplateStep[] = nodes.map((node) => {
    const parentKey =
      node.parentId && idSet.has(node.parentId) ? keyById.get(node.parentId) : undefined;
    const config = pickTemplateConfig(node.config);
    return {
      key: keyById.get(node.id)!,
      kind: node.kind,
      name: node.name,
      x: node.x,
      y: node.y,
      ...(parentKey ? { parentKey } : {}),
      ...(config ? { config } : {}),
    };
  });

  const links: FlowGraphTemplateLink[] = graph.edges
    .filter((edge) => idSet.has(edge.from) && idSet.has(edge.to))
    .map((edge) => ({
      from: keyById.get(edge.from)!,
      to: keyById.get(edge.to)!,
      ...(edge.fromPort !== 'next' ? { fromPort: edge.fromPort } : {}),
    }));

  return {
    id: newFlowTemplateId(),
    name: options.name?.trim() || 'Saved selection',
    hint: options.hint?.trim() || `${actionable.length} node${actionable.length === 1 ? '' : 's'}`,
    tags: normalizeFlowTemplateTags(options.tags ?? []),
    steps,
    links,
  };
}

function pickTemplateConfig(
  config: Readonly<Record<string, FlowNodeConfigValue>>,
): Readonly<Record<string, string | number | boolean>> | undefined {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
