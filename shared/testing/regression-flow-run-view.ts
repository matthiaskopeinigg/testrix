import type { FlowStepRunCapture } from './flow-step-capture';
import type { RegressionFlowResult } from './regression-run.schema';
import { flattenEnabledFlowSteps } from './test-suite-flow-order';
import type { TestSuiteStepStatus, TestSuiteStepType } from './test-suite-steps.schema';
import type {
  TestSuiteFlow,
  TestSuiteFlowNode,
  TestSuiteFlowStep,
} from './test-suites.schema';
import { isFlowFolderNode } from './test-suites.schema';

/** Maps a finished regression flow status onto a test-suite last-run status. */
export function regressionFlowStatusToStepStatus(
  status: RegressionFlowResult['status'],
): TestSuiteStepStatus {
  if (status === 'passed') {
    return 'passed';
  }
  if (status === 'skipped') {
    return 'skipped';
  }
  return 'failed';
}

/**
 * Builds a Test Suite flow snapshot for the regression run log: current step
 * names/types with this run's statuses, captures, errors, and nested children.
 */
export function overlayRegressionResultOnFlow(
  flow: TestSuiteFlow | null,
  result: RegressionFlowResult,
  runStartedAt: string | null = null,
): TestSuiteFlow {
  const lastRunAt = flow?.lastRunAt ?? runStartedAt;
  const overlaid = flow ? flow.nodes.map((node) => overlayFlowNode(node, result)) : [];
  const knownIds = new Set(flattenEnabledFlowSteps(overlaid).map((step) => step.id));
  const extras = Object.keys(result.stepStatuses ?? {})
    .filter((stepId) => !knownIds.has(stepId))
    .map((stepId) => syntheticStepFromResult(stepId, result));

  return {
    id: result.flowId,
    name: result.flowName.trim() || flow?.name || result.flowId,
    description: flow?.description ?? '',
    tags: [...(flow?.tags ?? [])],
    environmentId: flow?.environmentId,
    isCritical: flow?.isCritical,
    e2eShowWindow: flow?.e2eShowWindow,
    e2eKeepWindowOpen: flow?.e2eKeepWindowOpen,
    lastRunStatus: regressionFlowStatusToStepStatus(result.status),
    lastRunAt,
    lastRunDurationMs: result.durationMs,
    nodes: [...overlaid, ...extras],
    updatedAt: flow?.updatedAt ?? lastRunAt ?? result.flowId,
  };
}

function overlayFlowNode(node: TestSuiteFlowNode, result: RegressionFlowResult): TestSuiteFlowNode {
  if (isFlowFolderNode(node)) {
    return {
      ...node,
      children: node.children.map((child) => overlayFlowNode(child, result)),
    };
  }
  return overlayFlowStep(node, result);
}

function overlayFlowStep(step: TestSuiteFlowStep, result: RegressionFlowResult): TestSuiteFlowStep {
  const status = result.stepStatuses?.[step.id];
  const capture = result.stepCaptures?.[step.id];
  const duration = result.stepDurations?.[step.id];
  const error = result.stepErrors?.[step.id];
  const children = result.nestedChildren?.[step.id];
  return {
    ...step,
    ...(status ? { lastRunStatus: status } : {}),
    ...(capture ? { lastRunCapture: capture } : {}),
    ...(duration != null && duration >= 0 ? { lastRunDurationMs: duration } : {}),
    ...(status === 'failed' && error
      ? { error }
      : status === 'passed' || status === 'skipped'
        ? { error: undefined }
        : {}),
    lastRunChildren: children && children.length > 0 ? [...children] : undefined,
  };
}

function syntheticStepFromResult(stepId: string, result: RegressionFlowResult): TestSuiteFlowStep {
  const status = result.stepStatuses?.[stepId] ?? 'never';
  const capture = result.stepCaptures?.[stepId];
  const duration = result.stepDurations?.[stepId];
  const error = result.stepErrors?.[stepId];
  const children = result.nestedChildren?.[stepId];
  const named = result.validationFailures.find((failure) => failure.stepId === stepId);
  return {
    id: stepId,
    type: 'step',
    name: named?.stepName.trim() || 'Step',
    parentId: null,
    stepType: inferStepType(capture, named != null),
    config: {},
    enabled: true,
    ...(status !== 'never' ? { lastRunStatus: status } : {}),
    ...(duration != null && duration >= 0 ? { lastRunDurationMs: duration } : {}),
    ...(capture ? { lastRunCapture: capture } : {}),
    ...(status === 'failed' && error ? { error } : {}),
    lastRunChildren: children && children.length > 0 ? [...children] : undefined,
  };
}

function inferStepType(capture: FlowStepRunCapture | undefined, isValidation: boolean): TestSuiteStepType {
  if (isValidation) {
    return 'VALIDATION';
  }
  if (capture?.kind === 'http_response') {
    return 'REQUEST';
  }
  if (capture?.kind === 'database_result') {
    return 'DATABASE';
  }
  if (capture?.kind === 'e2e_element') {
    return 'E2E';
  }
  return 'TRIGGER';
}
