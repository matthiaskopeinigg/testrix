import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultMockServerEndpoint,
  createDefaultMockServerFile,
  isMockServerEndpoint,
  mockServerEndpointSchema,
  mockServerFileSchema,
  mockServerTabResourceId,
  type MockServerEndpoint,
  type MockServerMismatchRecord,
  type MockServerOptions,
  type MockServerFile,
  type MockServerRuntimeStatus,
  type MockServerTreeItem,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import {
  fromMockServerTreeNodesWithExisting,
  toMockServerTreeNodes,
} from '@app/features/shell/testing/mock-server-sidebar-panel/mock-server-tree.adapter';
import {
  collectMockServerEndpointIdsForDeletion,
  createEndpointFromMismatch,
  createMockServerNode,
  deleteMockServerNode,
  findMockServerNode,
  renameMockServerNode,
} from '@app/features/shell/testing/mock-server-sidebar-panel/mock-server-tree.mutations';
import type { MockServerTreeNode } from '@app/features/shell/testing/mock-server-sidebar-panel/mock-server-tree.types';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.mock-server.v2';

@Injectable({ providedIn: 'root' })
export class MockServerService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<MockServerFile | null>(null);
  private readonly statusState = signal<MockServerRuntimeStatus | null>(null);
  private readonly mismatchesState = signal<readonly MockServerMismatchRecord[]>([]);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };
  private activityUnsub: (() => void) | null = null;

  readonly items = computed(() => this.fileState()?.items ?? []);
  readonly options = computed(() => this.fileState()?.options ?? createDefaultMockServerFile().options);
  readonly nodes = computed(() => toMockServerTreeNodes(this.items()));
  readonly running = computed(() => this.statusState()?.running ?? false);
  readonly status = computed(() => this.statusState());
  readonly mismatches = computed(() => this.mismatchesState());
  readonly unmatchedCount = computed(() => this.statusState()?.unmatchedCount ?? 0);

  readonly allTags = computed(() => {
    const tags = new Set<string>();
    const walk = (list: readonly MockServerTreeItem[]): void => {
      for (const item of list) {
        if (isMockServerEndpoint(item)) {
          for (const tag of item.tags) {
            tags.add(tag);
          }
        } else {
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
          const [file, status, mismatches] = await Promise.all([
            api.getMockServer(),
            api.mockStatus(),
            api.mockListMismatches(),
          ]);
          this.fileState.set(mockServerFileSchema.parse(file));
          this.statusState.set(status);
          this.mismatchesState.set(mismatches);
          this.wireActivityListener(api);
        } catch (error: unknown) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultMockServerFile());
        }
      },
    );
  }

  findEndpoint(id: string): MockServerEndpoint | null {
    const walk = (list: readonly MockServerTreeItem[]): MockServerEndpoint | null => {
      for (const item of list) {
        if (isMockServerEndpoint(item) && item.id === id) {
          return item;
        }
        if (!isMockServerEndpoint(item)) {
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

  findMismatch(id: string): MockServerMismatchRecord | null {
    return this.mismatches().find((m) => m.id === id) ?? null;
  }

  labelForResource(resourceId: string): string {
    if (resourceId.startsWith('ms-mismatch:')) {
      const m = this.findMismatch(resourceId.slice('ms-mismatch:'.length));
      return m ? `${m.method} ${m.pathname}` : 'Unmatched request';
    }
    if (!resourceId.startsWith('ms:')) {
      return 'Mock server';
    }
    return this.findEndpoint(resourceId.slice(3))?.name ?? 'Mock endpoint';
  }

  saveNodes(treeNodes: readonly MockServerTreeNode[]): void {
    const merged = fromMockServerTreeNodesWithExisting(treeNodes, this.items());
    const file = this.fileState() ?? createDefaultMockServerFile();
    this.scheduleSave({ ...file, items: merged });
  }

  updateOptions(patch: Partial<MockServerOptions>): void {
    const file = this.fileState() ?? createDefaultMockServerFile();
    this.scheduleSave({
      ...file,
      options: mockServerFileSchema.shape.options.parse({ ...file.options, ...patch }),
    });
  }

  patchEndpoint(id: string, patch: Partial<Omit<MockServerEndpoint, 'id'>>): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    const ts = new Date().toISOString();
    const patchItem = (items: readonly MockServerTreeItem[]): MockServerTreeItem[] =>
      items.map((item) => {
        if (isMockServerEndpoint(item)) {
          if (item.id !== id) {
            return item;
          }
          return mockServerEndpointSchema.parse({
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

  addFolder(name = 'New folder', parentId: string | null = null): string | null {
    const result = createMockServerNode(this.nodes(), parentId, 'folder', name);
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    return result.nodeId;
  }

  addEndpoint(parentId: string | null = null, name = 'New endpoint'): MockServerEndpoint {
    const result = createMockServerNode(this.nodes(), parentId, 'endpoint', name);
    if (!result) {
      const ts = new Date().toISOString();
      const endpoint = createDefaultMockServerEndpoint(newTestingId(), name, ts);
      const file = this.fileState() ?? createDefaultMockServerFile();
      this.scheduleSave({ ...file, items: [...file.items, endpoint] });
      return endpoint;
    }
    this.saveNodes(result.nodes);
    return this.findEndpoint(result.nodeId) ?? createDefaultMockServerEndpoint(result.nodeId, name, new Date().toISOString());
  }

  addEndpointFromMismatch(mismatch: MockServerMismatchRecord): MockServerEndpoint {
    const endpoint = createEndpointFromMismatch(mismatch);
    const file = this.fileState() ?? createDefaultMockServerFile();
    this.scheduleSave({ ...file, items: [...file.items, endpoint] });
    return endpoint;
  }

  renameNode(nodeId: string, label: string): void {
    const next = renameMockServerNode(this.nodes(), nodeId, label);
    if (next) {
      this.saveNodes(next);
    }
  }

  deleteNode(nodeId: string): string[] {
    const removedIds = collectMockServerEndpointIdsForDeletion(this.nodes(), nodeId);
    const next = deleteMockServerNode(this.nodes(), nodeId);
    if (next) {
      this.saveNodes(next);
    }
    return removedIds;
  }

  async refreshStatus(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      return;
    }
    try {
      this.statusState.set(await api.mockStatus());
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  async start(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      const portOpt = this.options().port;
      this.statusState.set({
        running: true,
        host: this.options().host,
        port: portOpt === 'auto' ? 0 : portOpt,
        unmatchedCount: 0,
      });
      return;
    }
    try {
      this.statusState.set(await api.mockStart());
      this.mismatchesState.set(await api.mockListMismatches());
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  async stop(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      const portOpt = this.options().port;
      this.statusState.set({
        running: false,
        host: this.options().host,
        port: portOpt === 'auto' ? 0 : portOpt,
        unmatchedCount: 0,
      });
      this.mismatchesState.set([]);
      return;
    }
    try {
      this.statusState.set(await api.mockStop());
      this.mismatchesState.set([]);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  async clearMismatches(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.mismatchesState.set([]);
      return;
    }
    await api.mockClearMismatches();
    this.mismatchesState.set([]);
    await this.refreshStatus();
  }

  openEndpointTab(id: string): string {
    return mockServerTabResourceId(id);
  }

  private wireActivityListener(
    api: NonNullable<ReturnType<ElectronService['bridge']>>['testing'],
  ): void {
    this.activityUnsub?.();
    this.activityUnsub = api.onMockActivity((payload: unknown) => {
      const event = payload as {
        readonly type?: string;
        readonly record?: MockServerMismatchRecord;
        readonly unmatchedCount?: number;
      };
      if (event.type === 'mismatch' && event.record) {
        this.mismatchesState.update((list) => {
          const without = list.filter((m) => m.id !== event.record!.id);
          return [event.record!, ...without];
        });
        if (typeof event.unmatchedCount === 'number') {
          this.statusState.update((s) =>
            s ? { ...s, unmatchedCount: event.unmatchedCount! } : s,
          );
        }
      }
      void this.refreshStatus();
    });
  }

  private scheduleSave(file: MockServerFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: MockServerFile): Promise<void> {
    const parsed = mockServerFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(mockServerFileSchema.parse(await api.setMockServer(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(mockServerFileSchema.parse(JSON.parse(raw)));
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultMockServerFile());
  }
}
