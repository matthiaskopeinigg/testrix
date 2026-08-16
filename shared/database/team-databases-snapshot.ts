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

/** True when the profile `databases.json` has no connection tree yet. */
export function isEmptyTeamDatabasesFile(file: TeamDatabasesFile): boolean {
  return file.nodes.length === 0;
}

/** True when shared settings still hold connection rows (pre–per-profile layout). */
export function hasSharedDatabaseConnections(settings: Pick<DatabaseSettings, 'nodes' | 'connections'>): boolean {
  return flattenDatabaseConnections(settings.nodes).length > 0 || settings.connections.length > 0;
}

/**
 * Builds a local `databases.json` payload, keeping passwords for the profile folder.
 */
export function teamDatabasesFileFromSettings(
  settings: Pick<DatabaseSettings, 'nodes'> | DatabaseSettings,
): TeamDatabasesFile {
  return {
    schemaVersion: TEAM_DATABASES_FILE_SCHEMA_VERSION,
    nodes: [...settings.nodes],
  };
}

/** Strips connection rows from shared settings; idle disconnect stays global. */
export function stripSharedSettingsDatabases<T extends { readonly databases: DatabaseSettings }>(
  settings: T,
): T {
  return {
    ...settings,
    databases: {
      connections: [],
      nodes: [],
      idleDisconnectMinutes: settings.databases.idleDisconnectMinutes,
    },
  };
}

/** Overlays a profile `databases.json` tree onto settings idle-disconnect. */
export function overlayProfileDatabasesOnSettings<T extends { readonly databases: DatabaseSettings }>(
  settings: T,
  profileFile: TeamDatabasesFile,
): T {
  if (isEmptyTeamDatabasesFile(profileFile) && hasSharedDatabaseConnections(settings.databases)) {
    return settings;
  }
  return {
    ...settings,
    databases: normalizeDatabaseSettings({
      nodes: profileFile.nodes,
      idleDisconnectMinutes: settings.databases.idleDisconnectMinutes,
    }),
  };
}

/** Sanitized `databases.json` for the team Git copy (no passwords). */
export function sanitizeTeamDatabasesFile(file: TeamDatabasesFile): TeamDatabasesFile {
  return {
    schemaVersion: file.schemaVersion,
    nodes: sanitizeDatabaseConnectionTree(file.nodes),
  };
}

/**
 * Merges a pulled sanitized snapshot onto a local file, keeping local passwords.
 */
export function mergeTeamDatabasesFiles(
  local: TeamDatabasesFile,
  incoming: TeamDatabasesFile,
): TeamDatabasesFile {
  const merged = mergeTeamDatabasesIntoSettings(
    normalizeDatabaseSettings({ nodes: local.nodes, idleDisconnectMinutes: 0 }),
    incoming,
  );
  return {
    schemaVersion: TEAM_DATABASES_FILE_SCHEMA_VERSION,
    nodes: [...merged.nodes],
  };
}

function collectConnectionSecrets(
  nodes: readonly DatabaseConnectionTreeItem[],
): Map<string, Pick<DatabaseConnection, 'password' | 'clientPath' | 'selectedSchemas'>> {
  const secrets = new Map<string, Pick<DatabaseConnection, 'password' | 'clientPath' | 'selectedSchemas'>>();
  for (const conn of flattenDatabaseConnections(nodes)) {
    secrets.set(conn.id, {
      password: conn.password,
      clientPath: conn.clientPath,
      selectedSchemas: conn.selectedSchemas,
    });
  }
  return secrets;
}

function applyLocalSecrets(
  nodes: readonly DatabaseConnectionTreeItem[],
  secrets: ReadonlyMap<string, Pick<DatabaseConnection, 'password' | 'clientPath' | 'selectedSchemas'>>,
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
      selectedSchemas:
        item.selectedSchemas !== undefined ? item.selectedSchemas : local.selectedSchemas,
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
