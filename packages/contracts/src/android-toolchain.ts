/** Managed AVD name created by Testrix. */
export const ANDROID_AVD_NAME = 'testrix';

/** Folder name under userData for the managed SDK. */
export const ANDROID_SDK_DIR_NAME = 'android-sdk';

/** Folder name under userData for the managed AVD home. */
export const ANDROID_AVD_DIR_NAME = 'android-avd';

/** Preferred API level for the managed system image. */
export const ANDROID_PREFERRED_API_LEVEL = 34;

/** API levels offered on the device tab. */
export const ANDROID_SYSTEM_IMAGE_API_LEVELS = [36, 35, 34, 33, 32, 31, 30, 28] as const;

/** Google repository root for emulator and platform-tools zips. */
export const ANDROID_REPO_BASE_URL = 'https://dl.google.com/android/repository';

/** Google repository XML for emulator / platform-tools. */
export const ANDROID_REPO_XML_URL = `${ANDROID_REPO_BASE_URL}/repository2-1.xml`;

/** Managed system-image tags Testrix can download. */
export const ANDROID_SYSTEM_IMAGE_TAGS = ['google_apis', 'google_apis_playstore'] as const;

export type AndroidSystemImageTag = (typeof ANDROID_SYSTEM_IMAGE_TAGS)[number];

/** Default image: Google APIs without the Play Store (smaller). */
export const ANDROID_DEFAULT_SYSTEM_IMAGE_TAG: AndroidSystemImageTag = 'google_apis';

/** Google APIs system-image addon XML. */
export const ANDROID_SYS_IMG_XML_URL = `${ANDROID_REPO_BASE_URL}/sys-img/google_apis/sys-img2-1.xml`;

/** Google Play Store system-image addon XML. */
export const ANDROID_SYS_IMG_PLAYSTORE_XML_URL = `${ANDROID_REPO_BASE_URL}/sys-img/google_apis_playstore/sys-img2-1.xml`;

/** Base URL for Google APIs system-image zips. */
export const ANDROID_SYS_IMG_BASE_URL = `${ANDROID_REPO_BASE_URL}/sys-img/google_apis`;

/** Base URL for Google Play Store system-image zips. */
export const ANDROID_SYS_IMG_PLAYSTORE_BASE_URL = `${ANDROID_REPO_BASE_URL}/sys-img/google_apis_playstore`;

/**
 * Short license notice shown before Activate downloads Google SDK packages.
 */
export const ANDROID_SDK_LICENSE_SUMMARY = [
  'Testrix downloads Google Android SDK packages (platform-tools, the emulator, and one system image) into this PC’s app data folder.',
  'Choose Google APIs (default) or Google Play Store when you Activate. The Play image includes the Play Store app and is larger.',
  'Those packages are licensed by Google under the Android Software Development Kit License Agreement. Testrix does not grant that license.',
  'The first download is about 2–3 GB (Play Store images are larger) and needs the network. Later starts reuse the files on disk.',
  'A hypervisor is required: Windows Hypervisor Platform, KVM on Linux, or Hypervisor.framework on macOS.',
].join('\n\n');

/**
 * Known Android SDK license hashes written after the user accepts in Testrix.
 */
export const ANDROID_SDK_LICENSE_HASHES = [
  '24333f8a63b6825ea9c5514f83c2829b004d1fee',
  'd56f5187479451eabf01fb78af6dfcb301aa916',
  '8933bad161af4178b1185d1d5dc4190',
] as const;

export type AndroidHostOs = 'windows' | 'macos' | 'linux';

export type AndroidAbi = 'x86_64' | 'arm64-v8a';

export type AndroidHypervisorState = 'unknown' | 'ready' | 'missing';

export type AndroidToolchainPhase =
  | 'idle'
  | 'license'
  | 'download'
  | 'extract'
  | 'avd'
  | 'probe'
  | 'start'
  | 'stop'
  | 'remove'
  | 'done'
  | 'error';

export interface AndroidDeviceInfo {
  readonly serial: string;
  readonly state: string;
  readonly model: string;
}

/** On-disk Android Virtual Device discovered under an AVD home. */
export interface AndroidAvdInfo {
  readonly name: string;
  readonly displayName: string;
  readonly home: string;
  readonly path: string;
}

