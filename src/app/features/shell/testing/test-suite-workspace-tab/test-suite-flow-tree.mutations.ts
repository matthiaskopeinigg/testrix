import type { TxTreeDropContext } from '@app/shared/components/tx-tree/tx-tree.types';

import type { FlowStepTreeMeta, FlowStepTreeNode } from './test-suite-flow-tree.adapter';

export interface FlowStepTreeNodeLocation {
  readonly node: FlowStepTreeNode;
  readonly parent: FlowStepTreeNode | null;
}

/** Finds a flow step tree node by id. */
export function findFlowStepTreeNode(
  nodes: readonly FlowStepTreeNode[],
  id: string,
): FlowStepTreeNodeLocation | null {
  for (const node of nodes) {
    if (node.id === id) {
      return { node, parent: null };
    }
  }
  return null;
}

/** Drop guard for flat flow step reordering. */
export function flowStepCanDrop(
  _nodes: readonly FlowStepTreeNode[],
  ctx: TxTreeDropContext<FlowStepTreeMeta>,
): boolean {
  if (ctx.sourceId === ctx.targetId) {
    return false;
  }
  return ctx.position !== 'inside';
}
