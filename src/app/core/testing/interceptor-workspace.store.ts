import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultInterceptorFile,
  interceptorFileSchema,
  migrateInterceptorFile,
  interceptorHitSchema,
  interceptorRuleSchema,
  interceptorRuleTabResourceId,
  interceptorRuntimeStatusSchema,
  type InterceptorFile,
  type InterceptorHit,
  type InterceptorRule,
  type InterceptorTreeItem,
} from '@shared/testing';

import { normalizeCaptureStartUrl } from '@shared/http';

import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import {
  fromInterceptorTreeNodesWithExisting,
  toInterceptorTreeNodes,
} from '@app/features/shell/testing/interceptor-sidebar-panel/interceptor-tree.adapter';
import {
  collectInterceptorRuleIdsForDeletion,
  createInterceptorNode,
  deleteInterceptorNode,
  renameInterceptorNode,
} from '@app/features/shell/testing/interceptor-sidebar-panel/interceptor-tree.mutations';
import type { InterceptorTreeNode } from '@app/features/shell/testing/interceptor-sidebar-panel/interceptor-tree.types';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.interceptor.v1';

function isRule(item: InterceptorTreeItem): item is InterceptorRule {
  return 'matchUrl' in item;
}

@Injectable({ providedIn: 'root' })
export class InterceptorWorkspaceStore {
  private readonly electron = inject(ElectronService);
  private readonly configService = inject(ConfigService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<InterceptorFile | null>(null);
  private readonly runningState = signal(false);
  private readonly hitsState = signal<readonly InterceptorHit[]>([]);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };
  private interceptorHitUnsub: (() => void) | null = null;
  private interceptorStatusUnsub: (() => void) | null = null;

