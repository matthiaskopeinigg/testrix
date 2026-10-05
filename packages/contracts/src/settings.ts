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
import {
  collectionKvRowSchema,
  type CollectionKvRow,
} from './collection-folder';
import { DEFAULT_PLACEHOLDER_EMAIL_DOMAIN } from './placeholders';
import { parseAndroidSystemImageAbi, parseAndroidSystemImageApi } from './android-toolchain';
import { clampUiZoom, UI_ZOOM_DEFAULT } from './ui-zoom';
import { DEFAULT_UPDATE_PREFS, parseUpdatePrefs, updatePrefsSchema } from './update';
import { CONFIG_SCHEMA_VERSION } from './config-schema-version';

export {
  clampUiZoom,
  nudgeUiZoom,
  UI_ZOOM_DEFAULT,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  UI_ZOOM_STEP,
} from './ui-zoom';

export { CONFIG_SCHEMA_VERSION } from './config-schema-version';

export const themePreferenceSchema = z.enum(['dark', 'light', 'system']);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const resolvedThemeSchema = z.enum(['dark', 'light']);

export type ResolvedTheme = z.infer<typeof resolvedThemeSchema>;

export const animationSpeedSchema = z.enum(['none', 'slow', 'normal', 'fast']);

export type AnimationSpeed = z.infer<typeof animationSpeedSchema>;

/** Coarse motion preset that drives both animationSpeed and closeAnimationSpeed. */
export const motionPresetSchema = z.enum(['reduced', 'normal', 'snappy', 'custom']);

export type MotionPreset = z.infer<typeof motionPresetSchema>;

export const saveModeSchema = z.enum(['auto', 'manual']);

export type SaveMode = z.infer<typeof saveModeSchema>;

export const SAVE_MODE_OPTIONS = saveModeSchema.options;

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

export const TAB_WARN_THRESHOLD_MIN = 8;

export const TAB_WARN_THRESHOLD_MAX = 200;

export const TAB_WARN_THRESHOLD_DEFAULT = 24;

export const settingsResetScopeSchema = z.enum([
  'all',
  'appearance',
  'keyboard',
  'logging',
  'proxy',
  'dns',
  'certificates',
  'database',
  'http',
  'android',
]);

export type SettingsResetScope = z.infer<typeof settingsResetScopeSchema>;

export const DEFAULT_API_KEY_HEADER = 'X-Api-Key';

export const DEFAULT_HTTP_HEADERS: CollectionKvRow[] = [
  { id: 'hdr-user-agent', enabled: true, key: 'User-Agent', value: 'Testrix/2.0', description: '' },
  { id: 'hdr-accept', enabled: true, key: 'Accept', value: '*/*', description: '' },
  { id: 'hdr-accept-encoding', enabled: true, key: 'Accept-Encoding', value: 'gzip, deflate', description: '' },
  { id: 'hdr-connection', enabled: true, key: 'Connection', value: 'keep-alive', description: '' },
];

