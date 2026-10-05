import {
  buildFlowRunPlan,
  flowConfigNumber,
  flowNodePorts,
  isFlowFrameKind,
  isFlowNestKind,
  isFlowTerminalKind,
  FLOW_FRAME_DEFAULT_HEIGHT,
  FLOW_FRAME_DEFAULT_WIDTH,
  FLOW_FRAME_MIN_HEIGHT,
  FLOW_FRAME_MIN_WIDTH,
  type FlowGraphEdge,
  type FlowGraphNode,
  type FlowPort,
  type FlowScenario,
} from '@testrix/contracts';

export const FLOW_NODE_WIDTH = 208;
export const FLOW_NODE_HEIGHT = 64;
export const FLOW_TERMINAL_SIZE = 28;
export const FLOW_GRID = 20;
/** String notes get a taller card so documentation text wraps instead of truncating. */
export const FLOW_NOTE_WIDTH = 248;
export const FLOW_NOTE_HEIGHT = 96;

const COLUMN_GAP = 100;
const ROW_GAP = 72;
const PAD = 80;
const CONTAINER_PAD_X = 24;
const CONTAINER_HEAD = 56;
const CONTAINER_PAD_Y = 24;
const EDGE_PULL = 46;

export interface FlowLayoutPort {
  readonly port: FlowPort;
  readonly x: number;
  readonly y: number;
}

export interface FlowLayoutNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly inPort: { readonly x: number; readonly y: number };
  readonly outPorts: readonly FlowLayoutPort[];
}

export interface FlowLayoutEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly fromPort: FlowPort;
  readonly name: string;
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
}

export interface FlowLayout {
  readonly nodes: readonly FlowLayoutNode[];
  readonly edges: readonly FlowLayoutEdge[];
  readonly byId: ReadonlyMap<string, FlowLayoutNode>;
  readonly width: number;
  readonly height: number;
}

export function snapToGrid(value: number): number {
  return Math.round(value / FLOW_GRID) * FLOW_GRID;
}

function portOffsets(node: FlowGraphNode, height: number, width = FLOW_NODE_WIDTH): FlowLayoutPort[] {
  const ports = flowNodePorts(node.kind);
  if (ports.length === 0)
    return [];
  return ports.map((port, index) => ({
    port,
    x: width,
    y: ports.length === 1 ? height / 2 : (height / (ports.length + 1)) * (index + 1),
  }));
}

