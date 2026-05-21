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

import { logError } from '../../errors/logger';

const UPDATE_CHECK_CACHE_FILE = 'update-check-cache.json';

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
    this.pushStatus({ state: 'idle', info: null });
    this.scheduleBootCheck();
  }

  getStatus(): UpdaterStatus {
    return this.lastStatus;
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
    try {
      this.lastHttpAt = Date.now();
      this.lastHttpKey = cacheKey;
      await autoUpdater.checkForUpdates();
      return this.lastStatus;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Update check failed';
      this.pushStatus({ state: 'error', info: null, message });
      return this.lastStatus;
    } finally {
      this.checkInFlight = false;
    }
  }

  async downloadUpdate(): Promise<UpdaterStatus> {
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
    if (!electronApp.isPackaged) {
      return;
    }
    autoUpdater.quitAndInstall(false, true);
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
    return `${channel}|${electronApp.getVersion()}`;
  }

  private shouldHitNetwork(cacheKey: string, isBoot: boolean): boolean {
    const disk = this.readDiskCache();
    if (disk) {
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
      return updateCheckCacheSchema.parse(raw);
    } catch {
      return null;
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

let singleton: UpdaterService | null = null;

export function getUpdaterService(): UpdaterService {
  if (!singleton) {
    singleton = new UpdaterService();
  }
  return singleton;
}
