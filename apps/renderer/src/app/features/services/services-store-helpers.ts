import {
  findServiceNode,
  insertServiceChildAt,
  type FlowRunEventDetail,
  type RegressionMetricsSample,
  type RegressionSuiteEvent,
  type ServiceRuntimeStatus,
  type ServiceTreeNode,
  HISTORY_BODY_MAX_CHARS,
} from '@testrix/contracts';

import type { ServiceSort } from './services.store';

export const EMPTY_STATUS: ServiceRuntimeStatus = { running: false, label: 'Idle', error: null };

export function isServiceTreeDescendant(
  nodes: readonly ServiceTreeNode<Record<string, unknown>>[],
  ancestorId: string,
  candidateId: string,
): boolean {
  const ancestor = findServiceNode(nodes, ancestorId);
  if (!ancestor || ancestor.kind !== 'folder')
    return false;
  return findServiceNode(ancestor.children, candidateId) !== null;
}

export function insertServiceChildrenAt(
  nodes: readonly ServiceTreeNode<Record<string, unknown>>[],
  parentId: string | null,
  index: number,
  children: readonly ServiceTreeNode<Record<string, unknown>>[],
): ServiceTreeNode<Record<string, unknown>>[] {
  if (children.length === 0)
    return [...nodes];
  if (!parentId) {
    const next = [...nodes];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, ...children);
    return next;
  }
  let next: ServiceTreeNode<Record<string, unknown>>[] = [...nodes];
  for (let offset = 0; offset < children.length; offset += 1)
    next = insertServiceChildAt(next, parentId, index + offset, children[offset]!);
  return next;
}

/** Keeps folders ahead of artifacts at every depth (manual order within each band). */
export function ensureFoldersFirst<T>(nodes: readonly ServiceTreeNode<T>[]): ServiceTreeNode<T>[] {
  const folders: ServiceTreeNode<T>[] = [];
  const leaves: ServiceTreeNode<T>[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder')
      folders.push({ ...node, children: ensureFoldersFirst(node.children) });
    else
      leaves.push(node);
  }
  return [...folders, ...leaves];
}

export function sortTree<T>(nodes: readonly ServiceTreeNode<T>[], sort: ServiceSort): ServiceTreeNode<T>[] {
  if (sort === 'manual')
    return ensureFoldersFirst(nodes);
  const copy = nodes.map((node) =>
    node.kind === 'folder' ? { ...node, children: sortTree(node.children, sort) } : node,
  );
  copy.sort((a, b) => {
    if (a.kind !== b.kind)
      return a.kind === 'folder' ? -1 : 1;
    if (sort === 'updated')
      return b.updatedAt.localeCompare(a.updatedAt);
    return a.name.localeCompare(b.name);
  });
  return copy;
}

export function flowRunKey(flowId: string, scenarioId: string): string {
  return `${flowId}:${scenarioId}`;
}

export function capFlowExchangeDetail(detail: FlowRunEventDetail): FlowRunEventDetail {
  return {
    ...detail,
    body: detail.body !== undefined ? detail.body.slice(0, HISTORY_BODY_MAX_CHARS) : undefined,
    requestBody:
      detail.requestBody !== undefined ? detail.requestBody.slice(0, HISTORY_BODY_MAX_CHARS) : undefined,
  };
}

/** Derives a live metrics snapshot from a regression suite event, preferring its latest sample. */
export function buildRegressionLiveMetrics(event: RegressionSuiteEvent): RegressionMetricsSample {
  const latest = event.samples?.[event.samples.length - 1];
  if (latest)
    return latest;
  const passed = event.passed ?? 0;
  const failed = event.failed ?? 0;
  const skipped = event.skipped ?? 0;
  const decided = passed + failed;
  return {
    elapsedSec: event.elapsedSec ?? 0,
    completedFlows: event.completed ?? passed + failed + skipped,
    passedFlows: passed,
    failedFlows: failed,
    skippedFlows: skipped,
    activeParallelism: event.activeParallelism ?? 0,
    passRatePercent: decided > 0 ? (passed / decided) * 100 : 0,
    avgFlowDurationMs: 0,
  };
}

/**
 * Hub drill-in, workspace service files, and runtime status.
 */
