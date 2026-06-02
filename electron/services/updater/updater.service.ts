import type { App, BrowserWindow } from 'electron';
import { app as electronApp } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SettingsFile } from '../../../shared/config';
import type { UpdateChannel } from '../../../shared/updater/updater-status.schema';
import {
  updaterStatusSchema,
  type UpdaterInfo,
  type UpdaterStatus,
} from '../../../shared/updater/updater-status.schema';
import { updateCheckCacheSchema } from '../../../shared/updater/updater-status.schema';
import { isUpdaterCacheStatusStale, isUpdaterCacheStatusUsable } from '../../../shared/updater/updater-cache';
import { DEFAULT_DEV_SIM_VERSION } from '../../../shared/updater/dev-update-sim';

import { isDevMode } from '../../config/environment';
import { logError } from '../../errors/logger';

import {
  fetchLatestGitHubRelease,
  formatInstallerAssetError,
  isReleaseVersionNewer,
  resolveInstallerAssetForVersion,
  type GitHubReleaseSummary,
} from './github-release-update';
import {
  buildSilentUpdateLaunchOptions,
  downloadInstallerAsset,
  launchDownloadedInstaller,
  resolveInstallerDownloadPath,
} from './installer-download.service';
import { resolveInstallLocation, type InstallLocation } from '../install/install-location.service';

const UPDATE_CHECK_CACHE_FILE = 'update-check-cache.json';
const CACHE_KEY_SUFFIX = 'v2';

