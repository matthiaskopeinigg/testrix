import { z } from 'zod';

import { flowStepRunCaptureSchema, type FlowStepRunCapture } from './flow-step-capture';
import {
  testSuiteStepStatusSchema,
  testSuiteStepTypeSchema,
  type TestSuiteStepStatus,
  type TestSuiteStepType,
} from './test-suite-steps.schema';

const boundedText = (max: number) => z.string().max(max);

/**
 * Nested TRIGGER run log node (a child flow, or a step inside a triggered flow).
 */
export type FlowRunChildLog = {
  readonly kind: 'step' | 'flow';
  readonly id: string;
  readonly flowId: string;
  readonly flowName: string;
  readonly name: string;
  readonly stepType?: TestSuiteStepType;
  readonly status: TestSuiteStepStatus;
  readonly durationMs?: number;
  readonly error?: string;
  readonly lastRunCapture?: FlowStepRunCapture | null;
  readonly children?: readonly FlowRunChildLog[];
};

/** Persisted / IPC tree of nested TRIGGER children. */
export const flowRunChildLogSchema: z.ZodType<FlowRunChildLog> = z.lazy(() =>
  z.object({
    kind: z.enum(['step', 'flow']),
    id: z.string().min(1),
    flowId: z.string().min(1),
    flowName: boundedText(256).default(''),
    name: boundedText(256),
    stepType: testSuiteStepTypeSchema.optional(),
    status: testSuiteStepStatusSchema,
    durationMs: z.number().int().min(0).optional(),
    error: boundedText(4_000).optional(),
    lastRunCapture: flowStepRunCaptureSchema.nullable().optional(),
    children: z.array(flowRunChildLogSchema).optional(),
  }),
);

/** TRIGGER step id → nested run log children. */
export const flowRunNestedChildrenSchema = z.record(z.string(), z.array(flowRunChildLogSchema));

export type FlowRunNestedChildren = Readonly<Record<string, readonly FlowRunChildLog[]>>;

/** Builds a unique run-log row id for a nested child under `parentLogId`. */
export function flowRunChildLogId(parentLogId: string, childId: string): string {
  return `${parentLogId}::${childId}`;
}

/** Walks nested children and returns the node whose computed log id matches. */
export function findFlowRunChildByLogId(
  children: readonly FlowRunChildLog[],
  logId: string,
  parentLogId: string,
): FlowRunChildLog | null {
  for (const child of children) {
    const id = flowRunChildLogId(parentLogId, child.id);
    if (id === logId) {
      return child;
    }
    const nested = findFlowRunChildByLogId(child.children ?? [], logId, id);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/** True when this node or any descendant failed. */
export function flowRunChildTreeHasFailed(node: FlowRunChildLog): boolean {
  if (node.status === 'failed') {
    return true;
  }
  return (node.children ?? []).some(flowRunChildTreeHasFailed);
}

/** Log id of the first failed descendant in run order (prefers nested leaves). */
export function firstFailedFlowRunChildLogId(
  children: readonly FlowRunChildLog[],
  parentLogId: string,
): string | null {
  for (const child of children) {
    const id = flowRunChildLogId(parentLogId, child.id);
    const nested = firstFailedFlowRunChildLogId(child.children ?? [], id);
    if (nested) {
      return nested;
    }
    if (child.status === 'failed') {
      return id;
    }
  }
  return null;
}

/** Status of a parent flow group from its child steps. */
export function rollupFlowRunChildStatus(
  children: readonly FlowRunChildLog[],
): TestSuiteStepStatus {
  if (children.some((child) => child.status === 'running')) {
    return 'running';
  }
  if (children.some((child) => child.status === 'failed')) {
    return 'failed';
  }
  if (children.some((child) => child.status === 'waiting')) {
    return 'waiting';
  }
  if (children.length > 0 && children.every((child) => child.status === 'skipped')) {
    return 'skipped';
  }
  if (children.length > 0 && children.every((child) => child.status === 'passed' || child.status === 'skipped')) {
    return 'passed';
  }
  return 'waiting';
}

/** Copies a nested tree without captures (used on live progress events). */
export function stripFlowRunChildLogCaptures(
  children: readonly FlowRunChildLog[],
): FlowRunChildLog[] {
  return children.map((child) => ({
    ...child,
    lastRunCapture: undefined,
    children: child.children ? stripFlowRunChildLogCaptures(child.children) : undefined,
  }));
}