export const userSettingsSchema = z.object({
  theme: themePreferenceSchema,
  animationSpeed: animationSpeedSchema,
  closeAnimationSpeed: animationSpeedSchema,
  /** Reduced / Normal / Snappy / Custom — Custom means the two speed controls differ. */
  motionPreset: motionPresetSchema.default('normal'),
  saveMode: saveModeSchema,
  /** Collapse sidebar after opening a request (or when window is narrow). */
  focusWhileEditing: z.boolean().default(false),
  fontUi: fontUiSchema,
  fontMono: fontMonoSchema,
  fontScale: typeScaleSchema,
  iconScale: typeScaleSchema,
  uiZoom: z.number(),
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
  defaultHeaders: z.array(collectionKvRowSchema).default(DEFAULT_HTTP_HEADERS),
  placeholderEmailDomain: z.string().default(DEFAULT_PLACEHOLDER_EMAIL_DOMAIN),
  defaultApiKeyHeader: z.string().default(DEFAULT_API_KEY_HEADER),
  androidEmulatorActivated: z.boolean().default(false),
  androidSdkRoot: z.string().default(''),
  androidSdkLicenseAcceptedAt: z.string().nullable().default(null),
  androidSystemImageTag: z.enum(['google_apis', 'google_apis_playstore']).default('google_apis'),
  androidSystemImageApi: z.number().int().default(34),
  androidSystemImageAbi: z.enum(['x86_64', 'arm64-v8a', '']).default(''),
  /** Soft warning in the strip when open tab count exceeds this (default 24). */
  tabWarnThreshold: z
    .number()
    .int()
    .min(TAB_WARN_THRESHOLD_MIN)
    .max(TAB_WARN_THRESHOLD_MAX)
    .default(TAB_WARN_THRESHOLD_DEFAULT),
  /** When true, palette / data actions may close tabs that are not active in their group. */
  autoCloseInactiveTabs: z.boolean().default(false),
  /** Last workspace import merge mode for repeat drops. */
  lastImportMode: z.enum(['merge', 'replace']).default('merge'),
  /** When true, Settings opens on the full category wizard instead of first-run essentials. */
  settingsWizardCompleted: z.boolean().default(false),
  updates: updatePrefsSchema.default(DEFAULT_UPDATE_PREFS),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  animationSpeed: 'normal',
  closeAnimationSpeed: 'normal',
  motionPreset: 'normal',
  saveMode: 'auto',
  focusWhileEditing: false,
  fontUi: 'segoe-variable',
  fontMono: 'cascadia',
  fontScale: 'md',
  iconScale: 'md',
  uiZoom: UI_ZOOM_DEFAULT,
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
  defaultHeaders: DEFAULT_HTTP_HEADERS.map((row) => ({ ...row })),
  placeholderEmailDomain: DEFAULT_PLACEHOLDER_EMAIL_DOMAIN,
  defaultApiKeyHeader: DEFAULT_API_KEY_HEADER,
  androidEmulatorActivated: false,
  androidSdkRoot: '',
  androidSdkLicenseAcceptedAt: null,
  androidSystemImageTag: 'google_apis',
  androidSystemImageApi: 34,
  androidSystemImageAbi: '',
  tabWarnThreshold: TAB_WARN_THRESHOLD_DEFAULT,
  autoCloseInactiveTabs: false,
  lastImportMode: 'merge',
  settingsWizardCompleted: false,
  updates: { ...DEFAULT_UPDATE_PREFS },
};

export const ANDROID_SETTING_KEYS = [
  'androidEmulatorActivated',
  'androidSdkRoot',
  'androidSdkLicenseAcceptedAt',
  'androidSystemImageTag',
  'androidSystemImageApi',
  'androidSystemImageAbi',
] as const satisfies readonly (keyof UserSettings)[];

export const ONBOARDING_SETTING_KEYS = [
  'settingsWizardCompleted',
] as const satisfies readonly (keyof UserSettings)[];

export const APPEARANCE_SETTING_KEYS = [
  'theme',
  'animationSpeed',
  'closeAnimationSpeed',
  'motionPreset',
  'saveMode',
  'focusWhileEditing',
  'tabWarnThreshold',
  'autoCloseInactiveTabs',
  'fontUi',
  'fontMono',
  'fontScale',
  'iconScale',
  'uiZoom',
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
    defaultHeaders: DEFAULT_USER_SETTINGS.defaultHeaders.map((row) => ({ ...row })),
    placeholderEmailDomain: DEFAULT_USER_SETTINGS.placeholderEmailDomain,
    defaultApiKeyHeader: DEFAULT_USER_SETTINGS.defaultApiKeyHeader,
    androidEmulatorActivated: DEFAULT_USER_SETTINGS.androidEmulatorActivated,
    androidSdkRoot: DEFAULT_USER_SETTINGS.androidSdkRoot,
    androidSdkLicenseAcceptedAt: DEFAULT_USER_SETTINGS.androidSdkLicenseAcceptedAt,
    androidSystemImageTag: DEFAULT_USER_SETTINGS.androidSystemImageTag,
    androidSystemImageApi: DEFAULT_USER_SETTINGS.androidSystemImageApi,
    androidSystemImageAbi: DEFAULT_USER_SETTINGS.androidSystemImageAbi,
    updates: { ...DEFAULT_UPDATE_PREFS },
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
    updates: { ...current.updates, ...patch.updates },
    defaultHeaders: (patch.defaultHeaders ?? current.defaultHeaders).map((row) => ({ ...row })),
    placeholderEmailDomain: patch.placeholderEmailDomain ?? current.placeholderEmailDomain,
    defaultApiKeyHeader: parseApiKeyHeader(patch.defaultApiKeyHeader ?? current.defaultApiKeyHeader),
    uiZoom: clampUiZoom(patch.uiZoom ?? current.uiZoom),
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
    defaultHeaders: parseDefaultHeaders(source['defaultHeaders']),
    placeholderEmailDomain: parseEmailDomain(source['placeholderEmailDomain']),
    defaultApiKeyHeader: parseApiKeyHeader(source['defaultApiKeyHeader']),
    androidEmulatorActivated: source['androidEmulatorActivated'] === true,
    androidSdkRoot: typeof source['androidSdkRoot'] === 'string' ? source['androidSdkRoot'] : '',
    androidSdkLicenseAcceptedAt: parseAndroidLicenseAcceptedAt(source['androidSdkLicenseAcceptedAt']),
    androidSystemImageTag:
      source['androidSystemImageTag'] === 'google_apis_playstore' ? 'google_apis_playstore' : 'google_apis',
    androidSystemImageApi: parseAndroidSystemImageApi(source['androidSystemImageApi']),
    androidSystemImageAbi: parseAndroidSystemImageAbi(source['androidSystemImageAbi']),
    tabWarnThreshold: parseTabWarnThreshold(source['tabWarnThreshold']),
    autoCloseInactiveTabs: source['autoCloseInactiveTabs'] === true,
    focusWhileEditing: source['focusWhileEditing'] === true,
    motionPreset: parseMotionPreset(
      source['motionPreset'],
      source['animationSpeed'],
      source['closeAnimationSpeed'],
    ),
    lastImportMode: source['lastImportMode'] === 'replace' ? 'replace' : 'merge',
    settingsWizardCompleted: source['settingsWizardCompleted'] === true,
    updates: parseUpdatePrefs(source['updates']),
    uiZoom: clampUiZoom(source['uiZoom']),
    schemaVersion: CONFIG_SCHEMA_VERSION,
  });
}

