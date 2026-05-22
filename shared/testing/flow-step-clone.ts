import { findFlowStepById } from './test-suite-flow-order';
import {
  isFlowFolderNode,
  type TestSuiteFlowNode,
  type TestSuiteFlowStep,
} from './test-suites.schema';

/** Inserts a node immediately after `afterNodeId` in the flow tree. */
export function insertFlowNodeAfter(
  nodes: readonly TestSuiteFlowNode[],
  afterNodeId: string,
  node: TestSuiteFlowNode,
): TestSuiteFlowNode[] | null {
  const index = nodes.findIndex((entry) => entry.id === afterNodeId);
  if (index >= 0) {
    const next = [...nodes];
    next.splice(index + 1, 0, node);
    return next;
  }

  let inserted = false;
  const mapped = nodes.map((entry) => {
    if (!isFlowFolderNode(entry) || inserted) {
      return entry;
    }
    const childNext = insertFlowNodeAfter(entry.children, afterNodeId, node);
    if (childNext) {
      inserted = true;
      return { ...entry, children: childNext };
    }
    return entry;
  });

  return inserted ? mapped : null;
}

/** Creates a copy of a flow step with fresh id and cleared run metadata. */
export function cloneFlowStep(source: TestSuiteFlowStep, newId: string): TestSuiteFlowStep {
  const trimmed = source.name.trim();
  return {
    ...source,
    id: newId,
    name: trimmed.length > 0 ? `${trimmed} copy` : source.name,
    config: structuredClone(source.config),
    enabled: source.enabled,
    parentId: source.parentId,
    lastRunStatus: 'never',
    lastRunDurationMs: undefined,
    lastRunCapture: null,
    error: undefined,
  };
}

/** Duplicates a flow step as the next sibling in run order. */
export function cloneFlowStepNode(
  nodes: readonly TestSuiteFlowNode[],
  stepId: string,
  newId: string,
): { readonly nodes: TestSuiteFlowNode[]; readonly step: TestSuiteFlowStep } | null {
  const source = findFlowStepById(nodes, stepId);
  if (!source) {
    return null;
  }

  const step = cloneFlowStep(source, newId);
  const nextNodes = insertFlowNodeAfter(nodes, stepId, step);
  if (!nextNodes) {
    return null;
  }

  return { nodes: nextNodes, step };
}
