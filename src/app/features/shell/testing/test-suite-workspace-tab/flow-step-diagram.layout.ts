import {
  isFlowControlStepType,
  isFlowFolderNode,
  isFlowLaneNode,
  isFlowStepNode,
  type TestSuiteFlowNode,
  type TestSuiteFlowStep,
} from '@shared/testing';

export type FlowDiagramShape = 'rect' | 'diamond' | 'bar' | 'lane';

export interface FlowDiagramLayoutNode {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly shape: FlowDiagramShape;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly selectable: boolean;
}

export interface FlowDiagramLayoutEdge {
  readonly id: string;
  readonly d: string;
  readonly label?: string;
  readonly labelX?: number;
  readonly labelY?: number;
}

export interface FlowDiagramLayout {
  readonly nodes: readonly FlowDiagramLayoutNode[];
  readonly edges: readonly FlowDiagramLayoutEdge[];
  readonly width: number;
  readonly height: number;
}

/** Sequential leaf steps wrap after this many columns. */
export const FLOW_DIAGRAM_ROW_COLUMNS = 4;

const RECT_W = 168;
const RECT_H = 36;
const DIAMOND = 48;
const BAR_H = 10;
const LANE_H = 22;
const GAP_X = 24;
const GAP_Y = 36;
const PAD = 24;

interface PlacedBlock {
  readonly width: number;
  readonly height: number;
  readonly firstId: string | null;
  readonly lastId: string | null;
}

/**
 * Flowchart of nested steps: sequential leaves wrap into rows, IF lanes sit
 * side by side, PARALLEL children sit in columns.
 */