/** Cubic path from an output port to the left edge of the target. */
export function flowEdgePath(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): string {
  const dx = Math.max(EDGE_PULL, Math.abs(to.x - from.x) * 0.45);
  // When the target sits left of the source (body → child inside a frame), pull
  // the curve downward so the wire stays readable inside the container.
  if (to.x < from.x) {
    const midY = Math.max(from.y, to.y) + 28;
    return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
  }
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

/**
 * Anchor for an edge leaving `from`. Body edges into a child start under the
 * container header (inside the frame); Done / Next stay on the right wall.
 */
function edgeSourceAnchor(
  from: FlowLayoutNode,
  fromNode: FlowGraphNode,
  fromPort: FlowPort,
  toNode: FlowGraphNode,
): { readonly x: number; readonly y: number } | null {
  if (fromPort === 'body' && toNode.parentId === fromNode.id) {
    return {
      x: from.x + CONTAINER_PAD_X,
      y: from.y + CONTAINER_HEAD - 8,
    };
  }
  const port = from.outPorts.find((item) => item.port === fromPort) ?? from.outPorts[0];
  return port ?? null;
}

function containerBounds(
  container: FlowGraphNode,
  children: readonly FlowLayoutNode[],
): { readonly width: number; readonly height: number } {
  let fitted: { width: number; height: number };
  if (children.length === 0) {
    fitted = {
      width: FLOW_NODE_WIDTH + CONTAINER_PAD_X * 2,
      height: CONTAINER_HEAD + FLOW_NODE_HEIGHT + CONTAINER_PAD_Y,
    };
  } else {
    let right = 0;
    let bottom = 0;
    for (const child of children) {
      right = Math.max(right, child.x - container.x + child.width);
      bottom = Math.max(bottom, child.y - container.y + child.height);
    }
    fitted = { width: right + CONTAINER_PAD_X, height: bottom + CONTAINER_PAD_Y };
  }

  if (!isFlowFrameKind(container.kind))
    return fitted;

  const configuredW = flowConfigNumber(container, 'width', FLOW_FRAME_DEFAULT_WIDTH);
  const configuredH = flowConfigNumber(container, 'height', FLOW_FRAME_DEFAULT_HEIGHT);
  // Empty docs frames honor the configured size so users can shrink freely.
  if (children.length === 0) {
    return {
      width: Math.max(configuredW, FLOW_FRAME_MIN_WIDTH),
      height: Math.max(configuredH, FLOW_FRAME_MIN_HEIGHT),
    };
  }
  return {
    width: Math.max(fitted.width, configuredW, FLOW_FRAME_MIN_WIDTH),
    height: Math.max(fitted.height, configuredH, FLOW_FRAME_MIN_HEIGHT),
  };
}

/** Anchor Start / End to the left and right walls of the content bounds (fallback). */
function pinTerminalsToContent(
  placed: Map<string, FlowLayoutNode>,
  scenario: Pick<FlowScenario, 'nodes'>,
): void {
  const content: FlowLayoutNode[] = [];
  for (const node of scenario.nodes) {
    if (node.parentId !== null || isFlowTerminalKind(node.kind))
      continue;
    const layout = placed.get(node.id);
    if (layout)
      content.push(layout);
  }

  let minX = PAD;
  let maxX = PAD + FLOW_NODE_WIDTH;
  let midY = PAD + FLOW_NODE_HEIGHT / 2;
  if (content.length > 0) {
    minX = Math.min(...content.map((item) => item.x));
    maxX = Math.max(...content.map((item) => item.x + item.width));
    const minY = Math.min(...content.map((item) => item.y));
    const maxY = Math.max(...content.map((item) => item.y + item.height));
    midY = (minY + maxY) / 2;
  }

  const gap = 72;
  for (const node of scenario.nodes) {
    if (node.parentId !== null || !isFlowTerminalKind(node.kind))
      continue;
    const current = placed.get(node.id);
    if (!current)
      continue;
    const x = node.kind === 'start' ? minX - gap - FLOW_TERMINAL_SIZE : maxX + gap;
    const y = midY - FLOW_TERMINAL_SIZE / 2;
    placed.set(node.id, {
      ...current,
      x,
      y,
      inPort: { x, y: y + FLOW_TERMINAL_SIZE / 2 },
      outPorts: current.outPorts.map((port) => ({
        ...port,
        x: x + FLOW_TERMINAL_SIZE,
        y: y + FLOW_TERMINAL_SIZE / 2,
      })),
    });
  }
}

export interface FlowViewportPin {
  readonly panX: number;
  readonly panY: number;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  /** Screen-space padding from overlays (outline / inspector) so terminals stay in the clear. */
  readonly insetLeft?: number;
  readonly insetRight?: number;
}

/**
 * Pin Start / End to the visible left and right borders of the canvas viewport
 * (DaVinci Resolve style) so the graph can scroll forever between them.
 */
export function pinTerminalsToViewport(
  layout: FlowLayout,
  scenario: Pick<FlowScenario, 'nodes' | 'edges'>,
  view: FlowViewportPin,
): FlowLayout {
  if (view.width <= 0 || view.height <= 0 || view.scale <= 0)
    return layout;

  const inset = 18;
  const insetLeft = Math.max(0, view.insetLeft ?? 0);
  const insetRight = Math.max(0, view.insetRight ?? 0);
  const startX = (-view.panX + insetLeft) / view.scale + inset;
  const endX =
    (view.width - insetRight - view.panX) / view.scale - inset - FLOW_TERMINAL_SIZE;
  const midY = (view.height / 2 - view.panY) / view.scale - FLOW_TERMINAL_SIZE / 2;

  const placed = new Map(layout.byId);
  for (const node of scenario.nodes) {
    if (node.parentId !== null || !isFlowTerminalKind(node.kind))
      continue;
    const current = placed.get(node.id);
    if (!current)
      continue;
    const x = node.kind === 'start' ? startX : endX;
    const y = midY;
    placed.set(node.id, {
      ...current,
      x,
      y,
      inPort: { x, y: y + FLOW_TERMINAL_SIZE / 2 },
      outPorts: current.outPorts.map((port) => ({
        ...port,
        x: x + FLOW_TERMINAL_SIZE,
        y: y + FLOW_TERMINAL_SIZE / 2,
      })),
    });
  }

  const byNode = new Map(scenario.nodes.map((item) => [item.id, item]));
  const edges: FlowLayoutEdge[] = [];
  for (const edge of scenario.edges) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    const fromNode = byNode.get(edge.from);
    const toNode = byNode.get(edge.to);
    if (!from || !to || !fromNode || !toNode)
      continue;
    const anchor = edgeSourceAnchor(from, fromNode, edge.fromPort, toNode);
    if (!anchor)
      continue;
    edges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      fromPort: edge.fromPort,
      name: edge.name?.trim() ?? '',
      path: flowEdgePath(anchor, to.inPort),
      labelX: (anchor.x + to.inPort.x) / 2,
      labelY: (anchor.y + to.inPort.y) / 2 - 8,
    });
  }

  const nodes = [...placed.values()].sort((a, b) => a.depth - b.depth);
  let width = layout.width;
  let height = layout.height;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.width + PAD);
    height = Math.max(height, node.y + node.height + PAD);
  }

  return { nodes, edges, byId: placed, width, height };
}

