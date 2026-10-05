import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { finished } from 'node:stream/promises';
import path from 'node:path';

import {
  UPDATE_ASSET_NAME,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_FIRST_CHECK_DELAY_MS,
  effectiveUpdateChannel,
  githubRateLimitMessage,
  githubRetryAfterAt,
  isAllowedUpdateUrl,
  isGitHubRateLimitStatus,
  parseUpdateManifest,
  shouldSkipScheduledUpdateCheck,
  updateFetchUserAgent,
  updateManifestUrl,
  updateRejection,
  type UpdateChannel,
  type UpdateManifest,
  type UpdatePhase,
  type UpdatePrefs,
  type UpdatePrefsPatch,
  type UpdateRelease,
  type UpdateStatus,
} from '@testrix/contracts';

const MAX_REDIRECTS = 5;
const INSTALLED_NOTES_FILE = 'installed.json';
const CHECK_STATE_FILE = 'check-state.json';
export const UPDATE_LOG_FILE = 'last-update.log';

interface CachedManifestRecord {
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly text: string;
  readonly signature: string;
  readonly fetchedAt: string;
}

interface CheckState {
  lastCheckedAt: string | null;
  retryAfterAt: string | null;
  caches: Partial<Record<UpdateChannel, CachedManifestRecord>>;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface UpdateHostDeps {
  readonly currentVersion: string;
  /** `userData/updates`: downloads, the Setup log and notes for the installed version. */
  readonly updatesDir: string;
  /** Folder Testrix is installed in, or null when this build cannot update itself. */
  readonly installDir: string | null;
  readonly unsupportedReason: string | null;
  readonly publicKey: string;
  readonly repository: string;
  /** Overrides for a local test feed; production uses the GitHub manifest and host allow-list. */
  readonly manifestUrl?: (channel: UpdateChannel) => string;
  readonly isAllowedUrl?: (url: string) => boolean;
  readonly readPrefs: () => UpdatePrefs;
  readonly writePrefs: (prefs: UpdatePrefs) => Promise<void>;
  readonly publish: (status: UpdateStatus) => void;
  readonly fetch: FetchLike;
  readonly launchInstaller: (exe: string, args: readonly string[]) => void | Promise<void>;
  readonly quit: () => void;
  readonly pid: number;
  /** Version this launch updated from (`--updated-from`), when there was one. */
  readonly updatedFrom: string | null;
  readonly now?: () => Date;
}

export interface UpdateSupport {
  readonly installDir: string | null;
  readonly reason: string | null;
}

/**
 * Only an installed Windows build can replace itself: dev runs, previews and copies
 * without Setup's `.install-meta.json` never offer updates.
 */
export function resolveUpdateSupport(options: {
  readonly platform: NodeJS.Platform;
  readonly isPackaged: boolean;
  readonly execPath: string;
  readonly env: NodeJS.ProcessEnv;
  readonly readFile?: (file: string) => string | null;
}): UpdateSupport {
  const read = options.readFile ?? readTextOrNull;
  if (options.platform !== 'win32')
    return { installDir: null, reason: 'Automatic updates are only available on Windows.' };
  if (!options.isPackaged)
    return { installDir: null, reason: 'Development builds do not update themselves.' };
  if (options.env['TESTRIX_PREVIEW'] === '1')
    return { installDir: null, reason: 'Preview builds do not update themselves.' };
  const installDir = path.win32.dirname(options.execPath);
  const meta = read(path.win32.join(installDir, '.install-meta.json'));
  if (meta === null)
    return { installDir: null, reason: 'This copy was not installed with Testrix.' };
  if (/"scope"\s*:\s*"machine"/.test(meta))
    return { installDir: null, reason: 'Installed for all users. Run the new Testrix installer as an administrator to update.' };
  return { installDir, reason: null };
}

function readTextOrNull(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export interface DevUpdateFeed {
  readonly origin: string;
  readonly publicKey: string;
  readonly installDir: string;
  readonly profileDir: string | null;
  readonly setupMain: string | null;
}

/** Written by `npm run updater:local` so an unpackaged `npm start` can find the feed. */
export const LOCAL_RELEASE_DISCOVERY_NAME = 'testrix-local-releases.json';

export function localReleaseDiscoveryPath(tmpDir = os.tmpdir()): string {
  return path.join(tmpDir, LOCAL_RELEASE_DISCOVERY_NAME);
}

function feedFromFields(fields: {
  readonly origin?: string;
  readonly publicKey?: string;
  readonly installDir?: string;
  readonly profileDir?: string;
  readonly setupMain?: string;
}): DevUpdateFeed | null {
  const origin = fields.origin?.replace(/\/+$/, '');
  const publicKey = fields.publicKey?.trim();
  const installDir = fields.installDir?.trim();
  if (!origin || !publicKey || !installDir)
    return null;
  try {
    const { protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:')
      return null;
    const profileDir = fields.profileDir?.trim() || null;
    const setupMain = fields.setupMain?.trim() || null;
    return { origin, publicKey, installDir, profileDir, setupMain };
  } catch {
    return null;
  }
}

function feedFromDiscovery(readFile: (file: string) => string | null, discoveryPath: string): DevUpdateFeed | null {
  const raw = readFile(discoveryPath);
  if (!raw)
    return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return feedFromFields({
      origin: typeof parsed['origin'] === 'string' ? parsed['origin'] : undefined,
      publicKey: typeof parsed['publicKey'] === 'string' ? parsed['publicKey'] : undefined,
      installDir: typeof parsed['installDir'] === 'string' ? parsed['installDir'] : undefined,
      profileDir: typeof parsed['profileDir'] === 'string' ? parsed['profileDir'] : undefined,
      setupMain: typeof parsed['setupMain'] === 'string' ? parsed['setupMain'] : undefined,
    });
  } catch {
    return null;
  }
}

/**
 * Local manifest feed for end-to-end runs of an unpackaged build. Packaged builds never
 * read it, so a release only trusts GitHub and the built-in key.
 */
export function readDevUpdateFeed(
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
  options?: {
    readonly readFile?: (file: string) => string | null;
    readonly discoveryPath?: string;
  },
): DevUpdateFeed | null {
  if (isPackaged)
    return null;
  const hasEnv =
    Boolean(env['TESTRIX_UPDATE_FEED']) ||
    Boolean(env['TESTRIX_UPDATE_PUBLIC_KEY']) ||
    Boolean(env['TESTRIX_UPDATE_INSTALL_DIR']);
  if (hasEnv) {
    return feedFromFields({
      origin: env['TESTRIX_UPDATE_FEED'],
      publicKey: env['TESTRIX_UPDATE_PUBLIC_KEY'],
      installDir: env['TESTRIX_UPDATE_INSTALL_DIR'],
      profileDir: env['TESTRIX_USER_DATA_DIR'],
      setupMain: env['TESTRIX_UPDATE_SETUP_MAIN'],
    });
  }
  return feedFromDiscovery(options?.readFile ?? readTextOrNull, options?.discoveryPath ?? localReleaseDiscoveryPath());
}

/** Reads `--name=value` from a process argument list. */
export function readArgValue(argv: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function verifySignature(text: string, signature: string, publicKey: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(text, 'utf8'), key, Buffer.from(signature.trim(), 'base64'));
  } catch {
    return false;
  }
}

async function sha512File(file: string): Promise<string> {
  const hash = createHash('sha512');
  const stream = createReadStream(file);
  stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
  await finished(stream);
  return hash.digest('base64');
}

function releaseOf(manifest: UpdateManifest): UpdateRelease {
  return { version: manifest.version, notes: manifest.notes, releasedAt: manifest.releasedAt, size: manifest.size };
}

function messageOf(error: unknown): string {
  if (error instanceof UpdateError)
    return error.message;
  return 'Could not reach GitHub to check for updates. Check your connection and try again.';
}

class UpdateError extends Error {}

/**
 * Checks GitHub for signed release manifests, downloads the installer in the background
 * and hands over to Setup, which swaps the install folder once this process has exited.
 */
export class UpdateHost {
  private phase: UpdatePhase = 'idle';
  private manifest: UpdateManifest | null = null;
  private release: UpdateRelease | null = null;
  private percent: number | null = null;
  private error: string | null = null;
  private lastCheckedAt: string | null = null;
  private retryAfterAt: string | null = null;
  private caches: Partial<Record<UpdateChannel, CachedManifestRecord>> = {};
  private firstTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private inflight: Promise<void> | null = null;

