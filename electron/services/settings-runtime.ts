import { createDefaultSettings, type SettingsFile } from '../../shared/config';

let runtimeSettings: SettingsFile = createDefaultSettings();

/** Updates in-memory settings used by main-process services (logger, config writes). */
export function setMainSettings(settings: SettingsFile): void {
  runtimeSettings = settings;
}

/** Current settings snapshot for main-process consumers. */
export function getMainSettings(): SettingsFile {
  return runtimeSettings;
}
