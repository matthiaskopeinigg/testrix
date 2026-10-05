import {
  emptyFlowGraphNode,
  FLOW_FRAME_DEFAULT_HEIGHT,
  FLOW_FRAME_DEFAULT_WIDTH,
  flowExecutionScopeId,
  flowNodePorts,
  isFlowContainerKind,
  isFlowDeviceKind,
  isFlowFrameKind,
  isFlowTerminalKind,
  FLOW_DEVICE_NODES_ENABLED,
  newFlowEdgeId,
  newFlowNodeId,
  type FlowGraphEdge,
  type FlowGraphNode,
  type FlowNodeConfigValue,
  type FlowNodeKind,
  type FlowPort,
  type FlowScenario,
} from '@testrix/contracts';

import {
  FLOW_GRID,
  FLOW_NODE_HEIGHT,
  FLOW_NODE_WIDTH,
  FLOW_NOTE_HEIGHT,
  FLOW_NOTE_WIDTH,
  FLOW_TERMINAL_SIZE,
  snapToGrid,
} from './flow-graph-layout';

/** Graph slice the mutations operate on. Keeps helpers usable from tests. */
export type FlowGraph = Pick<FlowScenario, 'nodes' | 'edges'>;

const SPAWN_GAP_X = FLOW_NODE_WIDTH + 92;
const SPAWN_GAP_Y = FLOW_NODE_HEIGHT + 40;
/** Breathing room between sibling node boxes. */
const COLLISION_GAP = 12;

export function nodeById(graph: FlowGraph, id: string): FlowGraphNode | null {
  return graph.nodes.find((node) => node.id === id) ?? null;
}

export function outgoingEdges(graph: FlowGraph, id: string, port?: FlowPort): readonly FlowGraphEdge[] {
  return graph.edges.filter((edge) => edge.from === id && (port === undefined || edge.fromPort === port));
}

function nodeFootprint(node: Pick<FlowGraphNode, 'kind' | 'config'>): { readonly width: number; readonly height: number } {
  if (isFlowTerminalKind(node.kind))
    return { width: FLOW_TERMINAL_SIZE, height: FLOW_TERMINAL_SIZE };
  if (isFlowFrameKind(node.kind)) {
    const width = typeof node.config['width'] === 'number' ? node.config['width'] : FLOW_FRAME_DEFAULT_WIDTH;
    const height = typeof node.config['height'] === 'number' ? node.config['height'] : FLOW_FRAME_DEFAULT_HEIGHT;
    return { width, height };
  }
  if (isFlowContainerKind(node.kind))
    return { width: FLOW_NODE_WIDTH + 40, height: FLOW_NODE_HEIGHT + 56 };
  if (node.kind === 'note')
    return { width: FLOW_NOTE_WIDTH, height: FLOW_NOTE_HEIGHT };
  return { width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT };
}

function footprintForKind(kind: FlowNodeKind): { readonly width: number; readonly height: number } {
  return nodeFootprint({ kind, config: {} });
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return (
    ax < bx + bw + COLLISION_GAP &&
    ax + aw + COLLISION_GAP > bx &&
    ay < by + bh + COLLISION_GAP &&
    ay + ah + COLLISION_GAP > by
  );
}

/**
 * Finds a clear slot among same-parent siblings.
 * Nested children may sit inside their container (different parentId) — that is allowed.
 */
