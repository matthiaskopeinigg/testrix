import { describe, expect, it } from 'vitest';

import {
  createDefaultDatabaseConnection,
  databaseConnectionSchema,
  databaseSettingsSchema,
  defaultPortForDatabaseType,
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
    expect(databaseConnectionSchema.safeParse(conn).success).toBe(true);
  });

  it('defaults settings databases to empty connections', () => {
    const settings = createDefaultSettings();
    expect(settings.databases.connections).toEqual([]);
    expect(databaseSettingsSchema.safeParse(settings.databases).success).toBe(true);
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
  });
});
