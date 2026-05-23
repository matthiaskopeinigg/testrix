import {
  isFlowFolderNode,
  isTestSuiteFlow,
  isTestSuiteFolder,
  type TestSuiteFlow,
  type TestSuiteFlowNode,
  type TestSuiteFlowStep,
  type TestSuiteTreeItem,
} from './test-suites.schema';

function newCloneId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function copyLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? `${trimmed} (copy)` : name;
}

/** Remaps flow step tree ids and clears run metadata on the copy. */
export function cloneTestSuiteFlowStepTree(nodes: readonly TestSuiteFlowNode[]): TestSuiteFlowNode[] {
  const idMap = new Map<string, string>();
  const remapId = (oldId: string): string => {
    const existing = idMap.get(oldId);
    if (existing) {
      return existing;
    }
    const next = newCloneId();
    idMap.set(oldId, next);
    return next;
  };

  const walk = (list: readonly TestSuiteFlowNode[]): TestSuiteFlowNode[] =>
    list.map((node) => {
      if (isFlowFolderNode(node)) {
        const id = remapId(node.id);
        return {
          ...node,
          id,
          parentId: node.parentId ? remapId(node.parentId) : null,
          children: walk(node.children),
        };
      }
      const step = node as TestSuiteFlowStep;
      const id = remapId(step.id);
      return {
        ...structuredClone(step),
        id,
        name: copyLabel(step.name),
        parentId: step.parentId ? remapId(step.parentId) : null,
        lastRunStatus: 'never' as const,
        lastRunDurationMs: undefined,
        lastRunCapture: null,
        error: undefined,
      };
    });

  return walk(nodes);
}

/** Deep-clones a sidebar folder or flow with fresh ids. */
export function cloneTestSuiteTreeItem(item: TestSuiteTreeItem): TestSuiteTreeItem {
  const ts = new Date().toISOString();
  if (isTestSuiteFlow(item)) {
    return {
      ...structuredClone(item),
      id: newCloneId(),
      name: copyLabel(item.name),
      updatedAt: ts,
      lastRunStatus: 'never',
      lastRunAt: null,
      lastRunDurationMs: undefined,
      nodes: cloneTestSuiteFlowStepTree(item.nodes),
    };
  }
  if (isTestSuiteFolder(item)) {
    return {
      ...structuredClone(item),
      id: newCloneId(),
      name: copyLabel(item.name),
      updatedAt: ts,
      children: item.children.map((child) => cloneTestSuiteTreeItem(child)),
    };
  }
  return structuredClone(item);
}

/** Inserts a tree item immediately after `afterItemId` in the suite tree. */
export function insertTestSuiteTreeItemAfter(
  items: readonly TestSuiteTreeItem[],
  afterItemId: string,
  copy: TestSuiteTreeItem,
): TestSuiteTreeItem[] | null {
  const index = items.findIndex((entry) => entry.id === afterItemId);
  if (index >= 0) {
    const next = [...items];
    next.splice(index + 1, 0, copy);
    return next;
  }

  let inserted = false;
  const mapped = items.map((entry) => {
    if (!isTestSuiteFolder(entry) || inserted) {
      return entry;
    }
    const childNext = insertTestSuiteTreeItemAfter(entry.children, afterItemId, copy);
    if (childNext) {
      inserted = true;
      return { ...entry, children: childNext, updatedAt: new Date().toISOString() };
    }
    return entry;
  });

  return inserted ? mapped : null;
}