/**
 * Measures every node and routes edges. Container nodes grow to wrap their
 * children, so a loop body reads as one block on the canvas.
 */
export function layoutFlowGraph(scenario: Pick<FlowScenario, 'nodes' | 'edges'>): FlowLayout {
  const byParent = new Map<string | null, FlowGraphNode[]>();
  for (const node of scenario.nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  const placed = new Map<string, FlowLayoutNode>();

  const measure = (parentId: string | null, offsetX: number, offsetY: number, depth: number): void => {
    for (const node of byParent.get(parentId) ?? []) {
      // Children store coords relative to the container content box. Legacy seeds
      // sometimes used near-absolute x/y; pull them back so frames stay compact.
      let localX = node.x;
      let localY = node.y;
      if (parentId) {
        const parent = scenario.nodes.find((item) => item.id === parentId);
        if (parent && (localX > FLOW_NODE_WIDTH * 2 || localY > FLOW_NODE_HEIGHT * 3)) {
          localX = Math.max(0, localX - parent.x);
          localY = Math.max(0, localY - parent.y);
        }
      }
      const absX = offsetX + localX;
      const absY = offsetY + localY;
      if (isFlowNestKind(node.kind)) {
        measure(node.id, absX + CONTAINER_PAD_X, absY + CONTAINER_HEAD, depth + 1);
        const children = (byParent.get(node.id) ?? [])
          .map((child) => placed.get(child.id))
          .filter((child): child is FlowLayoutNode => child !== undefined);
        const bounds = containerBounds({ ...node, x: absX, y: absY }, children);
        placed.set(node.id, {
          id: node.id,
          x: absX,
          y: absY,
          width: Math.max(bounds.width, FLOW_NODE_WIDTH),
          height: Math.max(bounds.height, FLOW_NODE_HEIGHT),
          depth,
          inPort: { x: absX, y: absY + FLOW_NODE_HEIGHT / 2 },
          outPorts: portOffsets(node, FLOW_NODE_HEIGHT, Math.max(bounds.width, FLOW_NODE_WIDTH)).map((port) => ({
            ...port,
            x: absX + port.x,
            y: absY + port.y,
          })),
        });
        continue;
      }
      if (isFlowTerminalKind(node.kind)) {
        placed.set(node.id, {
          id: node.id,
          x: absX,
          y: absY,
          width: FLOW_TERMINAL_SIZE,
          height: FLOW_TERMINAL_SIZE,
          depth,
          inPort: { x: absX, y: absY + FLOW_TERMINAL_SIZE / 2 },
          outPorts: portOffsets(node, FLOW_TERMINAL_SIZE, FLOW_TERMINAL_SIZE).map((port) => ({
            ...port,
            x: absX + FLOW_TERMINAL_SIZE,
            y: absY + port.y,
          })),
        });
        continue;
      }
      if (node.kind === 'note') {
        placed.set(node.id, {
          id: node.id,
          x: absX,
          y: absY,
          width: FLOW_NOTE_WIDTH,
          height: FLOW_NOTE_HEIGHT,
          depth,
          inPort: { x: absX, y: absY + FLOW_NOTE_HEIGHT / 2 },
          outPorts: [],
        });
        continue;
      }
      placed.set(node.id, {
        id: node.id,
        x: absX,
        y: absY,
        width: FLOW_NODE_WIDTH,
        height: FLOW_NODE_HEIGHT,
        depth,
        inPort: { x: absX, y: absY + FLOW_NODE_HEIGHT / 2 },
        outPorts: portOffsets(node, FLOW_NODE_HEIGHT).map((port) => ({
          ...port,
          x: absX + FLOW_NODE_WIDTH,
          y: absY + port.y,
        })),
      });
    }
  };

  measure(null, 0, 0, 0);
  pinTerminalsToContent(placed, scenario);

  const byNode = new Map(scenario.nodes.map((item) => [item.id, item]));
  const edges: FlowLayoutEdge[] = [];
  for (const edge of scenario.edges) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    const fromNode = byNode.get(edge.from);
    const toNode = byNode.get(edge.to);
    if (!from || !to || !fromNode || !toNode)
      continue;
    const anchor = edgeSourceAnchor(from, fromNode, edge.fromPort, toNode);
    if (!anchor)
      continue;
    edges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      fromPort: edge.fromPort,
      name: edge.name?.trim() ?? '',
      path: flowEdgePath(anchor, to.inPort),
      labelX: (anchor.x + to.inPort.x) / 2,
      labelY: (anchor.y + to.inPort.y) / 2 - 8,
    });
  }

  const nodes = [...placed.values()].sort((a, b) => a.depth - b.depth);
  let width = 0;
  let height = 0;
  for (const node of nodes) {
    width = Math.max(width, node.x + node.width + PAD);
    height = Math.max(height, node.y + node.height + PAD);
  }

  return { nodes, edges, byId: placed, width: Math.max(width, 640), height: Math.max(height, 400) };
}

