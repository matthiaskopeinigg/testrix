import { newEntityId } from './entity-id';
import { CONFIG_SCHEMA_VERSION } from './settings';

export const ANDROID_APKS_DIR_NAME = 'android-apks';

export const emulatorApkSourceSchema = ['file', 'fdroid'] as const;

export type EmulatorApkSource = (typeof emulatorApkSourceSchema)[number];

/** Preset skins the managed AVD can emulate. */
export const EMULATOR_DEVICE_PROFILES = [
  { id: 'pixel_6', label: 'Pixel 6', manufacturer: 'Google' },
  { id: 'pixel_7', label: 'Pixel 7', manufacturer: 'Google' },
  { id: 'pixel_8', label: 'Pixel 8', manufacturer: 'Google' },
  { id: 'pixel_fold', label: 'Pixel Fold', manufacturer: 'Google' },
  { id: 'medium_phone', label: 'Medium Phone', manufacturer: 'Generic' },
] as const;

export type EmulatorDeviceProfileId = (typeof EMULATOR_DEVICE_PROFILES)[number]['id'];

export interface EmulatorDeviceRecord {
  readonly id: string;
  readonly name: string;
  readonly profile: EmulatorDeviceProfileId;
  /** When true, Start presses Home after the AVD is up (warm reuse or fresh). */
  readonly openHome: boolean;
  readonly createdAt: string;
  /**
   * When set, Start launches this named AVD (from Android Studio or another AVD home)
   * instead of rewriting the managed `testrix` profile.
   */
  readonly avdName: string | null;
  /** AVD home directory that contains `{avdName}.ini` when `avdName` is set. */
  readonly avdHome: string | null;
}

export interface EmulatorApkRecord {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly source: EmulatorApkSource;
  readonly packageName: string;
  readonly version: string;
  readonly addedAt: string;
}

export interface EmulatorFile {
  readonly schemaVersion: number;
  readonly selectedSerial: string | null;
  readonly selectedDeviceId: string | null;
  readonly selectedApkId: string | null;
  readonly devices: readonly EmulatorDeviceRecord[];
  readonly apks: readonly EmulatorApkRecord[];
}

export const DEFAULT_EMULATOR_FILE: EmulatorFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  selectedSerial: null,
  selectedDeviceId: null,
  selectedApkId: null,
  devices: [],
  apks: [],
};

export function newEmulatorApkId(_now = Date.now()): string {
  return newEntityId();
}

export function newEmulatorDeviceId(_now = Date.now()): string {
  return newEntityId();
}

export function emptyEmulatorApk(name = 'App', path = ''): EmulatorApkRecord {
  return {
    id: newEmulatorApkId(),
    name,
    path,
    source: 'file',
    packageName: '',
    version: '',
    addedAt: new Date().toISOString(),
  };
}

export function findEmulatorDeviceProfile(profileId: string): (typeof EMULATOR_DEVICE_PROFILES)[number] | null {
  return EMULATOR_DEVICE_PROFILES.find((item) => item.id === profileId) ?? null;
}

export function createEmulatorDevice(
  profileId: EmulatorDeviceProfileId,
  name?: string,
): EmulatorDeviceRecord {
  const profile = findEmulatorDeviceProfile(profileId) ?? EMULATOR_DEVICE_PROFILES[0];
  return {
    id: newEmulatorDeviceId(),
    name: name?.trim() || profile.label,
    profile: profile.id,
    openHome: false,
    createdAt: new Date().toISOString(),
    avdName: null,
    avdHome: null,
  };
}

/** Stable sidebar / flow id for a discovered AVD. */
export function emulatorAvdDeviceId(avdName: string): string {
  const slug = avdName.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `avd_${slug || 'device'}`;
}

/** True when the row launches an existing AVD instead of the managed profile. */
export function isAvdEmulatorDevice(device: EmulatorDeviceRecord): boolean {
  return Boolean(device.avdName?.trim());
}

export interface EmulatorAvdSource {
  readonly name: string;
  readonly displayName: string;
  readonly home: string;
}

/** Builds a sidebar device for an on-disk AVD. */
export function createEmulatorDeviceFromAvd(source: EmulatorAvdSource): EmulatorDeviceRecord {
  const avdName = source.name.trim();
  const display =
    source.displayName.trim() || avdName.replace(/_/g, ' ') || avdName;
  return {
    id: emulatorAvdDeviceId(avdName),
    name: display,
    profile: guessProfileFromAvdName(avdName),
    openHome: false,
    createdAt: new Date().toISOString(),
    avdName,
    avdHome: source.home.trim() || null,
  };
}

/**
 * Keeps app-created devices, refreshes AVD rows still on disk, drops missing AVDs,
 * and appends newly discovered AVDs (skips the managed `testrix` AVD).
 */
