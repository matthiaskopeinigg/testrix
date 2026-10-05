import { z } from 'zod';

/** GitHub repository that publishes Testrix releases. */
export const UPDATE_REPOSITORY = 'matthiaskopeinigg/testrix-workspace';

/**
 * Release tag whose assets hold the current `stable.json` and `beta.json`. A fixed tag
 * is used because GitHub's `releases/latest` never resolves to a prerelease.
 */
export const UPDATE_MANIFEST_TAG = 'updates';

/** Installer asset attached to every release. */
export const UPDATE_ASSET_NAME = 'Testrix.exe';

/**
 * Ed25519 public key (base64 SPKI DER) that release manifests are signed with.
 * Written by `npm run updater:keygen`; the private half is only a CI secret.
 */
export const UPDATE_PUBLIC_KEY = 'MCowBQYDK2VwAyEA9Jvlgz0+UZTV/TG7JrWCivci4D5J1/otQzal4KuhP04=';

/** Hosts that manifests and installers may be downloaded from, including redirects. */
export const UPDATE_ALLOWED_HOSTS: readonly string[] = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
];

/** First automatic check after launch, when the last GitHub check is older than the interval. */
export const UPDATE_FIRST_CHECK_DELAY_MS = 30_000;

/**
 * Minimum time between automatic GitHub Releases hits. Restarting the app does not
 * reset this — last check time is stored under the updates folder. GitHub rate-limits
 * unauthenticated `releases/download` traffic.
 */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Wait when GitHub returns 429/403 without `Retry-After`. */
export const UPDATE_RATE_LIMIT_DEFAULT_MS = 15 * 60 * 1000;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export const updateChannelSchema = z.enum(['stable', 'beta']);

export type UpdateChannel = z.infer<typeof updateChannelSchema>;

export const updateVersionSchema = z.string().regex(SEMVER, 'Expected a semantic version');

export const updateManifestSchema = z.object({
  version: updateVersionSchema,
  channel: updateChannelSchema,
  releasedAt: z.iso.datetime(),
  notes: z.string().max(20_000),
  /** Hosts and https are enforced by `isAllowedUpdateUrl` when the manifest is parsed. */
  url: z.url(),
  /** Base64 SHA-512 of the installer. */
  sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/, 'Expected a base64 SHA-512 digest'),
  size: z.number().int().positive(),
  /** Oldest installed version that may update straight to this one. */
  minVersion: updateVersionSchema.optional(),
});

export type UpdateManifest = z.infer<typeof updateManifestSchema>;

export const updatePrefsSchema = z.object({
  /** null follows the build: prerelease builds track beta, the rest stable. */
  channel: updateChannelSchema.nullable().default(null),
  autoCheck: z.boolean().default(true),
  autoDownload: z.boolean().default(true),
});

export type UpdatePrefs = z.infer<typeof updatePrefsSchema>;

export const DEFAULT_UPDATE_PREFS: UpdatePrefs = { channel: null, autoCheck: true, autoDownload: true };

/** Reads stored update preferences, keeping valid fields and defaulting the rest. */
export function parseUpdatePrefs(raw: unknown): UpdatePrefs {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const channel = updateChannelSchema.safeParse(source['channel']);
  return {
    channel: channel.success ? channel.data : null,
    autoCheck: typeof source['autoCheck'] === 'boolean' ? source['autoCheck'] : DEFAULT_UPDATE_PREFS.autoCheck,
    autoDownload: typeof source['autoDownload'] === 'boolean' ? source['autoDownload'] : DEFAULT_UPDATE_PREFS.autoDownload,
  };
}

export const updatePhaseSchema = z.enum([
  'idle',
  'checking',
  'up-to-date',
  'available',
  'downloading',
  'ready',
  'error',
]);

export type UpdatePhase = z.infer<typeof updatePhaseSchema>;

export const updateReleaseSchema = z.object({
  version: updateVersionSchema,
  notes: z.string(),
  releasedAt: z.string(),
  size: z.number().int().nonnegative(),
});

export type UpdateRelease = z.infer<typeof updateReleaseSchema>;

export const updateStatusSchema = z.object({
  phase: updatePhaseSchema,
  currentVersion: z.string(),
  channel: updateChannelSchema,
  prefs: updatePrefsSchema,
  /** False for dev, preview and portable builds, which never update themselves. */
  isSupported: z.boolean(),
  unsupportedReason: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  release: updateReleaseSchema.nullable(),
  /** 0-100 while downloading, otherwise null. */
  percent: z.number().min(0).max(100).nullable(),
  error: z.string().nullable(),
  /** Version this launch updated from, when it followed an update. */
  updatedFrom: z.string().nullable(),
});

export type UpdateStatus = z.infer<typeof updateStatusSchema>;

/** Built by hand: `.partial()` would still apply the defaults and reset unspecified fields. */
export const updatePrefsPatchSchema = z.strictObject({
  channel: updateChannelSchema.nullable().optional(),
  autoCheck: z.boolean().optional(),
  autoDownload: z.boolean().optional(),
});

export type UpdatePrefsPatch = z.infer<typeof updatePrefsPatchSchema>;

interface ParsedVersion {
  readonly core: readonly [number, number, number];
  readonly prerelease: readonly string[];
}

