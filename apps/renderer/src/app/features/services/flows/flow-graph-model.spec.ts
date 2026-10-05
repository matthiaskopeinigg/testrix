import { describe, expect, it } from 'vitest';

import { buildFlowRunPlan, emptyFlowGraphNode, flowNodePorts, isFlowContainerKind, type FlowGraphEdge, type FlowGraphNode } from '@testrix/contracts';

import {
  addNode,
  canConnect,
  connectNodes,
  duplicateNodes,
  insertOnEdge,
  moveNodes,
  nodesInRect,
  edgesInRect,
  patchNodeConfig,
  removeNodes,
  setNodesEnabled,
  splitFromNode,
  wouldCycle,
  type FlowGraph,
} from './flow-graph-model';

function node(id: string, kind: Parameters<typeof emptyFlowGraphNode>[0], x = 0, y = 0, parentId: string | null = null): FlowGraphNode {
  return { ...emptyFlowGraphNode(kind, { x, y }, parentId), id };
}

function edge(id: string, from: string, to: string, fromPort: FlowGraphEdge['fromPort'] = 'next'): FlowGraphEdge {
  return { id, from, fromPort, to };
}

const chain: FlowGraph = {
  nodes: [node('a', 'browser-open'), node('b', 'browser-click', 300), node('c', 'assert-text', 600)],
  edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
};

describe('connect', () => {
  it('refuses a connection that would close a cycle', () => {
    expect(wouldCycle(chain, 'c', 'a')).toBe(true);
    expect(canConnect(chain, 'c', 'next', 'a')).toBe(false);
    expect(connectNodes(chain, 'c', 'next', 'a').edges).toHaveLength(2);
  });

  it('refuses duplicates, self links, notes, and cross-scope links', () => {
    const graph: FlowGraph = {
      nodes: [node('a', 'wait'), node('n', 'note'), node('loop', 'for-each'), node('inner', 'wait', 0, 0, 'loop')],
      edges: [],
    };
    expect(canConnect(graph, 'a', 'next', 'a')).toBe(false);
    expect(canConnect(graph, 'a', 'next', 'n')).toBe(false);
    expect(canConnect(graph, 'a', 'next', 'inner')).toBe(false);
    expect(canConnect(chain, 'a', 'next', 'b')).toBe(false);
  });

  it('rejects a port the node does not expose', () => {
    expect(canConnect(chain, 'a', 'then', 'c')).toBe(false);
    expect(canConnect(chain, 'a', 'next', 'c')).toBe(true);
  });
});

describe('addNode and split', () => {
  it('wires a new node after the source port', () => {
    const result = addNode(chain, 'browser-type', { after: { id: 'c', port: 'next' } });
    expect(result.graph.nodes).toHaveLength(4);
    expect(result.graph.edges.some((item) => item.from === 'c' && item.to === result.id)).toBe(true);
  });

  it('gives a container an empty body slot', () => {
    const result = addNode(chain, 'for-each', {});
    const child = result.graph.nodes.find((item) => item.parentId === result.id);
    expect(child).toBeDefined();
    expect(child?.kind).toBe('wait');
  });

  it('adds a docs group frame with no ports and no body wait', () => {
    const result = addNode(chain, 'group', {});
    const group = result.graph.nodes.find((item) => item.id === result.id);
    expect(group?.kind).toBe('group');
    expect(isFlowContainerKind('group')).toBe(false);
    expect(flowNodePorts('group')).toEqual([]);
    expect(result.graph.nodes.some((item) => item.parentId === result.id)).toBe(false);
  });

  it('splits a node into two branches that share a wave', () => {
    const split = splitFromNode(chain, 'a', 'browser-click');
    const plan = buildFlowRunPlan({ nodes: split.graph.nodes, edges: split.graph.edges });
    const waveOf = (id: string) => plan.steps.find((step) => step.nodeId === id)?.wave;

    expect(waveOf('b')).toBe(1);
    expect(waveOf(split.id)).toBe(1);
    // The new branch is placed clear of the existing one.
    expect(split.graph.nodes.find((item) => item.id === split.id)?.y).toBeGreaterThan(0);
  });

  it('places a dropped node clear of an existing sibling', () => {
    const graph: FlowGraph = {
      nodes: [node('a', 'browser-open', 120, 120)],
      edges: [],
    };
    const result = addNode(graph, 'browser-open', { at: { x: 120, y: 120 } });
    const placed = result.graph.nodes.find((item) => item.id === result.id)!;
    expect(placed.x !== 120 || placed.y !== 120).toBe(true);
  });

  it('allows a child to sit inside its container frame', () => {
    const graph: FlowGraph = {
      nodes: [node('loop', 'for-each', 100, 100), node('inner', 'wait', 40, 80, 'loop')],
      edges: [],
    };
    const next = moveNodes(graph, ['inner'], { x: 0, y: 0 });
    expect(next.nodes.find((item) => item.id === 'inner')).toMatchObject({ x: 40, y: 80 });
  });
});

describe('insertOnEdge', () => {
  it('rewires both sides through the new node', () => {
    const result = insertOnEdge(chain, 'e1', 'wait');
    expect(result.graph.edges.some((item) => item.id === 'e1')).toBe(false);
    expect(result.graph.edges.some((item) => item.from === 'a' && item.to === result.id)).toBe(true);
    expect(result.graph.edges.some((item) => item.from === result.id && item.to === 'b')).toBe(true);
  });

  it('ignores an unknown edge', () => {
    expect(insertOnEdge(chain, 'nope', 'wait').graph).toBe(chain);
  });
});

