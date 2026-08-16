import { Injectable, computed, inject, signal } from '@angular/core';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { runTestingHydrateOnce, type TestingHydrateOptions } from '@app/core/testing/testing-hydrate-once';
import { newTestingId } from '@app/core/testing/testing-id';

import { insertChildIntoFolderTree } from '@shared/config';
import {
  createDefaultSavedQueriesFile,
  databaseQueryTabResourceId,
  findSavedQuery,
  flattenSavedQueries,
  isSavedDatabaseQuery,
  isSavedQueryFolder,
  mapSavedQueryTree,
  parseSavedQueriesFile,
  type SavedDatabaseQuery,
  type SavedQueriesFile,
  type SavedQueryTreeItem,
} from '@shared/database';

/**
 * Profile-local saved SQL/Redis queries for the Data workspace.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseQueriesService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<SavedQueriesFile | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };

  readonly nodes = computed(() => this.fileState()?.nodes ?? []);
  readonly queries = computed(() => flattenSavedQueries(this.nodes()));

  async hydrate(options?: TestingHydrateOptions): Promise<void> {
    return runTestingHydrateOnce(
      () => this.fileState() !== null,
      this.hydrateInflight,
      async () => {
        const api = this.electron.bridge()?.database;
        if (!api?.getQueries) {
          this.fileState.set(createDefaultSavedQueriesFile());
          return;
        }
        try {
          this.fileState.set(parseSavedQueriesFile(await api.getQueries()));
        } catch (error) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultSavedQueriesFile());
        }
      },
      options,
    );
  }

  /**
   * Writes a pending debounce save so a profile switch does not land on the next folder.
   */
  async flushPending(): Promise<void> {
    if (this.saveTimer === null) {
      return;
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const file = this.fileState();
    if (!file) {
      return;
    }
    await this.flushSave(file);
  }

  find(id: string): SavedDatabaseQuery | null {
    return findSavedQuery(this.nodes(), id);
  }

  labelForResource(resourceId: string): string {
    const id = resourceId.startsWith('dbq:') ? resourceId.slice(4) : resourceId;
    return this.find(id)?.name ?? 'Query';
  }

  /**
   * Replaces the saved-queries file immediately (used by workspace import).
   */
  async replaceFile(file: SavedQueriesFile): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.fileState.set(file);
    await this.flushSave(file);
  }

  saveNodes(nodes: readonly SavedQueryTreeItem[]): void {
    const file = this.fileState() ?? createDefaultSavedQueriesFile();
    this.scheduleSave({ ...file, schemaVersion: 2, nodes: [...nodes] });
  }

  createQuery(
    name = 'New query',
    connectionId = '',
    parentId: string | null = null,
    query = '',
    readOnly = false,
  ): SavedDatabaseQuery {
    const item: SavedDatabaseQuery = {
      id: newTestingId(),
      kind: 'query',
      name,
      connectionId,
      query,
      updatedAt: new Date().toISOString(),
      readOnly,
    };
    this.saveNodes(insertChild(this.nodes(), parentId, item));
    return item;
  }

  createFolder(name = 'New folder', parentId: string | null = null): string {
    const folder: SavedQueryTreeItem = {
      id: newTestingId(),
      kind: 'folder',
      name,
      children: [],
      updatedAt: new Date().toISOString(),
    };
    this.saveNodes(insertChild(this.nodes(), parentId, folder));
    return folder.id;
  }

  patchQuery(id: string, patch: Partial<Omit<SavedDatabaseQuery, 'id' | 'kind'>>): void {
    const ts = new Date().toISOString();
    this.saveNodes(
      mapSavedQueryTree(this.nodes(), (item) => {
        if (isSavedDatabaseQuery(item) && item.id === id) {
          return { ...item, ...patch, id: item.id, kind: 'query', updatedAt: ts };
        }
        return item;
      }),
    );
  }

  renameNode(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const ts = new Date().toISOString();
    this.saveNodes(
      mapSavedQueryTree(this.nodes(), (item) => {
        if (item.id !== id) {
          return item;
        }
        return { ...item, name: trimmed, updatedAt: ts };
      }),
    );
  }

  duplicateQuery(id: string): SavedDatabaseQuery | null {
    const source = this.find(id);
    if (!source) {
      return null;
    }
    const copy: SavedDatabaseQuery = {
      ...source,
      id: newTestingId(),
      name: `${source.name} copy`,
      updatedAt: new Date().toISOString(),
    };
    this.saveNodes(insertSiblingAfter(this.nodes(), id, copy));
    return copy;
  }

  deleteNode(id: string): void {
    this.saveNodes(removeNode(this.nodes(), id));
  }

  tabResourceId(id: string): string {
    return databaseQueryTabResourceId(id);
  }

  private scheduleSave(file: SavedQueriesFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave(file);
    }, 300);
  }

  private async flushSave(file: SavedQueriesFile): Promise<void> {
    const api = this.electron.bridge()?.database;
    if (!api?.setQueries) {
      return;
    }
    try {
      this.fileState.set(parseSavedQueriesFile(await api.setQueries(file)));
    } catch (error) {
      this.notifier.reportUnknown(error);
    }
  }
}

function insertChild(
  nodes: readonly SavedQueryTreeItem[],
  parentId: string | null,
  child: SavedQueryTreeItem,
): SavedQueryTreeItem[] {
  return insertChildIntoFolderTree(
    nodes,
    parentId,
    child,
    isSavedQueryFolder,
    stampQueryFolder,
    queryFolderChildren,
  );
}

function stampQueryFolder(
  folder: SavedQueryTreeItem,
  children: readonly SavedQueryTreeItem[],
): SavedQueryTreeItem {
  if (!isSavedQueryFolder(folder)) {
    return folder;
  }
  return { ...folder, children, updatedAt: new Date().toISOString() };
}

function queryFolderChildren(item: SavedQueryTreeItem): readonly SavedQueryTreeItem[] {
  return isSavedQueryFolder(item) ? item.children : [];
}

function insertSiblingAfter(
  nodes: readonly SavedQueryTreeItem[],
  siblingId: string,
  child: SavedQueryTreeItem,
): SavedQueryTreeItem[] {
  const index = nodes.findIndex((item) => item.id === siblingId);
  if (index >= 0) {
    return [...nodes.slice(0, index + 1), child, ...nodes.slice(index + 1)];
  }
  return nodes.map((item) => {
    if (!isSavedQueryFolder(item)) {
      return item;
    }
    return { ...item, children: insertSiblingAfter(item.children, siblingId, child) };
  });
}

function removeNode(nodes: readonly SavedQueryTreeItem[], id: string): SavedQueryTreeItem[] {
  return nodes
    .filter((item) => item.id !== id)
    .map((item) =>
      isSavedQueryFolder(item) ? { ...item, children: removeNode(item.children, id) } : item,
    );
}
