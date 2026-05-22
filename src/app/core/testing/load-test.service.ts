import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultLoadTestsFile,
  loadTestArtifactSchema,
  loadTestsFileSchema,
  loadTestTabResourceId,
  prependLoadTestRun,
  LOAD_TEST_RUN_HISTORY_MAX,
  type LoadTestArtifact,
  type LoadTestRunRecord,
  type LoadTestTreeItem,
  type LoadTestsFile,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import {
  fromLoadTestTreeNodesWithExisting,
  toLoadTestTreeNodes,
} from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.adapter';
import {
  createDefaultLoadTestArtifactPayload,
  createLoadTestNode,
  deleteLoadTestNode,
  duplicateLoadTestArtifact,
  findLoadTestNode,
  renameLoadTestNode,
} from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.mutations';
import type { LoadTestTreeNode } from '@app/features/shell/testing/load-test-sidebar-panel/load-test-tree.types';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.load-tests.v1';

function isArtifact(item: LoadTestTreeItem): item is LoadTestArtifact {
  return 'profile' in item;
}

/** Persists and mutates the workspace load test tree. */
@Injectable({ providedIn: 'root' })
export class LoadTestService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<LoadTestsFile | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };

  readonly items = computed(() => this.fileState()?.items ?? []);

  readonly nodes = computed(() => toLoadTestTreeNodes(this.items()));

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
          this.fileState.set(loadTestsFileSchema.parse(await api.getLoadTests()));
        } catch (error: unknown) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultLoadTestsFile());
        }
      },
    );
  }

  findArtifact(id: string): LoadTestArtifact | null {
    const walk = (list: readonly LoadTestTreeItem[]): LoadTestArtifact | null => {
      for (const item of list) {
        if (isArtifact(item) && item.id === id) {
          return item;
        }
        if (!isArtifact(item)) {
          const found = walk(item.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    return walk(this.items());
  }

  labelForResource(resourceId: string): string {
    if (!resourceId.startsWith('lt:')) {
      return 'Load test';
    }
    return this.findArtifact(resourceId.slice(3))?.name ?? 'Load test';
  }

  saveNodes(treeNodes: readonly LoadTestTreeNode[]): void {
    const merged = fromLoadTestTreeNodesWithExisting(treeNodes, this.items());
    const file = this.fileState() ?? createDefaultLoadTestsFile();
    this.scheduleSave({ ...file, items: merged });
  }

  addFolder(name = 'New folder'): LoadTestTreeItem | null {
    const result = createLoadTestNode(this.nodes(), null, 'folder', name);
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    return {
      id: result.nodeId,
      name,
      children: [],
      updatedAt: new Date().toISOString(),
    };
  }

  addArtifact(parentId: string | null = null, name = 'New load test'): LoadTestArtifact {
    const result = createLoadTestNode(this.nodes(), parentId, 'artifact', name);
    if (!result) {
      const ts = new Date().toISOString();
      const fallback: LoadTestArtifact = {
        id: newTestingId(),
        name,
        description: '',
        docs: '',
        profile: { durationSec: 60, virtualUsers: 10, rampUpSec: 0 },
        thresholds: {},
        runs: [],
        updatedAt: ts,
      };
      const file = this.fileState() ?? createDefaultLoadTestsFile();
      this.scheduleSave({ ...file, items: [...file.items, fallback] });
      return fallback;
    }

    this.saveNodes(result.nodes);
    return this.findArtifact(result.nodeId) ?? createDefaultLoadTestArtifactPayload(result.nodeId, name);
  }

  patchArtifact(id: string, patch: Partial<Omit<LoadTestArtifact, 'id'>>): void {
    const file = this.fileState();
    if (!file) {
      return;
    }

    const ts = new Date().toISOString();
    const patchItem = (items: readonly LoadTestTreeItem[]): LoadTestTreeItem[] =>
      items.map((item) => {
        if (isArtifact(item)) {
          if (item.id !== id) {
            return item;
          }
          return loadTestArtifactSchema.parse({
            ...item,
            ...patch,
            id: item.id,
            updatedAt: ts,
          });
        }
        return { ...item, children: patchItem(item.children) };
      });

    this.scheduleSave({ ...file, items: patchItem(file.items) });
  }

  renameNode(nodeId: string, label: string): void {
    const next = renameLoadTestNode(this.nodes(), nodeId, label);
    if (!next) {
      return;
    }
    this.saveNodes(next);
  }

  deleteNode(nodeId: string): readonly string[] {
    const artifactIds = this.collectArtifactIdsInSubtree(nodeId);
    const next = deleteLoadTestNode(this.nodes(), nodeId);
    if (!next) {
      return [];
    }
    this.saveNodes(next);
    return artifactIds;
  }

  duplicateArtifact(nodeId: string): LoadTestArtifact | null {
    const existing = this.findArtifact(nodeId);
    const result = duplicateLoadTestArtifact(this.nodes(), nodeId, this.items());
    if (!result || !existing) {
      return null;
    }

    this.saveNodes(result.nodes);
    this.patchArtifact(result.nodeId, {
      name: `${existing.name} copy`,
      description: existing.description,
      docs: existing.docs,
      targetRequestId: existing.targetRequestId,
      profile: existing.profile,
      thresholds: existing.thresholds,
      runs: [],
    });
    return this.findArtifact(result.nodeId);
  }

  tabResourceId(id: string): string {
    return loadTestTabResourceId(id);
  }

  findNode(id: string) {
    return findLoadTestNode(this.nodes(), id);
  }

  appendRun(artifactId: string, record: LoadTestRunRecord): void {
    const artifact = this.findArtifact(artifactId);
    if (!artifact) {
      return;
    }
    this.patchArtifact(artifactId, {
      runs: prependLoadTestRun(artifact.runs, record, LOAD_TEST_RUN_HISTORY_MAX),
    });
  }

  clearRuns(artifactId: string): void {
    this.patchArtifact(artifactId, { runs: [] });
  }

  deleteRun(artifactId: string, runId: string): void {
    const artifact = this.findArtifact(artifactId);
    if (!artifact) {
      return;
    }
    this.patchArtifact(artifactId, {
      runs: artifact.runs.filter((run) => run.id !== runId),
    });
  }

  private collectArtifactIdsInSubtree(nodeId: string): readonly string[] {
    const loc = findLoadTestNode(this.nodes(), nodeId);
    if (!loc) {
      return [];
    }

    const ids: string[] = [];
    const walk = (node: LoadTestTreeNode): void => {
      if (node.data?.kind === 'artifact' || node.kind === 'artifact') {
        ids.push(node.id);
      }
      for (const child of node.children ?? []) {
        walk(child);
      }
    };
    walk(loc.node);
    return ids;
  }

  private scheduleSave(file: LoadTestsFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: LoadTestsFile): Promise<void> {
    const parsed = loadTestsFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(loadTestsFileSchema.parse(await api.setLoadTests(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(loadTestsFileSchema.parse(JSON.parse(raw)));
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultLoadTestsFile());
  }
}