export function layoutFlowStepDiagram(
  nodes: readonly TestSuiteFlowNode[],
  columns = FLOW_DIAGRAM_ROW_COLUMNS,
): FlowDiagramLayout {
  const cols = Math.max(2, columns);
  const rowWidth = cols * RECT_W + (cols - 1) * GAP_X;
  const outNodes: FlowDiagramLayoutNode[] = [];
  const outEdges: FlowDiagramLayoutEdge[] = [];

  layoutSequence(nodes, PAD, PAD, rowWidth);

  function layoutSequence(
    items: readonly TestSuiteFlowNode[],
    originX: number,
    originY: number,
    maxWidth: number,
  ): PlacedBlock {
    let x = originX;
    let y = originY;
    let rowHeight = 0;
    let maxX = originX;
    let firstId: string | null = null;
    let prevId: string | null = null;

    const wrapRow = (): void => {
      if (x === originX) {
        return;
      }
      x = originX;
      y += rowHeight + GAP_Y;
      rowHeight = 0;
    };

    for (const item of items) {
      const estimated = estimateWidth(item, maxWidth);
      if (x > originX && x + estimated > originX + maxWidth) {
        wrapRow();
      }
      const placed = layoutBlock(item, x, y, maxWidth);
      if (!placed.firstId) {
        continue;
      }
      if (prevId) {
        connect(prevId, placed.firstId);
      }
      firstId ??= placed.firstId;
      prevId = placed.lastId ?? placed.firstId;
      x += placed.width + GAP_X;
      rowHeight = Math.max(rowHeight, placed.height);
      maxX = Math.max(maxX, x - GAP_X);
    }

    return {
      width: Math.max(maxX - originX, 0),
      height: rowHeight === 0 ? 0 : y + rowHeight - originY,
      firstId,
      lastId: prevId,
    };
  }

  function layoutBlock(node: TestSuiteFlowNode, x: number, y: number, maxWidth: number): PlacedBlock {
    if (isFlowFolderNode(node)) {
      return layoutSequence(node.children, x, y, maxWidth);
    }
    if (isFlowLaneNode(node)) {
      return layoutLane(node.id, node.name, node.children, x, y, Math.min(maxWidth, RECT_W * 2 + GAP_X));
    }
    if (!isFlowStepNode(node)) {
      return emptyBlock();
    }
    if (node.stepType === 'IF') {
      return layoutIf(node, x, y, maxWidth);
    }
    if (node.stepType === 'PARALLEL') {
      return layoutParallel(node, x, y, maxWidth);
    }
    if (node.stepType === 'FOR_EACH' || node.stepType === 'WHILE' || node.stepType === 'RETRY') {
      return layoutLoop(node, x, y, maxWidth);
    }
    return layoutLeaf(node, x, y);
  }

  function layoutLeaf(step: TestSuiteFlowStep, x: number, y: number): PlacedBlock {
    const laid = pushNode({
      id: step.id,
      label: diagramLabel(step.name.trim() || step.stepType),
      title: step.name.trim() || step.stepType,
      shape: 'rect',
      x,
      y,
      width: RECT_W,
      height: RECT_H,
      selectable: true,
    });
    return { width: RECT_W, height: RECT_H, firstId: laid.id, lastId: laid.id };
  }

  function layoutLane(
    id: string,
    name: string,
    children: readonly TestSuiteFlowNode[],
    x: number,
    y: number,
    maxWidth: number,
  ): PlacedBlock {
    const header = pushNode({
      id,
      label: name,
      title: name,
      shape: 'lane',
      x,
      y,
      width: RECT_W,
      height: LANE_H,
      selectable: false,
    });
    const body = layoutSequence(children, x, y + LANE_H + GAP_Y * 0.6, maxWidth);
    if (body.firstId) {
      connect(header.id, body.firstId);
    }
    return {
      width: Math.max(RECT_W, body.width),
      height: LANE_H + (body.height > 0 ? GAP_Y * 0.6 + body.height : 0),
      firstId: header.id,
      lastId: body.lastId ?? header.id,
    };
  }

  function layoutIf(step: TestSuiteFlowStep, x: number, y: number, maxWidth: number): PlacedBlock {
    const lanes = (step.children ?? []).filter(isFlowLaneNode);
    const laneMax = Math.min(RECT_W * 2 + GAP_X, Math.max(RECT_W, maxWidth / Math.max(lanes.length, 1) - GAP_X));
    const laneY = y + DIAMOND + GAP_Y;
    let laneX = x;
    let maxLaneH = 0;
    const laneBlocks: PlacedBlock[] = [];

    for (const lane of lanes) {
      const block = layoutLane(lane.id, lane.name, lane.children, laneX, laneY, laneMax);
      laneBlocks.push(block);
      laneX += block.width + GAP_X;
      maxLaneH = Math.max(maxLaneH, block.height);
    }

    const contentW = lanes.length === 0 ? DIAMOND : laneX - x - GAP_X;
    const diamond = pushNode({
      id: step.id,
      label: diagramLabel(step.name.trim() || 'IF', 10),
      title: step.name.trim() || 'IF',
      shape: 'diamond',
      x: x + Math.max(0, (contentW - DIAMOND) / 2),
      y,
      width: DIAMOND,
      height: DIAMOND,
      selectable: true,
    });

    for (let i = 0; i < lanes.length; i++) {
      const first = laneBlocks[i]?.firstId;
      if (first) {
        connect(diamond.id, first, lanes[i]?.name);
      }
    }

    const joinY = laneY + maxLaneH + GAP_Y * 0.7;
    const joinW = Math.min(Math.max(contentW, RECT_W), maxWidth || RECT_W);
    const join = pushNode({
      id: `${step.id}__join`,
      label: '',
      title: '',
      shape: 'bar',
      x: x + Math.max(0, (contentW - joinW) / 2),
      y: joinY,
      width: joinW,
      height: BAR_H,
      selectable: false,
    });
    for (const block of laneBlocks) {
      if (block.lastId) {
        connect(block.lastId, join.id);
      }
    }

    return {
      width: Math.max(contentW, DIAMOND),
      height: joinY + BAR_H - y,
      firstId: diamond.id,
      lastId: join.id,
    };
  }

  function layoutParallel(step: TestSuiteFlowStep, x: number, y: number, maxWidth: number): PlacedBlock {
    const children = step.children ?? [];
    const childY = y + BAR_H + GAP_Y;
    let childX = x;
    let maxH = 0;
    const firsts: string[] = [];
    const lasts: string[] = [];
    for (const child of children) {
      const placed = layoutBlock(child, childX, childY, RECT_W * 2 + GAP_X);
      if (placed.firstId) {
        firsts.push(placed.firstId);
      }
      if (placed.lastId) {
        lasts.push(placed.lastId);
      }
      childX += Math.max(placed.width, RECT_W) + GAP_X;
      maxH = Math.max(maxH, placed.height);
    }
    const contentW = Math.max(children.length === 0 ? RECT_W : childX - x - GAP_X, RECT_W);
    const bar = pushNode({
      id: step.id,
      label: '',
      title: step.name.trim() || 'PARALLEL',
      shape: 'bar',
      x,
      y,
      width: Math.min(contentW, maxWidth || contentW),
      height: BAR_H,
      selectable: true,
    });
    for (const firstId of firsts) {
      connect(bar.id, firstId);
    }
    if (children.length === 0) {
      return { width: contentW, height: BAR_H, firstId: bar.id, lastId: bar.id };
    }
    const joinY = childY + maxH + GAP_Y * 0.7;
    const join = pushNode({
      id: `${step.id}__join`,
      label: '',
      title: '',
      shape: 'bar',
      x,
      y: joinY,
      width: contentW,
      height: BAR_H,
      selectable: false,
    });
    for (const lastId of lasts) {
      connect(lastId, join.id);
    }
    return {
      width: contentW,
      height: joinY + BAR_H - y,
      firstId: bar.id,
      lastId: join.id,
    };
  }

  function layoutLoop(step: TestSuiteFlowStep, x: number, y: number, maxWidth: number): PlacedBlock {
    const header = pushNode({
      id: step.id,
      label: diagramLabel(step.name.trim() || step.stepType),
      title: step.name.trim() || step.stepType,
      shape: 'rect',
      x,
      y,
      width: RECT_W,
      height: RECT_H,
      selectable: true,
    });
    const bodyNodes =
      (step.children ?? []).find((child) => isFlowLaneNode(child) && child.laneKind === 'body')?.children ??
      step.children ??
      [];
    const body = layoutSequence(bodyNodes, x, y + RECT_H + GAP_Y, maxWidth);
    if (body.firstId) {
      connect(header.id, body.firstId, 'Body');
    }
    return {
      width: Math.max(RECT_W, body.width),
      height: RECT_H + (body.height > 0 ? GAP_Y + body.height : 0),
      firstId: header.id,
      lastId: body.lastId ?? header.id,
    };
  }

  function pushNode(node: FlowDiagramLayoutNode): FlowDiagramLayoutNode {
    outNodes.push(node);
    return node;
  }

  function connect(fromId: string, toId: string, label?: string): void {
    const from = outNodes.find((entry) => entry.id === fromId);
    const to = outNodes.find((entry) => entry.id === toId);
    if (!from || !to) {
      return;
    }
    const d = pathBetween(from, to);
    const labelX = (from.x + from.width / 2 + to.x + to.width / 2) / 2;
    const labelY = Math.min(from.y + from.height, to.y) - 4;
    outEdges.push({
      id: `${fromId}->${toId}`,
      d,
      label,
      labelX,
      labelY: labelY < to.y ? to.y - 10 : labelY,
    });
  }

  const maxX = outNodes.reduce((acc, node) => Math.max(acc, node.x + node.width), PAD);
  const maxY = outNodes.reduce((acc, node) => Math.max(acc, node.y + node.height), PAD);

  return {
    nodes: outNodes,
    edges: outEdges,
    width: Math.max(maxX + PAD, 360),
    height: Math.max(maxY + PAD, 200),
  };
}

