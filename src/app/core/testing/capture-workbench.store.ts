import { Injectable, computed, inject, signal } from '@angular/core';

import {
  captureLogEntrySchema,
  captureTabResourceId,
  captureFileSchema,
  captureItemSchema,
  captureRuntimeStatusSchema,
  createDefaultCaptureFile,
  createDefaultCaptureItem,
  isCaptureItem,
  migrateCaptureFile,
  MAX_CAPTURE_PERSISTED_TRAFFIC,
  type CaptureFile,
  type CaptureItem,
  type CaptureLogEntry,
  type CaptureTrafficFilterPrefs,
  type CaptureTreeItem,
} from '@shared/testing';

import { normalizeCaptureStartUrl } from '@shared/http';

import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import {
  fromCaptureTreeNodesWithExisting,
  toCaptureTreeNodes,
} from '@app/features/shell/testing/capture-sidebar-panel/capture-tree.adapter';
import {
  collectCaptureSessionIdsForDeletion,
  createCaptureNode,
  deleteCaptureNode,
  renameCaptureNode,
} from '@app/features/shell/testing/capture-sidebar-panel/capture-tree.mutations';
import type { CaptureTreeNode } from '@app/features/shell/testing/capture-sidebar-panel/capture-tree.types';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.capture.v2';

@Injectable({ providedIn: 'root' })
export class CaptureWorkbenchStore {
  private readonly electron = inject(ElectronService);
  private readonly configService = inject(ConfigService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<CaptureFile | null>(null);
  private readonly activeCaptureItemIdState = signal<string | null>(null);
  private readonly entriesBySessionState = signal<Readonly<Record<string, readonly CaptureLogEntry[]>>>({});
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };
  private captureEntryUnsub: (() => void) | null = null;
  private captureStatusUnsub: (() => void) | null = null;