  constructor(private readonly deps: UpdateHostDeps) {}

  get isSupported(): boolean {
    return this.deps.installDir !== null && this.deps.unsupportedReason === null;
  }

  status(): UpdateStatus {
    const prefs = this.deps.readPrefs();
    return {
      phase: this.phase,
      currentVersion: this.deps.currentVersion,
      channel: effectiveUpdateChannel(prefs, this.deps.currentVersion),
      prefs,
      isSupported: this.isSupported,
      unsupportedReason: this.deps.unsupportedReason,
      lastCheckedAt: this.lastCheckedAt,
      release: this.release,
      percent: this.percent,
      error: this.error,
      updatedFrom: this.deps.updatedFrom,
    };
  }

  /** Loads notes for a version just installed, restores the last GitHub check, and arms the timers. */
  async start(): Promise<void> {
    await this.loadCheckState();
    await this.restoreInstalledNotes();
    if (!this.isSupported)
      return;
    const cached = this.manifestFromCache(this.status().channel);
    const keep =
      cached && !updateRejection(cached, this.deps.currentVersion, this.status().channel)
        ? cached.version
        : null;
    await this.pruneDownloads(keep);
    await this.restoreCachedOffer();
    this.firstTimer = setTimeout(() => this.autoCheck(), UPDATE_FIRST_CHECK_DELAY_MS);
    this.intervalTimer = setInterval(() => this.autoCheck(), UPDATE_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.firstTimer)
      clearTimeout(this.firstTimer);
    if (this.intervalTimer)
      clearInterval(this.intervalTimer);
    this.firstTimer = null;
    this.intervalTimer = null;
  }

