import { resolveTriggerTargetFlows } from './collect-trigger-targets';
import { flowNeedsBrowserRunner } from './flow-http-middleware-config';
import { flattenEnabledFlowSteps } from './test-suite-flow-order';
import { triggerStepConfigSchema } from './test-suite-steps.schema';
import type { TestSuiteFlow, TestSuiteTreeItem } from './test-suites.schema';

type FlowBrowserWalkStep = {
  readonly stepType: string;
  readonly config?: unknown;
};

type FlowBrowserWalkFlow = Pick<TestSuiteFlow, 'id' | 'nodes' | 'e2eShowWindow' | 'e2eKeepWindowOpen'>;

/**
 * True when these steps, or any TRIGGER target they resolve, need the E2E runner.
 */
export function flowNeedsBrowserRunnerDeep(
  steps: readonly FlowBrowserWalkStep[],
  suiteItems: readonly TestSuiteTreeItem[],
  visitingFlowIds: ReadonlySet<string> = new Set(),
): boolean {
  if (flowNeedsBrowserRunner(steps)) {
    return true;
  }
  return walkTriggerTargets(
    steps,
    suiteItems,
    visitingFlowIds,
    (_nestedFlow, nestedSteps, visiting) =>
      flowNeedsBrowserRunnerDeep(nestedSteps, suiteItems, visiting),
  );
}

/**
 * True when this flow wants the E2E window visible.
 *
 * TRIGGER children do not affect this: the root run pins Show E2E onto nested flows.
 */
export function flowRunWantsVisibleE2eWindow(
  flow: FlowBrowserWalkFlow,
  _suiteItems?: readonly TestSuiteTreeItem[],
  _visitingFlowIds?: ReadonlySet<string>,
): boolean {
  return flow.e2eShowWindow !== false;
}

/**
 * True when this flow wants the E2E window left open after the run.
 *
 * TRIGGER children do not affect this: the root run pins Keep E2E onto nested flows.
 */
export function flowRunWantsKeepE2eWindow(
  flow: FlowBrowserWalkFlow,
  _suiteItems?: readonly TestSuiteTreeItem[],
  _visitingFlowIds?: ReadonlySet<string>,
): boolean {
  return flow.e2eKeepWindowOpen === true;
}

/**
 * Resolves TRIGGER targets and visits each unvisited flow until `visit` returns true.
 */
function walkTriggerTargets(
  steps: readonly FlowBrowserWalkStep[],
  suiteItems: readonly TestSuiteTreeItem[],
  visitingFlowIds: ReadonlySet<string>,
  visit: (
    flow: FlowBrowserWalkFlow,
    nestedSteps: ReturnType<typeof flattenEnabledFlowSteps>,
    visiting: Set<string>,
  ) => boolean,
): boolean {
  const visiting = visitingFlowIds instanceof Set ? visitingFlowIds : new Set(visitingFlowIds);
  for (const step of steps) {
    if (step.stepType !== 'TRIGGER') {
      continue;
    }
    const parsed = triggerStepConfigSchema.safeParse(step.config ?? {});
    if (!parsed.success) {
      continue;
    }
    const resolved = resolveTriggerTargetFlows(suiteItems, {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
    });
    if (!resolved.ok) {
      continue;
    }
    for (const location of resolved.locations) {
      if (visiting.has(location.flow.id)) {
        continue;
      }
      visiting.add(location.flow.id);
      const nestedSteps = flattenEnabledFlowSteps(location.flow.nodes);
      if (visit(location.flow, nestedSteps, visiting)) {
        return true;
      }
    }
  }
  return false;
}