const CACHE_TTL_MS = parsePositiveIntEnv(process.env.TESTRIX_UPDATE_CACHE_MS, 30 * 60 * 1000);
const HTTP_MIN_INTERVAL_MS = parsePositiveIntEnv(process.env.TESTRIX_UPDATE_HTTP_MIN_MS, 60 * 1000);

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseInt(String(raw).trim(), 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class UpdaterService {
  private lastStatus: UpdaterStatus = { state: 'idle', info: null };
  private lastHttpAt = 0;
  private lastHttpKey = '';
  private getMainWindow: () => BrowserWindow | null = () => null;
  private getConfigDir: () => string = () => '';
  private readSettings: () => SettingsFile = () => ({}) as SettingsFile;
  private checkInFlight = false;
  private downloadInFlight = false;
  private devSimulatedVersion: string | null = null;

  init(deps: {
    readonly getMainWindow: () => BrowserWindow | null;
    readonly getConfigDir: () => string;
    readonly readSettings: () => SettingsFile;
  }): void {
    this.getMainWindow = deps.getMainWindow;
    this.getConfigDir = deps.getConfigDir;
    this.readSettings = deps.readSettings;

    if (!electronApp.isPackaged) {
      this.pushStatus({
        state: 'disabled',
        info: { devPreviewOnly: true },
        message: 'Updates apply to installed builds.',
      });
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => {
      this.pushStatus({ state: 'checking', info: null });
    });

    autoUpdater.on('update-available', (info) => {
      this.pushStatus({
        state: 'available',
        info: this.mapReleaseInfo(info.version, info.releaseNotes, info.releaseName),
      });
      this.writeDiskCache(this.lastStatus);
    });

    autoUpdater.on('update-not-available', (info) => {
      this.pushStatus({
        state: 'not-available',
        info: this.mapReleaseInfo(info.version, info.releaseNotes, info.releaseName),
      });
      this.writeDiskCache(this.lastStatus);
    });

    autoUpdater.on('download-progress', (progress) => {
      const current = this.lastStatus.info ?? {};
      this.pushStatus({
        state: 'downloading',
        info: {
          ...current,
          percent: Math.round(progress.percent),
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total,
          version: current.version,
        },
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.pushStatus({
        state: 'downloaded',
        info: this.mapReleaseInfo(info.version, info.releaseNotes, info.releaseName),
      });
      this.writeDiskCache(this.lastStatus);
    });

    autoUpdater.on('error', (error) => {
      logError(this.getPathFn(), 'updater error', error);
      this.pushStatus({
        state: 'error',
        info: null,
        message: error.message,
      });
    });

    this.applyChannel(this.readSettings().updates.channel);
    this.reconcileDiskCacheWithInstalledVersion();
    if (this.lastStatus.state === 'idle' && this.lastStatus.info === null) {
      this.pushStatus({ state: 'idle', info: null });
    }
    this.scheduleBootCheck();
  }

  getStatus(): UpdaterStatus {
    return this.lastStatus;
  }

  /** Dev-only semver override for real GitHub release checks from unpackaged builds. */
  getDevSimulatedVersion(): string | null {
    return this.devSimulatedVersion;
  }

  /**
   * Dev-only: sets the simulated installed app version without running an update check.
   *
   * @param version Semver to treat as the installed app version.
   */
  setDevSimulatedVersion(version: string): UpdaterStatus {
    if (!isDevMode() || electronApp.isPackaged) {
      throw new Error('Simulated version is dev-only.');
    }

    const trimmed = version.trim();
    if (!trimmed) {
      throw new Error('Version is required.');
    }

    this.devSimulatedVersion = trimmed;
    this.pushStatus({ state: 'idle', info: null });
    return this.lastStatus;
  }

  async checkForUpdatesAsVersion(version = DEFAULT_DEV_SIM_VERSION): Promise<UpdaterStatus> {
    if (!isDevMode() || electronApp.isPackaged) {
      throw new Error('Simulated version checks are dev-only.');
    }

    const trimmed = version.trim();
    if (!trimmed) {
      throw new Error('Version is required.');
    }

    this.devSimulatedVersion = trimmed;
    const channel = this.readSettings().updates.channel;
    this.applyChannel(channel);

    if (this.checkInFlight) {
      return this.lastStatus;
    }

    this.checkInFlight = true;
    this.pushStatus({ state: 'checking', info: null });
    try {
      const status = await this.checkGitHubRelease(channel, trimmed);
      this.pushStatus(status);
      return this.lastStatus;
    } catch (error: unknown) {
      const message = formatGitHubUpdateError(error);
      this.pushStatus({ state: 'error', info: null, message });
      return this.lastStatus;
    } finally {
      this.checkInFlight = false;
    }
  }

  async checkForUpdates(): Promise<UpdaterStatus> {
    if (!electronApp.isPackaged) {
      return this.lastStatus;
    }

    if (this.checkInFlight) {
      return this.lastStatus;
    }

    const settings = this.readSettings();
    this.applyChannel(settings.updates.channel);

    const cacheKey = this.buildCacheKey(settings.updates.channel);
    if (!this.shouldHitNetwork(cacheKey, false)) {
      const cached = this.readDiskCache();
      if (cached) {
        this.pushStatus(cached.status);
        return this.lastStatus;
      }
    }

    this.checkInFlight = true;
    this.pushStatus({ state: 'checking', info: null });
    try {
      this.lastHttpAt = Date.now();
      this.lastHttpKey = cacheKey;
      const status = await this.checkGitHubRelease(settings.updates.channel);
      this.pushStatus(status);
      this.writeDiskCache(status);
      return this.lastStatus;
    } catch (error: unknown) {
      const message = formatGitHubUpdateError(error);
      this.pushStatus({ state: 'error', info: null, message });
      return this.lastStatus;
    } finally {
      this.checkInFlight = false;
    }
  }

  async downloadUpdate(): Promise<UpdaterStatus> {
    if (!electronApp.isPackaged && !this.canRunDevSimulatedUpdateActions()) {
      return this.lastStatus;
    }

    let info = this.lastStatus.info;
    if (
      this.lastStatus.state === 'available' &&
      info?.version &&
      !info.installerDownloadUrl
    ) {
      info = await this.enrichInfoWithInstallerAsset(info);
      if (info !== this.lastStatus.info) {
        this.pushStatus({ state: 'available', info });
      }
    }

    if (info?.installerDownloadUrl && info.version) {
      return this.downloadCustomInstaller(info);
    }

    if (this.lastStatus.state === 'available' && info?.version) {
      const { assetNames } = await resolveInstallerAssetForVersion(info.version);
      this.pushStatus({
        state: 'error',
        info,
        message: formatInstallerAssetError(info.version, assetNames),
      });
      return this.lastStatus;
    }

    if (!electronApp.isPackaged) {
      return this.lastStatus;
    }

    try {
      await autoUpdater.downloadUpdate();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Download failed';
      this.pushStatus({ state: 'error', info: null, message });
    }
    return this.lastStatus;
  }

  quitAndInstall(): void {
    if (!electronApp.isPackaged && !this.canRunDevSimulatedUpdateActions()) {
      return;
    }

    const localPath = this.lastStatus.info?.installerLocalPath;
    if (localPath) {
      this.clearDiskCache();
      void this.runDownloadedInstaller(localPath);
      return;
    }

    if (this.lastStatus.state === 'downloaded' && this.lastStatus.info?.version) {
      void this.downloadUpdate().then((status) => {
        const pathAfterDownload = status.info?.installerLocalPath;
        if (pathAfterDownload) {
          void this.runDownloadedInstaller(pathAfterDownload);
        }
      });
      return;
    }

    if (!electronApp.isPackaged) {
      return;
    }

    autoUpdater.quitAndInstall(false, true);
  }

  private async checkGitHubRelease(
    channel: UpdateChannel,
    currentVersionOverride?: string,
  ): Promise<UpdaterStatus> {
    const currentVersion = currentVersionOverride ?? this.resolveCurrentVersion();
    const release = await fetchLatestGitHubRelease(channel);

    if (!release) {
      return {
        state: 'not-available',
        info: { version: currentVersion, externalOnly: true },
        message:
          channel === 'stable'
            ? 'No stable release is published yet. Switch to Beta for prereleases.'
            : 'No beta release is published yet. Confirm GitHub releases are public.',
      };
    }

    if (!isReleaseVersionNewer(currentVersion, release.version)) {
      return {
        state: 'not-available',
        info: {
          version: release.version,
          releasePageUrl: release.releasePageUrl,
          externalOnly: true,
        },
      };
    }

    return {
      state: 'available',
      info: this.mapGitHubReleaseInfo(release),
    };
  }

  private async enrichInfoWithInstallerAsset(info: UpdaterInfo): Promise<UpdaterInfo> {
    const version = info.version;
    if (!version || info.installerDownloadUrl) {
      return info;
    }

    const { asset } = await resolveInstallerAssetForVersion(version);
    if (!asset) {
      return info;
    }

    return {
      ...info,
      externalOnly: false,
      installerAssetName: asset.name,
      installerDownloadUrl: asset.downloadUrl,
      total: asset.size,
    };
  }

  private mapGitHubReleaseInfo(release: GitHubReleaseSummary): UpdaterInfo {
    const asset = release.installerAsset;
    return {
      version: release.version,
      releasePageUrl: release.releasePageUrl,
      externalOnly: asset == null,
      installerAssetName: asset?.name,
      installerDownloadUrl: asset?.downloadUrl,
      total: asset?.size,
    };
  }

  private async downloadCustomInstaller(info: UpdaterInfo): Promise<UpdaterStatus> {
    const downloadUrl = info.installerDownloadUrl;
    const version = info.version;
    if (!downloadUrl || !version) {
      return this.lastStatus;
    }

    if (this.downloadInFlight) {
      return this.lastStatus;
    }

    const destPath = resolveInstallerDownloadPath(version);
    const existingPath = info.installerLocalPath ?? destPath;
    const expectedSize = info.total ?? 0;

    if (fs.existsSync(existingPath)) {
      const size = fs.statSync(existingPath).size;
      if (!expectedSize || size === expectedSize) {
        this.pushStatus({
          state: 'downloaded',
          info: { ...info, installerLocalPath: existingPath, percent: 100 },
        });
        this.writeDiskCache(this.lastStatus);
        return this.lastStatus;
      }
    }

    this.downloadInFlight = true;
    this.pushStatus({
      state: 'downloading',
      info: {
        ...info,
        installerLocalPath: undefined,
        percent: 0,
        transferred: 0,
        total: expectedSize,
        bytesPerSecond: 0,
      },
    });

    try {
      await downloadInstallerAsset(downloadUrl, destPath, expectedSize, (progress) => {
        this.pushStatus({
          state: 'downloading',
          info: {
            ...info,
            installerLocalPath: undefined,
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total,
          },
        });
      });

      this.pushStatus({
        state: 'downloaded',
        info: {
          ...info,
          installerLocalPath: destPath,
          percent: 100,
          transferred: expectedSize || undefined,
          total: expectedSize || undefined,
        },
      });
      this.writeDiskCache(this.lastStatus);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Download failed';
      this.pushStatus({ state: 'error', info: info, message });
    } finally {
      this.downloadInFlight = false;
    }

    return this.lastStatus;
  }

  private async runDownloadedInstaller(localPath: string): Promise<void> {
    try {
      const install =
        resolveInstallLocation(electronApp) ??
        resolveInstallLocationFromExecutableDir(electronApp);
      await launchDownloadedInstaller(
        localPath,
        buildSilentUpdateLaunchOptions(install),
      );
      if (process.platform !== 'darwin') {
        electronApp.quit();
        return;
      }
      setTimeout(() => {
        electronApp.quit();
      }, 400);
    } catch (error: unknown) {
      logError(this.getPathFn(), 'installer launch failed', error);
      const message = error instanceof Error ? error.message : 'Could not launch the installer.';
      this.pushStatus({
        state: 'error',
        info: this.lastStatus.info,
        message,
      });
    }
  }

  setChannel(channel: UpdateChannel): void {
    this.applyChannel(channel);
  }

  private applyChannel(channel: UpdateChannel): void {
    if (channel === 'beta') {
      autoUpdater.allowPrerelease = true;
      autoUpdater.channel = 'beta';
    } else {
      autoUpdater.allowPrerelease = false;
      autoUpdater.channel = 'latest';
    }
  }

  private mapReleaseInfo(
    version?: string,
    releaseNotes?: string | ReleaseNote[] | null,
    releaseName?: string | null,
  ): UpdaterInfo {
    const notes =
      typeof releaseNotes === 'string'
        ? releaseNotes
        : Array.isArray(releaseNotes)
          ? releaseNotes.map((n) => (typeof n === 'string' ? n : (n.note ?? ''))).join('\n')
          : null;

    return {
      version: version ?? undefined,
      releaseNotes: notes,
      releasePageUrl: version ? this.buildReleasePageUrl(version) : null,
    };
  }

  private buildReleasePageUrl(version: string): string {
    return `https://github.com/matthiaskopeinigg/testrix/releases/tag/v${version.replace(/^v/i, '')}`;
  }

  private buildCacheKey(channel: UpdateChannel): string {
    return `${channel}|${this.resolveCurrentVersion()}|${CACHE_KEY_SUFFIX}`;
  }

  private resolveCurrentVersion(): string {
    if (isDevMode() && this.devSimulatedVersion) {
      return this.devSimulatedVersion;
    }
    return electronApp.getVersion() || '0.0.0';
  }

  private canRunDevSimulatedUpdateActions(): boolean {
    return isDevMode() && this.devSimulatedVersion != null;
  }

  private shouldHitNetwork(cacheKey: string, isBoot: boolean): boolean {
    const disk = this.readDiskCache();
    if (disk && isUpdaterCacheStatusUsable(disk.status)) {
      const age = Date.now() - new Date(disk.checkedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return false;
      }
    }

    if (!isBoot && this.lastHttpKey === cacheKey && Date.now() - this.lastHttpAt < HTTP_MIN_INTERVAL_MS) {
      return false;
    }

    return true;
  }

  private scheduleBootCheck(): void {
    const attempt = (): void => {
      const win = this.getMainWindow();
      if (!win || win.isDestroyed() || !win.isVisible()) {
        setTimeout(attempt, 400);
        return;
      }
      void this.maybeRunBootCheck();
    };
    setTimeout(attempt, 800);
  }

  private async maybeRunBootCheck(): Promise<void> {
    if (!electronApp.isPackaged) {
      return;
    }

    const settings = this.readSettings();
    if (!settings.updates.checkOnStartup) {
      return;
    }

    const cacheKey = this.buildCacheKey(settings.updates.channel);
    if (!this.shouldHitNetwork(cacheKey, true)) {
      const cached = this.readDiskCache();
      if (cached) {
        this.pushStatus(cached.status);
      }
      return;
    }

    await this.checkForUpdates();
  }

  private cacheFilePath(): string {
    return path.join(this.getConfigDir(), UPDATE_CHECK_CACHE_FILE);
  }

  private readDiskCache(): { checkedAt: string; status: UpdaterStatus } | null {
    try {
      const fp = this.cacheFilePath();
      if (!fs.existsSync(fp)) {
        return null;
      }
      const raw = JSON.parse(fs.readFileSync(fp, 'utf8')) as unknown;
      const parsed = updateCheckCacheSchema.parse(raw);
      if (!isUpdaterCacheStatusUsable(parsed.status, this.resolveCurrentVersion())) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private clearDiskCache(): void {
    try {
      const fp = this.cacheFilePath();
      if (fs.existsSync(fp)) {
        fs.rmSync(fp, { force: true });
      }
    } catch (error: unknown) {
      logError(this.getPathFn(), 'updater cache clear failed', error);
    }
  }

  private reconcileDiskCacheWithInstalledVersion(): void {
    const installed = this.resolveCurrentVersion();
    try {
      const fp = this.cacheFilePath();
      if (!fs.existsSync(fp)) {
        return;
      }

      const raw = JSON.parse(fs.readFileSync(fp, 'utf8')) as unknown;
      const parsed = updateCheckCacheSchema.parse(raw);
      if (isUpdaterCacheStatusStale(parsed.status, installed)) {
        this.clearDiskCache();
        this.lastStatus = { state: 'idle', info: null };
        return;
      }

      if (isUpdaterCacheStatusUsable(parsed.status, installed)) {
        this.lastStatus = updaterStatusSchema.parse(parsed.status);
      }
    } catch (error: unknown) {
      logError(this.getPathFn(), 'updater cache reconcile failed', error);
      this.clearDiskCache();
      this.lastStatus = { state: 'idle', info: null };
    }
  }

  private writeDiskCache(status: UpdaterStatus): void {
    try {
      const payload = updateCheckCacheSchema.parse({
        checkedAt: new Date().toISOString(),
        status,
      });
      fs.mkdirSync(this.getConfigDir(), { recursive: true });
      fs.writeFileSync(this.cacheFilePath(), JSON.stringify(payload, null, 2), 'utf8');
    } catch (error: unknown) {
      logError(this.getPathFn(), 'updater cache write failed', error);
    }
  }

  private pushStatus(status: UpdaterStatus): void {
    this.lastStatus = updaterStatusSchema.parse(status);
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', this.lastStatus);
    }
  }

  private getPathFn(): App['getPath'] {
    return electronApp.getPath.bind(electronApp);
  }
}

type ReleaseNote = string | { note?: string | null };

function formatGitHubUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Update check failed';
  if (/\b404\b/.test(message)) {
    return 'GitHub releases are unavailable. Confirm the repository is public or try again later.';
  }
  if (/\b403\b/.test(message)) {
    return 'GitHub denied access to release metadata (HTTP 403).';
  }
  return message;
}

function resolveInstallLocationFromExecutableDir(appRef: App): InstallLocation | null {
  if (!appRef.isPackaged || process.platform !== 'win32') {
    return null;
  }

  const installDir = path.dirname(appRef.getPath('exe'));
  const mainExePath = path.join(installDir, 'Testrix.exe');
  if (!fs.existsSync(mainExePath)) {
    return null;
  }

  return {
    installDir,
    scope: 'user',
    mainExePath,
  };
}

let singleton: UpdaterService | null = null;

export function getUpdaterService(): UpdaterService {
  if (!singleton) {
    singleton = new UpdaterService();
  }
  return singleton;
}
