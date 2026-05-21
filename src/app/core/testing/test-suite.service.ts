import { Injectable, computed, inject, signal } from '@angular/core';

import {
  TEST_SUITE_ROOT_ID,
  createDefaultTestSuitesFile,
  testSuitesFileSchema,
  type TestSuiteFlow,
  type TestSuiteRoot,
  type TestSuiteTreeItem,
  type TestSuitesFile,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.test-suites.v1';

function isFlow(item: TestSuiteTreeItem): item is TestSuiteFlow {
  return 'nodes' in item;
}

function isFolder(item: TestSuiteTreeItem): item is TestSuiteTreeItem & { children: readonly TestSuiteTreeItem[] } {
  return 'children' in item && !('nodes' in item);
}

/**
 * Persists and mutates the workspace test suite tree.
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
          this.fileState.set(testSuitesFileSchema.parse(file));
        } catch (error: unknown) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultTestSuitesFile());
        }
      },
    );
  }

  findFlow(id: string): TestSuiteFlow | null {
    const walk = (items: readonly TestSuiteTreeItem[]): TestSuiteFlow | null => {
      for (const item of items) {
        if (isFlow(item) && item.id === id) {
          return item;
        }
        if (isFolder(item)) {
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

  findFolder(id: string): (TestSuiteTreeItem & { children: readonly TestSuiteTreeItem[] }) | null {
    const walk = (items: readonly TestSuiteTreeItem[]): (TestSuiteTreeItem & { children: readonly TestSuiteTreeItem[] }) | null => {
      for (const item of items) {
        if (isFolder(item)) {
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

  addFlow(name = 'New flow'): TestSuiteFlow | null {
    const root = this.rootSuite();
    if (!root) {
      return null;
    }
    const ts = new Date().toISOString();
    const flow: TestSuiteFlow = {
      id: newTestingId(),
      name,
      description: '',
      tags: [],
      nodes: [],
      updatedAt: ts,
    };
    this.patchRoot({ ...root, flows: [...root.flows, flow], updatedAt: ts });
    return flow;
  }

  addFolder(name = 'New folder', parentId?: string): void {
    const root = this.rootSuite();
    if (!root) {
      return;
    }
    const ts = new Date().toISOString();
    const folder = {
      id: newTestingId(),
      name,
      description: '',
      tags: [],
      children: [],
      updatedAt: ts,
    };
    if (!parentId) {
      this.patchRoot({ ...root, flows: [...root.flows, folder], updatedAt: ts });
      return;
    }
    const nextFlows = this.mapTree(root.flows, (item) => {
      if (isFolder(item) && item.id === parentId) {
        return { ...item, children: [...item.children, folder], updatedAt: ts };
      }
      return item;
    });
    this.patchRoot({ ...root, flows: nextFlows, updatedAt: ts });
  }

  private mapTree(
    items: readonly TestSuiteTreeItem[],
    fn: (item: TestSuiteTreeItem) => TestSuiteTreeItem,
  ): TestSuiteTreeItem[] {
    return items.map((item) => {
      const next = fn(item);
      if (isFolder(next)) {
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
      this.fileState.set(testSuitesFileSchema.parse(saved));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(testSuitesFileSchema.parse(JSON.parse(raw)));
        return;
      }
    } catch {
      // fall through
    }
    this.fileState.set(createDefaultTestSuitesFile());
  }
}
