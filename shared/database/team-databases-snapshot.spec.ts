import { describe, expect, it } from 'vitest';

import type { DatabaseConnection, DatabaseConnectionFolder } from '../config/database-settings.schema';

import {
  createTeamDatabasesSnapshot,
  mergeTeamDatabasesIntoSettings,
  sanitizeDatabaseConnectionTree,
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
