import type { FlowGraphEdge, FlowGraphNode } from '@testrix/contracts';

import type { FlowGraph } from './flow-graph-model';

const DEFAULT_MAX = 50;

/** Deep-ish clone of a flow graph for undo/redo snapshots. */
export function cloneFlowGraph(graph: FlowGraph): FlowGraph {
  return {
    nodes: graph.nodes.map(
      (node): FlowGraphNode => ({
        ...node,
        config: { ...node.config },
      }),
    ),
    edges: graph.edges.map((edge): FlowGraphEdge => ({ ...edge })),
  };
}

/**
 * Linear undo/redo stack for flow canvas edits.
 * Call {@link beforeCommit} with the current graph before applying a new one.
 */
export class FlowGraphHistory {
  private past: FlowGraph[] = [];
  private future: FlowGraph[] = [];
  private applying = false;

  constructor(private readonly maxDepth = DEFAULT_MAX) {}

  clear(): void {
    this.past = [];
    this.future = [];
    this.applying = false;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Snapshot `current` before replacing it with a new graph. No-op during undo/redo. */
  beforeCommit(current: FlowGraph): void {
    if (this.applying)
      return;
    this.past.push(cloneFlowGraph(current));
    if (this.past.length > this.maxDepth)
      this.past.shift();
    this.future = [];
  }

  undo(current: FlowGraph): FlowGraph | null {
    const prev = this.past.pop();
    if (!prev)
      return null;
    this.future.push(cloneFlowGraph(current));
    this.applying = true;
    return prev;
  }

  redo(current: FlowGraph): FlowGraph | null {
    const next = this.future.pop();
    if (!next)
      return null;
    this.past.push(cloneFlowGraph(current));
    this.applying = true;
    return next;
  }

  /** Call after applying an undo/redo snapshot via commit. */
  endApply(): void {
    this.applying = false;
  }
}