  readonly items = computed(() => this.fileState()?.items ?? []);
  readonly nodes = computed(() => toInterceptorTreeNodes(this.items()));
  readonly running = computed(() => this.runningState());
  readonly startUrl = computed(() => this.fileState()?.startUrl ?? 'https://example.com');
  readonly hits = this.hitsState.asReadonly();

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
          const [file, status, hits] = await Promise.all([
            api.getInterceptor(),
            api.interceptorStatus(),
            api.interceptorListHits(),
          ]);
          this.fileState.set(interceptorFileSchema.parse(file));
          this.applyRuntimeStatus(interceptorRuntimeStatusSchema.parse(status));
          this.hitsState.set(hits.map((h) => interceptorHitSchema.parse(h)));
          this.wireInterceptorEvents(api);
        } catch (error: unknown) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultInterceptorFile());
        }
      },
    );
  }

  findRule(id: string): InterceptorRule | null {
    const walk = (list: readonly InterceptorTreeItem[]): InterceptorRule | null => {
      for (const item of list) {
        if (isRule(item) && item.id === id) {
          return item;
        }
        if (!isRule(item)) {
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
    if (!resourceId.startsWith('int-rule:')) {
      return 'Interceptor rule';
    }
    return this.findRule(resourceId.slice('int-rule:'.length))?.name ?? 'Rule';
  }

  saveNodes(treeNodes: readonly InterceptorTreeNode[]): void {
    const merged = fromInterceptorTreeNodesWithExisting(treeNodes, this.items());
    const file = this.fileState() ?? createDefaultInterceptorFile();
    this.scheduleSave({ ...file, items: merged });
  }

  addFolder(name = 'New folder'): InterceptorTreeItem | null {
    const result = createInterceptorNode(this.nodes(), null, 'folder', name);
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    return this.findFolder(result.nodeId);
  }

  addRule(parentId: string | null = null, name = 'New rule'): InterceptorRule {
    const result = createInterceptorNode(this.nodes(), parentId, 'rule', name);
    if (!result) {
      const ts = new Date().toISOString();
      const fallback: InterceptorRule = {
        id: newTestingId(),
        name,
        enabled: true,
        matchUrl: '*',
        action: 'proxy',
        mockBody: { mode: 'none' },
        updatedAt: ts,
      };
      const file = this.fileState() ?? createDefaultInterceptorFile();
      this.scheduleSave({ ...file, items: [...file.items, fallback] });
      return fallback;
    }
    this.saveNodes(result.nodes);
    return this.findRule(result.nodeId) ?? {
      id: result.nodeId,
      name,
      enabled: true,
      matchUrl: '*',
      action: 'proxy',
      mockBody: { mode: 'none' },
      updatedAt: new Date().toISOString(),
    };
  }

  renameNode(nodeId: string, label: string): void {
    const next = renameInterceptorNode(this.nodes(), nodeId, label);
    if (!next) {
      return;
    }
    this.saveNodes(next);
  }

  deleteNode(nodeId: string): readonly string[] {
    const ruleIds = collectInterceptorRuleIdsForDeletion(this.nodes(), nodeId);
    const next = deleteInterceptorNode(this.nodes(), nodeId);
    if (!next) {
      return [];
    }
    this.saveNodes(next);
    return ruleIds;
  }

  patchRule(id: string, patch: Partial<Omit<InterceptorRule, 'id'>>): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    const ts = new Date().toISOString();
    const patchTree = (items: readonly InterceptorTreeItem[]): InterceptorTreeItem[] =>
      items.map((item) => {
        if (isRule(item)) {
          if (item.id !== id) {
            return item;
          }
          return interceptorRuleSchema.parse({ ...item, ...patch, id: item.id, updatedAt: ts });
        }
        return { ...item, children: patchTree(item.children) };
      });
    this.scheduleSave({ ...file, items: patchTree(file.items) });
  }

  patchStartUrl(startUrl: string): void {
    const file = this.fileState() ?? createDefaultInterceptorFile();
    const normalized = this.resolveStartUrl(startUrl);
    if (normalized === file.startUrl) {
      return;
    }
    this.scheduleSave({ ...file, startUrl: normalized });
  }

  async start(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.runningState.set(true);
      return;
    }
    const file = this.fileState() ?? createDefaultInterceptorFile();
    const startUrl = this.resolveStartUrl(file.startUrl);
    if (startUrl !== file.startUrl) {
      this.scheduleSave({ ...file, startUrl });
    }
    const status = interceptorRuntimeStatusSchema.parse(
      await api.interceptorStart({ startUrl }),
    );
    if (status.error) {
      this.notifier.reportUnknown(new Error(status.error));
    }
    this.applyRuntimeStatus(status);
    if (status.running) {
      const hits = await api.interceptorListHits();
      this.hitsState.set(hits.map((h) => interceptorHitSchema.parse(h)));
    }
  }

  async stop(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.runningState.set(false);
      return;
    }
    const status = interceptorRuntimeStatusSchema.parse(await api.interceptorStop());
    this.applyRuntimeStatus(status);
  }

  async clearHits(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (api) {
      await api.interceptorClearHits();
    }
    this.hitsState.set([]);
  }

  private resolveStartUrl(raw: string): string {
    const request = this.configService.settings()?.http.request;
    return normalizeCaptureStartUrl(raw, request);
  }

  private applyRuntimeStatus(status: { readonly running: boolean }): void {
    this.runningState.set(status.running);
  }

  private wireInterceptorEvents(
    api: NonNullable<ReturnType<ElectronService['bridge']>>['testing'],
  ): void {
    this.interceptorHitUnsub?.();
    this.interceptorStatusUnsub?.();
    this.interceptorHitUnsub = api.onInterceptorHit((hit) => {
      const parsed = interceptorHitSchema.parse(hit);
      this.hitsState.update((prev) => [...prev, parsed].slice(-200));
    });
    this.interceptorStatusUnsub = api.onInterceptorStatus((status) => {
      this.applyRuntimeStatus(interceptorRuntimeStatusSchema.parse(status));
    });
  }

  private findFolder(id: string): InterceptorTreeItem | null {
    const walk = (list: readonly InterceptorTreeItem[]): InterceptorTreeItem | null => {
      for (const item of list) {
        if (!isRule(item) && item.id === id) {
          return item;
        }
        if (!isRule(item)) {
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

  private scheduleSave(file: InterceptorFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: InterceptorFile): Promise<void> {
    const parsed = interceptorFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(interceptorFileSchema.parse(await api.setInterceptor(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(migrateInterceptorFile(JSON.parse(raw)));
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultInterceptorFile());
  }

  tabResourceId(id: string): string {
    return interceptorRuleTabResourceId(id);
  }
}
