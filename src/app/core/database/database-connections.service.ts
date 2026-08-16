import { Injectable, computed, inject, signal } from '@angular/core';

import {
  collectDatabaseConnectionFolders,
  createDefaultDatabaseConnection,
  findDatabaseConnection,
  findDatabaseConnectionParentId,
  findDatabaseConnectionTreeItem,
  flattenDatabaseConnections,
  insertChildIntoFolderTree,
  isDatabaseConnectionFolder,
  isDatabaseConnectionLeaf,
  mapDatabaseConnectionTree,
  normalizeDatabaseSettings,
  type DatabaseConnection,
  type DatabaseConnectionTreeItem,
} from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { newTestingId } from '@app/core/testing/testing-id';

export interface DatabaseConnectionDraft {
  readonly connection: DatabaseConnection;
  readonly parentId: string | null;
}

/**
 * Inserts unsaved connection drafts into the persisted folder tree for the sidebar.
 *
 * @param nodes Saved connection tree.
 * @param drafts In-memory new connections not yet written to settings.
 */
export function mergeDatabaseConnectionDrafts(
  nodes: readonly DatabaseConnectionTreeItem[],
  drafts: readonly DatabaseConnectionDraft[],
): DatabaseConnectionTreeItem[] {
  let next = [...nodes];
  for (const draft of drafts) {
    next = insertChild(next, draft.parentId, { ...draft.connection, kind: 'connection' });
  }
  return next;
}

/**
 * Shared `settings.json` database connections as a folder tree.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseConnectionsService {
  private readonly config = inject(ConfigService);
  private readonly drafts = signal<readonly DatabaseConnectionDraft[]>([]);

  readonly persistedNodes = computed(() => this.config.settings()?.databases.nodes ?? []);
  readonly nodes = computed(() => mergeDatabaseConnectionDrafts(this.persistedNodes(), this.drafts()));
  readonly connections = computed(() => flattenDatabaseConnections(this.nodes()));

  find(id: string): DatabaseConnection | null {
    return findDatabaseConnection(this.nodes(), id);
  }

  /**
   * True when the connection exists only in memory (not yet saved).
   */
  isDraft(id: string): boolean {
    return this.drafts().some((draft) => draft.connection.id === id);
  }

  async saveNodes(nodes: readonly DatabaseConnectionTreeItem[]): Promise<void> {
    const normalized = normalizeDatabaseSettings({
      nodes,
      idleDisconnectMinutes: this.config.settings()?.databases.idleDisconnectMinutes,
    });
    await this.config.patchSettings({
      databases: {
        connections: [...normalized.connections],
        nodes: [...normalized.nodes],
        idleDisconnectMinutes: normalized.idleDisconnectMinutes,
      },
    });
  }

  /**
   * Persists sidebar reorder/drop results without writing unsaved drafts.
   */
  async saveVisibleTree(nodes: readonly DatabaseConnectionTreeItem[]): Promise<void> {
    const draftIds = new Set(this.drafts().map((draft) => draft.connection.id));
    this.drafts.set(
      this.drafts().flatMap((draft) => {
        const found = findDatabaseConnection(nodes, draft.connection.id);
        if (!found) {
          return [];
        }
        return [
          {
            connection: found,
            parentId: findDatabaseConnectionParentId(nodes, draft.connection.id) ?? null,
          },
        ];
      }),
    );
    await this.saveNodes(omitConnectionIds(nodes, draftIds));
  }

  /**
   * Adds a connection that stays in memory until {@link commitDraft}.
   */
  async createConnection(parentId: string | null = null): Promise<DatabaseConnection> {
    const connection = createDefaultDatabaseConnection();
    this.drafts.update((list) => [...list, { connection, parentId }]);
    return connection;
  }

  /**
   * Writes an unsaved connection to settings.
   */
  async commitDraft(connection: DatabaseConnection): Promise<void> {
    const draft = this.drafts().find((item) => item.connection.id === connection.id);
    if (!draft) {
      return;
    }
    await this.saveNodes(insertChild(this.persistedNodes(), draft.parentId, { ...connection, kind: 'connection' }));
    this.drafts.update((list) => list.filter((item) => item.connection.id !== connection.id));
  }

  /**
   * Drops an unsaved connection without writing settings.
   */
  discardDraft(id: string): void {
    this.drafts.update((list) => list.filter((item) => item.connection.id !== id));
  }

  async createFolder(name = 'New folder', parentId: string | null = null): Promise<string> {
    const folder: DatabaseConnectionTreeItem = {
      id: newTestingId(),
      kind: 'folder',
      name,
      children: [],
      updatedAt: new Date().toISOString(),
    };
    await this.saveNodes(insertChild(this.persistedNodes(), parentId, folder));
    return folder.id;
  }

  async patchConnection(
    id: string,
    patch: Partial<Omit<DatabaseConnection, 'id' | 'kind'>>,
  ): Promise<void> {
    if (this.isDraft(id)) {
      this.drafts.update((list) =>
        list.map((item) =>
          item.connection.id === id
            ? {
                ...item,
                connection: { ...item.connection, ...patch, id: item.connection.id, kind: 'connection' },
              }
            : item,
        ),
      );
      return;
    }
    await this.saveNodes(
      mapDatabaseConnectionTree(this.persistedNodes(), (item) => {
        if (isDatabaseConnectionLeaf(item) && item.id === id) {
          return { ...item, ...patch, id: item.id, kind: 'connection' };
        }
        return item;
      }),
    );
  }

  async renameNode(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    if (this.isDraft(id)) {
      await this.patchConnection(id, { name: trimmed });
      return;
    }
    const ts = new Date().toISOString();
    await this.saveNodes(
      mapDatabaseConnectionTree(this.persistedNodes(), (item) => {
        if (item.id !== id) {
          return item;
        }
        if (isDatabaseConnectionFolder(item)) {
          return { ...item, name: trimmed, updatedAt: ts };
        }
        return { ...item, name: trimmed };
      }),
    );
  }

  async duplicateConnection(id: string): Promise<DatabaseConnection | null> {
    const source = this.find(id);
    if (!source) {
      return null;
    }
    const copy: DatabaseConnection = {
      ...source,
      id: newTestingId(),
      kind: 'connection',
      name: `${source.name} copy`,
    };
    const parentId = findDatabaseConnectionParentId(this.nodes(), id) ?? null;
    if (this.isDraft(id)) {
      this.drafts.update((list) => [...list, { connection: copy, parentId }]);
      return copy;
    }
    await this.saveNodes(insertSiblingAfter(this.persistedNodes(), id, copy));
    return copy;
  }

  async deleteNode(id: string): Promise<void> {
    if (this.isDraft(id)) {
      this.discardDraft(id);
      return;
    }
    await this.saveNodes(removeNode(this.persistedNodes(), id));
  }

  /**
   * Moves a connection into `parentId` (or the root when `null`).
   */
  async moveConnectionToFolder(connectionId: string, parentId: string | null): Promise<void> {
    const currentParent = findDatabaseConnectionParentId(this.nodes(), connectionId);
    if (currentParent === undefined) {
      return;
    }
    if (currentParent === parentId) {
      return;
    }
    if (this.isDraft(connectionId)) {
      this.drafts.update((list) =>
        list.map((item) => (item.connection.id === connectionId ? { ...item, parentId } : item)),
      );
      return;
    }
    const item = findDatabaseConnectionTreeItem(this.persistedNodes(), connectionId);
    if (!item || isDatabaseConnectionFolder(item)) {
      return;
    }
    if (parentId) {
      const parent = findDatabaseConnectionTreeItem(this.persistedNodes(), parentId);
      if (!parent || !isDatabaseConnectionFolder(parent)) {
        return;
      }
    }
    await this.saveNodes(insertChild(removeNode(this.persistedNodes(), connectionId), parentId, item));
  }

  folderOptions(): ReturnType<typeof collectDatabaseConnectionFolders> {
    return collectDatabaseConnectionFolders(this.nodes());
  }

  parentFolderId(connectionId: string): string | null {
    return findDatabaseConnectionParentId(this.nodes(), connectionId) ?? null;
  }
}