export function resolveFreePosition(
  graph: FlowGraph,
  parentId: string | null,
  x: number,
  y: number,
  options: {
    readonly excludeIds?: ReadonlySet<string>;
    readonly width?: number;
    readonly height?: number;
    /** When true, keep the requested point (docs frames may overlap anything). */
    readonly allowOverlap?: boolean;
  } = {},
): { readonly x: number; readonly y: number } {
  const width = options.width ?? FLOW_NODE_WIDTH;
  const height = options.height ?? FLOW_NODE_HEIGHT;
  const exclude = options.excludeIds ?? new Set<string>();
  const originX = snapToGrid(x);
  const originY = snapToGrid(y);
  if (options.allowOverlap)
    return { x: originX, y: originY };

  // Start/End are viewport-pinned — their stored coords are not layout obstacles.
  // Docs frames are background chrome — other nodes may sit on top of them.
  const obstacles = graph.nodes.filter(
    (node) =>
      node.parentId === parentId &&
      !exclude.has(node.id) &&
      !isFlowTerminalKind(node.kind) &&
      !isFlowFrameKind(node.kind),
  );

  let nextX = originX;
  let nextY = originY;
  for (let guard = 0; guard < 500; guard += 1) {
    const blocked = obstacles.some((node) => {
      const size = nodeFootprint(node);
      return rectsOverlap(nextX, nextY, width, height, node.x, node.y, size.width, size.height);
    });
    if (!blocked)
      return { x: nextX, y: nextY };
    nextY = snapToGrid(nextY + FLOW_GRID);
    if (guard > 0 && guard % 16 === 0) {
      nextX = snapToGrid(nextX + FLOW_GRID * 2);
      nextY = originY;
    }
  }
  return { x: nextX, y: nextY };
}

export function incomingEdges(graph: FlowGraph, id: string): readonly FlowGraphEdge[] {
  return graph.edges.filter((edge) => edge.to === id);
}

/** True when connecting from -> to would close a loop. */
export function wouldCycle(graph: FlowGraph, from: string, to: string): boolean {
  if (from === to)
    return true;
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === from)
      return true;
    if (seen.has(current))
      continue;
    seen.add(current);
    for (const edge of graph.edges) {
      if (edge.from === current)
        stack.push(edge.to);
    }
  }
  return false;
}

export function canConnect(graph: FlowGraph, from: string, fromPort: FlowPort, to: string): boolean {
  const source = nodeById(graph, from);
  const target = nodeById(graph, to);
  if (!source || !target || source.id === target.id)
    return false;
  if (source.kind === 'note' || target.kind === 'note')
    return false;
  if (isFlowFrameKind(source.kind) || isFlowFrameKind(target.kind))
    return false;
  if (target.kind === 'start' || source.kind === 'end')
    return false;
  if (flowExecutionScopeId(graph, source) !== flowExecutionScopeId(graph, target))
    return false;
  if (!flowNodePorts(source.kind).includes(fromPort))
    return false;
  if (graph.edges.some((edge) => edge.from === from && edge.fromPort === fromPort && edge.to === to))
    return false;
  return !wouldCycle(graph, from, to);
}

export function connectNodes<T extends FlowGraph>(graph: T, from: string, fromPort: FlowPort, to: string): T {
  if (!canConnect(graph, from, fromPort, to))
    return graph;
  return { ...graph, edges: [...graph.edges, { id: newFlowEdgeId(), from, fromPort, to }] };
}

export function disconnectEdge<T extends FlowGraph>(graph: T, edgeId: string): T {
  return { ...graph, edges: graph.edges.filter((edge) => edge.id !== edgeId) };
}

/** Sets or clears the optional documentation name on a link. */
export function renameEdge<T extends FlowGraph>(graph: T, edgeId: string, name: string): T {
  const trimmed = name.trim();
  return {
    ...graph,
    edges: graph.edges.map((edge) => {
      if (edge.id !== edgeId)
        return edge;
      if (!trimmed)
        return { id: edge.id, from: edge.from, fromPort: edge.fromPort, to: edge.to };
      return { ...edge, name: trimmed };
    }),
  };
}

export interface AddNodeResult<T extends FlowGraph> {
  readonly graph: T;
  readonly id: string;
}

