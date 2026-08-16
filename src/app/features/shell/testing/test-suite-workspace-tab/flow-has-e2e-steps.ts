import type { TestSuiteFlowNode, TestSuiteTreeItem } from '@shared/testing';
import { flattenFlowNodesInRunOrder, flowNeedsBrowserRunnerDeep, isFlowStepNode } from '@shared/testing';

/**
 * True when the flow needs the E2E browser runner, including TRIGGER targets
 * that contain E2E, listener, or interceptor steps.
 */
export function flowHasE2eSteps(
  nodes: readonly TestSuiteFlowNode[] | undefined,
  suiteItems: readonly TestSuiteTreeItem[] = [],
): boolean {
  if (!nodes?.length) {
    return false;
  }
  const steps = flattenFlowNodesInRunOrder(nodes).filter(isFlowStepNode);
  return flowNeedsBrowserRunnerDeep(steps, suiteItems);
}