function insertChild(
  nodes: readonly DatabaseConnectionTreeItem[],
  parentId: string | null,
  child: DatabaseConnectionTreeItem,
): DatabaseConnectionTreeItem[] {
  return insertChildIntoFolderTree(
    nodes,
    parentId,
    child,
    isDatabaseConnectionFolder,
    stampConnectionFolder,
    connectionFolderChildren,
  );
}

function stampConnectionFolder(
  folder: DatabaseConnectionTreeItem,
  children: readonly DatabaseConnectionTreeItem[],
): DatabaseConnectionTreeItem {
  if (!isDatabaseConnectionFolder(folder)) {
    return folder;
  }
  return { ...folder, children, updatedAt: new Date().toISOString() };
}

function connectionFolderChildren(item: DatabaseConnectionTreeItem): readonly DatabaseConnectionTreeItem[] {
  return isDatabaseConnectionFolder(item) ? item.children : [];
}

function insertSiblingAfter(
  nodes: readonly DatabaseConnectionTreeItem[],
  siblingId: string,
  child: DatabaseConnectionTreeItem,
): DatabaseConnectionTreeItem[] {
  const index = nodes.findIndex((item) => item.id === siblingId);
  if (index >= 0) {
    return [...nodes.slice(0, index + 1), child, ...nodes.slice(index + 1)];
  }
  return nodes.map((item) => {
    if (!isDatabaseConnectionFolder(item)) {
      return item;
    }
    return { ...item, children: insertSiblingAfter(item.children, siblingId, child) };
  });
}

function removeNode(
  nodes: readonly DatabaseConnectionTreeItem[],
  id: string,
): DatabaseConnectionTreeItem[] {
  return omitConnectionIds(nodes, new Set([id]));
}

function omitConnectionIds(
  nodes: readonly DatabaseConnectionTreeItem[],
  ids: ReadonlySet<string>,
): DatabaseConnectionTreeItem[] {
  return nodes
    .filter((item) => !ids.has(item.id))
    .map((item) =>
      isDatabaseConnectionFolder(item) ? { ...item, children: omitConnectionIds(item.children, ids) } : item,
    );
}