export function addNode<T extends FlowGraph>(
  graph: T,
  kind: FlowNodeKind,
  options: {
    readonly at?: { readonly x: number; readonly y: number };
    readonly parentId?: string | null;
    readonly after?: { readonly id: string; readonly port: FlowPort } | null;
  } = {},
): AddNodeResult<T> {
  if (isFlowTerminalKind(kind))
    return { graph, id: '' };
  if (!FLOW_DEVICE_NODES_ENABLED && isFlowDeviceKind(kind))
    return { graph, id: '' };

  const after = options.after ?? null;
  const source = after ? nodeById(graph, after.id) : null;
  const parentId = options.parentId !== undefined ? options.parentId : (source?.parentId ?? null);
  const base = options.at ?? (source ? { x: source.x + SPAWN_GAP_X, y: source.y } : { x: 120, y: 120 });
  const size = footprintForKind(kind);
  const position = resolveFreePosition(graph, parentId, base.x, base.y, {
    width: size.width,
    height: size.height,
    allowOverlap: isFlowFrameKind(kind),
  });

  const node = { ...emptyFlowGraphNode(kind, position, parentId) };
  let next = { ...graph, nodes: [...graph.nodes, node] } as T;

  if (source && after && flowNodePorts(source.kind).includes(after.port))
    next = connectNodes(next, source.id, after.port, node.id);

  // Loops/retries get one empty body slot; docs frames stay empty.
  if (isFlowContainerKind(kind)) {
    const child = emptyFlowGraphNode('wait', { x: 40, y: 80 }, node.id);
    next = { ...next, nodes: [...next.nodes, child] } as T;
  }

  return { graph: next, id: node.id };
}

/**
 * Adds a second branch on the same port, which is what makes the split run
 * both paths at once.
 */
export function splitFromNode<T extends FlowGraph>(
  graph: T,
  nodeId: string,
  kind: FlowNodeKind,
  port: FlowPort = 'next',
): AddNodeResult<T> {
  const source = nodeById(graph, nodeId);
  if (!source)
    return { graph, id: '' };
  const existing = outgoingEdges(graph, nodeId, port);
  const lowest = existing
    .map((edge) => nodeById(graph, edge.to))
    .filter((node): node is FlowGraphNode => node !== null)
    .reduce((max, node) => Math.max(max, node.y), source.y);
  return addNode(graph, kind, {
    at: { x: source.x + SPAWN_GAP_X, y: lowest + SPAWN_GAP_Y },
    parentId: source.parentId,
    after: { id: nodeId, port },
  });
}

/** Drops a node onto an existing edge, rewiring both sides through it. */
export function insertOnEdge<T extends FlowGraph>(
  graph: T,
  edgeId: string,
  kind: FlowNodeKind,
): AddNodeResult<T> {
  const edge = graph.edges.find((item) => item.id === edgeId);
  if (!edge)
    return { graph, id: '' };
  const from = nodeById(graph, edge.from);
  const to = nodeById(graph, edge.to);
  if (!from || !to)
    return { graph, id: '' };

  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const added = addNode(graph, kind, { at: midpoint, parentId: from.parentId });
  const withoutOld = disconnectEdge(added.graph, edgeId);
  const wired = {
    ...withoutOld,
    edges: [
      ...withoutOld.edges,
      { id: newFlowEdgeId(), from: edge.from, fromPort: edge.fromPort, to: added.id, ...(edge.name ? { name: edge.name } : {}) },
      { id: newFlowEdgeId(), from: added.id, fromPort: 'next' as FlowPort, to: edge.to },
    ],
  } as T;
  return { graph: wired, id: added.id };
}

function descendantIds(graph: FlowGraph, rootIds: readonly string[]): Set<string> {
  const all = new Set(rootIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of graph.nodes) {
      if (node.parentId && all.has(node.parentId) && !all.has(node.id)) {
        all.add(node.id);
        grew = true;
      }
    }
  }
  return all;
}

/**
 * Removes nodes and heals the graph: every predecessor reconnects to every
 * successor so the chain does not fall apart.
 */
