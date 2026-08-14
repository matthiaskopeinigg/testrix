import type { TestSuiteFlowNode } from '@shared/testing';
import { flattenFlowNodesInRunOrder, isFlowStepNode } from '@shared/testing';
import { flowNeedsBrowserRunner } from '@shared/testing';

/** True when the flow needs the E2E browser runner (E2E, listener, or interceptor steps). */
export function flowHasE2eSteps(nodes: readonly TestSuiteFlowNode[] | undefined): boolean {
  if (!nodes?.length) {
    return false;
  }
  const steps = flattenFlowNodesInRunOrder(nodes).filter(isFlowStepNode);
  return flowNeedsBrowserRunner(steps);
}