function parseMotionPreset(
  raw: unknown,
  animationSpeed: unknown,
  closeAnimationSpeed: unknown,
): MotionPreset {
  if (raw === 'reduced' || raw === 'normal' || raw === 'snappy' || raw === 'custom')
    return raw
  const open = typeof animationSpeed === 'string' ? animationSpeed : 'normal'
  const close = typeof closeAnimationSpeed === 'string' ? closeAnimationSpeed : open
  if (open !== close)
    return 'custom'
  if (open === 'none')
    return 'reduced'
  if (open === 'fast')
    return 'snappy'
  if (open === 'slow')
    return 'custom'
  return 'normal'
}

/**
 * Maps a coarse motion preset onto the two animation speed fields.
 */
export function speedsForMotionPreset(preset: MotionPreset): {
  readonly animationSpeed: AnimationSpeed
  readonly closeAnimationSpeed: AnimationSpeed
} {
  switch (preset) {
    case 'reduced':
      return { animationSpeed: 'none', closeAnimationSpeed: 'none' }
    case 'snappy':
      return { animationSpeed: 'fast', closeAnimationSpeed: 'fast' }
    case 'custom':
      return { animationSpeed: 'normal', closeAnimationSpeed: 'normal' }
    case 'normal':
    default:
      return { animationSpeed: 'normal', closeAnimationSpeed: 'normal' }
  }
}

/**
 * Infers the coarse preset from the two speed controls.
 */
export function motionPresetFromSpeeds(
  animationSpeed: AnimationSpeed,
  closeAnimationSpeed: AnimationSpeed,
): MotionPreset {
  if (animationSpeed !== closeAnimationSpeed)
    return 'custom'
  if (animationSpeed === 'none')
    return 'reduced'
  if (animationSpeed === 'fast')
    return 'snappy'
  if (animationSpeed === 'slow')
    return 'custom'
  return 'normal'
}

function parseTabWarnThreshold(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value))
    return TAB_WARN_THRESHOLD_DEFAULT;
  return Math.min(TAB_WARN_THRESHOLD_MAX, Math.max(TAB_WARN_THRESHOLD_MIN, Math.round(value)));
}

function parseAndroidLicenseAcceptedAt(raw: unknown): string | null {
  if (typeof raw !== 'string')
    return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function parseDefaultHeaders(raw: unknown): CollectionKvRow[] {
  if (raw === undefined)
    return DEFAULT_HTTP_HEADERS.map((row) => ({ ...row }));
  if (!Array.isArray(raw))
    return DEFAULT_HTTP_HEADERS.map((row) => ({ ...row }));
  return raw.map((item) => collectionKvRowSchema.parse(item));
}

function parseEmailDomain(raw: unknown): string {
  return typeof raw === 'string' ? raw : DEFAULT_PLACEHOLDER_EMAIL_DOMAIN;
}

function parseApiKeyHeader(raw: unknown): string {
  if (typeof raw !== 'string')
    return DEFAULT_API_KEY_HEADER;
  const trimmed = raw.trim();
  return trimmed || DEFAULT_API_KEY_HEADER;
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
