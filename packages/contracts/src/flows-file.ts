import { z } from 'zod';

import { httpMethodSchema } from './collection-tree';
import { newEntityId } from './entity-id';
import { CONFIG_SCHEMA_VERSION } from './settings';
import {
  emptyFlowGraphNode,
  emptyFlowScenario,
  isFlowBrowserKind,
  isFlowDeviceKind,
  newFlowEdgeId,
  parseFlowScenario,
  parseFlowScenarioFolder,
  type FlowGraphEdge,
  type FlowGraphNode,
  type FlowNodeConfigValue,
  type FlowNodeKind,
  type FlowScenario,
  type FlowScenarioFolder,
} from './flow-graph';
import {
  newServiceNodeId,
  parseUnknownTree,
  type ServiceTreeNode,
} from './service-tree';

export const FLOW_SECTIONS = ['design', 'data', 'history', 'settings', 'docs'] as const;
export type FlowSection = (typeof FLOW_SECTIONS)[number];

/**
 * Maps a tab `serviceSection` onto the current Flow section list.
 * Legacy overview/steps/runs tabs land on Design; runs also maps to History.
 */
export function normalizeFlowSection(value: string | null | undefined): FlowSection {
  if (value === 'data' || value === 'history' || value === 'settings' || value === 'design' || value === 'docs')
    return value;
  if (value === 'runs')
    return 'history';
  if (value === 'steps' || value === 'overview')
    return 'design';
  return 'design';
}

/** Legacy nested step kinds, read from older flows.json files. */
export const flowStepKindSchema = z.enum([
  'request',
  'validation',
  'wait',
  'if',
  'forEach',
  'while',
  'parallel',
  'retry',
  'cache',
  'database',
  'e2e',
  'http-listener',
  'http-interceptor',
  'trigger',
  'manual',
]);

export type FlowStepKind = z.infer<typeof flowStepKindSchema>;

/** Legacy nested step, kept so old workspaces still migrate. */
export interface FlowStep {
  readonly id: string;
  readonly kind: FlowStepKind;
  readonly name: string;
  readonly enabled: boolean;
  readonly method?: string;
  readonly url?: string;
  readonly body?: string;
  readonly expression?: string;
  readonly waitMs?: number;
  readonly condition?: string;
  readonly connectionId?: string;
  readonly query?: string;
  readonly requestId?: string;
  readonly selector?: string;
  readonly e2eAction?: string;
  readonly children?: readonly FlowStep[];
}

export interface FlowArtifactFields {
  readonly description: string;
  readonly tags: readonly string[];
  readonly environmentId: string | null;
  readonly docs: string;
  /** Browser replay pacing when the flow includes E2E nodes. */
  readonly e2eReplay: FlowE2eReplay;
  /** When false, the E2E BrowserWindow stays hidden during runs. */
  readonly e2eShowWindow: boolean;
  /** How Run all executes enabled scenarios. */
  readonly scenariosRunMode: FlowScenariosRunMode;
  /** Scenario sidebar folders (child folders nest via parentId). */
  readonly scenarioFolders: readonly FlowScenarioFolder[];
  readonly scenarios: readonly FlowScenario[];
  /** ADB serial; empty uses emulator.json then the first online device. */
  readonly deviceSerial: string;
  /** Default APK path when a device-install node has no path of its own. */
  readonly apkPath: string;
  /** When true, a device node starts the Testrix AVD if nothing is online. */
  readonly deviceStartEmulator: boolean;
  /** When false, Start Device launches the AVD with `-no-window` (hidden). */
  readonly deviceShowEmulator: boolean;
}

/** Visible pacing for browser automation (slow = watchable, fast = minimal delays). */
export type FlowE2eReplay = 'slow' | 'fast';

/** Run-all strategy across scenarios. */
export type FlowScenariosRunMode = 'sequential' | 'parallel';

export function parseFlowE2eReplay(value: unknown): FlowE2eReplay {
  return value === 'fast' ? 'fast' : 'slow';
}

