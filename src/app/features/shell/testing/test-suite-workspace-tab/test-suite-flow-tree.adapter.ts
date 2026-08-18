import type { TestSuiteFlowLane, TestSuiteFlowNode, TestSuiteFlowStep } from '@shared/testing';
import {
  isFlowFolderNode,
  isFlowLaneNode,
  isFlowStepNode,
  isFlowControlStepType,
  type TestSuiteStepType,
  type ValidationStepConfig,
  type CacheStepConfig,
  type FlowLaneKind,
} from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import type { TxTreeNode } from '@app/shared/components/data/tx-tree/tx-tree.types';

import {
  flowStepPrimaryLabel,
  flowStepTreeSubtitle,
} from './flow-step-labels';

export interface FlowStepTreeMeta {
  readonly kind: 'step' | 'folder' | 'lane';
  readonly stepType?: TestSuiteStepType;
  readonly laneKind?: FlowLaneKind;
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
    case 'IF':
      return 'gitBranch';
    case 'FOR_EACH':
      return 'list';
    case 'WHILE':
      return 'clock';
    case 'PARALLEL':
      return 'layers';
    case 'RETRY':
      return 'refresh';
    default:
      return 'layers';
  }
}

function collectStepsById(nodes: readonly TestSuiteFlowNode[]): Map<string, TestSuiteFlowStep> {
  const map = new Map<string, TestSuiteFlowStep>();
  const walk = (items: readonly TestSuiteFlowNode[]): void => {
    for (const node of items) {
      if (isFlowStepNode(node)) {
        map.set(node.id, node);
        if (node.children?.length) {
          walk(node.children);
        }
      } else {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return map;
}

function toFlowStepTreeNode(
  node: TestSuiteFlowNode,
  stepById: ReadonlyMap<string, TestSuiteFlowStep>,
): FlowStepTreeNode {
  if (isFlowLaneNode(node)) {
    return {
      id: node.id,
      label: node.name,
      kind: 'folder',
      icon: 'gitBranch',
      draggable: false,
      droppable: true,
      expandable: true,
      children: node.children.map((child) => toFlowStepTreeNode(child, stepById)),
      subtitle: node.children.length === 0 ? 'Drop a step here' : undefined,
      data: { kind: 'lane', laneKind: node.laneKind },
    };
  }
  if (isFlowFolderNode(node)) {
    return {
      id: node.id,
      label: node.name,
      kind: 'folder',
      icon: 'folder',
      expandable: true,
      children: node.children.map((child) => toFlowStepTreeNode(child, stepById)),
      data: { kind: 'folder' },
    };
  }
  const subtitle = flowStepTreeSubtitle(node, stepById);
  const refStepId =
    node.stepType === 'VALIDATION' || node.stepType === 'CACHE'
      ? ((node.config as ValidationStepConfig | CacheStepConfig).refStepId ?? null)
      : null;
  const nested = node.children?.map((child) => toFlowStepTreeNode(child, stepById));
  return {
    id: node.id,
    label: flowStepPrimaryLabel(node.name, node.stepType),
    subtitle,
    kind: 'step',
    icon: iconForStepType(node.stepType),
    disabled: false,
    expandable: Boolean(nested?.length) || isFlowControlStepType(node.stepType),
    children: nested,
    data: {
      kind: 'step',
      stepType: node.stepType,
      enabled: node.enabled,
      lastRunStatus: node.lastRunStatus,
      refStepId,
    },
  };
}

/** Maps the nested flow graph to tx-tree nodes. Lanes stay as droppable non-step rows. */
export function toFlowStepTreeNodes(nodes: readonly TestSuiteFlowNode[]): FlowStepTreeNode[] {
  const stepById = collectStepsById(nodes);
  return nodes.map((node) => toFlowStepTreeNode(node, stepById));
}

function fromFlowStepTreeNode(
  node: FlowStepTreeNode,
  existingById: ReadonlyMap<string, TestSuiteFlowNode>,
): TestSuiteFlowNode {
  const prev = existingById.get(node.id);
  const children = node.children?.map((child) => fromFlowStepTreeNode(child, existingById)) ?? [];
  if (node.data?.kind === 'lane' || prev?.type === 'lane') {
    const lane = prev && isFlowLaneNode(prev) ? prev : null;
    return {
      id: node.id,
      type: 'lane',
      laneKind: node.data?.laneKind ?? lane?.laneKind ?? 'then',
      name: lane?.name ?? node.label,
      parentId: lane?.parentId ?? null,
      children,
      condition: lane?.condition,
    } satisfies TestSuiteFlowLane;
  }
  if (node.data?.kind === 'folder' || prev?.type === 'folder') {
    const folder = prev && isFlowFolderNode(prev) ? prev : null;
    return {
      id: node.id,
      type: 'folder',
      name: folder?.name ?? node.label,
      parentId: folder?.parentId ?? null,
      children,
      expanded: folder?.expanded ?? true,
    };
  }
  const step = prev && isFlowStepNode(prev) ? prev : null;
  const stepType = node.data?.stepType ?? step?.stepType ?? 'REQUEST';
  return {
    id: node.id,
    type: 'step',
    name: step?.name ?? node.label,
    parentId: step?.parentId ?? null,
    stepType,
    config: step?.config ?? {},
    enabled: step?.enabled ?? true,
    lastRunStatus: step?.lastRunStatus ?? 'never',
    error: step?.error,
    skipUnless: step?.skipUnless,
    children: children.length > 0 ? children : step?.children,
  };
}

function indexExistingNodes(nodes: readonly TestSuiteFlowNode[]): Map<string, TestSuiteFlowNode> {
  const map = new Map<string, TestSuiteFlowNode>();
  const walk = (items: readonly TestSuiteFlowNode[]): void => {
    for (const node of items) {
      map.set(node.id, node);
      if (isFlowStepNode(node) && node.children?.length) {
        walk(node.children);
      } else if (!isFlowStepNode(node)) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return map;
}

/** Merges tree structure with existing flow nodes (preserves configs and lanes). */
export function fromFlowStepTreeNodesWithExisting(
  treeNodes: readonly FlowStepTreeNode[],
  existingNodes: readonly TestSuiteFlowNode[],
): TestSuiteFlowNode[] {
  const existingById = indexExistingNodes(existingNodes);
  return treeNodes.map((node) => fromFlowStepTreeNode(node, existingById));
}