export function removeNodes<T extends FlowGraph>(graph: T, ids: readonly string[]): T {
  // Start / End terminals are fixed — never remove them.
  const removable = ids.filter((id) => {
    const node = nodeById(graph, id);
    return node ? !isFlowTerminalKind(node.kind) : false;
  });
  if (removable.length === 0)
    return graph;
  const doomed = descendantIds(graph, removable);

  const bridges: FlowGraphEdge[] = [];
  for (const id of removable) {
    const before = graph.edges.filter((edge) => edge.to === id && !doomed.has(edge.from));
    const after = graph.edges.filter((edge) => edge.from === id && !doomed.has(edge.to));
    for (const left of before) {
      for (const right of after) {
        const duplicate = graph.edges.some((edge) => edge.from === left.from && edge.to === right.to);
        const alreadyBridged = bridges.some((edge) => edge.from === left.from && edge.to === right.to);
        if (!duplicate && !alreadyBridged)
          bridges.push({ id: newFlowEdgeId(), from: left.from, fromPort: left.fromPort, to: right.to });
      }
    }
  }

  return {
    ...graph,
    nodes: graph.nodes.filter((node) => !doomed.has(node.id)),
    edges: [
      ...graph.edges.filter((edge) => !doomed.has(edge.from) && !doomed.has(edge.to)),
      ...bridges,
    ],
  } as T;
}

export function duplicateNodes<T extends FlowGraph>(graph: T, ids: readonly string[]): AddNodeResult<T> {
  const seed = ids.filter((id) => {
    const node = nodeById(graph, id);
    return node ? !isFlowTerminalKind(node.kind) : false;
  });
  if (seed.length === 0)
    return { graph, id: '' };
  const family = descendantIds(graph, seed);
  const remap = new Map<string, string>();
  for (const id of family)
    remap.set(id, newFlowNodeId());

  const clones = graph.nodes
    .filter((node) => family.has(node.id))
    .map((node) => ({
      ...node,
      id: remap.get(node.id)!,
      parentId: node.parentId && remap.has(node.parentId) ? remap.get(node.parentId)! : node.parentId,
      x: seed.includes(node.id) ? snapToGrid(node.x + 40) : node.x,
      y: seed.includes(node.id) ? snapToGrid(node.y + 40) : node.y,
      name: seed.includes(node.id) && node.name ? `${node.name} copy` : node.name,
    }));

  let nextNodes = [...graph.nodes, ...clones];
  for (const seedId of seed) {
    const cloneId = remap.get(seedId);
    if (!cloneId)
      continue;
    const clone = nextNodes.find((node) => node.id === cloneId);
    if (!clone)
      continue;
    const size = nodeFootprint(clone);
    const free = resolveFreePosition(
      { nodes: nextNodes, edges: graph.edges },
      clone.parentId,
      clone.x,
      clone.y,
      { excludeIds: new Set([cloneId]), width: size.width, height: size.height },
    );
    nextNodes = nextNodes.map((node) =>
      node.id === cloneId ? { ...node, x: free.x, y: free.y } : node,
    );
  }

  const innerEdges = graph.edges
    .filter((edge) => remap.has(edge.from) && remap.has(edge.to))
    .map((edge) => ({
      id: newFlowEdgeId(),
      from: remap.get(edge.from)!,
      fromPort: edge.fromPort,
      to: remap.get(edge.to)!,
      ...(edge.name ? { name: edge.name } : {}),
    }));

  return {
    graph: { ...graph, nodes: nextNodes, edges: [...graph.edges, ...innerEdges] } as T,
    id: remap.get(seed[0]!) ?? '',
  };
}

/** Serializable subgraph for copy / cut / paste. */
export interface FlowClipboardSlice {
  readonly nodes: readonly FlowGraphNode[];
  readonly edges: readonly FlowGraphEdge[];
}

