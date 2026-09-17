import { z } from 'zod';

import {
  DEFAULT_CERTIFICATE_SETTINGS,
  DEFAULT_DNS_SETTINGS,
  DEFAULT_PROXY_SETTINGS,
  certificateSettingsSchema,
  dnsSettingsSchema,
  parseCertificateSettings,
  parseDnsSettings,
  parseProxySettings,
  proxySettingsSchema,
} from './network-settings';
import { DEFAULT_SHORTCUTS, shortcutsSchema } from './shortcuts';
import {
  DEFAULT_DATABASE_PREFS,
  databasePrefsSchema,
  parseDatabasePrefs,
} from './database';
import { parseToolOrderIds } from './tools';

export const CONFIG_SCHEMA_VERSION = 1;

export const themePreferenceSchema = z.enum(['dark', 'light', 'system']);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const resolvedThemeSchema = z.enum(['dark', 'light']);

export type ResolvedTheme = z.infer<typeof resolvedThemeSchema>;

export const animationSpeedSchema = z.enum(['none', 'slow', 'normal', 'fast']);

export type AnimationSpeed = z.infer<typeof animationSpeedSchema>;

export const fontUiSchema = z.enum(['segoe-variable', 'segoe', 'system']);

export type FontUi = z.infer<typeof fontUiSchema>;

export const FONT_UI_OPTIONS = fontUiSchema.options;

export const fontMonoSchema = z.enum(['cascadia', 'consolas', 'ui-monospace']);

export type FontMono = z.infer<typeof fontMonoSchema>;

export const FONT_MONO_OPTIONS = fontMonoSchema.options;

export const typeScaleSchema = z.enum(['sm', 'md', 'lg']);

export type TypeScale = z.infer<typeof typeScaleSchema>;

export const TYPE_SCALE_OPTIONS = typeScaleSchema.options;

export const logLevelSchema = z.enum(['error', 'warn', 'info', 'debug']);

export type LogLevel = z.infer<typeof logLevelSchema>;

export const LOG_LEVEL_OPTIONS = logLevelSchema.options;

export const LOG_FILE_MAX_MB_MIN = 1;

export const LOG_FILE_MAX_MB_MAX = 50;

export const LOG_FILE_MAX_MB_DEFAULT = 10;

export const settingsResetScopeSchema = z.enum([
  'all',
  'appearance',
  'keyboard',
  'logging',
  'proxy',
  'dns',
  'certificates',
  'database',
]);

export type SettingsResetScope = z.infer<typeof settingsResetScopeSchema>;

export const userSettingsSchema = z.object({
  theme: themePreferenceSchema,
  animationSpeed: animationSpeedSchema,
  closeAnimationSpeed: animationSpeedSchema,
  fontUi: fontUiSchema,
  fontMono: fontMonoSchema,
  fontScale: typeScaleSchema,
  iconScale: typeScaleSchema,
  shortcuts: shortcutsSchema,
  logLevel: logLevelSchema,
  logToFile: z.boolean(),
  logsFolder: z.string(),
  logFileMaxMb: z.number().int().min(LOG_FILE_MAX_MB_MIN).max(LOG_FILE_MAX_MB_MAX),
  toolsOrderIds: z.array(z.string()),
  proxy: proxySettingsSchema,
  dns: dnsSettingsSchema,
  certificates: certificateSettingsSchema,
  database: databasePrefsSchema,
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  animationSpeed: 'normal',
  closeAnimationSpeed: 'normal',
  fontUi: 'segoe-variable',
  fontMono: 'cascadia',
  fontScale: 'md',
  iconScale: 'md',
  shortcuts: { ...DEFAULT_SHORTCUTS },
  logLevel: 'warn',
  logToFile: false,
  logsFolder: '',
  logFileMaxMb: LOG_FILE_MAX_MB_DEFAULT,
  toolsOrderIds: [],
  proxy: { ...DEFAULT_PROXY_SETTINGS },
  dns: { ...DEFAULT_DNS_SETTINGS },
  certificates: { ...DEFAULT_CERTIFICATE_SETTINGS, clientCerts: [] },
  database: { ...DEFAULT_DATABASE_PREFS },
};

export const APPEARANCE_SETTING_KEYS = [
  'theme',
  'animationSpeed',
  'closeAnimationSpeed',
  'fontUi',
  'fontMono',
  'fontScale',
  'iconScale',
] as const satisfies readonly (keyof UserSettings)[];

export const settingsFileSchema = userSettingsSchema.extend({
  schemaVersion: z.number().int().positive(),
});

export type SettingsFile = z.infer<typeof settingsFileSchema>;

export const DEFAULT_SETTINGS_FILE: SettingsFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  ...DEFAULT_USER_SETTINGS,
};

