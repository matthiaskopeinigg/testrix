import type { FlowRunChildLog } from '@shared/testing';
import { flowRunChildLogId, flowRunChildTreeHasFailed } from '@shared/testing';

/** Whether a nested run-log node should start expanded. */
export function shouldAutoExpandFlowRunChild(node: FlowRunChildLog): boolean {
  return node.status === 'running' || flowRunChildTreeHasFailed(node);
}

/** Expand unless the user collapsed; honor an explicit expand. */
export function isFlowRunLogNodeExpanded(
  logId: string,
  autoExpand: boolean,
  expandedIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string>,
): boolean {
  if (collapsedIds.has(logId)) {
    return false;
  }
  return autoExpand || expandedIds.has(logId);
}

export interface VisibleFlowRunChildRow {
  readonly log: FlowRunChildLog;
  readonly logId: string;
  readonly depth: number;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
  readonly index: number;
}

/**
 * Flattens nested TRIGGER children for the run log, honoring expand/collapse.
 */
export function flattenVisibleFlowRunChildren(
  children: readonly FlowRunChildLog[],
  parentLogId: string,
  depth: number,
  expandedIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string>,
): VisibleFlowRunChildRow[] {
  const rows: VisibleFlowRunChildRow[] = [];
  children.forEach((child, index) => {
    const logId = flowRunChildLogId(parentLogId, child.id);
    const nested = child.children ?? [];
    const hasChildren = nested.length > 0;
    const expanded =
      hasChildren &&
      isFlowRunLogNodeExpanded(
        logId,
        shouldAutoExpandFlowRunChild(child),
        expandedIds,
        collapsedIds,
      );
    rows.push({
      log: child,
      logId,
      depth,
      expanded,
      hasChildren,
      index: index + 1,
    });
    if (expanded) {
      rows.push(
        ...flattenVisibleFlowRunChildren(nested, logId, depth + 1, expandedIds, collapsedIds),
      );
    }
  });
  return rows;
}