function emptyBlock(): PlacedBlock {
  return { width: 0, height: 0, firstId: null, lastId: null };
}

function estimateWidth(node: TestSuiteFlowNode, maxWidth: number): number {
  if (isFlowFolderNode(node) || isFlowLaneNode(node)) {
    return Math.min(maxWidth, RECT_W);
  }
  if (!isFlowStepNode(node)) {
    return RECT_W;
  }
  if (isFlowControlStepType(node.stepType)) {
    return maxWidth;
  }
  return RECT_W;
}

function diagramLabel(text: string, max = 22): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

function pathBetween(from: FlowDiagramLayoutNode, to: FlowDiagramLayoutNode): string {
  const fromCx = from.x + from.width / 2;
  const fromCy = from.y + from.height / 2;
  const fromRight = from.x + from.width;
  const fromBottom = from.y + from.height;
  const toCx = to.x + to.width / 2;
  const toTop = to.y;
  const toLeft = to.x;
  const toCy = to.y + to.height / 2;

  const sameRow = Math.abs(fromCy - toCy) <= Math.max(from.height, to.height) * 0.6;
  const toTheRight = to.x >= from.x + from.width - 8;
  const below = to.y >= from.y + from.height - 8;

  if (sameRow && toTheRight) {
    const midX = (fromRight + toLeft) / 2;
    return `M ${fromRight} ${fromCy} L ${midX} ${fromCy} L ${midX} ${toCy} L ${toLeft} ${toCy}`;
  }
  if (below && Math.abs(fromCx - toCx) < 20) {
    const midY = (fromBottom + toTop) / 2;
    return `M ${fromCx} ${fromBottom} L ${fromCx} ${midY} L ${toCx} ${midY} L ${toCx} ${toTop}`;
  }
  const dropY = Math.max(fromBottom + 12, (fromBottom + toTop) / 2);
  return `M ${fromRight} ${fromCy} L ${fromRight + 12} ${fromCy} L ${fromRight + 12} ${dropY} L ${toCx} ${dropY} L ${toCx} ${toTop}`;
}