  /**
   * `force` is Check now (and IPC). Automatic checks pass `false` so a restart
   * inside six hours, or a GitHub backoff, does not hit Releases again.
   */
  async check(force = true): Promise<UpdateStatus> {
    if (!this.isSupported || this.phase === 'checking' || this.phase === 'downloading')
      return this.status();
    await this.loadCheckState();
    const now = this.deps.now?.() ?? new Date();
    const channel = this.status().channel;
    const skip = shouldSkipScheduledUpdateCheck({
      lastCheckedAt: this.caches[channel]?.fetchedAt ?? null,
      retryAfterAt: this.retryAfterAt,
      now,
    });
    if (!force && skip)
      return this.status();
    if (force && this.retryAfterAt && Date.parse(this.retryAfterAt) > now.getTime()) {
      const cached = this.manifestFromCache(channel);
      if (cached)
        return this.applyManifest(cached);
      this.set({
        phase: 'error',
        error: githubRateLimitMessage(new Date(this.retryAfterAt), now),
      });
      return this.status();
    }
    this.set({ phase: 'checking', error: null });
    try {
      const fetched = await this.fetchManifest();
      if (fetched.networked) {
        this.lastCheckedAt = now.toISOString();
        this.retryAfterAt = null;
        await this.saveCheckState();
      }
      return await this.applyManifest(fetched.manifest);
    } catch (error) {
      this.set({ phase: 'error', error: messageOf(error) });
    }
    return this.status();
  }

  async download(): Promise<UpdateStatus> {
    const manifest = this.manifest;
    if (!manifest || this.phase === 'downloading' || this.phase === 'ready')
      return this.status();
    this.inflight = this.runDownload(manifest);
    await this.inflight;
    this.inflight = null;
    return this.status();
  }

  /** Starts Setup with the downloaded installer and quits so it can replace this build. */
  async install(): Promise<boolean> {
    const manifest = this.manifest;
    if (this.phase !== 'ready' || !manifest || !this.deps.installDir)
      return false;
    const exe = this.installerPath(manifest);
    if (!existsSync(exe))
      return false;
    await writeFile(path.join(this.updatesRoot(), INSTALLED_NOTES_FILE), JSON.stringify(releaseOf(manifest)), 'utf8');
    try {
      await this.deps.launchInstaller(exe, [
        '--silent-update',
        `--wait-pid=${this.deps.pid}`,
        '--relaunch',
        `--install-dir=${this.deps.installDir}`,
        `--payload-file=${exe}`,
        `--log-file=${path.join(this.updatesRoot(), UPDATE_LOG_FILE)}`,
        `--updated-from=${this.deps.currentVersion}`,
      ]);
    } catch {
      this.set({ phase: 'error', error: 'Could not start Testrix. Try downloading the update again.' });
      return false;
    }
    this.deps.quit();
    return true;
  }