describe('removeNodes', () => {
  it('bridges the gap left behind', () => {
    const next = removeNodes(chain, ['b']);
    expect(next.nodes.map((item) => item.id)).toEqual(['a', 'c']);
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({ from: 'a', to: 'c' });
  });

  it('takes container children with the container', () => {
    const graph: FlowGraph = {
      nodes: [node('loop', 'for-each'), node('inner', 'wait', 0, 0, 'loop'), node('deep', 'wait', 0, 0, 'inner')],
      edges: [],
    };
    expect(removeNodes(graph, ['loop']).nodes).toEqual([]);
  });

  it('does not create a duplicate bridge', () => {
    const graph: FlowGraph = {
      nodes: [node('a', 'wait'), node('b', 'wait'), node('c', 'wait')],
      edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'a', 'c')],
    };
    expect(removeNodes(graph, ['b']).edges).toHaveLength(1);
  });
});

describe('duplicate, move, patch', () => {
  it('clones a container with its children and inner edges', () => {
    const graph: FlowGraph = {
      nodes: [node('loop', 'for-each'), node('i1', 'wait', 0, 0, 'loop'), node('i2', 'wait', 200, 0, 'loop')],
      edges: [edge('e1', 'i1', 'i2')],
    };
    const result = duplicateNodes(graph, ['loop']);
    expect(result.graph.nodes).toHaveLength(6);
    expect(result.graph.edges).toHaveLength(2);
    const clonedChildren = result.graph.nodes.filter((item) => item.parentId === result.id);
    expect(clonedChildren).toHaveLength(2);
  });

  it('moves a selection and snaps it', () => {
    const next = moveNodes(chain, ['a'], { x: 33, y: 27 });
    expect(next.nodes[0]).toMatchObject({ x: 40, y: 20 });
  });

  it('can skip collision while dragging so the preview follows the pointer', () => {
    const graph: FlowGraph = {
      nodes: [node('a', 'browser-open', 100, 100), node('b', 'wait', 100, 100)],
      edges: [],
    };
    const next = moveNodes(graph, ['a'], { x: 0, y: 0 }, { resolveCollisions: false });
    expect(next.nodes.find((item) => item.id === 'a')).toMatchObject({ x: 100, y: 100 });
  });

  it('does not treat Start/End as obstacles', () => {
    const graph: FlowGraph = {
      nodes: [
        node('start', 'start', 100, 100),
        node('a', 'browser-open', 80, 80),
        node('end', 'end', 120, 120),
      ],
      edges: [],
    };
    const next = moveNodes(graph, ['a'], { x: 20, y: 20 });
    expect(next.nodes.find((item) => item.id === 'a')).toMatchObject({ x: 100, y: 100 });
  });

  it('lets docs frames stay under step nodes on drop', () => {
    const graph: FlowGraph = {
      nodes: [node('frame', 'group', 100, 100), node('a', 'browser-open', 100, 100)],
      edges: [],
    };
    const next = moveNodes(graph, ['frame'], { x: 0, y: 0 });
    expect(next.nodes.find((item) => item.id === 'frame')).toMatchObject({ x: 100, y: 100 });
  });

  it('does not shift a child twice when its container also moves', () => {
    const graph: FlowGraph = {
      nodes: [node('loop', 'for-each', 100, 100), node('inner', 'wait', 40, 80, 'loop')],
      edges: [],
    };
    const next = moveNodes(graph, ['loop', 'inner'], { x: 20, y: 20 });
    expect(next.nodes.find((item) => item.id === 'loop')).toMatchObject({ x: 120, y: 120 });
    expect(next.nodes.find((item) => item.id === 'inner')).toMatchObject({ x: 40, y: 80 });
  });

  it('merges config and toggles enabled', () => {
    const next = patchNodeConfig(chain, 'b', { selector: '#go' });
    expect(next.nodes[1]?.config['selector']).toBe('#go');
    expect(setNodesEnabled(next, ['b'], false).nodes[1]?.enabled).toBe(false);
  });
});

describe('nodesInRect', () => {
  it('selects only fully enclosed nodes', () => {
    const placed = [
      { id: 'a', x: 10, y: 10, width: 100, height: 50 },
      { id: 'b', x: 400, y: 10, width: 100, height: 50 },
    ];
    expect(nodesInRect(placed, { x: 0, y: 0, width: 200, height: 200 })).toEqual(['a']);
  });

  it('handles a rectangle dragged up and to the left', () => {
    const placed = [{ id: 'a', x: 10, y: 10, width: 100, height: 50 }];
    expect(nodesInRect(placed, { x: 200, y: 200, width: -220, height: -220 })).toEqual(['a']);
  });
});

describe('edgesInRect', () => {
  it('selects edges whose midpoint is inside the marquee', () => {
    const edges = [
      { id: 'e1', labelX: 50, labelY: 50 },
      { id: 'e2', labelX: 400, labelY: 50 },
    ];
    expect(edgesInRect(edges, { x: 0, y: 0, width: 100, height: 100 })).toEqual(['e1']);
  });
});
