import type { TestSuiteFlow, TestSuiteFlowNode, TestSuiteStepStatus } from '@shared/testing';
import {
  flattenEnabledFlowSteps,
  flattenFlowNodesInRunOrder,
  formatFlowRunDuration,
  formatFlowRunTimestamp,
  isFlowStepNode,
} from '@shared/testing';

import type { TxTagVariant } from '@app/shared/components/tx-tag/tx-tag.component';

export interface FlowRunProgress {
  readonly total: number;
  readonly completed: number;
  readonly percent: number;
}

export interface FlowRunSummary {
  readonly status: TestSuiteStepStatus;
  readonly statusVariant: TxTagVariant;
  readonly statusLabel: string;
  readonly durationLabel: string | null;
  readonly runAtLabel: string | null;
  readonly countsLabel: string | null;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
}

const TERMINAL_STEP_STATUSES = new Set<TestSuiteStepStatus>(['passed', 'failed', 'skipped']);

/** Computes enabled-step completion for an in-flight or live-updated flow run. */
export function buildFlowRunProgress(
  nodes: readonly TestSuiteFlowNode[],
  liveStepStatuses: Readonly<Record<string, TestSuiteStepStatus>>,
): FlowRunProgress | null {
  const steps = flattenEnabledFlowSteps(nodes);
  if (steps.length === 0) {
    return null;
  }

  const completed = steps.filter((step) => {
    const status = liveStepStatuses[step.id] ?? step.lastRunStatus ?? 'never';
    return TERMINAL_STEP_STATUSES.has(status);
  }).length;

  const total = steps.length;
  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/** Builds header run summary from flow metadata and step statuses. */
export function buildFlowRunSummary(flow: TestSuiteFlow): FlowRunSummary | null {
  if (!flow.lastRunAt) {
    return null;
  }

  const steps = flattenFlowNodesInRunOrder(flow.nodes).filter(isFlowStepNode);
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const step of steps) {
    switch (step.lastRunStatus) {
      case 'passed':
        passed += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      default:
        break;
    }
  }

  const status = flow.lastRunStatus ?? 'never';
  const durationLabel =
    flow.lastRunDurationMs != null && flow.lastRunDurationMs >= 0
      ? formatFlowRunDuration(flow.lastRunDurationMs)
      : null;
  const runAtLabel = flow.lastRunAt ? formatFlowRunTimestamp(flow.lastRunAt) : null;

  const parts: string[] = [];
  if (passed > 0) {
    parts.push(`${passed} passed`);
  }
  if (failed > 0) {
    parts.push(`${failed} failed`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} skipped`);
  }

  return {
    status,
    statusVariant: flowStatusVariant(status),
    statusLabel: flowStatusLabel(status),
    durationLabel,
    runAtLabel,
    countsLabel: parts.length > 0 ? parts.join(' · ') : null,
    passedCount: passed,
    failedCount: failed,
    skippedCount: skipped,
  };
}

function flowStatusVariant(status: TestSuiteStepStatus): TxTagVariant {
  switch (status) {
    case 'passed':
      return 'success';
    case 'failed':
      return 'error';
    case 'running':
    case 'waiting':
      return 'info';
    case 'skipped':
      return 'warning';
    default:
      return 'default';
  }
}

function flowStatusLabel(status: TestSuiteStepStatus): string {
  switch (status) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'waiting':
      return 'Waiting';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Not run';
  }
}

/** Collects folder ids in a flow graph for expansion persistence. */
export function collectFlowFolderIds(nodes: readonly TestSuiteFlowNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type === 'folder') {
      ids.push(node.id);
      ids.push(...collectFlowFolderIds(node.children));
    }
  }
  return ids;
}
