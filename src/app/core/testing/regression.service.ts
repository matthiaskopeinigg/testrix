import { Injectable, computed, inject, signal } from '@angular/core';

import {
  REGRESSION_RUN_HISTORY_MAX,
  createDefaultRegressionsFile,
  isRegressionArtifact,
  migrateRegressionsFile,
  prependRegressionRun,
  regressionArtifactSchema,
  regressionTabResourceId,
  regressionsFileSchema,
  serializeRegressionRunExport,
  type RegressionArtifact,
  type RegressionProfile,
  type RegressionRun,
  type RegressionThresholds,
  type RegressionTreeItem,
  type RegressionsFile,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import {
  fromRegressionTreeNodesWithExisting,
  toRegressionTreeNodes,
} from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.adapter';
import {
  collectRegressionArtifactIdsForDeletion,
  createRegressionNode,
  deleteRegressionNode,
  duplicateRegressionArtifact,
  findRegressionNode,
  renameRegressionNode,
} from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.mutations';
import type { RegressionTreeNode } from '@app/features/shell/testing/regression-sidebar-panel/regression-tree.types';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.regressions.v2';

/** Persists and mutates the workspace regression tree. */
@Injectable({ providedIn: 'root' })
export class RegressionService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<RegressionsFile | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };

  readonly items = computed(() => this.fileState()?.items ?? []);
  readonly nodes = computed(() => toRegressionTreeNodes(this.items()));

  readonly allTags = computed(() => {
    const tags = new Set<string>();
    const walk = (list: readonly RegressionTreeItem[]): void => {
      for (const item of list) {
        for (const tag of item.tags ?? []) {
          tags.add(tag);
        }
        if (!isRegressionArtifact(item)) {
          walk(item.children);
        }
      }
    };
    walk(this.items());
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
          const raw = await api.getRegressions();
          this.fileState.set(migrateRegressionsFile(raw));
        } catch (error: unknown) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultRegressionsFile());
        }
      },
    );
  }

  findArtifact(id: string): RegressionArtifact | null {
    const walk = (list: readonly RegressionTreeItem[]): RegressionArtifact | null => {
      for (const item of list) {
        if (isRegressionArtifact(item) && item.id === id) {
          return item;
        }
        if (!isRegressionArtifact(item)) {
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

  /** @deprecated Use findArtifact */
  find(id: string): RegressionArtifact | null {
    return this.findArtifact(id);
  }

  labelForResource(resourceId: string): string {
    if (!resourceId.startsWith('rg:')) {
      return 'Regression';
    }
    return this.findArtifact(resourceId.slice(3))?.name ?? 'Regression';
  }

  saveNodes(treeNodes: readonly RegressionTreeNode[]): void {
    const merged = fromRegressionTreeNodesWithExisting(treeNodes, this.items());
    const file = this.fileState() ?? createDefaultRegressionsFile();
    this.scheduleSave({ ...file, items: merged });
  }

  addFolder(name = 'New folder'): RegressionTreeItem | null {
    const result = createRegressionNode(this.nodes(), null, 'folder', name);
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    const ts = new Date().toISOString();
    return {
      id: result.nodeId,
      name,
      description: '',
      tags: [],
      createdAt: ts,
      updatedAt: ts,
      children: [],
    };
  }

  addArtifact(parentId: string | null = null, name = 'New regression'): RegressionArtifact {
    const result = createRegressionNode(this.nodes(), parentId, 'artifact', name);
    if (!result) {
      const ts = new Date().toISOString();
      const fallback = regressionArtifactSchema.parse({
        id: newTestingId(),
        name,
        description: '',
        tags: [],
        createdAt: ts,
        updatedAt: ts,
        docs: '',
        flowIds: [],
        profile: {},
        thresholds: {},
        runs: [],
      });
      const file = this.fileState() ?? createDefaultRegressionsFile();
      this.scheduleSave({ ...file, items: [...file.items, fallback] });
      return fallback;
    }
    this.saveNodes(result.nodes);
    return this.findArtifact(result.nodeId)!;
  }

  /** @deprecated Use addArtifact */
  add(name = 'New regression'): RegressionArtifact {
    return this.addArtifact(null, name);
  }

  patchArtifact(id: string, patch: Partial<Omit<RegressionArtifact, 'id'>>): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    const ts = new Date().toISOString();
    const patchItem = (items: readonly RegressionTreeItem[]): RegressionTreeItem[] =>
      items.map((item) => {
        if (isRegressionArtifact(item)) {
          if (item.id !== id) {
            return item;
          }
          return regressionArtifactSchema.parse({
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

  patchProfile(id: string, patch: Partial<RegressionProfile>): void {
    const artifact = this.findArtifact(id);
    if (!artifact) {
      return;
    }
    this.patchArtifact(id, { profile: { ...artifact.profile, ...patch } });
  }

  patchThresholds(id: string, patch: Partial<RegressionThresholds>): void {
    const artifact = this.findArtifact(id);
    if (!artifact) {
      return;
    }
    this.patchArtifact(id, { thresholds: { ...artifact.thresholds, ...patch } });
  }

  patchFlowIds(id: string, flowIds: readonly string[]): void {
    this.patchArtifact(id, { flowIds: [...flowIds] });
  }

  patchTags(id: string, tags: readonly string[]): void {
    this.patchArtifact(id, { tags: [...tags] });
  }

  archive(id: string): void {
    this.patchNode(id, { archivedAt: new Date().toISOString() });
  }

  restore(id: string): void {
    this.patchNode(id, { archivedAt: null });
  }

  isArchived(id: string): boolean {
    const artifact = this.findArtifact(id);
    if (artifact) {
      return !!artifact.archivedAt;
    }
    const walk = (items: readonly RegressionTreeItem[]): boolean => {
      for (const item of items) {
        if (item.id === id) {
          return !!item.archivedAt;
        }
        if (!isRegressionArtifact(item)) {
          if (walk(item.children)) {
            return true;
          }
        }
      }
      return false;
    };
    return walk(this.items());
  }

  renameNode(nodeId: string, label: string): void {
    const next = renameRegressionNode(this.nodes(), nodeId, label);
    if (!next) {
      return;
    }
    this.saveNodes(next);
  }

  deleteNode(nodeId: string): readonly string[] {
    const artifactIds = collectRegressionArtifactIdsForDeletion(this.nodes(), nodeId);
    const next = deleteRegressionNode(this.nodes(), nodeId);
    if (!next) {
      return [];
    }
    this.saveNodes(next);
    return artifactIds;
  }

  duplicateArtifact(nodeId: string): RegressionArtifact | null {
    const existing = this.findArtifact(nodeId);
    const result = duplicateRegressionArtifact(this.nodes(), nodeId);
    if (!result || !existing) {
      return null;
    }
    this.saveNodes(result.nodes);
    this.patchArtifact(result.nodeId, {
      name: `${existing.name} copy`,
      release: existing.release,
      description: existing.description,
      tags: [...existing.tags],
      docs: existing.docs,
      flowIds: [...existing.flowIds],
      profile: existing.profile,
      thresholds: existing.thresholds,
      runs: [],
      archivedAt: null,
    });
    return this.findArtifact(result.nodeId);
  }

  exportArtifactJson(id: string): string | null {
    const artifact = this.findArtifact(id);
    if (!artifact) {
      return null;
    }
    return JSON.stringify(artifact, null, 2);
  }

  /** Imports a regression artifact JSON at workspace root with a new id. */
  importArtifactJson(json: string, parentFolderId: string | null = null): RegressionArtifact | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return null;
    }
    const result = regressionArtifactSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    const source = result.data;
    const id = newTestingId();
    const ts = new Date().toISOString();
    const artifact = regressionArtifactSchema.parse({
      ...source,
      id,
      name: `${source.name} (imported)`,
      createdAt: ts,
      updatedAt: ts,
      runs: [],
      archivedAt: null,
    });

    const file = this.fileState() ?? createDefaultRegressionsFile();
    if (parentFolderId) {
      const insert = (items: readonly RegressionTreeItem[]): RegressionTreeItem[] =>
        items.map((item) => {
          if (!isRegressionArtifact(item) && item.id === parentFolderId) {
            return { ...item, children: [...item.children, artifact], updatedAt: ts };
          }
          if (!isRegressionArtifact(item)) {
            return { ...item, children: insert(item.children) };
          }
          return item;
        });
      this.scheduleSave({ ...file, items: insert(file.items) });
    } else {
      this.scheduleSave({ ...file, items: [...file.items, artifact] });
    }
    return artifact;
  }

  patchRelease(id: string, release: string): void {
    this.patchArtifact(id, { release: release.trim() });
  }

  tabResourceId(id: string): string {
    return regressionTabResourceId(id);
  }

  findNode(id: string) {
    return findRegressionNode(this.nodes(), id);
  }

  appendRun(artifactId: string, record: RegressionRun): void {
    const artifact = this.findArtifact(artifactId);
    if (!artifact) {
      return;
    }
    this.patchArtifact(artifactId, {
      runs: prependRegressionRun(artifact.runs, record, REGRESSION_RUN_HISTORY_MAX),
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

  private patchNode(
    id: string,
    patch: Partial<{ archivedAt: string | null; description: string; tags: readonly string[] }>,
  ): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    const ts = new Date().toISOString();
    const patchItem = (items: readonly RegressionTreeItem[]): RegressionTreeItem[] =>
      items.map((item) => {
        if (item.id === id) {
          if (isRegressionArtifact(item)) {
            return regressionArtifactSchema.parse({ ...item, ...patch, updatedAt: ts });
          }
          return { ...item, ...patch, updatedAt: ts };
        }
        if (!isRegressionArtifact(item)) {
          return { ...item, children: patchItem(item.children) };
        }
        return item;
      });
    this.scheduleSave({ ...file, items: patchItem(file.items) });
  }

  private scheduleSave(file: RegressionsFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: RegressionsFile): Promise<void> {
    const parsed = regressionsFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(migrateRegressionsFile(await api.setRegressions(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(migrateRegressionsFile(JSON.parse(raw)));
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultRegressionsFile());
  }
}

export { serializeRegressionRunExport } from '@shared/testing';