  async setPrefs(patch: UpdatePrefsPatch): Promise<UpdateStatus> {
    const current = this.deps.readPrefs();
    const next: UpdatePrefs = { ...current, ...patch };
    await this.deps.writePrefs(next);
    const channelChanged =
      effectiveUpdateChannel(current, this.deps.currentVersion) !==
      effectiveUpdateChannel(next, this.deps.currentVersion);
    if (channelChanged && this.phase !== 'downloading') {
      this.manifest = null;
      this.set({ phase: 'idle', release: null, error: null, percent: null });
      if (next.autoCheck)
        return this.check(true);
      return this.status();
    }
    this.publish();
    return this.status();
  }

  private autoCheck(): void {
    if (this.deps.readPrefs().autoCheck)
      void this.check(false);
  }

  private async applyManifest(manifest: UpdateManifest | null): Promise<UpdateStatus> {
    if (!manifest) {
      this.manifest = null;
      this.set({ phase: 'up-to-date', release: null });
      return this.status();
    }
    const reason = updateRejection(manifest, this.deps.currentVersion, this.status().channel);
    if (reason === 'Already up to date') {
      this.manifest = null;
      this.set({ phase: 'up-to-date', release: null });
      await this.pruneDownloads(null);
      return this.status();
    }
    if (reason)
      throw new UpdateError(reason);
    this.manifest = manifest;
    if (await this.isDownloaded(manifest)) {
      this.set({ phase: 'ready', release: releaseOf(manifest), percent: null });
      return this.status();
    }
    this.set({ phase: 'available', release: releaseOf(manifest), percent: null });
    if (this.deps.readPrefs().autoDownload)
      void this.download();
    return this.status();
  }

  private async restoreCachedOffer(): Promise<void> {
    if (!this.isSupported)
      return;
    const cached = this.manifestFromCache(this.status().channel);
    if (!cached)
      return;
    if (updateRejection(cached, this.deps.currentVersion, this.status().channel))
      return;
    await this.applyManifest(cached);
  }

  private async runDownload(manifest: UpdateManifest): Promise<void> {
    const dest = this.installerPath(manifest);
    const dir = path.dirname(dest);
    const partial = `${dest}.partial`;
    this.set({ phase: 'downloading', percent: 0, error: null });
    try {
      await mkdir(dir, { recursive: true });
      let offset = existsSync(partial) ? (await stat(partial)).size : 0;
      if (offset > manifest.size) {
        await rm(partial, { force: true });
        offset = 0;
      }
      if (offset < manifest.size)
        offset = await this.fetchInstaller(manifest, partial, offset);
      if (offset !== manifest.size) {
        await rm(partial, { force: true });
        throw new UpdateError('The download was incomplete. Try again.');
      }
      this.set({ percent: 100 });
      if ((await sha512File(partial)) !== manifest.sha512) {
        await rm(partial, { force: true });
        throw new UpdateError('The downloaded installer failed its integrity check and was discarded.');
      }
      await rename(partial, dest);
      await this.pruneDownloads(manifest.version);
      this.set({ phase: 'ready', percent: null });
    } catch (error) {
      this.set({
        phase: 'error',
        percent: null,
        error: error instanceof UpdateError ? error.message : 'The download stopped. Try again to resume it.',
      });
    }
  }