/** Captures selected nodes (with container children) and edges that stay inside the slice. */
export function copyFlowSelection(
  graph: FlowGraph,
  nodeIds: readonly string[],
): FlowClipboardSlice | null {
  const seed = nodeIds.filter((id) => {
    const node = nodeById(graph, id);
    return node ? !isFlowTerminalKind(node.kind) : false;
  });
  if (seed.length === 0)
    return null;
  const family = descendantIds(graph, seed);
  const nodes = graph.nodes
    .filter((node) => family.has(node.id))
    .map((node) => structuredClone(node));
  const edges = graph.edges
    .filter((edge) => family.has(edge.from) && family.has(edge.to))
    .map((edge) => structuredClone(edge));
  return { nodes, edges };
}

/** Pastes a clipboard slice with remapped ids, offset from the original positions. */
export function pasteFlowSelection<T extends FlowGraph>(
  graph: T,
  slice: FlowClipboardSlice,
  offset = { x: 40, y: 40 },
): { readonly graph: T; readonly selectedIds: readonly string[] } {
  if (slice.nodes.length === 0)
    return { graph, selectedIds: [] };
  const remap = new Map<string, string>();
  for (const node of slice.nodes)
    remap.set(node.id, newFlowNodeId());

  const seedIds = new Set(
    slice.nodes
      .filter((node) => !node.parentId || !remap.has(node.parentId))
      .map((node) => node.id),
  );

  const clones = slice.nodes.map((node) => ({
    ...node,
    id: remap.get(node.id)!,
    parentId: node.parentId && remap.has(node.parentId) ? remap.get(node.parentId)! : null,
    x: seedIds.has(node.id) ? snapToGrid(node.x + offset.x) : node.x,
    y: seedIds.has(node.id) ? snapToGrid(node.y + offset.y) : node.y,
  }));

  let nextNodes = [...graph.nodes, ...clones];
  for (const seedId of seedIds) {
    const cloneId = remap.get(seedId);
    if (!cloneId)
      continue;
    const clone = nextNodes.find((node) => node.id === cloneId);
    if (!clone || isFlowTerminalKind(clone.kind))
      continue;
    const size = nodeFootprint(clone);
    const free = resolveFreePosition(
      { nodes: nextNodes, edges: graph.edges },
      clone.parentId,
      clone.x,
      clone.y,
      { excludeIds: new Set([cloneId]), width: size.width, height: size.height },
    );
    nextNodes = nextNodes.map((node) =>
      node.id === cloneId ? { ...node, x: free.x, y: free.y } : node,
    );
  }

  const edges = slice.edges
    .filter((edge) => remap.has(edge.from) && remap.has(edge.to))
    .map((edge) => ({
      id: newFlowEdgeId(),
      from: remap.get(edge.from)!,
      fromPort: edge.fromPort,
      to: remap.get(edge.to)!,
      ...(edge.name ? { name: edge.name } : {}),
    }));

  const selectedIds = nextNodes
    .filter((node) => [...remap.values()].includes(node.id))
    .filter((node) => !node.parentId || !nextNodes.some((other) => other.id === node.parentId))
    .filter((node) => !isFlowTerminalKind(node.kind))
    .map((node) => node.id);

  return {
    graph: {
      ...graph,
      nodes: nextNodes,
      edges: [...graph.edges, ...edges],
    } as T,
    selectedIds,
  };
}

/**
 * Drops ids whose ancestor is already in the list. Child coordinates are
 * relative to the container, so moving both would shift the child twice.
 */
export function topLevelSelection(graph: FlowGraph, ids: readonly string[]): readonly string[] {
  const set = new Set(ids);
  const hasMovedAncestor = (id: string): boolean => {
    let parent = nodeById(graph, id)?.parentId ?? null;
    while (parent) {
      if (set.has(parent))
        return true;
      parent = nodeById(graph, parent)?.parentId ?? null;
    }
    return false;
  };
  return ids.filter((id) => !hasMovedAncestor(id));
}