export interface AndroidPackageStatus {
  readonly id: string;
  readonly present: boolean;
}

export interface AndroidHypervisorStatus {
  readonly state: AndroidHypervisorState;
  readonly detail: string;
  readonly hint: string;
}

export interface AndroidToolchainStatus {
  readonly activated: boolean;
  readonly licenseAccepted: boolean;
  readonly busy: boolean;
  readonly sdkRoot: string;
  readonly avdHome: string;
  readonly avdName: string;
  readonly avdExists: boolean;
  /** AVDs discovered under managed + default Android AVD homes. */
  readonly avds: readonly AndroidAvdInfo[];
  readonly usingManagedSdk: boolean;
  readonly packages: readonly AndroidPackageStatus[];
  readonly packagesReady: boolean;
  /** System-image tag on disk (preferred when both are present). */
  readonly systemImageTag: AndroidSystemImageTag | null;
  /** Preferred tag from Settings (google_apis or google_apis_playstore). */
  readonly preferredSystemImageTag: AndroidSystemImageTag;
  /** API level of the installed system image, when known. */
  readonly systemImageApi: number | null;
  /** ABI of the installed system image, when known. */
  readonly systemImageAbi: AndroidAbi | null;
  readonly hypervisor: AndroidHypervisorStatus;
  readonly emulatorRunning: boolean;
  readonly emulatorPid: number | null;
  readonly devices: readonly AndroidDeviceInfo[];
  readonly canStart: boolean;
  readonly canRemove: boolean;
  readonly error: string | null;
}

export interface AndroidToolchainEvent {
  readonly phase: AndroidToolchainPhase;
  readonly percent: number;
  readonly message: string;
  readonly error?: string;
}

export interface AndroidToolchainCommandResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly status: AndroidToolchainStatus;
  /** True when this call spawned the emulator process (not a reuse). */
  readonly bootedFresh?: boolean;
}

export interface AndroidRepoArchive {
  readonly path: string;
  readonly hostOs: string;
  readonly url: string;
  readonly size: number;
  readonly sha1: string;
}

/**
 * Empty status used before the first desktop probe.
 */
export function emptyAndroidToolchainStatus(): AndroidToolchainStatus {
  return {
    activated: false,
    licenseAccepted: false,
    busy: false,
    sdkRoot: '',
    avdHome: '',
    avdName: ANDROID_AVD_NAME,
    avdExists: false,
    avds: [],
    usingManagedSdk: true,
    packages: [],
    packagesReady: false,
    systemImageTag: null,
    preferredSystemImageTag: ANDROID_DEFAULT_SYSTEM_IMAGE_TAG,
    systemImageApi: null,
    systemImageAbi: null,
    hypervisor: emptyAndroidHypervisorStatus(),
    emulatorRunning: false,
    emulatorPid: null,
    devices: [],
    canStart: false,
    canRemove: false,
    error: null,
  };
}

/**
 * Default hypervisor row before `emulator -accel-check` runs.
 */
export function emptyAndroidHypervisorStatus(): AndroidHypervisorStatus {
  return {
    state: 'unknown',
    detail: 'Hypervisor not checked yet.',
    hint: '',
  };
}

/**
 * True when Activate must show the license and stop before download.
 */
export function androidLicenseBlocksActivate(acceptedAt: string | null | undefined): boolean {
  return typeof acceptedAt !== 'string' || acceptedAt.trim().length === 0;
}

/**
 * Picks the SDK root: settings override, then managed tree when activated, else env, else managed.
 */
export function resolveAndroidSdkRoot(options: {
  readonly settingsRoot: string;
  readonly managedRoot: string;
  readonly envRoot: string;
  readonly preferManaged: boolean;
}): string {
  const settings = options.settingsRoot.trim();
  if (settings)
    return settings;
  if (options.preferManaged)
    return options.managedRoot;
  const env = options.envRoot.trim();
  if (env)
    return env;
  return options.managedRoot;
}

/**
 * First non-empty env SDK path.
 */
