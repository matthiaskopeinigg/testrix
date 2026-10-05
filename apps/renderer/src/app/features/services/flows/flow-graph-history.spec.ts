import { describe, expect, it } from 'vitest';

import { emptyFlowGraphNode } from '@testrix/contracts';

import { FlowGraphHistory, cloneFlowGraph } from './flow-graph-history';
import type { FlowGraph } from './flow-graph-model';

function graph(nodes: FlowGraph['nodes']): FlowGraph {
  return { nodes, edges: [] };
}

describe('FlowGraphHistory', () => {
  it('undoes and redoes graph commits', () => {
    const history = new FlowGraphHistory();
    const a = graph([{ ...emptyFlowGraphNode('wait'), id: 'a' }]);
    const b = graph([
      { ...emptyFlowGraphNode('wait'), id: 'a' },
      { ...emptyFlowGraphNode('wait'), id: 'b' },
    ]);

    history.beforeCommit(a);
    let current = cloneFlowGraph(b);

    const undone = history.undo(current);
    expect(undone?.nodes.map((node) => node.id)).toEqual(['a']);
    history.endApply();
    current = undone!;

    const redone = history.redo(current);
    expect(redone?.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    history.endApply();
  });

  it('clears redo when a new edit is committed after undo', () => {
    const history = new FlowGraphHistory();
    const a = graph([{ ...emptyFlowGraphNode('wait'), id: 'a' }]);
    const b = graph([{ ...emptyFlowGraphNode('wait'), id: 'b' }]);
    const c = graph([{ ...emptyFlowGraphNode('wait'), id: 'c' }]);

    history.beforeCommit(a);
    let current = cloneFlowGraph(b);
    const undone = history.undo(current)!;
    history.endApply();
    current = undone;

    history.beforeCommit(current);
    current = cloneFlowGraph(c);

    expect(history.redo(current)).toBeNull();
  });
});
