import { flattenFlowNodesInRunOrder } from './test-suite-flow-order';
import {
  isTestSuiteFlow,
  isTestSuiteFolder,
  isFlowStepNode,
  type TestSuiteFlow,
  type TestSuiteTreeItem,
} from './test-suites.schema';
import { triggerStepConfigSchema } from './test-suite-steps.schema';
import { resolveTriggerTargetFlows, triggerFlowCycleMessage } from './collect-trigger-targets';

/** Directed TRIGGER call from one flow to another. */
export interface TriggerGraphEdge {
  readonly fromFlowId: string;
  readonly toFlowId: string;
  readonly muted: boolean;
  readonly cyclic: boolean;
}

/** Flow node in the suite-level TRIGGER call graph. */
export interface TriggerGraphNode {
  readonly flowId: string;
  readonly name: string;
  readonly layer: number;
  readonly indexInLayer: number;
  readonly cyclic: boolean;
}

/** Suite-level TRIGGER call graph (flows as nodes). */
export interface TriggerCallGraph {
  readonly nodes: readonly TriggerGraphNode[];
  readonly edges: readonly TriggerGraphEdge[];
}

function collectFlows(items: readonly TestSuiteTreeItem[]): TestSuiteFlow[] {
  const flows: TestSuiteFlow[] = [];
  const walk = (list: readonly TestSuiteTreeItem[]): void => {
    for (const item of list) {
      if (isTestSuiteFlow(item)) {
        flows.push(item);
        continue;
      }
      if (isTestSuiteFolder(item)) {
        walk(item.children);
      }
    }
  };
  walk(items);
  return flows;
}

function collectRawEdges(
  items: readonly TestSuiteTreeItem[],
  flows: readonly TestSuiteFlow[],
): TriggerGraphEdge[] {
  const edges: TriggerGraphEdge[] = [];
  const seen = new Set<string>();

  for (const flow of flows) {
    for (const node of flattenFlowNodesInRunOrder(flow.nodes)) {
      if (!isFlowStepNode(node) || node.stepType !== 'TRIGGER') {
        continue;
      }
      const parsed = triggerStepConfigSchema.safeParse(node.config ?? {});
      if (!parsed.success || !parsed.data.targetId.trim()) {
        continue;
      }
      const resolved = resolveTriggerTargetFlows(items, {
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
      });
      if (!resolved.ok) {
        continue;
      }
      const muted = node.enabled === false;
      for (const location of resolved.locations) {
        const key = `${flow.id}\0${location.flow.id}\0${muted ? 'm' : 'a'}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        edges.push({
          fromFlowId: flow.id,
          toFlowId: location.flow.id,
          muted,
          cyclic: false,
        });
      }
    }
  }

  return edges;
}

function adjacency(edges: readonly TriggerGraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.fromFlowId) ?? [];
    if (!list.includes(edge.toFlowId)) {
      list.push(edge.toFlowId);
    }
    map.set(edge.fromFlowId, list);
  }
  return map;
}

/**
 * Marks edges that participate in a static cycle using the same stack rule as runtime.
 */
export function markTriggerGraphCycles(
  edges: readonly TriggerGraphEdge[],
): readonly TriggerGraphEdge[] {
  const adj = adjacency(edges);
  const cyclicKeys = new Set<string>();

  const visit = (flowId: string, stack: string[]): void => {
    for (const next of adj.get(flowId) ?? []) {
      if (triggerFlowCycleMessage(stack, next)) {
        cyclicKeys.add(`${flowId}\0${next}`);
        continue;
      }
      visit(next, [...stack, next]);
    }
  };

  const roots = new Set(edges.map((edge) => edge.fromFlowId));
  for (const edge of edges) {
    roots.delete(edge.toFlowId);
  }
  const startIds = roots.size > 0 ? [...roots] : [...new Set(edges.map((edge) => edge.fromFlowId))];
  for (const start of startIds) {
    visit(start, [start]);
  }

  return edges.map((edge) =>
    cyclicKeys.has(`${edge.fromFlowId}\0${edge.toFlowId}`) ? { ...edge, cyclic: true } : edge,
  );
}

function layoutLayers(
  flowIds: readonly string[],
  edges: readonly TriggerGraphEdge[],
): ReadonlyMap<string, number> {
  const incoming = new Map<string, number>();
  for (const id of flowIds) {
    incoming.set(id, 0);
  }
  for (const edge of edges) {
    if (!incoming.has(edge.toFlowId)) {
      continue;
    }
    incoming.set(edge.toFlowId, (incoming.get(edge.toFlowId) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const id of flowIds) {
    if ((incoming.get(id) ?? 0) === 0) {
      layer.set(id, 0);
      queue.push(id);
    }
  }

  const adj = adjacency(edges);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layer.get(current) ?? 0;
    for (const next of adj.get(current) ?? []) {
      const nextLayer = Math.max(layer.get(next) ?? 0, currentLayer + 1);
      layer.set(next, nextLayer);
      const remaining = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, remaining);
      if (remaining <= 0 && !queue.includes(next)) {
        queue.push(next);
      }
    }
  }

  for (const id of flowIds) {
    if (!layer.has(id)) {
      layer.set(id, 0);
    }
  }
  return layer;
}

/**
 * Walks the suite tree and builds a TRIGGER call graph.
 * Folder targets expand to descendant flows. Disabled TRIGGERs become muted edges.
 */
export function collectTriggerCallGraph(items: readonly TestSuiteTreeItem[]): TriggerCallGraph {
  const flows = collectFlows(items);
  const rawEdges = collectRawEdges(items, flows);
  const edges = markTriggerGraphCycles(rawEdges);
  const involved = new Set<string>();
  for (const edge of edges) {
    involved.add(edge.fromFlowId);
    involved.add(edge.toFlowId);
  }
  const involvedFlows = flows.filter((flow) => involved.has(flow.id));
  const layers = layoutLayers(
    involvedFlows.map((flow) => flow.id),
    edges,
  );
  const cyclicNodes = new Set<string>();
  for (const edge of edges) {
    if (edge.cyclic) {
      cyclicNodes.add(edge.fromFlowId);
      cyclicNodes.add(edge.toFlowId);
    }
  }

  const byLayer = new Map<number, string[]>();
  for (const flow of involvedFlows) {
    const layer = layers.get(flow.id) ?? 0;
    const list = byLayer.get(layer) ?? [];
    list.push(flow.id);
    byLayer.set(layer, list);
  }

  const indexById = new Map<string, number>();
  for (const [layer, ids] of byLayer) {
    ids.forEach((id, index) => {
      indexById.set(id, index);
    });
    void layer;
  }

  const nodes: TriggerGraphNode[] = involvedFlows.map((flow) => ({
    flowId: flow.id,
    name: flow.name,
    layer: layers.get(flow.id) ?? 0,
    indexInLayer: indexById.get(flow.id) ?? 0,
    cyclic: cyclicNodes.has(flow.id),
  }));

  return { nodes, edges };
}