function parseVersion(version: string): ParsedVersion | null {
  const match = SEMVER.exec(version.trim().replace(/^v/, ''));
  if (!match)
    return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric)
    return Math.sign(Number(a) - Number(b));
  if (aNumeric !== bNumeric)
    return aNumeric ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Semantic-version order: -1, 0 or 1. A prerelease sorts before its release, and an
 * unparseable version sorts before everything.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right)
    return left ? 1 : right ? -1 : 0;
  for (let index = 0; index < 3; index += 1) {
    const diff = Math.sign(left.core[index]! - right.core[index]!);
    if (diff !== 0)
      return diff;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0)
    return Math.sign(right.prerelease.length - left.prerelease.length);
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const l = left.prerelease[index];
    const r = right.prerelease[index];
    if (l === undefined)
      return -1;
    if (r === undefined)
      return 1;
    const diff = compareIdentifiers(l, r);
    if (diff !== 0)
      return diff;
  }
  return 0;
}

/** Prerelease versions (`-beta.1`, `-rc.2`, …) belong to the beta channel. */
export function channelForVersion(version: string): UpdateChannel {
  return parseVersion(version)?.prerelease.length ? 'beta' : 'stable';
}

/** The channel a user follows: their choice, or the one their build came from. */
export function effectiveUpdateChannel(prefs: UpdatePrefs, currentVersion: string): UpdateChannel {
  return prefs.channel ?? channelForVersion(currentVersion);
}

export function updateManifestUrl(
  channel: UpdateChannel,
  repository = UPDATE_REPOSITORY,
  origin = 'https://github.com',
): string {
  return `${origin.replace(/\/+$/, '')}/${repository}/releases/download/${UPDATE_MANIFEST_TAG}/${channel}.json`;
}

export function parseUpdateManifest(
  raw: unknown,
  isAllowed: (url: string) => boolean = isAllowedUpdateUrl,
): UpdateManifest | null {
  const parsed = updateManifestSchema.safeParse(raw);
  if (!parsed.success || !isAllowed(parsed.data.url))
    return null;
  return parsed.data;
}

/**
 * Why a verified manifest cannot be installed over `currentVersion`, or null when it can.
 */
export function updateRejection(
  manifest: UpdateManifest,
  currentVersion: string,
  channel: UpdateChannel,
): string | null {
  if (manifest.channel !== channel)
    return `Manifest is for the ${manifest.channel} channel`;
  if (compareVersions(manifest.version, currentVersion) <= 0)
    return 'Already up to date';
  if (manifest.minVersion && compareVersions(currentVersion, manifest.minVersion) < 0)
    return `Testrix ${manifest.version} needs ${manifest.minVersion} or newer installed first`;
  return null;
}

/** True when `url` is https on a host updates may come from. */
export function isAllowedUpdateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && UPDATE_ALLOWED_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

interface HeaderReader {
  get(name: string): string | null;
}

/** Identifies this install so GitHub can tell Testrix traffic from a script without a UA. */
export function updateFetchUserAgent(version: string, repository = UPDATE_REPOSITORY): string {
  return `Testrix/${version} (+https://github.com/${repository})`;
}

/** 429 is always a limit. 403 is only a limit when GitHub says the quota is gone. */
export function isGitHubRateLimitStatus(status: number, headers: HeaderReader): boolean {
  if (status === 429)
    return true;
  if (status !== 403)
    return false;
  if (headers.get('retry-after'))
    return true;
  return headers.get('x-ratelimit-remaining') === '0';
}

/** When the next GitHub request is allowed, from `Retry-After` or `x-ratelimit-reset`. */
export function githubRetryAfterAt(
  headers: HeaderReader,
  now: Date,
  fallbackMs = UPDATE_RATE_LIMIT_DEFAULT_MS,
): Date {
  const retryAfter = headers.get('retry-after')?.trim();
  if (retryAfter) {
    if (/^\d+$/.test(retryAfter))
      return new Date(now.getTime() + Number(retryAfter) * 1000);
    const parsed = Date.parse(retryAfter);
    if (!Number.isNaN(parsed) && parsed > now.getTime())
      return new Date(parsed);
  }
  const reset = headers.get('x-ratelimit-reset')?.trim();
  if (reset && /^\d+$/.test(reset)) {
    const at = Number(reset) * 1000;
    if (at > now.getTime())
      return new Date(at);
  }
  return new Date(now.getTime() + fallbackMs);
}

export function githubRateLimitMessage(retryAt: Date, now: Date): string {
  const waitMs = retryAt.getTime() - now.getTime();
  if (waitMs <= 60_000)
    return 'GitHub rate-limited the update check. Try again in a minute.';
  if (waitMs < 60 * 60_000) {
    const minutes = Math.max(2, Math.round(waitMs / 60_000));
    return `GitHub rate-limited the update check. Try again in ${minutes} minutes.`;
  }
  return `GitHub rate-limited the update check. Try again after ${retryAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
}

/**
 * Automatic checks skip GitHub while a rate-limit backoff is active, or when this
 * channel was fetched within `intervalMs`. Check now still goes to GitHub unless
 * backoff is active.
 */
export function shouldSkipScheduledUpdateCheck(input: {
  readonly lastCheckedAt: string | null;
  readonly retryAfterAt: string | null;
  readonly now: Date;
  readonly intervalMs?: number;
}): boolean {
  const now = input.now.getTime();
  if (input.retryAfterAt) {
    const retry = Date.parse(input.retryAfterAt);
    if (!Number.isNaN(retry) && retry > now)
      return true;
  }
  if (!input.lastCheckedAt)
    return false;
  const last = Date.parse(input.lastCheckedAt);
  return !Number.isNaN(last) && now - last < (input.intervalMs ?? UPDATE_CHECK_INTERVAL_MS);
}