/**
 * Assigns tidy grid positions from the run plan: one column per wave,
 * siblings stacked down the column. Runs per scope so loop bodies stay inside.
 */
export function autoLayoutScenario<T extends Pick<FlowScenario, 'nodes' | 'edges'>>(scenario: T): T {
  const positions = new Map<string, { x: number; y: number }>();

  const place = (parentId: string | null): void => {
    const scope = scenario.nodes.filter((node) => node.parentId === parentId);
    if (scope.length === 0)
      return;
    const plan = buildFlowRunPlan(scenario, parentId);
    const waveOf = new Map(plan.steps.map((step) => [step.nodeId, step.wave]));
    const maxWave = plan.steps.reduce((max, step) => Math.max(max, step.wave), 0);

    const rows = new Map<number, number>();
    const originX = parentId ? CONTAINER_PAD_X : PAD;
    const originY = parentId ? CONTAINER_HEAD : PAD;

    for (const node of scope) {
      // Unreachable and note nodes park in a trailing column.
      // Start sticks left; End sticks right of the last wave.
      let wave = waveOf.get(node.id) ?? maxWave + 1;
      if (node.kind === 'start')
        wave = -1;
      else if (node.kind === 'end')
        wave = maxWave + 1;
      const row = rows.get(wave) ?? 0;
      rows.set(wave, row + 1);
      positions.set(node.id, {
        x: originX + Math.max(0, wave) * (FLOW_NODE_WIDTH + COLUMN_GAP) + (wave < 0 ? -(FLOW_TERMINAL_SIZE + COLUMN_GAP) : 0),
        y: originY + row * (FLOW_NODE_HEIGHT + ROW_GAP),
      });
    }

    for (const node of scope) {
      if (isFlowNestKind(node.kind))
        place(node.id);
    }
  };

  place(null);

  // Stretch each wave column so a container's children never overlap the next column.
  const nodes = scenario.nodes.map((node) => {
    const next = positions.get(node.id);
    return next ? { ...node, x: snapToGrid(next.x), y: snapToGrid(next.y) } : node;
  });

  const spaced = spreadContainers(nodes);
  return { ...scenario, nodes: spaced };
}