export function mergeEmulatorDevicesWithAvds(
  devices: readonly EmulatorDeviceRecord[],
  avds: readonly EmulatorAvdSource[],
  managedAvdName = 'testrix',
): EmulatorDeviceRecord[] {
  const byName = new Map(
    avds
      .filter((item) => item.name.trim() && item.name.trim() !== managedAvdName)
      .map((item) => [item.name.trim(), item] as const),
  );
  const kept: EmulatorDeviceRecord[] = [];
  const seen = new Set<string>();

  for (const device of devices) {
    const avdName = device.avdName?.trim() ?? '';
    if (!avdName) {
      kept.push(device);
      continue;
    }
    if (avdName === managedAvdName)
      continue;
    const live = byName.get(avdName);
    if (!live)
      continue;
    seen.add(avdName);
    kept.push({
      ...device,
      id: emulatorAvdDeviceId(avdName),
      avdName,
      avdHome: live.home.trim() || device.avdHome,
      name: device.name.trim() || live.displayName.trim() || avdName,
    });
  }

  for (const avd of byName.values()) {
    if (seen.has(avd.name.trim()))
      continue;
    kept.push(createEmulatorDeviceFromAvd(avd));
  }

  return kept;
}

function guessProfileFromAvdName(avdName: string): EmulatorDeviceProfileId {
  const lower = avdName.toLowerCase();
  for (const profile of EMULATOR_DEVICE_PROFILES) {
    if (lower.includes(profile.id) || lower.includes(profile.id.replace(/_/g, '')))
      return profile.id;
  }
  return 'pixel_6';
}

/** Workbench tab node id for a device console. */
export function emulatorDeviceTabNodeId(deviceId: string): string {
  return `emulator-device:${deviceId.trim()}`;
}

/** Reads the device id from an emulator workbench tab node id. */
export function parseEmulatorDeviceTabNodeId(nodeId: string): string | null {
  const prefix = 'emulator-device:';
  if (!nodeId.startsWith(prefix))
    return null;
  const id = nodeId.slice(prefix.length).trim();
  return id || null;
}

function parseApkSource(value: unknown): EmulatorApkSource {
  return value === 'fdroid' ? 'fdroid' : 'file';
}

function parseProfile(value: unknown): EmulatorDeviceProfileId {
  if (typeof value === 'string' && findEmulatorDeviceProfile(value))
    return value as EmulatorDeviceProfileId;
  return 'pixel_6';
}

function parseApk(raw: unknown): EmulatorApkRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source['id'] === 'string' ? source['id'].trim() : '';
  const filePath = typeof source['path'] === 'string' ? source['path'] : '';
  if (!id || !filePath)
    return null;
  return {
    id,
    name: typeof source['name'] === 'string' && source['name'].trim() ? source['name'] : id,
    path: filePath,
    source: parseApkSource(source['source']),
    packageName: typeof source['packageName'] === 'string' ? source['packageName'] : '',
    version: typeof source['version'] === 'string' ? source['version'] : '',
    addedAt: typeof source['addedAt'] === 'string' ? source['addedAt'] : new Date().toISOString(),
  };
}

function parseDevice(raw: unknown): EmulatorDeviceRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source['id'] === 'string' ? source['id'].trim() : '';
  if (!id)
    return null;
  const profile = parseProfile(source['profile']);
  const preset = findEmulatorDeviceProfile(profile);
  const avdName =
    typeof source['avdName'] === 'string' && source['avdName'].trim()
      ? source['avdName'].trim()
      : null;
  const avdHome =
    typeof source['avdHome'] === 'string' && source['avdHome'].trim()
      ? source['avdHome'].trim()
      : null;
  return {
    id,
    name:
      typeof source['name'] === 'string' && source['name'].trim()
        ? source['name'].trim()
        : preset?.label ?? id,
    profile,
    openHome: source['openHome'] === true,
    createdAt: typeof source['createdAt'] === 'string' ? source['createdAt'] : new Date().toISOString(),
    avdName,
    avdHome: avdName ? avdHome : null,
  };
}

export function parseEmulatorFile(raw: unknown): EmulatorFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const apks = Array.isArray(source['apks'])
    ? source['apks'].map(parseApk).filter((item): item is EmulatorApkRecord => item !== null)
    : [];
  const devices = Array.isArray(source['devices'])
    ? source['devices'].map(parseDevice).filter((item): item is EmulatorDeviceRecord => item !== null)
    : [];
  const selectedSerial = typeof source['selectedSerial'] === 'string' ? source['selectedSerial'].trim() : '';
  const selectedApkId = typeof source['selectedApkId'] === 'string' ? source['selectedApkId'].trim() : '';
  const selectedDeviceId =
    typeof source['selectedDeviceId'] === 'string' ? source['selectedDeviceId'].trim() : '';
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    selectedSerial: selectedSerial || null,
    selectedDeviceId:
      selectedDeviceId && devices.some((item) => item.id === selectedDeviceId) ? selectedDeviceId : null,
    selectedApkId: selectedApkId && apks.some((item) => item.id === selectedApkId) ? selectedApkId : null,
    devices,
    apks,
  };
}

export function findEmulatorApk(file: EmulatorFile, apkId: string | null | undefined): EmulatorApkRecord | null {
  if (!apkId)
    return null;
  return file.apks.find((item) => item.id === apkId) ?? null;
}

export function findEmulatorDevice(
  file: EmulatorFile,
  deviceId: string | null | undefined,
): EmulatorDeviceRecord | null {
  if (!deviceId)
    return null;
  return file.devices.find((item) => item.id === deviceId) ?? null;
}
