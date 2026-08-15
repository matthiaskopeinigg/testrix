import {
  normalizeDatabaseSettings,
  type DatabaseSettings,
} from '../config/database-settings.schema';
import type { SettingsFile } from '../config/settings.schema';
import type { TestrixBundleV1 } from './testrix-bundle.schema';

/**
 * True when a database settings block has at least one connection or folder.
 */
export function databaseSettingsHasContent(settings: DatabaseSettings | undefined): boolean {
  if (!settings) {
    return false;
  }
  return settings.nodes.length > 0 || settings.connections.length > 0;
}

/**
 * Moves legacy `settings.databases` onto the first-class `databases` bundle section
 * so import/export shows the connection tree instead of a Settings blob.
 */
export function liftDatabasesFromSettings(bundle: TestrixBundleV1): TestrixBundleV1 {
  const settings = bundle.settings;
  if (!settings || settings.databases === undefined) {
    return bundle;
  }

  const lifted = normalizeDatabaseSettings(settings.databases);
  const nextSettings: Partial<SettingsFile> = { ...settings };
  delete nextSettings.databases;

  const next: TestrixBundleV1 = {
    ...bundle,
    settings: Object.keys(nextSettings).length > 0 ? nextSettings : undefined,
  };

  if (databaseSettingsHasContent(lifted) && !next.databases?.connections) {
    next.databases = {
      ...next.databases,
      connections: lifted,
    };
  }

  return next;
}

/**
 * Drops `databases` from a settings snapshot used for workspace export.
 */
export function omitSettingsDatabases(settings: SettingsFile | Partial<SettingsFile> | undefined): Partial<SettingsFile> | undefined {
  if (!settings) {
    return undefined;
  }
  const next: Partial<SettingsFile> = { ...settings };
  delete next.databases;
  return Object.keys(next).length > 0 ? next : undefined;
}
