import {
  flattenEnabledFlowSteps,
  isFlowValidationReferenceStepType,
  isTestSuiteFlow,
  isTestSuiteFolder,
  type TestSuiteFlow,
  type TestSuiteTreeItem,
} from '@shared/testing';

import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';

import { FLOW_STEP_GUIDED_TITLES } from './flow-step-labels';

/** Prior capturable steps in run order before the current step (for validation ref picker). */
export function buildValidationRefStepOptions(
  flow: TestSuiteFlow,
  currentStepId: string,
): readonly TxDropdownOption[] {
  const options: TxDropdownOption[] = [];
  for (const step of flattenEnabledFlowSteps(flow.nodes)) {
    if (step.id === currentStepId) {
      break;
    }
    if (!isFlowValidationReferenceStepType(step.stepType)) {
      continue;
    }
    options.push({
      value: step.id,
      label: step.name?.trim() || FLOW_STEP_GUIDED_TITLES[step.stepType],
    });
  }
  return options;
}

/** Prior steps in run order before the current step (for validation ref picker). */
export function buildPriorStepOptions(flow: TestSuiteFlow, currentStepId: string): readonly TxDropdownOption[] {
  const options: TxDropdownOption[] = [];
  for (const step of flattenEnabledFlowSteps(flow.nodes)) {
    if (step.id === currentStepId) {
      break;
    }
    options.push({
      value: step.id,
      label: step.name?.trim() || FLOW_STEP_GUIDED_TITLES[step.stepType],
    });
  }
  return options;
}

/** Lists flows or folders from the test suite tree for trigger targets. */
export function buildTriggerTargetOptions(
  items: readonly TestSuiteTreeItem[],
  targetType: 'flow' | 'folder',
): readonly TxDropdownOption[] {
  const options: TxDropdownOption[] = [];

  const walk = (nodes: readonly TestSuiteTreeItem[]): void => {
    for (const node of nodes) {
      if (targetType === 'flow' && isTestSuiteFlow(node)) {
        options.push({ value: node.id, label: node.name });
      }
      if (isTestSuiteFolder(node)) {
        if (targetType === 'folder') {
          options.push({ value: node.id, label: node.name });
        }
        walk(node.children);
      }
    }
  };

  walk(items);
  return options;
}
