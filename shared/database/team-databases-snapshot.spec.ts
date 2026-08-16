import { describe, expect, it } from 'vitest';

import type { DatabaseConnection, DatabaseConnectionFolder } from '../config/database-settings.schema';

import {
  createTeamDatabasesSnapshot,
  mergeTeamDatabasesFiles,
  mergeTeamDatabasesIntoSettings,
  overlayProfileDatabasesOnSettings,
  sanitizeDatabaseConnectionTree,
  sanitizeTeamDatabasesFile,
  stripSharedSettingsDatabases,
} from './team-databases-snapshot';

function connection(
  patch: Partial<DatabaseConnection> & Pick<DatabaseConnection, 'id' | 'name'>,
): DatabaseConnection {
  return {
    kind: 'connection',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    connectOnBoot: false,
    ...patch,
  };
}

describe('sanitizeDatabaseConnectionTree', () => {
  it('strips password and clientPath from connections', () => {
    const folder: DatabaseConnectionFolder = {
      id: 'f1',
      kind: 'folder',
      name: 'Prod',
      updatedAt: '2026-01-01T00:00:00.000Z',
      children: [connection({ id: 'c1', name: 'Primary', password: 'secret', clientPath: 'C:\\\\oracle' })],
    };
    const sanitized = sanitizeDatabaseConnectionTree([folder]);
    const child = sanitized[0];
    expect(child && 'children' in child ? child.children[0] : null).toMatchObject({
      id: 'c1',
      name: 'Primary',
    });
    expect(JSON.stringify(sanitized)).not.toContain('secret');
    expect(JSON.stringify(sanitized)).not.toContain('oracle');
  });
});

describe('mergeTeamDatabasesIntoSettings', () => {
  it('keeps local passwords when the incoming snapshot omits them', () => {
    const local = {
      connections: [connection({ id: 'c1', name: 'Primary', password: 'keep-me' })],
      nodes: [connection({ id: 'c1', name: 'Primary', password: 'keep-me' })],
      idleDisconnectMinutes: 15,
    };
    const incoming = createTeamDatabasesSnapshot({
      nodes: [connection({ id: 'c1', name: 'Renamed', host: 'db.example' })],
    });
    const merged = mergeTeamDatabasesIntoSettings(local, incoming);
    expect(merged.idleDisconnectMinutes).toBe(15);
    expect(merged.connections[0]).toMatchObject({
      id: 'c1',
      name: 'Renamed',
      host: 'db.example',
      password: 'keep-me',
    });
  });

  it('keeps local selectedSchemas when the incoming snapshot omits them', () => {
    const local = {
      connections: [connection({ id: 'c1', name: 'Primary', selectedSchemas: ['public', 'app'] })],
      nodes: [connection({ id: 'c1', name: 'Primary', selectedSchemas: ['public', 'app'] })],
      idleDisconnectMinutes: 0,
    };
    const incoming = createTeamDatabasesSnapshot({
      nodes: [connection({ id: 'c1', name: 'Primary' })],
    });
    const merged = mergeTeamDatabasesIntoSettings(local, incoming);
    expect(merged.connections[0]?.selectedSchemas).toEqual(['public', 'app']);
  });
});

describe('overlayProfileDatabasesOnSettings', () => {
  it('replaces connection rows and keeps idle disconnect from settings', () => {
    const settings = {
      databases: {
        connections: [connection({ id: 'old', name: 'Old' })],
        nodes: [connection({ id: 'old', name: 'Old' })],
        idleDisconnectMinutes: 20,
      },
    };
    const overlayed = overlayProfileDatabasesOnSettings(settings, {
      schemaVersion: 1,
      nodes: [connection({ id: 'new', name: 'New', password: 'secret' })],
    });
    expect(overlayed.databases.idleDisconnectMinutes).toBe(20);
    expect(overlayed.databases.connections.map((item) => item.id)).toEqual(['new']);
    expect(overlayed.databases.connections[0]?.password).toBe('secret');
  });

  it('keeps shared settings connections when the profile file is still empty', () => {
    const settings = {
      databases: {
        connections: [connection({ id: 'old', name: 'Old' })],
        nodes: [connection({ id: 'old', name: 'Old' })],
        idleDisconnectMinutes: 0,
      },
    };
    const overlayed = overlayProfileDatabasesOnSettings(settings, {
      schemaVersion: 1,
      nodes: [],
    });
    expect(overlayed.databases.connections.map((item) => item.id)).toEqual(['old']);
  });
});

describe('stripSharedSettingsDatabases', () => {
  it('clears connection rows and keeps idle disconnect', () => {
    const settings = {
      databases: {
        connections: [connection({ id: 'c1', name: 'Primary' })],
        nodes: [connection({ id: 'c1', name: 'Primary' })],
        idleDisconnectMinutes: 9,
      },
    };
    const stripped = stripSharedSettingsDatabases(settings);
    expect(stripped.databases.connections).toEqual([]);
    expect(stripped.databases.nodes).toEqual([]);
    expect(stripped.databases.idleDisconnectMinutes).toBe(9);
  });
});

describe('mergeTeamDatabasesFiles', () => {
  it('keeps local passwords when the incoming team file omits them', () => {
    const local = {
      schemaVersion: 1 as const,
      nodes: [connection({ id: 'c1', name: 'Primary', password: 'keep-me' })],
    };
    const incoming = sanitizeTeamDatabasesFile({
      schemaVersion: 1,
      nodes: [connection({ id: 'c1', name: 'Renamed', host: 'db.example', password: 'keep-me' })],
    });
    const merged = mergeTeamDatabasesFiles(local, incoming);
    expect(merged.nodes[0]).toMatchObject({
      id: 'c1',
      name: 'Renamed',
      host: 'db.example',
      password: 'keep-me',
    });
  });
});
