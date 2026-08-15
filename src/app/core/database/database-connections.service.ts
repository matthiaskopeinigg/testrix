import { Injectable, computed, inject } from '@angular/core';

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

/**
 * Shared `settings.json` database connections as a folder tree.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseConnectionsService {
  private readonly config = inject(ConfigService);

  readonly nodes = computed(() => this.config.settings()?.databases.nodes ?? []);
  readonly connections = computed(() => flattenDatabaseConnections(this.nodes()));

  find(id: string): DatabaseConnection | null {
    return findDatabaseConnection(this.nodes(), id);
  }

  async saveNodes(nodes: readonly DatabaseConnectionTreeItem[]): Promise<void> {
    const normalized = normalizeDatabaseSettings({ nodes });
    await this.config.patchSettings({
      databases: {
        connections: [...normalized.connections],
        nodes: [...normalized.nodes],
      },
    });
  }

  async createConnection(parentId: string | null = null): Promise<DatabaseConnection> {
    const connection = createDefaultDatabaseConnection();
    await this.saveNodes(insertChild(this.nodes(), parentId, connection));
    return connection;
  }

  async createFolder(name = 'New folder', parentId: string | null = null): Promise<string> {
    const folder: DatabaseConnectionTreeItem = {
      id: newTestingId(),
      kind: 'folder',
      name,
      children: [],
      updatedAt: new Date().toISOString(),
    };
    await this.saveNodes(insertChild(this.nodes(), parentId, folder));
    return folder.id;
  }

  async patchConnection(
    id: string,
    patch: Partial<Omit<DatabaseConnection, 'id' | 'kind'>>,
  ): Promise<void> {
    await this.saveNodes(
      mapDatabaseConnectionTree(this.nodes(), (item) => {
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
    const ts = new Date().toISOString();
    await this.saveNodes(
      mapDatabaseConnectionTree(this.nodes(), (item) => {
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
    await this.saveNodes(insertSiblingAfter(this.nodes(), id, copy));
    return copy;
  }

  async deleteNode(id: string): Promise<void> {
    await this.saveNodes(removeNode(this.nodes(), id));
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
    const item = findDatabaseConnectionTreeItem(this.nodes(), connectionId);
    if (!item || isDatabaseConnectionFolder(item)) {
      return;
    }
    if (parentId) {
      const parent = findDatabaseConnectionTreeItem(this.nodes(), parentId);
      if (!parent || !isDatabaseConnectionFolder(parent)) {
        return;
      }
    }
    await this.saveNodes(insertChild(removeNode(this.nodes(), connectionId), parentId, item));
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
  return nodes
    .filter((item) => item.id !== id)
    .map((item) =>
      isDatabaseConnectionFolder(item) ? { ...item, children: removeNode(item.children, id) } : item,
    );
}