export const themeSnapshotSchema = z.object({
  preference: themePreferenceSchema,
  resolved: resolvedThemeSchema,
});

export type ThemeSnapshot = z.infer<typeof themeSnapshotSchema>;

/**
 * Deep-clones default user settings so nested network objects stay independent.
 */
export function cloneDefaultUserSettings(): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    toolsOrderIds: [...DEFAULT_USER_SETTINGS.toolsOrderIds],
    proxy: { ...DEFAULT_PROXY_SETTINGS },
    dns: { ...DEFAULT_DNS_SETTINGS },
    certificates: {
      ...DEFAULT_CERTIFICATE_SETTINGS,
      clientCerts: DEFAULT_CERTIFICATE_SETTINGS.clientCerts.map((item) => ({ ...item })),
    },
    database: { ...DEFAULT_DATABASE_PREFS },
  };
}

/**
 * Applies a settings patch while keeping nested proxy, DNS, and certificate objects intact.
 */
export function mergeUserSettingsPatch(
  current: UserSettings,
  patch: Partial<UserSettings>,
): UserSettings {
  return {
    ...current,
    ...patch,
    shortcuts: patch.shortcuts
      ? { ...DEFAULT_SHORTCUTS, ...current.shortcuts, ...patch.shortcuts }
      : current.shortcuts,
    toolsOrderIds: patch.toolsOrderIds ?? current.toolsOrderIds,
    proxy: { ...current.proxy, ...patch.proxy },
    dns: { ...current.dns, ...patch.dns },
    certificates: {
      ...current.certificates,
      ...patch.certificates,
      clientCerts: patch.certificates?.clientCerts ?? current.certificates.clientCerts,
    },
    database: { ...current.database, ...patch.database },
  };
}

/**
 * Merges a raw settings.json object onto defaults so older files still load.
 */
export function parseSettingsFile(raw: unknown): SettingsFile {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const shortcutsRaw =
    source['shortcuts'] && typeof source['shortcuts'] === 'object'
      ? (source['shortcuts'] as Record<string, unknown>)
      : {};
  return settingsFileSchema.parse({
    ...DEFAULT_SETTINGS_FILE,
    ...source,
    shortcuts: {
      ...DEFAULT_SHORTCUTS,
      ...shortcutsRaw,
    },
    logsFolder: typeof source['logsFolder'] === 'string' ? source['logsFolder'] : '',
    logFileMaxMb: parseLogFileMaxMb(source['logFileMaxMb']),
    toolsOrderIds: parseToolOrderIds(source['toolsOrderIds']),
    proxy: parseProxySettings(source['proxy']),
    dns: parseDnsSettings(source['dns']),
    certificates: parseCertificateSettings(source['certificates']),
    database: parseDatabasePrefs(source['database']),
    schemaVersion: CONFIG_SCHEMA_VERSION,
  });
}

function parseLogFileMaxMb(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value))
    return LOG_FILE_MAX_MB_DEFAULT;
  return Math.min(LOG_FILE_MAX_MB_MAX, Math.max(LOG_FILE_MAX_MB_MIN, Math.round(value)));
}

export function toUserSettings(file: SettingsFile): UserSettings {
  const { schemaVersion: _schemaVersion, ...settings } = file;
  return settings;
}
