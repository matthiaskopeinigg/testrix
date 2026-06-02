import type { App } from 'electron';

import type { ConfigFileService } from '../config/config-file.service';
import { getInstalledAppVersion } from '../app-info.service';
import { setMainSettings } from '../settings-runtime';
import type { SettingsFile } from '../../../shared/config';
import { resolveUpdateChannelForVersion } from '../../../shared/updater/release-version';

/**
 * Aligns the persisted update channel with the installed app version on boot.
 *
 * Beta builds subscribe to the beta channel; stable builds use stable.
 *
 * @param appRef Electron app reference.
 * @param settings Current settings snapshot.
 */
export function syncUpdateChannelWithInstalledVersion(
  appRef: App,
  settings: SettingsFile,
): SettingsFile {
  const appVersion = getInstalledAppVersion(appRef);
  const expectedChannel = resolveUpdateChannelForVersion(appVersion);
  if (settings.updates.channel === expectedChannel) {
    return settings;
  }

  return {
    ...settings,
    updates: {
      ...settings.updates,
      channel: expectedChannel,
    },
    meta: {
      ...settings.meta,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Persists the boot-time update channel sync when it differs from disk.
 *
 * @param appRef Electron app reference.
 * @param files Profile config file service.
 */
export async function applyUpdateChannelBootSync(
  appRef: App,
  files: ConfigFileService,
): Promise<SettingsFile> {
  const current = await files.readSettings();
  const synced = syncUpdateChannelWithInstalledVersion(appRef, current);
  if (synced.updates.channel === current.updates.channel) {
    return current;
  }

  await files.writeSettings(synced);
  setMainSettings(synced);
  return synced;
}
