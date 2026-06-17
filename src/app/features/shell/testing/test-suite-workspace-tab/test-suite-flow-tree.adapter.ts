import type { TestSuiteFlowNode, TestSuiteFlowStep } from '@shared/testing';
import { isFlowStepNode, normalizeFlowStepNodes } from '@shared/testing';
import type { TestSuiteStepType, ValidationStepConfig, CacheStepConfig } from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import type { TxTreeNode } from '@app/shared/components/tx-tree/tx-tree.types';

import {
  flowStepPrimaryLabel,
  flowStepTreeSubtitle,
} from './flow-step-labels';

export interface FlowStepTreeMeta {
  readonly kind: 'step';
  readonly stepType?: TestSuiteStepType;
  readonly enabled?: boolean;
  readonly lastRunStatus?: string;
  readonly refStepId?: string | null;
}

export type FlowStepTreeNode = TxTreeNode<FlowStepTreeMeta>;

function iconForStepType(stepType: TestSuiteStepType): TxIconName {
  switch (stepType) {
    case 'REQUEST':
      return 'http';
    case 'VALIDATION':
      return 'checkCircle';
    case 'CACHE':
      return 'bookmark';
    case 'WAIT':
      return 'clock';
    case 'E2E':
      return 'globe';
    case 'DATABASE':
      return 'database';
    case 'TRIGGER':
      return 'zap';
    case 'HTTP_LISTENER':
      return 'filter';
    case 'HTTP_INTERCEPTOR':
      return 'interceptor';
    default:
      return 'layers';
  }
}

/** Maps flow steps to a flat tx-tree list (folders are hoisted away). */
export function toFlowStepTreeNodes(nodes: readonly TestSuiteFlowNode[]): FlowStepTreeNode[] {
  const steps = normalizeFlowStepNodes(nodes);
  const stepById = new Map(steps.map((step) => [step.id, step]));
  return steps.map((step) => toFlowStepTreeNode(step, stepById));
}

function toFlowStepTreeNode(
  step: TestSuiteFlowStep,
  stepById: ReadonlyMap<string, TestSuiteFlowStep>,
): FlowStepTreeNode {
  const subtitle = flowStepTreeSubtitle(step, stepById);
  const refStepId =
    step.stepType === 'VALIDATION' || step.stepType === 'CACHE'
      ? ((step.config as ValidationStepConfig | CacheStepConfig).refStepId ?? null)
      : null;
  return {
    id: step.id,
    label: flowStepPrimaryLabel(step.name, step.stepType),
    subtitle,
    kind: 'step',
    icon: iconForStepType(step.stepType),
    disabled: !step.enabled,
    data: {
      kind: 'step',
      stepType: step.stepType,
      enabled: step.enabled,
      lastRunStatus: step.lastRunStatus,
      refStepId,
    },
  };
}

function fromFlowStepTreeNode(
  node: FlowStepTreeNode,
  existing?: TestSuiteFlowStep,
): TestSuiteFlowStep {
  const prev = existing && isFlowStepNode(existing) ? existing : null;
  const stepType = node.data?.stepType ?? prev?.stepType ?? 'REQUEST';
  return {
    id: node.id,
    type: 'step',
    name: prev?.name ?? node.label,
    parentId: null,
    stepType,
    config: prev?.config ?? {},
    enabled: prev?.enabled ?? true,
    lastRunStatus: prev?.lastRunStatus ?? 'never',
    error: prev?.error,
  } as TestSuiteFlowStep;
}

/** Merges tree structure with existing flow steps (preserves step configs). */
export function fromFlowStepTreeNodesWithExisting(
  treeNodes: readonly FlowStepTreeNode[],
  existingNodes: readonly TestSuiteFlowNode[],
): TestSuiteFlowNode[] {
  const existingById = new Map<string, TestSuiteFlowStep>();
  for (const step of normalizeFlowStepNodes(existingNodes)) {
    existingById.set(step.id, step);
  }
  return treeNodes.map((node) => fromFlowStepTreeNode(node, existingById.get(node.id)));
}