export function parseFlowScenariosRunMode(value: unknown): FlowScenariosRunMode {
  return value === 'parallel' ? 'parallel' : 'sequential';
}

/** True when any scenario graph contains a browser node. */
export function flowHasBrowserNodes(
  scenarios: readonly { readonly nodes: readonly { readonly kind: string }[] }[],
): boolean {
  return scenarios.some((scenario) =>
    scenario.nodes.some((node) => isFlowBrowserKind(node.kind as FlowNodeKind)),
  );
}

/** True when any scenario graph contains an Android device node. */
export function flowHasDeviceNodes(
  scenarios: readonly { readonly nodes: readonly { readonly kind: string }[] }[],
): boolean {
  return scenarios.some((scenario) =>
    scenario.nodes.some((node) => isFlowDeviceKind(node.kind as FlowNodeKind)),
  );
}

export type FlowNode = ServiceTreeNode<FlowArtifactFields>;

export interface FlowsFile {
  readonly schemaVersion: number;
  readonly items: readonly FlowNode[];
}

export const DEFAULT_FLOWS_FILE: FlowsFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  items: [],
};

export function emptyFlowStep(kind: FlowStepKind = 'request'): FlowStep {
  return {
    id: newEntityId(),
    kind,
    name: kind === 'request' ? 'Request' : kind,
    enabled: true,
    method: 'GET',
    url: 'https://127.0.0.1/',
    body: '',
    expression: '',
    waitMs: 250,
    condition: '',
    connectionId: '',
    query: '',
    children: [],
  };
}

export function emptyFlowArtifact(name = 'New flow'): ServiceTreeNode<FlowArtifactFields> {
  const now = new Date().toISOString();
  return {
    kind: 'artifact',
    id: newServiceNodeId(),
    name,
    updatedAt: now,
    description: '',
    tags: [],
    environmentId: null,
    docs: '',
    e2eReplay: 'slow',
    e2eShowWindow: true,
    scenariosRunMode: 'sequential',
    scenarioFolders: [],
    scenarios: [emptyFlowScenario()],
    deviceSerial: '',
    apkPath: '',
    deviceStartEmulator: true,
    deviceShowEmulator: true,
  };
}

function parseStep(raw: unknown): FlowStep {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const kind = flowStepKindSchema.safeParse(source['kind']).success
    ? (source['kind'] as FlowStepKind)
    : 'request';
  return {
    id: typeof source['id'] === 'string' && source['id'] ? source['id'] : newServiceNodeId(),
    kind,
    name: typeof source['name'] === 'string' ? source['name'] : kind,
    enabled: source['enabled'] !== false,
    method: typeof source['method'] === 'string' ? source['method'] : 'GET',
    url: typeof source['url'] === 'string' ? source['url'] : '',
    body: typeof source['body'] === 'string' ? source['body'] : '',
    expression: typeof source['expression'] === 'string' ? source['expression'] : '',
    waitMs: typeof source['waitMs'] === 'number' ? source['waitMs'] : 250,
    condition: typeof source['condition'] === 'string' ? source['condition'] : '',
    connectionId: typeof source['connectionId'] === 'string' ? source['connectionId'] : '',
    query: typeof source['query'] === 'string' ? source['query'] : '',
    requestId: typeof source['requestId'] === 'string' ? source['requestId'] : '',
    selector: typeof source['selector'] === 'string' ? source['selector'] : '',
    e2eAction: typeof source['e2eAction'] === 'string' ? source['e2eAction'] : '',
    children: Array.isArray(source['children']) ? source['children'].map(parseStep) : [],
  };
}

const COLUMN_X = 260;
const ROW_Y = 150;