  readonly items = computed(() => this.fileState()?.items ?? []);
  readonly nodes = computed(() => toCaptureTreeNodes(this.items()));
  readonly activeCaptureItemId = computed(() => this.activeCaptureItemIdState());
  readonly running = computed(() => this.activeCaptureItemIdState() !== null);
  readonly entriesBySession = this.entriesBySessionState.asReadonly();

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
          const [file, status] = await Promise.all([api.getCapture(), api.captureStatus()]);
          this.fileState.set(migrateCaptureFile(file));
          this.hydrateEntriesFromFile();
          this.applyRuntimeStatus(captureRuntimeStatusSchema.parse(status));
          await this.refreshEntriesForActiveSession();
          this.wireCaptureEvents(api);
        } catch (error: unknown) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultCaptureFile());
        }
      },
    );
  }

  isSessionRecording(captureItemId: string): boolean {
    return this.activeCaptureItemIdState() === captureItemId;
  }

  async refreshEntriesForSession(captureItemId: string): Promise<void> {
    if (this.isSessionRecording(captureItemId)) {
      const api = this.electron.bridge()?.testing;
      if (!api) {
        return;
      }
      const list = await api.captureListEntries(captureItemId);
      const parsed = list.map((e) => captureLogEntrySchema.parse(e));
      this.entriesBySessionState.update((prev) => ({ ...prev, [captureItemId]: parsed }));
      this.persistSessionTraffic(captureItemId, parsed);
      return;
    }
    const persisted = this.find(captureItemId)?.traffic ?? [];
    this.entriesBySessionState.update((prev) => ({ ...prev, [captureItemId]: persisted }));
  }

  find(id: string): CaptureItem | null {
    const walk = (list: readonly CaptureTreeItem[]): CaptureItem | null => {
      for (const item of list) {
        if (isCaptureItem(item) && item.id === id) {
          return item;
        }
        if (!isCaptureItem(item)) {
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
    if (!resourceId.startsWith('cap:')) {
      return 'Capture';
    }
    return this.find(resourceId.slice(4))?.name ?? 'Capture';
  }

  saveNodes(treeNodes: readonly CaptureTreeNode[]): void {
    const merged = fromCaptureTreeNodesWithExisting(treeNodes, this.items());
    const file = this.fileState() ?? createDefaultCaptureFile();
    this.scheduleSave({ ...file, items: merged });
  }

  addFolder(name = 'New folder'): CaptureTreeItem | null {
    const result = createCaptureNode(this.nodes(), null, 'folder', name);
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    return this.findFolder(result.nodeId);
  }

  addItem(parentId: string | null = null, name = 'New capture'): CaptureItem {
    const result = createCaptureNode(this.nodes(), parentId, 'session', name);
    if (!result) {
      const ts = new Date().toISOString();
      const fallback = createDefaultCaptureItem(newTestingId(), name, ts);
      const file = this.fileState() ?? createDefaultCaptureFile();
      this.scheduleSave({ ...file, items: [...file.items, fallback] });
      return fallback;
    }
    this.saveNodes(result.nodes);
    return this.find(result.nodeId) ?? createDefaultCaptureItem(result.nodeId, name);
  }

  renameNode(nodeId: string, label: string): void {
    const next = renameCaptureNode(this.nodes(), nodeId, label);
    if (!next) {
      return;
    }
    this.saveNodes(next);
  }

  deleteNode(nodeId: string): readonly string[] {
    const sessionIds = collectCaptureSessionIdsForDeletion(this.nodes(), nodeId);
    const next = deleteCaptureNode(this.nodes(), nodeId);
    if (!next) {
      return [];
    }
    this.saveNodes(next);
    return sessionIds;
  }

  patchTrafficFilter(id: string, patch: Partial<CaptureTrafficFilterPrefs>): void {
    const item = this.find(id);
    if (!item) {
      return;
    }
    const trafficFilter = {
      query: patch.query ?? item.trafficFilter?.query ?? '',
      scope: patch.scope ?? item.trafficFilter?.scope ?? 'all',
      resourceCategory: patch.resourceCategory ?? item.trafficFilter?.resourceCategory ?? 'all',
    };
    this.patchItem(id, { trafficFilter });
  }

  patchItem(id: string, patch: Partial<Omit<CaptureItem, 'id'>>): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    const ts = new Date().toISOString();
    const patchTree = (items: readonly CaptureTreeItem[]): CaptureTreeItem[] =>
      items.map((item) => {
        if (isCaptureItem(item)) {
          if (item.id !== id) {
            return item;
          }
          return captureItemSchema.parse({ ...item, ...patch, id: item.id, updatedAt: ts });
        }
        return { ...item, children: patchTree(item.children) };
      });
    this.scheduleSave({ ...file, items: patchTree(file.items) });
  }

  async startSession(captureItemId: string): Promise<void> {
    const item = this.find(captureItemId);
    if (!item) {
      return;
    }
    const startUrl = this.resolveCaptureStartUrl(item.startUrl ?? '');
    if (startUrl !== item.startUrl) {
      this.patchItem(captureItemId, { startUrl });
    }
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.activeCaptureItemIdState.set(captureItemId);
      return;
    }
    const status = captureRuntimeStatusSchema.parse(
      await api.captureStart({
        captureItemId,
        startUrl,
      }),
    );
    if (status.error) {
      this.notifier.reportUnknown(new Error(status.error));
    }
    this.applyRuntimeStatus(status);
    await this.refreshEntriesForSession(captureItemId);
  }

  async stopSession(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.activeCaptureItemIdState.set(null);
      return;
    }
    const status = captureRuntimeStatusSchema.parse(await api.captureStop());
    this.applyRuntimeStatus(status);
  }

  async clearSessionEntries(captureItemId: string): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (api) {
      await api.captureClearEntries(captureItemId);
    }
    this.entriesBySessionState.update((prev) => ({ ...prev, [captureItemId]: [] }));
    this.persistSessionTraffic(captureItemId, []);
  }

  private resolveCaptureStartUrl(raw: string): string {
    const request = this.configService.settings()?.http.request;
    return normalizeCaptureStartUrl(raw, request);
  }

  private applyRuntimeStatus(status: { readonly running: boolean; readonly captureItemId?: string | null }): void {
    this.activeCaptureItemIdState.set(status.running ? (status.captureItemId ?? null) : null);
  }

  private wireCaptureEvents(api: NonNullable<ReturnType<ElectronService['bridge']>>['testing']): void {
    this.captureEntryUnsub?.();
    this.captureStatusUnsub?.();
    this.captureEntryUnsub = api.onCaptureEntry((entry) => {
      const parsed = captureLogEntrySchema.parse(entry);
      this.entriesBySessionState.update((prev) => {
        const list = [...(prev[parsed.captureItemId] ?? []), parsed];
        const capped = list.slice(-MAX_CAPTURE_PERSISTED_TRAFFIC);
        this.persistSessionTraffic(parsed.captureItemId, capped);
        return { ...prev, [parsed.captureItemId]: capped };
      });
    });
    this.captureStatusUnsub = api.onCaptureStatus((status) => {
      this.applyRuntimeStatus(captureRuntimeStatusSchema.parse(status));
    });
  }

  private async refreshEntriesForActiveSession(): Promise<void> {
    const id = this.activeCaptureItemIdState();
    if (!id) {
      return;
    }
    await this.refreshEntriesForSession(id);
  }

  private findFolder(id: string): CaptureTreeItem | null {
    const walk = (list: readonly CaptureTreeItem[]): CaptureTreeItem | null => {
      for (const item of list) {
        if (!isCaptureItem(item) && item.id === id) {
          return item;
        }
        if (!isCaptureItem(item)) {
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

  private scheduleSave(file: CaptureFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: CaptureFile): Promise<void> {
    const parsed = captureFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(captureFileSchema.parse(await api.setCapture(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private persistSessionTraffic(captureItemId: string, entries: readonly CaptureLogEntry[]): void {
    const capped = entries.slice(-MAX_CAPTURE_PERSISTED_TRAFFIC);
    this.patchItem(captureItemId, { traffic: capped });
  }

  private hydrateEntriesFromFile(): void {
    const bySession: Record<string, readonly CaptureLogEntry[]> = {};
    const walk = (items: readonly CaptureTreeItem[]): void => {
      for (const item of items) {
        if (isCaptureItem(item)) {
          bySession[item.id] = item.traffic ?? [];
        } else {
          walk(item.children);
        }
      }
    };
    walk(this.items());
    this.entriesBySessionState.set(bySession);
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(migrateCaptureFile(JSON.parse(raw)));
        this.hydrateEntriesFromFile();
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultCaptureFile());
  }

  tabResourceId(id: string): string {
    return captureTabResourceId(id);
  }
}
