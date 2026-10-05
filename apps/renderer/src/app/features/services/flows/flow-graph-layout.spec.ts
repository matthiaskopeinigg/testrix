import { describe, expect, it } from 'vitest';

import { emptyFlowGraphNode, type FlowGraphEdge, type FlowGraphNode } from '@testrix/contracts';

import {
  FLOW_NODE_HEIGHT,
  FLOW_NODE_WIDTH,
  autoLayoutScenario,
  edgesTouching,
  fitFlowLayout,
  flowEdgePath,
  layoutFlowGraph,
  snapToGrid,
} from './flow-graph-layout';

function node(id: string, kind: Parameters<typeof emptyFlowGraphNode>[0], x = 0, y = 0, parentId: string | null = null): FlowGraphNode {
  return { ...emptyFlowGraphNode(kind, { x, y }, parentId), id };
}

function edge(id: string, from: string, to: string, fromPort: FlowGraphEdge['fromPort'] = 'next'): FlowGraphEdge {
  return { id, from, fromPort, to };
}

describe('layoutFlowGraph', () => {
  it('anchors an edge on the matching output port', () => {
    const scenario = {
      nodes: [node('a', 'if', 0, 0), node('b', 'wait', 400, 0), node('c', 'wait', 400, 200)],
      edges: [edge('e1', 'a', 'b', 'then'), edge('e2', 'a', 'c', 'else')],
    };
    const layout = layoutFlowGraph(scenario);
    const thenEdge = layout.edges.find((item) => item.id === 'e1');
    const elseEdge = layout.edges.find((item) => item.id === 'e2');
    const source = layout.byId.get('a');

    expect(source?.outPorts.map((port) => port.port)).toEqual(['then', 'else']);
    expect(thenEdge?.path.startsWith(`M ${FLOW_NODE_WIDTH} `)).toBe(true);
    // Then sits above Else on the same node.
    expect(source!.outPorts[0]!.y).toBeLessThan(source!.outPorts[1]!.y);
    expect(elseEdge?.path).toContain('C');
  });

  it('grows a container around its children and offsets them', () => {
    const scenario = {
      nodes: [node('loop', 'for-each', 100, 100), node('inner', 'wait', 40, 80, 'loop')],
      edges: [],
    };
    const layout = layoutFlowGraph(scenario);
    const loop = layout.byId.get('loop')!;
    const inner = layout.byId.get('inner')!;

    expect(inner.x).toBeGreaterThan(loop.x);
    expect(inner.y).toBeGreaterThan(loop.y);
    expect(loop.width).toBeGreaterThan(FLOW_NODE_WIDTH);
    expect(loop.height).toBeGreaterThan(FLOW_NODE_HEIGHT);
    expect(inner.depth).toBe(1);
  });

  it('routes body edges from inside the container to children', () => {
    const scenario = {
      nodes: [
        node('loop', 'for-each', 100, 100),
        node('inner', 'wait', 40, 80, 'loop'),
        node('after', 'wait', 400, 100),
      ],
      edges: [edge('body', 'loop', 'inner', 'body'), edge('done', 'loop', 'after', 'done')],
    };
    const layout = layoutFlowGraph(scenario);
    const body = layout.edges.find((item) => item.id === 'body')!;
    const done = layout.edges.find((item) => item.id === 'done')!;
    const loop = layout.byId.get('loop')!;
    const inner = layout.byId.get('inner')!;

    expect(body.path.startsWith(`M ${loop.x + 24} `)).toBe(true);
    expect(body.path).toContain(`${inner.x}`);
    expect(done.path.startsWith(`M ${loop.x + loop.width} `)).toBe(true);
  });

  it('drops edges that point at a missing node', () => {
    const layout = layoutFlowGraph({ nodes: [node('a', 'wait')], edges: [edge('e1', 'a', 'gone')] });
    expect(layout.edges).toEqual([]);
  });
});

describe('autoLayoutScenario', () => {
  it('puts a split into one column and the join into the next', () => {
    const scenario = {
      nodes: [
        node('open', 'browser-open'),
        node('c1', 'browser-click'),
        node('c2', 'browser-click'),
        node('join', 'join'),
      ],
      edges: [
        edge('e1', 'open', 'c1'),
        edge('e2', 'open', 'c2'),
        edge('e3', 'c1', 'join'),
        edge('e4', 'c2', 'join'),
      ],
    };
    const next = autoLayoutScenario(scenario);
    const at = (id: string) => next.nodes.find((item) => item.id === id)!;

    expect(at('c1').x).toBe(at('c2').x);
    expect(at('c1').y).not.toBe(at('c2').y);
    expect(at('open').x).toBeLessThan(at('c1').x);
    expect(at('join').x).toBeGreaterThan(at('c1').x);
  });

  it('snaps every position to the grid', () => {
    const scenario = { nodes: [node('a', 'wait', 7, 13)], edges: [] };
    const next = autoLayoutScenario(scenario);
    expect(next.nodes[0]!.x).toBe(snapToGrid(next.nodes[0]!.x));
    expect(next.nodes[0]!.y).toBe(snapToGrid(next.nodes[0]!.y));
  });
});

describe('fitFlowLayout', () => {
  it('centers content and clamps the scale', () => {
    const layout = layoutFlowGraph({ nodes: [node('a', 'wait', 0, 0), node('b', 'wait', 4000, 3000)], edges: [] });
    const fit = fitFlowLayout(layout, { width: 800, height: 600 });
    expect(fit.scale).toBeGreaterThanOrEqual(0.3);
    expect(fit.scale).toBeLessThan(1);
  });

  it('does not upscale small graphs above 100%', () => {
    const layout = layoutFlowGraph({ nodes: [node('a', 'wait', 0, 0), node('b', 'wait', 200, 0)], edges: [] });
    const fit = fitFlowLayout(layout, { width: 1200, height: 800 });
    expect(fit.scale).toBe(1);
    expect(Number.isInteger(fit.panX)).toBe(true);
    expect(Number.isInteger(fit.panY)).toBe(true);
  });

  it('is a no-op for an empty graph', () => {
    expect(fitFlowLayout({ nodes: [] }, { width: 800, height: 600 })).toEqual({ scale: 1, panX: 0, panY: 0 });
  });
});

describe('helpers', () => {
  it('routes a cubic path between two points', () => {
    expect(flowEdgePath({ x: 0, y: 0 }, { x: 100, y: 40 })).toBe('M 0 0 C 46 0, 54 40, 100 40');
  });

  it('finds edges touching a node', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')];
    expect(edgesTouching(edges, ['a'])).toEqual(['e1']);
    expect(edgesTouching(edges, ['b'])).toEqual(['e1', 'e2']);
  });
});
