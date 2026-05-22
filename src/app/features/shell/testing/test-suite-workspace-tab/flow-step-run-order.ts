import type { TestSuiteFlowNode } from '@shared/testing';
import { flattenEnabledFlowSteps, isFlowFolderNode, isFlowStepNode } from '@shared/testing';

/** Maps enabled step ids to 1-based run order index. */
export function buildFlowStepRunOrderIndex(
  nodes: readonly TestSuiteFlowNode[],
): Readonly<Record<string, number>> {
  const map: Record<string, number> = {};
  flattenEnabledFlowSteps(nodes).forEach((step, index) => {
    map[step.id] = index + 1;
  });
  return map;
}

/** Returns 1-based run order index for a step, or null for folders / disabled / missing. */
export function flowStepIndexInRunOrder(
  stepId: string,
  nodes: readonly TestSuiteFlowNode[],
): number | null {
  return buildFlowStepRunOrderIndex(nodes)[stepId] ?? null;
}

/** Finds any flow node (step or folder) by id. */
export function findFlowNodeById(
  nodes: readonly TestSuiteFlowNode[],
  nodeId: string,
): TestSuiteFlowNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    if (isFlowFolderNode(node)) {
      const found = findFlowNodeById(node.children, nodeId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Counts enabled steps in run order. */
export function countEnabledFlowSteps(nodes: readonly TestSuiteFlowNode[]): number {
  return flattenEnabledFlowSteps(nodes).length;
}

/** Whether the node id refers to a folder. */
export function isFlowFolderId(nodes: readonly TestSuiteFlowNode[], nodeId: string): boolean {
  const node = findFlowNodeById(nodes, nodeId);
  return node != null && isFlowFolderNode(node);
}

/** Whether the node id refers to a step. */
export function isFlowStepId(nodes: readonly TestSuiteFlowNode[], nodeId: string): boolean {
  const node = findFlowNodeById(nodes, nodeId);
  return node != null && isFlowStepNode(node);
}
