import { Injectable, computed, inject, signal } from '@angular/core';

import type {
  CollectionFolderSettings,
  CollectionRequestSettings,
  CollectionsFile,
  HttpMethodId,
} from '@shared/config';
import { createDefaultCollections, enrichCollectionNodes } from '@shared/config';

import { fromTreeNodes, toTreeNodes } from '@app/features/shell/collections/collection-tree.adapter';
import { withCollectionTreeIcons } from '@app/features/shell/collections/collection-tree.icons';
import {
  createCollectionNode,
  deleteCollectionNode,
  duplicateCollectionNode,
  renameCollectionNode,
  setCollectionFolderDescription,
  setCollectionRequestDescription,
  updateCollectionFolderSettings,
  updateCollectionRequestLine,
  updateCollectionRequestSettings,
} from '@app/features/shell/collections/collection-tree.mutations';
import type { CollectionTreeKind, CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';

import { ConfigService } from '../config/config.service';
import { ElectronService } from '../electron/electron.service';
import { ErrorNotificationService } from '../errors/error-notification.service';

const BROWSER_STORAGE_KEY = 'testrix.collections.v1';

@Injectable({ providedIn: 'root' })
export class CollectionsService {
  private readonly electron = inject(ElectronService);
  private readonly configService = inject(ConfigService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly nodesState = signal<CollectionTreeNode[]>([]);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly nodes = computed(() => this.nodesState());

  async hydrate(): Promise<void> {
    const api = this.electron.bridge();

    if (!api) {
      this.loadBrowserFallback();
      return;
    }

    try {
      const file = await api.config.getCollections();
      this.nodesState.set(toTreeNodes(file.nodes));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
      this.nodesState.set(toTreeNodes(createDefaultCollections().nodes));
    }
  }

  saveNodes(nodes: readonly CollectionTreeNode[], immediate = false): void {
    this.nodesState.set(withCollectionTreeIcons(nodes));
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

  createFolder(parentId: string | null, label?: string): string | null {
    const result = createCollectionNode(this.nodesState(), parentId, 'folder', label);
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    return result.nodeId;
  }

  createRequest(parentId: string | null, label?: string): string | null {
    const method = this.configService.settings()?.http.request.defaultMethod ?? 'GET';
    const result = createCollectionNode(this.nodesState(), parentId, 'request', label, {
      method,
      url: '',
    });
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    return result.nodeId;
  }

  createWebsocket(parentId: string | null, label?: string): string | null {
    const result = createCollectionNode(this.nodesState(), parentId, 'websocket', label);
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    return result.nodeId;
  }

  renameNode(id: string, label: string): boolean {
    const next = renameCollectionNode(this.nodesState(), id, label);
    if (!next) {
      return false;
    }
    this.saveNodes(next);
    return true;
  }

  deleteNode(id: string): boolean {
    const next = deleteCollectionNode(this.nodesState(), id);
    if (!next) {
      return false;
    }
    this.saveNodes(next);
    return true;
  }

  duplicateNode(id: string): string | null {
    const result = duplicateCollectionNode(this.nodesState(), id);
    if (!result) {
      return null;
    }
    this.saveNodes(result.nodes);
    return result.nodeId;
  }

  /** Sets optional notes on a collection folder (empty string clears). */
  setFolderDescription(folderId: string, description: string): boolean {
    const next = setCollectionFolderDescription(this.nodesState(), folderId, description);
    if (!next) {
      return false;
    }
    this.saveNodes(next);
    return true;
  }

  /** Updates persisted settings on a collection folder. */
  patchFolderSettings(folderId: string, patch: Partial<CollectionFolderSettings>): boolean {
    const next = updateCollectionFolderSettings(this.nodesState(), folderId, patch);
    if (!next) {
      return false;
    }
    this.saveNodes(next);
    return true;
  }

  /** Sets optional notes on a collection request (empty string clears). */
  setRequestDescription(requestId: string, description: string): boolean {
    const next = setCollectionRequestDescription(this.nodesState(), requestId, description);
    if (!next) {
      return false;
    }
    this.saveNodes(next);
    return true;
  }

  /** Updates method, url, and/or label on a collection request. */
  updateRequest(
    requestId: string,
    patch: { readonly method?: HttpMethodId; readonly url?: string; readonly label?: string },
  ): boolean {
    const next = updateCollectionRequestLine(this.nodesState(), requestId, patch);
    if (!next) {
      return false;
    }
    this.saveNodes(next);
    return true;
  }

  /** Updates persisted settings on a collection request. */
  patchRequestSettings(requestId: string, patch: Partial<CollectionRequestSettings>): boolean {
    const next = updateCollectionRequestSettings(this.nodesState(), requestId, patch);
    if (!next) {
      return false;
    }
    this.saveNodes(next);
    return true;
  }

  /** Persists any debounced collection changes before profile switch. */
  async flushPending(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.flushSave();
  }

  private async flushSave(): Promise<void> {
    const file = this.buildFile();
    const api = this.electron.bridge();

    if (!api) {
      try {
        localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(file));
      } catch {
        /* ignore quota errors in dev */
      }
      return;
    }

    try {
      await api.config.setCollections(file);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private buildFile(): CollectionsFile {
    const defaults = createDefaultCollections();
    return {
      schemaVersion: 1,
      meta: {
        ...defaults.meta,
        updatedAt: new Date().toISOString(),
      },
      nodes: enrichCollectionNodes(fromTreeNodes(this.nodesState())),
    };
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CollectionsFile;
        this.nodesState.set(toTreeNodes(parsed.nodes ?? createDefaultCollections().nodes));
        return;
      }
    } catch {
      /* use defaults */
    }
    this.nodesState.set(toTreeNodes(createDefaultCollections().nodes));
  }
}