function legacyKindOf(step: FlowStep): FlowNodeKind {
  switch (step.kind) {
    case 'validation':
      return 'assert-json';
    case 'forEach':
      return 'for-each';
    case 'parallel':
      return 'join';
    case 'e2e': {
      const action = (step.e2eAction || 'navigate').toLowerCase();
      if (action === 'click')
        return 'browser-click';
      if (action === 'type')
        return 'browser-type';
      if (action === 'assert')
        return 'assert-visible';
      return 'browser-open';
    }
    default:
      return step.kind as FlowNodeKind;
  }
}

function legacyConfigOf(step: FlowStep): Record<string, FlowNodeConfigValue> {
  switch (step.kind) {
    case 'request':
      return { method: step.method || 'GET', url: step.url || '', body: step.body || '' };
    case 'validation':
      return { expression: step.expression || step.condition || 'status == 200' };
    case 'wait':
      return { waitMs: step.waitMs ?? 250 };
    case 'if':
    case 'while':
      return { condition: step.condition || step.expression || 'true' };
    case 'forEach':
      return { items: step.expression || 'items' };
    case 'retry':
      return { attempts: Math.max(1, Math.min(8, step.waitMs ?? 3)) };
    case 'cache':
      return { key: step.expression || '' };
    case 'database':
      return { connectionId: step.connectionId || '', query: step.query || 'SELECT 1' };
    case 'http-listener':
    case 'http-interceptor':
      return { url: step.url || '', waitMs: step.waitMs ?? 500, method: '*', match: 'contains' };
    case 'trigger':
      return { flowId: step.expression || step.requestId || '' };
    case 'manual':
      return { prompt: step.body || 'Enter a value to continue', variable: 'manual', placeholder: '' };
    case 'e2e': {
      const action = (step.e2eAction || 'navigate').toLowerCase();
      if (action === 'click')
        return { selector: step.selector || '' };
      if (action === 'type')
        return { selector: step.selector || '', text: step.body || '', clearFirst: true };
      if (action === 'assert')
        return { selector: step.selector || '' };
      return { url: step.url || 'http://127.0.0.1/', width: 1100, height: 800 };
    }
    default:
      return {};
  }
}

/** Open ends of a migrated chain that the next sibling must wait for. */
type MigrationTails = { readonly id: string; readonly port: FlowGraphEdge['fromPort'] }[];

function migrateSteps(
  steps: readonly FlowStep[],
  parentId: string | null,
  originX: number,
  originY: number,
  out: { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] },
): MigrationTails {
  let tails: MigrationTails = [];
  let x = originX;

  for (const step of steps) {
    const kind = legacyKindOf(step);
    const node: FlowGraphNode = {
      ...emptyFlowGraphNode(kind, { x, y: originY }, parentId),
      id: step.id,
      name: step.name === step.kind ? '' : step.name,
      enabled: step.enabled,
      config: { ...emptyFlowGraphNode(kind).config, ...legacyConfigOf(step) },
    };
    out.nodes.push(node);
    for (const tail of tails)
      out.edges.push({ id: newFlowEdgeId(), from: tail.id, fromPort: tail.port, to: node.id });

    const children = step.children ?? [];
    if (step.kind === 'if') {
      const branch = migrateSteps(children, parentId, x + COLUMN_X, originY, out);
      if (children[0]) {
        out.edges.push({ id: newFlowEdgeId(), from: node.id, fromPort: 'then', to: children[0].id });
        tails = branch.length > 0 ? [...branch, { id: node.id, port: 'else' }] : [{ id: node.id, port: 'else' }];
      } else {
        tails = [
          { id: node.id, port: 'then' },
          { id: node.id, port: 'else' },
        ];
      }
      x += COLUMN_X * (children.length + 1);
      continue;
    }

    if (step.kind === 'forEach' || step.kind === 'while' || step.kind === 'retry') {
      migrateSteps(children, node.id, 40, 40, out);
      tails = [{ id: node.id, port: 'done' }];
      x += COLUMN_X;
      continue;
    }

    if (step.kind === 'parallel') {
      const branchTails: MigrationTails = [];
      children.forEach((child, index) => {
        const inner = migrateSteps([child], parentId, x + COLUMN_X, originY + index * ROW_Y, out);
        out.edges.push({ id: newFlowEdgeId(), from: node.id, fromPort: 'next', to: child.id });
        branchTails.push(...inner);
      });
      tails = branchTails.length > 0 ? branchTails : [{ id: node.id, port: 'next' }];
      x += COLUMN_X * 2;
      continue;
    }

    if (children.length > 0) {
      tails = migrateSteps(children, parentId, x + COLUMN_X, originY, out);
      out.edges.push({ id: newFlowEdgeId(), from: node.id, fromPort: 'next', to: children[0]!.id });
      x += COLUMN_X * (children.length + 1);
      continue;
    }

    tails = [{ id: node.id, port: 'next' }];
    x += COLUMN_X;
  }

  return tails;
}

