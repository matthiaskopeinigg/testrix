import { Injectable, computed, inject, signal } from '@angular/core';

import {
  TEST_SUITE_ROOT_ID,
  createDefaultTestSuitesFile,
  createFlowFolder,
  createFlowStep,
  isTestSuiteFlow,
  isTestSuiteFolder,
  cloneTestSuiteTreeItem,
  insertTestSuiteTreeItemAfter,
  migrateTestSuitesFile,
  testSuitesFileSchema,
  type TestSuiteFlow,
  type TestSuiteFlowNode,
  type TestSuiteFlowStep,
  type TestSuiteRoot,
  type TestSuiteStepStatus,
  type TestSuiteStepType,
  type TestSuiteTreeItem,
  type TestSuitesFile,
  cloneFlowStepNode,
} from '@shared/testing';
import {
  findFlowStepById,
  isFlowFolderNode,
  isFlowStepNode,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import {
  fromTestSuiteTreeNodesWithExisting,
  toTestSuiteTreeNodes,
} from '@app/features/shell/testing/test-suite-sidebar-panel/test-suite-tree.adapter';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.test-suites.v1';

/**
 * Persists and mutates the workspace test suite tree and flow graphs.
 */
@Injectable({ providedIn: 'root' })
export class TestSuiteService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<TestSuitesFile | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };

  readonly rootSuite = computed((): TestSuiteRoot | null => {
    const file = this.fileState();
    if (!file) {
      return null;
    }
    return file.suites.find((s) => s.id === TEST_SUITE_ROOT_ID) ?? file.suites[0] ?? null;
  });

  readonly flows = computed(() => this.rootSuite()?.flows ?? []);

  readonly nodes = computed(() => toTestSuiteTreeNodes(this.flows()));

  readonly allTags = computed(() => {
    const tags = new Set<string>();
    const walk = (items: readonly TestSuiteTreeItem[]): void => {
      for (const item of items) {
        for (const tag of item.tags ?? []) {
          tags.add(tag);
        }
        if (isTestSuiteFolder(item)) {
          walk(item.children);
        }
      }
    };
    walk(this.flows());
    return [...tags].sort((a, b) => a.localeCompare(b));
  });

  async hydrate(): Promise<void> {
    return runTestingHydrateOnce(
      () => this.fileState() !== null,
      this.hydrateInflight,
      async () => {
        const api = this.electron.bridge()?.testing;
        if (!api) {
          this.loadBrowserFallback();
          return;
        }
        try {
          const file = await api.getTestSuites();
          this.fileState.set(migrateTestSuitesFile(file));
        } catch (error: unknown) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultTestSuitesFile());
        }
      },
    );
  }

  saveTreeItems(items: readonly TestSuiteTreeItem[]): void {
    const root = this.rootSuite();
    if (!root) {
      return;
    }
    const ts = new Date().toISOString();
    this.patchRoot({ ...root, flows: [...items], updatedAt: ts });
  }

  saveNodesFromTree(treeNodes: ReturnType<typeof toTestSuiteTreeNodes>): void {
    this.saveTreeItems(fromTestSuiteTreeNodesWithExisting(treeNodes, this.flows()));
  }

  findFlow(id: string): TestSuiteFlow | null {
    const walk = (items: readonly TestSuiteTreeItem[]): TestSuiteFlow | null => {
      for (const item of items) {
        if (isTestSuiteFlow(item) && item.id === id) {
          return item;
        }
        if (isTestSuiteFolder(item)) {
          const found = walk(item.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    return walk(this.flows());
  }

  /** Returns the first flow in suite tree order (depth-first), or null when none exist. */
  firstFlow(): TestSuiteFlow | null {
    const walk = (items: readonly TestSuiteTreeItem[]): TestSuiteFlow | null => {
      for (const item of items) {
        if (isTestSuiteFlow(item)) {
          return item;
        }
        if (isTestSuiteFolder(item)) {
          const found = walk(item.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    return walk(this.flows());
  }

  findFolder(id: string): TestSuiteTreeItem & { children: readonly TestSuiteTreeItem[] } | null {
    const walk = (
      items: readonly TestSuiteTreeItem[],
    ): (TestSuiteTreeItem & { children: readonly TestSuiteTreeItem[] }) | null => {
      for (const item of items) {
        if (isTestSuiteFolder(item)) {
          if (item.id === id) {
            return item;
          }
          const found = walk(item.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    return walk(this.flows());
  }

  findFlowStep(flowId: string, stepId: string): TestSuiteFlowStep | null {
    const flow = this.findFlow(flowId);
    if (!flow) {
      return null;
    }
    return findFlowStepById(flow.nodes, stepId);
  }

  labelForResource(resourceId: string): string {
    if (resourceId.startsWith('ts:flw:')) {
      const id = resourceId.slice('ts:flw:'.length);
      return this.findFlow(id)?.name ?? 'Flow';
    }
    if (resourceId.startsWith('ts:fld:')) {
      const id = resourceId.slice('ts:fld:'.length);
      return this.findFolder(id)?.name ?? 'Folder';
    }
    return 'Test suite';
  }

  addFlow(name = 'New flow', parentId?: string): TestSuiteFlow | null {
    const ts = new Date().toISOString();
    const flow: TestSuiteFlow = {
      id: newTestingId(),
      name,
      description: '',
      tags: [],
      environmentId: null,
      e2eShowWindow: true,
      e2eKeepWindowOpen: false,
      lastRunStatus: 'never',
      lastRunAt: null,
      nodes: [],
      updatedAt: ts,
    };
    this.insertTreeItem(flow, parentId);
    return flow;
  }

  addFolder(name = 'New folder', parentId?: string): string | null {
    const ts = new Date().toISOString();
    const folder = {
      id: newTestingId(),
      name,
      description: '',
      tags: [],
      children: [],
      updatedAt: ts,
    };
    this.insertTreeItem(folder, parentId);
    return folder.id;
  }

  patchFlow(flowId: string, patch: Partial<Omit<TestSuiteFlow, 'id'>>): void {
    this.updateFlow(flowId, (flow) => ({
      ...flow,
      ...patch,
      id: flow.id,
      updatedAt: new Date().toISOString(),
    }));
  }

  patchFolder(folderId: string, patch: Partial<Omit<import('@shared/testing').TestSuiteFolder, 'id' | 'children'>>): void {
    const root = this.rootSuite();
    if (!root) {
      return;
    }
    const ts = new Date().toISOString();
    this.patchRoot({
      ...root,
      flows: this.mapTree(root.flows, (item) =>
        item.id === folderId && isTestSuiteFolder(item)
          ? { ...item, ...patch, id: item.id, children: item.children, updatedAt: ts }
          : item,
      ),
    });
  }

  addFlowStep(
    flowId: string,
    stepType: TestSuiteStepType,
    parentId: string | null,
    name?: string,
  ): TestSuiteFlowStep | null {
    const step = createFlowStep(stepType, name ?? defaultStepName(stepType), parentId);
    step.id = newTestingId();
    return this.insertFlowNode(flowId, parentId, step);
  }

  addFlowStepFolder(flowId: string, parentId: string | null, name = 'Folder'): TestSuiteFlowNode | null {
    const folder = createFlowFolder(name, parentId);
    const withId = { ...folder, id: newTestingId() };
    return this.insertFlowNode(flowId, parentId, withId);
  }

  updateFlowStep(flowId: string, stepId: string, patch: Partial<TestSuiteFlowStep>): void {
    this.updateFlow(flowId, (flow) => ({
      ...flow,
      nodes: patchFlowNode(flow.nodes, stepId, (node) =>
        isFlowStepNode(node) && node.id === stepId ? { ...node, ...patch, id: node.id } : node,
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  updateFlowFolder(flowId: string, folderId: string, patch: Partial<Pick<import('@shared/testing').TestSuiteFlowFolder, 'name'>>): void {
    this.updateFlow(flowId, (flow) => ({
      ...flow,
      nodes: patchFlowNode(flow.nodes, folderId, (node) =>
        isFlowFolderNode(node) && node.id === folderId ? { ...node, ...patch, id: node.id } : node,
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  deleteFlowNode(flowId: string, nodeId: string): void {
    this.updateFlow(flowId, (flow) => ({
      ...flow,
      nodes: removeFlowNode(flow.nodes, nodeId),
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Clones a flow step and inserts the copy immediately after the source step. */
  cloneFlowStep(flowId: string, stepId: string): TestSuiteFlowStep | null {
    let cloned: TestSuiteFlowStep | null = null;
    this.updateFlow(flowId, (flow) => {
      const result = cloneFlowStepNode(flow.nodes, stepId, newTestingId());
      if (!result) {
        return flow;
      }
      cloned = result.step;
      return { ...flow, nodes: result.nodes, updatedAt: new Date().toISOString() };
    });
    return cloned;
  }

  /** Applies in-memory step run statuses and captures from the flow executor (debounced save). */
  applyFlowRunStatuses(
    flowId: string,
    stepStatuses: Readonly<Record<string, TestSuiteStepStatus>>,
    ok: boolean,
    stepCaptures: Readonly<Record<string, import('@shared/testing').FlowStepRunCapture>> = {},
    stepDurations: Readonly<Record<string, number>> = {},
    stepErrors: Readonly<Record<string, string>> = {},
    durationMs = 0,
  ): void {
    const ts = new Date().toISOString();
    this.updateFlow(flowId, (flow) => ({
      ...flow,
      lastRunStatus: ok ? 'passed' : 'failed',
      lastRunAt: ts,
      lastRunDurationMs: durationMs >= 0 ? durationMs : 0,
      nodes: applyStepRunDataToNodes(flow.nodes, stepStatuses, stepCaptures, stepDurations, stepErrors),
      updatedAt: ts,
    }));
  }

  renameNode(itemId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const root = this.rootSuite();
    if (!root) {
      return;
    }
    const ts = new Date().toISOString();
    this.patchRoot({
      ...root,
      flows: this.mapTree(root.flows, (item) =>
        item.id === itemId ? { ...item, name: trimmed, updatedAt: ts } : item,
      ),
      updatedAt: ts,
    });
  }

  deleteTreeItem(itemId: string): void {
    const root = this.rootSuite();
    if (!root) {
      return;
    }
    const ts = new Date().toISOString();
    this.patchRoot({
      ...root,
      flows: removeTreeItem(root.flows, itemId),
      updatedAt: ts,
    });
  }

  /** Duplicates a folder or flow as the next sibling in the suite tree. */
  duplicateTreeItem(itemId: string): TestSuiteTreeItem | null {
    const root = this.rootSuite();
    if (!root) {
      return null;
    }
    const source = this.findTreeItem(itemId);
    if (!source) {
      return null;
    }
    const copy = cloneTestSuiteTreeItem(source);
    const nextFlows = insertTestSuiteTreeItemAfter(root.flows, itemId, copy);
    if (!nextFlows) {
      return null;
    }
    const ts = new Date().toISOString();
    this.patchRoot({ ...root, flows: nextFlows, updatedAt: ts });
    return copy;
  }

  private findTreeItem(itemId: string): TestSuiteTreeItem | null {
    const walk = (items: readonly TestSuiteTreeItem[]): TestSuiteTreeItem | null => {
      for (const item of items) {
        if (item.id === itemId) {
          return item;
        }
        if (isTestSuiteFolder(item)) {
          const found = walk(item.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    return walk(this.flows());
  }

  private insertTreeItem(item: TestSuiteTreeItem, parentId?: string): void {
    const root = this.rootSuite();
    if (!root) {
      return;
    }
    const ts = new Date().toISOString();
    if (!parentId) {
      this.patchRoot({ ...root, flows: [...root.flows, item], updatedAt: ts });
      return;
    }
    this.patchRoot({
      ...root,
      flows: this.mapTree(root.flows, (node) => {
        if (isTestSuiteFolder(node) && node.id === parentId) {
          return { ...node, children: [...node.children, item], updatedAt: ts };
        }
        return node;
      }),
      updatedAt: ts,
    });
  }

  private insertFlowNode(
    flowId: string,
    parentId: string | null,
    node: TestSuiteFlowNode,
  ): TestSuiteFlowStep | null {
    let inserted: TestSuiteFlowStep | null = null;
    this.updateFlow(flowId, (flow) => {
      const nodes = insertFlowNodeAt(flow.nodes, parentId, node);
      if (isFlowStepNode(node)) {
        inserted = node;
      }
      return { ...flow, nodes, updatedAt: new Date().toISOString() };
    });
    return inserted;
  }

  private updateFlow(flowId: string, fn: (flow: TestSuiteFlow) => TestSuiteFlow): void {
    const root = this.rootSuite();
    if (!root) {
      return;
    }
    const ts = new Date().toISOString();
    this.patchRoot({
      ...root,
      flows: this.mapTree(root.flows, (item) => {
        if (isTestSuiteFlow(item) && item.id === flowId) {
          return fn(item);
        }
        return item;
      }),
      updatedAt: ts,
    });
  }

  private mapTree(
    items: readonly TestSuiteTreeItem[],
    fn: (item: TestSuiteTreeItem) => TestSuiteTreeItem,
  ): TestSuiteTreeItem[] {
    return items.map((item) => {
      const next = fn(item);
      if (isTestSuiteFolder(next)) {
        return { ...next, children: this.mapTree(next.children, fn) };
      }
      return next;
    });
  }

  private patchRoot(root: TestSuiteRoot): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    const suites = file.suites.map((s) => (s.id === root.id ? root : s));
    this.scheduleSave({ ...file, suites });
  }

  private scheduleSave(file: TestSuitesFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist(file);
    }, 300);
  }

  private async persist(file: TestSuitesFile): Promise<void> {
    const parsed = testSuitesFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      const saved = await api.setTestSuites(parsed);
      this.fileState.set(migrateTestSuitesFile(saved));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(migrateTestSuitesFile(JSON.parse(raw)));
        return;
      }
    } catch {
      // fall through
    }
    this.fileState.set(createDefaultTestSuitesFile());
  }
}

function defaultStepName(stepType: TestSuiteStepType): string {
  switch (stepType) {
    case 'REQUEST':
      return 'HTTP Request';
    case 'VALIDATION':
      return 'Validation';
    case 'WAIT':
      return 'Wait';
    case 'E2E':
      return 'Browser step';
    case 'DATABASE':
      return 'Database';
    case 'HTTP_LISTENER':
      return 'HTTP Listener';
    case 'HTTP_INTERCEPTOR':
      return 'HTTP Interceptor';
    case 'MANUAL':
      return 'Manual input';
    case 'TRIGGER':
      return 'Trigger';
    default:
      return 'Step';
  }
}

function insertFlowNodeAt(
  nodes: readonly TestSuiteFlowNode[],
  parentId: string | null,
  node: TestSuiteFlowNode,
): TestSuiteFlowNode[] {
  if (!parentId) {
    return [...nodes, node];
  }
  return nodes.map((n) => {
    if (isFlowFolderNode(n) && n.id === parentId) {
      return { ...n, children: [...n.children, node] };
    }
    if (isFlowFolderNode(n) && n.children.length) {
      return { ...n, children: insertFlowNodeAt(n.children, parentId, node) };
    }
    return n;
  });
}

function patchFlowNode(
  nodes: readonly TestSuiteFlowNode[],
  nodeId: string,
  fn: (node: TestSuiteFlowNode) => TestSuiteFlowNode,
): TestSuiteFlowNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return fn(node);
    }
    if (isFlowFolderNode(node)) {
      return { ...node, children: patchFlowNode(node.children, nodeId, fn) };
    }
    return node;
  });
}

function removeFlowNode(nodes: readonly TestSuiteFlowNode[], nodeId: string): TestSuiteFlowNode[] {
  return nodes
    .filter((n) => n.id !== nodeId)
    .map((n) =>
      isFlowFolderNode(n) ? { ...n, children: removeFlowNode(n.children, nodeId) } : n,
    );
}

function applyStepRunDataToNodes(
  nodes: readonly TestSuiteFlowNode[],
  stepStatuses: Readonly<Record<string, TestSuiteStepStatus>>,
  stepCaptures: Readonly<Record<string, import('@shared/testing').FlowStepRunCapture>>,
  stepDurations: Readonly<Record<string, number>>,
  stepErrors: Readonly<Record<string, string>>,
): TestSuiteFlowNode[] {
  return nodes.map((node) => {
    if (isFlowFolderNode(node)) {
      return {
        ...node,
        children: applyStepRunDataToNodes(
          node.children,
          stepStatuses,
          stepCaptures,
          stepDurations,
          stepErrors,
        ),
      };
    }
    const status = stepStatuses[node.id];
    const capture = stepCaptures[node.id];
    const duration = stepDurations[node.id];
    const error = stepErrors[node.id];
    if (!status && !capture && duration == null && !error) {
      return node;
    }
    return {
      ...node,
      ...(status ? { lastRunStatus: status } : {}),
      ...(capture ? { lastRunCapture: capture } : {}),
      ...(duration != null && duration >= 0 ? { lastRunDurationMs: duration } : {}),
      ...(status === 'failed' && error
        ? { error }
        : status === 'passed' || status === 'skipped'
          ? { error: undefined }
          : {}),
    };
  });
}

function removeTreeItem(items: readonly TestSuiteTreeItem[], itemId: string): TestSuiteTreeItem[] {
  return items
    .filter((item) => item.id !== itemId)
    .map((item) =>
      isTestSuiteFolder(item)
        ? { ...item, children: removeTreeItem(item.children, itemId) }
        : item,
    );
}