  /** Appends the rest of the installer to `partial`, resuming at `offset`. Returns the new size. */
  private async fetchInstaller(manifest: UpdateManifest, partial: string, offset: number): Promise<number> {
    const response = await this.fetchPinned(manifest.url, offset > 0 ? { headers: { Range: `bytes=${offset}-` } } : {});
    if (isGitHubRateLimitStatus(response.status, response.headers))
      throw await this.rateLimited(response.headers);
    const isResume = response.status === 206;
    if (!response.ok || !response.body)
      throw new UpdateError(`GitHub answered ${response.status} for the installer.`);
    let written = isResume ? offset : 0;
    const out = await open(partial, isResume ? 'a' : 'w');
    let lastPercent = -1;
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done)
          break;
        await out.write(value);
        written += value.byteLength;
        if (written > manifest.size)
          throw new UpdateError('The installer is larger than the release says.');
        const percent = Math.floor((written / manifest.size) * 100);
        if (percent !== lastPercent) {
          lastPercent = percent;
          this.set({ percent });
        }
      }
    } finally {
      await out.close();
    }
    return written;
  }

  private async fetchManifest(): Promise<{ manifest: UpdateManifest | null; networked: boolean }> {
    const channel = this.status().channel;
    const url = this.deps.manifestUrl?.(channel) ?? updateManifestUrl(channel, this.deps.repository);
    const cached = this.caches[channel];
    const preconditions: Record<string, string> = {};
    if (cached?.etag)
      preconditions['If-None-Match'] = cached.etag;
    if (cached?.lastModified)
      preconditions['If-Modified-Since'] = cached.lastModified;
    const manifestResponse = await this.fetchPinned(url, { headers: preconditions });
    if (isGitHubRateLimitStatus(manifestResponse.status, manifestResponse.headers)) {
      const fromCache = this.manifestFromCache(channel);
      if (fromCache) {
        await this.rememberRateLimit(manifestResponse.headers);
        return { manifest: fromCache, networked: false };
      }
      throw await this.rateLimited(manifestResponse.headers);
    }
    if (manifestResponse.status === 304) {
      const fromCache = this.manifestFromCache(channel);
      if (fromCache)
        return { manifest: fromCache, networked: true };
      throw new UpdateError('The cached update manifest is no longer valid.');
    }
    if (manifestResponse.status === 404)
      return { manifest: null, networked: true };
    if (!manifestResponse.ok)
      throw new UpdateError(`GitHub answered ${manifestResponse.status} for the update manifest.`);
    const text = await manifestResponse.text();
    const signatureResponse = await this.fetchPinned(`${url}.sig`);
    if (isGitHubRateLimitStatus(signatureResponse.status, signatureResponse.headers)) {
      const fromCache = this.manifestFromCache(channel);
      if (fromCache) {
        await this.rememberRateLimit(signatureResponse.headers);
        return { manifest: fromCache, networked: false };
      }
      throw await this.rateLimited(signatureResponse.headers);
    }
    if (!signatureResponse.ok)
      throw new UpdateError('The update manifest has no signature.');
    const signature = await signatureResponse.text();
    const manifest = this.parseSignedManifest(text, signature);
    this.caches[channel] = {
      etag: manifestResponse.headers.get('etag'),
      lastModified: manifestResponse.headers.get('last-modified'),
      text,
      signature,
      fetchedAt: (this.deps.now?.() ?? new Date()).toISOString(),
    };
    return { manifest, networked: true };
  }

  /** Follows redirects by hand so every hop stays on an allowed https host. */
  private async fetchPinned(url: string, init: RequestInit = {}): Promise<Response> {
    let current = url;
    const headers = new Headers(init.headers);
    if (!headers.has('user-agent'))
      headers.set('User-Agent', updateFetchUserAgent(this.deps.currentVersion, this.deps.repository));
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!this.isAllowed(current))
        throw new UpdateError('An update download pointed outside GitHub and was blocked.');
      const response = await this.deps.fetch(current, { ...init, headers, redirect: 'manual' });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, current).href;
        continue;
      }
      return response;
    }
    throw new UpdateError('Too many redirects while downloading the update.');
  }

  private isAllowed(url: string): boolean {
    return (this.deps.isAllowedUrl ?? isAllowedUpdateUrl)(url);
  }

  private parseSignedManifest(text: string, signature: string): UpdateManifest {
    if (!verifySignature(text, signature, this.deps.publicKey))
      throw new UpdateError('The update manifest signature is invalid, so the update was ignored.');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new UpdateError('The update manifest is malformed.');
    }
    const manifest = parseUpdateManifest(raw, (candidate) => this.isAllowed(candidate));
    if (!manifest)
      throw new UpdateError('The update manifest is malformed.');
    return manifest;
  }

  private manifestFromCache(channel: UpdateChannel): UpdateManifest | null {
    const cached = this.caches[channel];
    if (!cached)
      return null;
    try {
      return this.parseSignedManifest(cached.text, cached.signature);
    } catch {
      return null;
    }
  }

  private async rememberRateLimit(headers: Headers): Promise<void> {
    const now = this.deps.now?.() ?? new Date();
    this.retryAfterAt = githubRetryAfterAt(headers, now).toISOString();
    await this.saveCheckState();
  }

  private async rateLimited(headers: Headers): Promise<UpdateError> {
    const now = this.deps.now?.() ?? new Date();
    await this.rememberRateLimit(headers);
    return new UpdateError(githubRateLimitMessage(new Date(this.retryAfterAt ?? now.toISOString()), now));
  }

  private checkStatePath(): string {
    return path.join(this.updatesRoot(), CHECK_STATE_FILE);
  }

  private async loadCheckState(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.checkStatePath(), 'utf8')) as CheckState;
      this.lastCheckedAt = typeof raw.lastCheckedAt === 'string' ? raw.lastCheckedAt : this.lastCheckedAt;
      this.retryAfterAt = typeof raw.retryAfterAt === 'string' ? raw.retryAfterAt : this.retryAfterAt;
      if (raw.caches && typeof raw.caches === 'object')
        this.caches = raw.caches;
    } catch {
      // First run, or a corrupt file — the next successful check rewrites it.
    }
  }

  private async saveCheckState(): Promise<void> {
    await mkdir(this.updatesRoot(), { recursive: true });
    const state: CheckState = {
      lastCheckedAt: this.lastCheckedAt,
      retryAfterAt: this.retryAfterAt,
      caches: this.caches,
    };
    await writeFile(this.checkStatePath(), JSON.stringify(state), 'utf8');
  }

  /** Absolute `updates` folder so `..` segments cannot skip a missing profile hop. */
  private updatesRoot(): string {
    return path.resolve(this.deps.updatesDir);
  }

  private installerPath(manifest: UpdateManifest): string {
    return path.join(this.updatesRoot(), manifest.version, UPDATE_ASSET_NAME);
  }

  private async isDownloaded(manifest: UpdateManifest): Promise<boolean> {
    const exe = this.installerPath(manifest);
    if (!existsSync(exe))
      return false;
    if ((await stat(exe)).size === manifest.size && (await sha512File(exe)) === manifest.sha512)
      return true;
    await rm(exe, { force: true });
    return false;
  }

  /** Keeps only the `keep` version folder; files such as the Setup log stay. A folder Setup still runs from is skipped. */
  private async pruneDownloads(keep: string | null): Promise<void> {
    if (!existsSync(this.updatesRoot()))
      return;
    const entries = await readdir(this.updatesRoot(), { withFileTypes: true });
    await Promise.allSettled(
      entries
        .filter((entry) => entry.isDirectory() && entry.name !== keep)
        .map((entry) => rm(path.join(this.updatesRoot(), entry.name), { recursive: true, force: true })),
    );
  }

  private async restoreInstalledNotes(): Promise<void> {
    if (!this.deps.updatedFrom)
      return;
    try {
      const raw = JSON.parse(await readFile(path.join(this.updatesRoot(), INSTALLED_NOTES_FILE), 'utf8')) as UpdateRelease;
      if (raw.version === this.deps.currentVersion) {
        this.release = raw;
        this.publish();
      }
    } catch {
      // No notes were saved for this update; the What's new dialog simply stays empty.
    }
  }

  private set(patch: {
    phase?: UpdatePhase;
    release?: UpdateRelease | null;
    percent?: number | null;
    error?: string | null;
  }): void {
    if (patch.phase !== undefined)
      this.phase = patch.phase;
    if (patch.release !== undefined)
      this.release = patch.release;
    if (patch.percent !== undefined)
      this.percent = patch.percent;
    if (patch.error !== undefined)
      this.error = patch.error;
    this.publish();
  }

  private publish(): void {
    this.deps.publish(this.status());
  }
}