/** Converts a legacy nested step list into a single scenario graph. */
export function flowScenarioFromLegacySteps(
  steps: readonly FlowStep[],
  name = 'Main scenario',
): FlowScenario {
  const base = emptyFlowScenario(name);
  if (steps.length === 0)
    return base;
  const out: { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] } = { nodes: [], edges: [] };
  migrateSteps(steps, null, 80, 80, out);
  const ids = new Set(out.nodes.map((node) => node.id));
  return {
    ...base,
    nodes: out.nodes,
    edges: out.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
  };
}

function parseScenarios(value: Record<string, unknown>): FlowScenario[] {
  const folders = parseScenarioFolders(value);
  const folderIds = new Set(folders.map((folder) => folder.id));
  const raw = value['scenarios'];
  if (Array.isArray(raw)) {
    const parsed = raw
      .map(parseFlowScenario)
      .filter((scenario): scenario is FlowScenario => scenario !== null)
      .map((scenario) =>
        scenario.folderId && !folderIds.has(scenario.folderId)
          ? { ...scenario, folderId: null }
          : scenario,
      );
    if (parsed.length > 0)
      return parsed;
  }
  const legacy = Array.isArray(value['steps'])
    ? value['steps']
    : Array.isArray(value['nodes'])
      ? value['nodes']
      : null;
  if (legacy)
    return [flowScenarioFromLegacySteps(legacy.map(parseStep))];
  return [emptyFlowScenario()];
}

export function parseFlowsFile(raw: unknown): FlowsFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: parseUnknownTree(source['items'] ?? source['suites'], (value) => ({
      description: typeof value['description'] === 'string' ? value['description'] : '',
      tags: Array.isArray(value['tags']) ? value['tags'].filter((item): item is string => typeof item === 'string') : [],
      environmentId: typeof value['environmentId'] === 'string' ? value['environmentId'] : null,
      docs: typeof value['docs'] === 'string' ? value['docs'] : '',
      e2eReplay: parseFlowE2eReplay(value['e2eReplay']),
      e2eShowWindow: value['e2eShowWindow'] !== false,
      scenariosRunMode: parseFlowScenariosRunMode(value['scenariosRunMode']),
      scenarioFolders: parseScenarioFolders(value),
      scenarios: parseScenarios(value),
      deviceSerial: typeof value['deviceSerial'] === 'string' ? value['deviceSerial'] : '',
      apkPath: typeof value['apkPath'] === 'string' ? value['apkPath'] : '',
      deviceStartEmulator: value['deviceStartEmulator'] !== false,
      deviceShowEmulator: value['deviceShowEmulator'] !== false,
    })),
  };
}

function parseScenarioFolders(value: Record<string, unknown>): FlowScenarioFolder[] {
  if (!Array.isArray(value['scenarioFolders']))
    return [];
  const folders = value['scenarioFolders']
    .map(parseFlowScenarioFolder)
    .filter((folder): folder is FlowScenarioFolder => folder !== null);
  const ids = new Set(folders.map((folder) => folder.id));
  return folders.map((folder) =>
    folder.parentId && !ids.has(folder.parentId) ? { ...folder, parentId: null } : folder,
  );
}

export const flowMethodSchema = httpMethodSchema;
