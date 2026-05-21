import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultInterceptorFile,
  interceptorFileSchema,
  interceptorRuleTabResourceId,
  type InterceptorFile,
  type InterceptorRule,
  type InterceptorTreeItem,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.interceptor.v1';

function isRule(item: InterceptorTreeItem): item is InterceptorRule {
  return 'matchUrl' in item;
}

@Injectable({ providedIn: 'root' })
export class InterceptorWorkspaceStore {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<InterceptorFile | null>(null);
  private readonly runningState = signal(false);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };

  readonly items = computed(() => this.fileState()?.items ?? []);
  readonly running = computed(() => this.runningState());

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
          const [file, status] = await Promise.all([api.getInterceptor(), api.interceptorStatus()]);
          this.fileState.set(interceptorFileSchema.parse(file));
          this.runningState.set(status.running);
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

  addRule(name = 'New rule'): InterceptorRule {
    const ts = new Date().toISOString();
    const rule: InterceptorRule = {
      id: newTestingId(),
      name,
      enabled: true,
      matchUrl: '*',
      action: 'proxy',
      updatedAt: ts,
    };
    const file = this.fileState() ?? createDefaultInterceptorFile();
    this.scheduleSave({ ...file, items: [...file.items, rule] });
    return rule;
  }

  async start(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.runningState.set(true);
      return;
    }
    this.runningState.set((await api.interceptorStart()).running);
  }

  async stop(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.runningState.set(false);
      return;
    }
    this.runningState.set((await api.interceptorStop()).running);
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
        this.fileState.set(interceptorFileSchema.parse(JSON.parse(raw)));
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
