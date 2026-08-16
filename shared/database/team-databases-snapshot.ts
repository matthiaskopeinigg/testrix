import { z } from 'zod';

import {
  databaseConnectionTreeItemSchema,
  flattenDatabaseConnections,
  isDatabaseConnectionFolder,
  isDatabaseConnectionLeaf,
  normalizeDatabaseSettings,
  type DatabaseConnection,
  type DatabaseConnectionTreeItem,
  type DatabaseSettings,
} from '../config/database-settings.schema';

export const TEAM_DATABASES_FILE_SCHEMA_VERSION = 1;

export const teamDatabasesFileSchema = z.object({
  schemaVersion: z.literal(TEAM_DATABASES_FILE_SCHEMA_VERSION).default(TEAM_DATABASES_FILE_SCHEMA_VERSION),
  nodes: z.array(databaseConnectionTreeItemSchema).default([]),
});

export type TeamDatabasesFile = z.infer<typeof teamDatabasesFileSchema>;

/**
 * Builds a shareable connection tree with passwords and Instant Client paths removed.
 */
export function sanitizeDatabaseConnectionTree(
  nodes: readonly DatabaseConnectionTreeItem[],
): DatabaseConnectionTreeItem[] {
  return nodes.map((item) => {
    if (isDatabaseConnectionFolder(item)) {
      return { ...item, children: sanitizeDatabaseConnectionTree(item.children) };
    }
    const { password: _password, clientPath: _clientPath, ...rest } = item;
    return rest;
  });
}

/** Snapshot written to profile-local `databases.json` for Teams sync. */
export function createTeamDatabasesSnapshot(
  settings: Pick<DatabaseSettings, 'nodes'> | DatabaseSettings,
): TeamDatabasesFile {
  return {
    schemaVersion: TEAM_DATABASES_FILE_SCHEMA_VERSION,
    nodes: sanitizeDatabaseConnectionTree(settings.nodes),
  };
}

/** Empty team databases snapshot used when creating a profile folder. */
export function createDefaultTeamDatabasesFile(): TeamDatabasesFile {
  return { schemaVersion: TEAM_DATABASES_FILE_SCHEMA_VERSION, nodes: [] };
}

function collectConnectionSecrets(
  nodes: readonly DatabaseConnectionTreeItem[],
): Map<string, Pick<DatabaseConnection, 'password' | 'clientPath'>> {
  const secrets = new Map<string, Pick<DatabaseConnection, 'password' | 'clientPath'>>();
  for (const conn of flattenDatabaseConnections(nodes)) {
    secrets.set(conn.id, { password: conn.password, clientPath: conn.clientPath });
  }
  return secrets;
}

function applyLocalSecrets(
  nodes: readonly DatabaseConnectionTreeItem[],
  secrets: ReadonlyMap<string, Pick<DatabaseConnection, 'password' | 'clientPath'>>,
): DatabaseConnectionTreeItem[] {
  return nodes.map((item) => {
    if (isDatabaseConnectionFolder(item)) {
      return { ...item, children: applyLocalSecrets(item.children, secrets) };
    }
    if (!isDatabaseConnectionLeaf(item)) {
      return item;
    }
    const local = secrets.get(item.id);
    if (!local) {
      return { ...item, password: item.password ?? '', clientPath: item.clientPath };
    }
    return {
      ...item,
      password: local.password || item.password,
      clientPath: local.clientPath || item.clientPath,
    };
  });
}

/**
 * Applies a pulled sanitized tree onto local settings, keeping local passwords.
 */
export function mergeTeamDatabasesIntoSettings(
  local: DatabaseSettings,
  incoming: TeamDatabasesFile | { readonly nodes?: readonly DatabaseConnectionTreeItem[] },
): DatabaseSettings {
  const incomingNodes = incoming.nodes ?? [];
  const mergedNodes = applyLocalSecrets(incomingNodes, collectConnectionSecrets(local.nodes));
  return normalizeDatabaseSettings({
    nodes: mergedNodes,
    idleDisconnectMinutes: local.idleDisconnectMinutes,
  });
}
