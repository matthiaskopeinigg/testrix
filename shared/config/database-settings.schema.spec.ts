import { describe, expect, it } from 'vitest';

import {
  collectDatabaseConnectionFolders,
  createDefaultDatabaseConnection,
  databaseConnectionSchema,
  databaseConnectionTreeItemSchema,
  databaseSettingsSchema,
  defaultPortForDatabaseType,
  findDatabaseConnectionFolderPath,
  findDatabaseConnectionParentId,
  flattenDatabaseConnections,
  formatDatabaseConnectionPickerLabel,
  normalizeDatabaseSettings,
} from './database-settings.schema';
import { createDefaultSettings } from './defaults';
import { migrateSettings } from './migrate';

describe('database-settings.schema', () => {
  it('creates default connection with type-specific port', () => {
    expect(defaultPortForDatabaseType('redis')).toBe(6379);
    expect(defaultPortForDatabaseType('sqlite')).toBe(0);
    const conn = createDefaultDatabaseConnection('mysql');
    expect(conn.type).toBe('mysql');
    expect(conn.port).toBe(3306);
    expect(defaultPortForDatabaseType('oracle')).toBe(1521);
    expect(databaseConnectionSchema.safeParse(conn).success).toBe(true);
  });

  it('defaults settings databases to empty connections and nodes', () => {
    const settings = createDefaultSettings();
    expect(settings.databases.connections).toEqual([]);
    expect(settings.databases.nodes).toEqual([]);
    expect(settings.databases.idleDisconnectMinutes).toBe(0);
    expect(databaseSettingsSchema.safeParse(settings.databases).success).toBe(true);
  });

  it('wraps a legacy flat connections list as root tree nodes', () => {
    const parsed = databaseSettingsSchema.parse({
      connections: [
        {
          id: 'c1',
          name: 'Prod',
          type: 'postgresql',
        },
      ],
    });
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]).toMatchObject({ id: 'c1', kind: 'connection', name: 'Prod' });
    expect(parsed.connections).toHaveLength(1);
    expect(parsed.connections[0]?.id).toBe('c1');
  });

  it('treats an explicit empty nodes array as the source of truth', () => {
    const parsed = databaseSettingsSchema.parse({
      connections: [
        {
          id: 'c1',
          name: 'Prod',
          type: 'postgresql',
        },
      ],
      nodes: [],
    });
    expect(parsed.nodes).toEqual([]);
    expect(parsed.connections).toEqual([]);
  });

  it('flattens nested connection folders', () => {
    const normalized = normalizeDatabaseSettings({
      nodes: [
        {
          id: 'f1',
          kind: 'folder',
          name: 'Prod',
          updatedAt: '2020-01-01T00:00:00.000Z',
          children: [
            {
              id: 'c1',
              kind: 'connection',
              name: 'Primary',
              type: 'postgresql',
              host: 'localhost',
              port: 5432,
              connectOnBoot: false,
            },
          ],
        },
      ],
    });
    expect(flattenDatabaseConnections(normalized.nodes).map((conn) => conn.id)).toEqual(['c1']);
    expect(normalized.connections[0]?.name).toBe('Primary');
  });

  it('keeps a connection with an accidental children array as a connection', () => {
    const parsed = databaseConnectionTreeItemSchema.parse({
      id: 'c1',
      kind: 'connection',
      name: 'Primary',
      type: 'postgresql',
      children: [],
    });
    expect(parsed).toMatchObject({ id: 'c1', kind: 'connection', name: 'Primary' });
  });

  it('drops duplicate connection ids copied into every folder', () => {
    const connection = {
      id: 'c1',
      kind: 'connection' as const,
      name: 'Primary',
      type: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      connectOnBoot: false,
    };
    const normalized = normalizeDatabaseSettings({
      nodes: [
        {
          id: 'f1',
          kind: 'folder',
          name: 'A',
          updatedAt: '2020-01-01T00:00:00.000Z',
          children: [connection],
        },
        {
          id: 'f2',
          kind: 'folder',
          name: 'B',
          updatedAt: '2020-01-01T00:00:00.000Z',
          children: [connection],
        },
      ],
    });
    expect(flattenDatabaseConnections(normalized.nodes).map((conn) => conn.id)).toEqual(['c1']);
    expect(normalized.nodes).toHaveLength(2);
    expect(normalized.nodes[0]).toMatchObject({
      id: 'f1',
      children: [expect.objectContaining({ id: 'c1' })],
    });
    expect(normalized.nodes[1]).toMatchObject({ id: 'f2', children: [] });
  });

  it('migrates legacy settings without databases section', () => {
    const legacy = {
      schemaVersion: 1,
      meta: createDefaultSettings().meta,
      general: createDefaultSettings().general,
      appearance: createDefaultSettings().appearance,
      privacy: createDefaultSettings().privacy,
      updates: createDefaultSettings().updates,
      ui: createDefaultSettings().ui,
      logging: createDefaultSettings().logging,
      dataConfig: createDefaultSettings().dataConfig,
      collections: createDefaultSettings().collections,
      environments: createDefaultSettings().environments,
      testSuite: createDefaultSettings().testSuite,
      editor: createDefaultSettings().editor,
      http: createDefaultSettings().http,
    };
    const migrated = migrateSettings(legacy);
    expect(migrated.databases.connections).toEqual([]);
    expect(migrated.databases.nodes).toEqual([]);
  });

  it('collects nested folders and finds a connection parent', () => {
    const nodes = [
      {
        id: 'f1',
        kind: 'folder' as const,
        name: 'Prod',
        updatedAt: '2020-01-01T00:00:00.000Z',
        children: [
          {
            id: 'f2',
            kind: 'folder' as const,
            name: 'EU',
            updatedAt: '2020-01-01T00:00:00.000Z',
            children: [createDefaultDatabaseConnection('postgresql', 'c1')],
          },
        ],
      },
    ];
    expect(collectDatabaseConnectionFolders(nodes).map((folder) => folder.label)).toEqual([
      'Prod',
      'Prod / EU',
    ]);
    expect(findDatabaseConnectionParentId(nodes, 'c1')).toBe('f2');
    expect(findDatabaseConnectionParentId(nodes, 'f1')).toBeNull();
    expect(findDatabaseConnectionFolderPath(nodes, 'c1')).toEqual(['Prod', 'EU']);
    expect(
      formatDatabaseConnectionPickerLabel(nodes, {
        id: 'c1',
        name: 'Primary',
        type: 'oracle',
      }),
    ).toBe('Prod/EU/Primary (oracle)');
  });
});