function spreadContainers(nodes: readonly FlowGraphNode[]): FlowGraphNode[] {
  const childCount = new Map<string, number>();
  for (const node of nodes) {
    if (!node.parentId)
      continue;
    childCount.set(node.parentId, (childCount.get(node.parentId) ?? 0) + 1);
  }
  if (childCount.size === 0)
    return [...nodes];

  const extraByParent = new Map<string, number>();
  for (const [parentId, count] of childCount)
    extraByParent.set(parentId, Math.max(0, count - 1) * (FLOW_NODE_HEIGHT + ROW_GAP));

  return nodes.map((node) => {
    if (node.parentId)
      return node;
    const shift = [...extraByParent.entries()]
      .filter(([parentId]) => {
        const parent = nodes.find((item) => item.id === parentId);
        return parent !== undefined && parent.parentId === null && parent.y < node.y;
      })
      .reduce((sum, [, extra]) => sum + extra, 0);
    return shift > 0 ? { ...node, y: snapToGrid(node.y + shift) } : node;
  });
}

export interface FlowFitResult {
  readonly scale: number;
  readonly panX: number;
  readonly panY: number;
}

export const FLOW_MIN_SCALE = 0.3;
export const FLOW_MAX_SCALE = 2.2;

/** Centers the graph content in the viewport (Start/End terminals excluded). */
export function fitFlowLayout(
  layout: Pick<FlowLayout, 'nodes'>,
  viewport: { readonly width: number; readonly height: number },
  options: { readonly excludeTerminalIds?: ReadonlySet<string> } = {},
): FlowFitResult {
  if (layout.nodes.length === 0 || viewport.width <= 0 || viewport.height <= 0)
    return { scale: 1, panX: 0, panY: 0 };

  const exclude = options.excludeTerminalIds ?? new Set<string>();
  const content = layout.nodes.filter((node) => !exclude.has(node.id));
  const nodes = content.length > 0 ? content : layout.nodes;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const margin = 48;
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  // Prefer exact 1x when the graph nearly fits — fractional CSS scale softens node text.
  const raw = Math.min(
    1,
    Math.max(
      FLOW_MIN_SCALE,
      Math.min((viewport.width - margin * 2) / contentWidth, (viewport.height - margin * 2) / contentHeight),
    ),
  );
  const scale = raw > 0.97 ? 1 : Math.round(raw * 100) / 100;

  return {
    scale,
    panX: Math.round((viewport.width - contentWidth * scale) / 2 - minX * scale),
    panY: Math.round((viewport.height - contentHeight * scale) / 2 - minY * scale),
  };
}

/** Edge ids whose source or target is in the given set. */
export function edgesTouching(
  edges: readonly FlowGraphEdge[],
  nodeIds: readonly string[],
): readonly string[] {
  const set = new Set(nodeIds);
  return edges.filter((edge) => set.has(edge.from) || set.has(edge.to)).map((edge) => edge.id);
}