export function resolveAndroidEnvSdkRoot(env: {
  readonly ANDROID_SDK_ROOT?: string;
  readonly ANDROID_HOME?: string;
}): string {
  const root = env.ANDROID_SDK_ROOT?.trim() || env.ANDROID_HOME?.trim();
  return root ?? '';
}

/**
 * Common on-disk Android Studio / cmdline-tools SDK locations for this OS.
 * Does not check whether packages exist — callers probe each path.
 */
export function androidSdkDiscoveryRoots(options: {
  readonly env?: {
    readonly ANDROID_SDK_ROOT?: string;
    readonly ANDROID_HOME?: string;
  };
  readonly homeDir?: string;
  readonly localAppData?: string;
  readonly platform?: string;
}): readonly string[] {
  const env = options.env ?? {};
  const platform = options.platform ?? 'win32';
  const home = (options.homeDir ?? '').trim();
  const localAppData = (options.localAppData ?? '').trim();
  const out: string[] = [];
  const push = (value: string) => {
    const next = value.trim();
    if (!next)
      return;
    const normalized = next.replace(/[\\/]+$/, '').replace(/\\/g, '/');
    if (out.some((item) => item.toLowerCase() === normalized.toLowerCase()))
      return;
    out.push(normalized);
  };

  push(resolveAndroidEnvSdkRoot(env));
  if (platform === 'win32') {
    if (localAppData)
      push(`${localAppData}/Android/Sdk`);
    if (home)
      push(`${home}/AppData/Local/Android/Sdk`);
  } else if (platform === 'darwin') {
    if (home)
      push(`${home}/Library/Android/sdk`);
    if (home)
      push(`${home}/Android/Sdk`);
  } else {
    if (home)
      push(`${home}/Android/Sdk`);
    push('/opt/android-sdk');
  }
  return out;
}

/**
 * True when every required package is already on disk.
 */
export function androidPackagesAlreadyInstalled(packages: readonly AndroidPackageStatus[]): boolean {
  return packages.length > 0 && packages.every((item) => item.present);
}

/**
 * Maps Node `process.platform` to Google archive host-os.
 */
export function androidHostOs(platform: string): AndroidHostOs {
  if (platform === 'darwin')
    return 'macos';
  if (platform === 'linux')
    return 'linux';
  return 'windows';
}

/**
 * ABI for the managed system image.
 */
export function androidPreferredAbi(arch: string): AndroidAbi {
  return arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
}

/**
 * Relative adb path inside an SDK root.
 */
export function androidAdbRelativePath(platform: string): string {
  return platform === 'win32' ? 'platform-tools/adb.exe' : 'platform-tools/adb';
}

/**
 * Relative emulator binary path inside an SDK root.
 */
export function androidEmulatorRelativePath(platform: string): string {
  return platform === 'win32' ? 'emulator/emulator.exe' : 'emulator/emulator';
}

/**
 * Stable platform-tools zip for the current OS.
 */
export function androidPlatformToolsUrl(hostOs: AndroidHostOs): string {
  const slug = hostOs === 'macos' ? 'darwin' : hostOs;
  return `${ANDROID_REPO_BASE_URL}/platform-tools-latest-${slug}.zip`;
}

/**
 * Resolves a repository file name against a base URL.
 */
export function androidRepoFileUrl(base: string, file: string): string {
  const trimmed = file.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://'))
    return trimmed;
  return `${base.replace(/\/$/, '')}/${trimmed.replace(/^\//, '')}`;
}

/**
 * Parses remotePackage archives from a Google repository XML document.
 */
export function parseAndroidRepoPackages(xml: string): AndroidRepoArchive[] {
  const packages: AndroidRepoArchive[] = [];
  const packageRe = /<remotePackage\b([^>]*)>([\s\S]*?)<\/remotePackage>/g;
  let pack = packageRe.exec(xml);
  while (pack) {
    const attrs = pack[1] ?? '';
    const body = pack[2] ?? '';
    const path = /(?:^|\s)path="([^"]+)"/.exec(attrs)?.[1] ?? '';
    if (!path || body.includes('<obsolete')) {
      pack = packageRe.exec(xml);
      continue;
    }
    const archiveRe = /<archive>([\s\S]*?)<\/archive>/g;
    let archive = archiveRe.exec(body);
    while (archive) {
      const block = archive[1] ?? '';
      const hostOs = /<host-os>([^<]+)<\/host-os>/.exec(block)?.[1]?.trim() ?? '';
      const url = /<url>([^<]+)<\/url>/.exec(block)?.[1]?.trim() ?? '';
      const sha1 = /<checksum[^>]*>([^<]+)<\/checksum>/.exec(block)?.[1]?.trim() ?? '';
      const size = Number(/<size>([^<]+)<\/size>/.exec(block)?.[1] ?? '0');
      if (url)
        packages.push({ path, hostOs, url, size: Number.isFinite(size) ? size : 0, sha1 });
      archive = archiveRe.exec(body);
    }
    pack = packageRe.exec(xml);
  }
  return packages;
}

