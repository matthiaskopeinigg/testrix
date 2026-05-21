import { Injectable, computed, inject, signal } from '@angular/core';

import type { HistoryFile, HistoryItem } from '@shared/config';
import { createDefaultHistory } from '@shared/config';
import { buildHistoryRequestCapture } from '@shared/history';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';
import type { OutgoingHttpRequest } from '@shared/http/outgoing-request.schema';

import { fromTreeNodes, toTreeNodes } from '@app/features/shell/history/history-tree.adapter';
import {
  clearHistoryNodes,
  deleteHistoryNode,
} from '@app/features/shell/history/history-tree.mutations';
import type { HistoryTreeNode } from '@app/features/shell/history/history-tree.types';
import { resolveHistorySnapshot } from '@app/features/shell/history/history-entry-display';

import { ConfigService } from '../config/config.service';
import { ElectronService } from '../electron/electron.service';
import { ErrorNotificationService } from '../errors/error-notification.service';

const BROWSER_STORAGE_KEY = 'testrix.history.v1';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly electron = inject(ElectronService);
  private readonly configService = inject(ConfigService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly nodesState = signal<HistoryTreeNode[]>([]);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly nodes = computed(() => this.nodesState());
  readonly items = computed(() => fromTreeNodes(this.nodesState()));

  async hydrate(): Promise<void> {
    const api = this.electron.bridge();

    if (!api) {
      this.loadBrowserFallback();
      return;
    }

    try {
      const file = await api.config.getHistory();
      this.nodesState.set(toTreeNodes(file.items));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
      this.nodesState.set(toTreeNodes(createDefaultHistory().items));
    }
  }

  getItem(id: string): HistoryItem | undefined {
    return this.items().find((item) => item.id === id);
  }

  resolveSnapshot(item: HistoryItem): HttpResponseSnapshot | null {
    const runsById = this.configService.session()?.workspace.collections.requestRunsById;
    return resolveHistorySnapshot(item, runsById);
  }

  saveNodes(nodes: readonly HistoryTreeNode[], immediate = false): void {
    this.nodesState.set([...nodes]);
    if (immediate) {
      void this.flushSave();
      return;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, 300);
  }

  /** Persists any debounced history before profile switch. */
  async flushPending(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.flushSave();
  }

  deleteNode(id: string): boolean {
    const next = deleteHistoryNode(this.nodesState(), id);
    if (!next) {
      return false;
    }
    this.saveNodes(next);
    return true;
  }

  clearAll(): void {
    this.saveNodes(clearHistoryNodes());
  }

  /** Appends a history row after a successful HTTP send. */
  appendFromSend(params: {
    readonly requestId: string;
    readonly snapshot: HttpResponseSnapshot;
    readonly outgoing: OutgoingHttpRequest;
    readonly label: string;
  }): void {
    const id =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `hist-${Date.now()}`;
    const method = params.snapshot.requestSummary.method;
    const url = params.snapshot.requestSummary.url;
    const requestCapture = buildHistoryRequestCapture(params.outgoing);
    const entry: HistoryItem = {
      id,
      label: `${method} ${params.label}`.trim(),
      method,
      url,
      requestedAt: params.snapshot.capturedAt,
      requestId: params.requestId,
      snapshotId: params.snapshot.id,
      snapshot: params.snapshot,
      request: requestCapture,
      order: Date.now(),
    };
    const node: HistoryTreeNode = {
      id,
      label: entry.label,
      kind: 'leaf',
      icon: 'api',
      order: entry.order,
      data: {
        kind: 'history',
        method,
        url,
        requestedAt: entry.requestedAt,
        requestId: params.requestId,
        snapshotId: params.snapshot.id,
        statusCode: params.snapshot.status.code,
        durationMs: params.snapshot.timing.totalMs,
        snapshot: params.snapshot,
        request: requestCapture,
      },
    };
    this.saveNodes([...this.nodesState(), node]);
  }

  private async flushSave(): Promise<void> {
    const file = this.buildFile();
    const api = this.electron.bridge();

    if (!api) {
      try {
        localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(file));
      } catch {
        /* ignore quota errors */
      }
      return;
    }

    try {
      await api.config.setHistory(file);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private buildFile(): HistoryFile {
    const defaults = createDefaultHistory();
    return {
      schemaVersion: 1,
      meta: {
        ...defaults.meta,
        updatedAt: new Date().toISOString(),
      },
      items: fromTreeNodes(this.nodesState()),
    };
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HistoryFile;
        this.nodesState.set(toTreeNodes(parsed.items ?? createDefaultHistory().items));
        return;
      }
    } catch {
      /* use defaults */
    }
    this.nodesState.set(toTreeNodes(createDefaultHistory().items));
  }
}
