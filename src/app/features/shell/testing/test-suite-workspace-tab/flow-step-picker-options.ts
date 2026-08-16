import {
  flattenEnabledFlowSteps,
  isFlowValidationReferenceStepType,
  isTestSuiteFlow,
  isTestSuiteFolder,
  type TestSuiteFlow,
  type TestSuiteTreeItem,
} from '@shared/testing';

import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';

import { toTestSuiteTreeNodes } from '../test-suite-sidebar-panel/test-suite-tree.adapter';
import type { TestSuiteTreeNode } from '../test-suite-sidebar-panel/test-suite-tree.types';

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

/** Drops a flow from the suite tree (used so a TRIGGER cannot pick its own flow). */
export function omitFlowFromSuiteTree(
  items: readonly TestSuiteTreeItem[],
  flowId: string,
): TestSuiteTreeItem[] {
  const out: TestSuiteTreeItem[] = [];
  for (const item of items) {
    if (isTestSuiteFlow(item)) {
      if (item.id !== flowId) {
        out.push(item);
      }
      continue;
    }
    if (isTestSuiteFolder(item)) {
      out.push({
        ...item,
        children: omitFlowFromSuiteTree(item.children, flowId),
      });
    }
  }
  return out;
}

/** Suite tree for the TRIGGER target picker (searchable folders + flows). */
export function buildTriggerTargetTree(
  items: readonly TestSuiteTreeItem[],
  targetType: 'flow' | 'folder',
  currentFlowId: string,
): TestSuiteTreeNode[] {
  const source =
    targetType === 'flow' && currentFlowId.trim()
      ? omitFlowFromSuiteTree(items, currentFlowId)
      : items;
  return toTestSuiteTreeNodes(source);
}