/**
 * Picks an archive for a package path and host OS.
 */
export function pickAndroidRepoArchive(
  packages: readonly AndroidRepoArchive[],
  path: string,
  hostOs: AndroidHostOs,
): AndroidRepoArchive | null {
  return (
    packages.find((item) => item.path === path && (item.hostOs === hostOs || item.hostOs === '')) ?? null
  );
}

/**
 * Picks a system image for the given tag, preferring API 34 then the newest.
 */
export function pickAndroidSystemImage(
  packages: readonly AndroidRepoArchive[],
  abi: AndroidAbi,
  tag: AndroidSystemImageTag = ANDROID_DEFAULT_SYSTEM_IMAGE_TAG,
  preferredApi = ANDROID_PREFERRED_API_LEVEL,
): AndroidRepoArchive | null {
  const prefix = 'system-images;android-';
  const suffix = `;${tag};${abi}`;
  const matches = packages.filter((item) => item.path.startsWith(prefix) && item.path.endsWith(suffix));
  const preferred = matches.find((item) => item.path === `${prefix}${preferredApi}${suffix}`);
  if (preferred)
    return preferred;
  const ranked = [...matches].sort(
    (left, right) => androidApiFromPackagePath(right.path) - androidApiFromPackagePath(left.path),
  );
  return ranked[0] ?? null;
}

/**
 * Picks a Google APIs system image, preferring API 34 then the newest.
 * @deprecated Prefer {@link pickAndroidSystemImage} with an explicit tag.
 */
export function pickGoogleApisSystemImage(
  packages: readonly AndroidRepoArchive[],
  abi: AndroidAbi,
  preferredApi = ANDROID_PREFERRED_API_LEVEL,
): AndroidRepoArchive | null {
  return pickAndroidSystemImage(packages, abi, 'google_apis', preferredApi);
}

/** Catalog XML URL for a system-image tag. */
export function androidSystemImageCatalogUrl(tag: AndroidSystemImageTag): string {
  return tag === 'google_apis_playstore' ? ANDROID_SYS_IMG_PLAYSTORE_XML_URL : ANDROID_SYS_IMG_XML_URL;
}

/** Zip base URL for a system-image tag. */
export function androidSystemImageBaseUrl(tag: AndroidSystemImageTag): string {
  return tag === 'google_apis_playstore' ? ANDROID_SYS_IMG_PLAYSTORE_BASE_URL : ANDROID_SYS_IMG_BASE_URL;
}

/** Human label for Settings / status. */
export function androidSystemImageTagLabel(tag: AndroidSystemImageTag): string {
  return tag === 'google_apis_playstore' ? 'Google Play Store' : 'Google APIs';
}

/** True when the value is a known managed system-image tag. */
export function parseAndroidSystemImageTag(value: unknown): AndroidSystemImageTag {
  return value === 'google_apis_playstore' ? 'google_apis_playstore' : ANDROID_DEFAULT_SYSTEM_IMAGE_TAG;
}

/** Keeps a device-tab API level, otherwise the preferred level. */
export function parseAndroidSystemImageApi(value: unknown): number {
  const api = typeof value === 'number' ? value : Number(value);
  return (ANDROID_SYSTEM_IMAGE_API_LEVELS as readonly number[]).includes(api)
    ? api
    : ANDROID_PREFERRED_API_LEVEL;
}

/** Empty means “use the host ABI”. */
export function parseAndroidSystemImageAbi(value: unknown): AndroidAbi | '' {
  return value === 'x86_64' || value === 'arm64-v8a' ? value : '';
}

