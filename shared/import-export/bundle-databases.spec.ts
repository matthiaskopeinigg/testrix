import { describe, expect, it } from 'vitest';

import { createDefaultDatabaseConnection } from '../config/database-settings.schema';
import { liftDatabasesFromSettings, omitSettingsDatabases } from './bundle-databases';
import { TESTRIX_BUNDLE_SCHEMA_V1, type TestrixBundleV1 } from './testrix-bundle.schema';

function connection(id: string, name: string) {
  return { ...createDefaultDatabaseConnection('postgresql', id), name };
}

describe('liftDatabasesFromSettings', () => {
  it('moves settings.databases onto the databases section and strips the settings blob', () => {
    const conn = connection('db-1', 'Local Postgres');
    const source: TestrixBundleV1 = {
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      settings: {
        databases: {
          connections: [conn],
          nodes: [conn],
        },
        privacy: { telemetryEnabled: false },
      },
    };

    const lifted = liftDatabasesFromSettings(source);

    expect(lifted.settings?.databases).toBeUndefined();
    expect(lifted.settings?.privacy).toEqual({ telemetryEnabled: false });
    expect(lifted.databases?.connections?.connections.map((item) => item.id)).toEqual(['db-1']);
  });

  it('keeps an explicit databases.connections payload over settings.databases', () => {
    const fromSettings = connection('old', 'Old');
    const fromSection = connection('new', 'New');
    const lifted = liftDatabasesFromSettings({
      schema: TESTRIX_BUNDLE_SCHEMA_V1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      databases: {
        connections: { connections: [fromSection], nodes: [fromSection] },
      },
      settings: {
        databases: { connections: [fromSettings], nodes: [fromSettings] },
      },
    });

    expect(lifted.databases?.connections?.connections[0]?.id).toBe('new');
    expect(lifted.settings?.databases).toBeUndefined();
  });
});

describe('omitSettingsDatabases', () => {
  it('drops databases from a settings snapshot', () => {
    const omitted = omitSettingsDatabases({
      databases: { connections: [], nodes: [] },
      privacy: { telemetryEnabled: false },
    });

    expect(omitted?.databases).toBeUndefined();
    expect(omitted?.privacy).toEqual({ telemetryEnabled: false });
  });
});