export function moveNodes<T extends FlowGraph>(
  graph: T,
  ids: readonly string[],
  delta: { readonly x: number; readonly y: number },
  options: {
    readonly snap?: boolean;
    readonly resolveCollisions?: boolean;
    readonly allowTerminals?: boolean;
  } = {},
): T {
  const snap = options.snap !== false;
  const resolveCollisions = options.resolveCollisions !== false;
  const allowTerminals = options.allowTerminals === true;
  if (ids.length === 0)
    return graph;
  const set = new Set(
    topLevelSelection(graph, ids).filter((id) => {
      const node = nodeById(graph, id);
      if (!node)
        return false;
      if (allowTerminals)
        return true;
      return !isFlowTerminalKind(node.kind);
    }),
  );
  if (set.size === 0)
    return graph;

  let nodes = graph.nodes.map((node) => {
    if (!set.has(node.id))
      return node;
    const x = node.x + delta.x;
    const y = node.y + delta.y;
    return { ...node, x: snap ? snapToGrid(x) : x, y: snap ? snapToGrid(y) : y };
  });

  if (!resolveCollisions)
    return { ...graph, nodes } as T;

  // Nudge each moved sibling clear of other same-parent nodes (nested bodies stay free).
  // Docs frames may sit under anything — skip collision resolve for them.
  for (const id of set) {
    const node = nodes.find((item) => item.id === id);
    if (!node)
      continue;
    if (isFlowFrameKind(node.kind))
      continue;
    const size = nodeFootprint(node);
    const free = resolveFreePosition(
      { nodes, edges: graph.edges },
      node.parentId,
      node.x,
      node.y,
      { excludeIds: new Set([id]), width: size.width, height: size.height },
    );
    if (free.x === node.x && free.y === node.y)
      continue;
    nodes = nodes.map((item) => (item.id === id ? { ...item, x: free.x, y: free.y } : item));
  }

  return { ...graph, nodes } as T;
}

export function patchNode<T extends FlowGraph>(graph: T, id: string, patch: Partial<FlowGraphNode>): T {
  return { ...graph, nodes: graph.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) } as T;
}

export function patchNodeConfig<T extends FlowGraph>(
  graph: T,
  id: string,
  config: Readonly<Record<string, FlowNodeConfigValue>>,
): T {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === id ? { ...node, config: { ...node.config, ...config } } : node)),
  } as T;
}

export function setNodesEnabled<T extends FlowGraph>(graph: T, ids: readonly string[], enabled: boolean): T {
  const set = new Set(ids);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (set.has(node.id) ? { ...node, enabled } : node)),
  } as T;
}

/** Nodes fully inside a marquee rectangle in world space. */
export function nodesInRect(
  placed: readonly { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[],
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): readonly string[] {
  const bounds = normalizeRect(rect);
  return placed
    .filter(
      (node) =>
        node.x >= bounds.left &&
        node.y >= bounds.top &&
        node.x + node.width <= bounds.right &&
        node.y + node.height <= bounds.bottom,
    )
    .map((node) => node.id);
}

/** Edges whose midpoint sits inside a marquee rectangle in world space. */
export function edgesInRect(
  edges: readonly { readonly id: string; readonly labelX: number; readonly labelY: number }[],
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): readonly string[] {
  const bounds = normalizeRect(rect);
  return edges
    .filter(
      (edge) =>
        edge.labelX >= bounds.left &&
        edge.labelX <= bounds.right &&
        edge.labelY >= bounds.top &&
        edge.labelY <= bounds.bottom,
    )
    .map((edge) => edge.id);
}

function normalizeRect(rect: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): { left: number; right: number; top: number; bottom: number } {
  return {
    left: Math.min(rect.x, rect.x + rect.width),
    right: Math.max(rect.x, rect.x + rect.width),
    top: Math.min(rect.y, rect.y + rect.height),
    bottom: Math.max(rect.y, rect.y + rect.height),
  };
}