/**
 * Reads the API level from `system-images;android-34;google_apis;x86_64`.
 */
export function androidApiFromPackagePath(path: string): number {
  const match = /system-images;android-(\d+)/.exec(path);
  return match ? Number(match[1]) : 0;
}

/**
 * Common AVD home directories to scan (managed first, then ANDROID_AVD_HOME, then ~/.android/avd).
 */
export function androidAvdDiscoveryHomes(options: {
  readonly managedHome?: string;
  readonly envHome?: string;
  readonly userAvdHome?: string;
}): readonly string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const next = value.trim().replace(/[\\/]+$/, '');
    if (!next)
      return;
    const normalized = next.replace(/\\/g, '/').toLowerCase();
    if (out.some((item) => item.replace(/\\/g, '/').toLowerCase() === normalized))
      return;
    out.push(next);
  };
  push(options.managedHome ?? '');
  push(options.envHome ?? '');
  push(options.userAvdHome ?? '');
  return out;
}

/**
 * Reads `avd.ini.displayname` or `AvdId` from an AVD config.ini body.
 */
export function parseAvdDisplayName(configIni: string, fallback: string): string {
  const display =
    /^avd\.ini\.displayname\s*=\s*(.+)$/im.exec(configIni)?.[1]?.trim() ??
    /^AvdId\s*=\s*(.+)$/im.exec(configIni)?.[1]?.trim() ??
    '';
  return display || fallback;
}

/**
 * Parses a top-level `{name}.ini` path value.
 */
export function parseAvdIniPath(iniText: string): string {
  return /^path\s*=\s*(.+)$/im.exec(iniText)?.[1]?.trim() ?? '';
}

/**
 * Parses `adb devices -l` into serial / state / model rows.
 */
export function parseAdbDevices(output: string): AndroidDeviceInfo[] {
  const devices: AndroidDeviceInfo[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('List of devices'))
      continue;
    const match = /^(\S+)\s+(\S+)(.*)$/.exec(line);
    if (!match)
      continue;
    const serial = match[1] ?? '';
    const state = match[2] ?? '';
    const rest = match[3] ?? '';
    if (!serial || serial === '*')
      continue;
    const model = /model:(\S+)/.exec(rest)?.[1]?.replace(/_/g, ' ') ?? '';
    devices.push({ serial, state, model });
  }
  return devices;
}

/**
 * Interprets `emulator -accel-check` stdout.
 */
export function parseEmulatorAccelCheck(output: string): Pick<AndroidHypervisorStatus, 'state' | 'detail'> {
  const text = output.trim();
  if (!text)
    return { state: 'unknown', detail: 'No hypervisor report from the emulator.' };
  const lower = text.toLowerCase();
  if (lower.includes('not usable') || lower.includes('not installed') || lower.includes('disabled'))
    return { state: 'missing', detail: firstAccelLine(text) };
  if (lower.includes('usable') || lower.includes('hypervisor.framework') || /\baccel:\s*1\b/.test(lower))
    return { state: 'ready', detail: firstAccelLine(text) };
  return { state: 'unknown', detail: firstAccelLine(text) };
}

/**
 * OS-specific text when the hypervisor is missing.
 */
export function androidHypervisorHint(platform: string): string {
  if (platform === 'win32')
    return 'Turn on Windows Hypervisor Platform and Virtual Machine Platform in Windows Features, then reboot.';
  if (platform === 'linux')
    return 'Install KVM and add your user to the kvm group, then sign out.';
  if (platform === 'darwin')
    return 'macOS should already provide Hypervisor.framework.';
  return 'Enable hardware virtualization for the Android emulator.';
}

/**
 * True when `target` is inside `userData` (managed install).
 */
export function isManagedAndroidPath(target: string, userData: string): boolean {
  const normalizedTarget = normalizeFsPath(target);
  const normalizedRoot = normalizeFsPath(userData);
  if (!normalizedTarget || !normalizedRoot)
    return false;
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function normalizeFsPath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function firstAccelLine(output: string): string {
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !/^(?:accel:\s*)?\d*$/i.test(item));
  return line || output.trim().slice(0, 200);
}
