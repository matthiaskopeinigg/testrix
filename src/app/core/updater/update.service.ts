import { DestroyRef, Injectable, NgZone, computed, inject, signal } from '@angular/core';

import { createDefaultSettings } from '@shared/config';
import type { UpdateChannel, UpdaterStatus } from '@shared/updater/updater-status.schema';

import { ConfigService } from '../config/config.service';
import { ElectronService } from '../electron/electron.service';

import { TxNotificationService } from '../notifications/tx-notification.service';

import { UPDATER_DOWNLOAD_RELEASES_PAGE_URL } from './format-updater-error-for-user';

import { UpdateBannerContextService } from './update-banner-context.service';

const IDLE_STATUS: UpdaterStatus = { state: 'idle', info: null };

/** Total simulated download duration (ms) for Debug → Starting update process. */
const DEV_DOWNLOAD_SIMULATION_MS = 3600;
const DEV_DOWNLOAD_TICK_MS = 72;
const DEV_SIMULATED_TOTAL_BYTES = 11 * 1024 * 1024;
/** How long the install overlay stays visible in dev simulation (ms). */
const DEV_INSTALL_PREVIEW_MS = 2800;

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly electron = inject(ElectronService);
  private readonly config = inject(ConfigService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly bannerContext = inject(UpdateBannerContextService);
  private readonly notifications = inject(TxNotificationService);

  private readonly statusState = signal<UpdaterStatus>(IDLE_STATUS);
  /** When set, main-process `updater:status` pushes do not replace the dev sidebar simulation. */
  private readonly devSimulationActive = signal(false);
  private devSimulationTimers: ReturnType<typeof setTimeout>[] = [];
  private downloadAndInstallPending = false;
  private readonly installingState = signal(false);
  private unsubscribeStatus: (() => void) | null = null;

  readonly status = this.statusState.asReadonly();
  readonly isInstalling = this.installingState.asReadonly();
  readonly showInstallOverlay = computed(() => this.installingState());

  readonly showUpdateBanner = computed(() => {
    if (this.installingState()) {
      return false;
    }

    const status = this.statusState();
    const isDevSimulation = status.info?.devPreviewOnly === true;

    if (!isDevSimulation && this.bannerContext.hideGlobalBanner()) {
      return false;
    }

    const ignored = this.config.settings()?.updates.ignoredOfferVersion ?? null;
    const offered = status.info?.version ?? null;

    if (!isDevSimulation && ignored && offered && ignored === offered) {
      return false;
    }

    return status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded';
  });

  constructor() {
    const bridge = this.electron.bridge();
    if (!bridge?.updater) {
      return;
    }

    void bridge.updater.getStatus().then((status) => {
      this.statusState.set(status);
    });

    this.unsubscribeStatus = bridge.updater.onStatus((status) => {
      this.zone.run(() => {
        if (this.devSimulationActive()) {
          return;
        }
        this.statusState.set(status);
        void this.maybeFinishDownloadAndInstall(status);
      });
    });

    this.destroyRef.onDestroy(() => this.cancelDevSimulationTimers());
  }

  async checkNow(): Promise<void> {
    const bridge = this.electron.bridge()?.updater;
    if (!bridge) {
      return;
    }
    const status = await bridge.check();
    this.statusState.set(status);
  }

  async download(): Promise<void> {
    if (this.isDevSimulationStatus()) {
      await this.runDevDownloadInstallSimulation(this.downloadAndInstallPending);
      return;
    }

    const bridge = this.electron.bridge()?.updater;
    if (!bridge) {
      return;
    }
    const status = await bridge.download();
    this.statusState.set(status);
    await this.maybeFinishDownloadAndInstall(status);
  }

  /** Downloads the offered update, then installs (and restarts) when the package is ready. */
  async downloadAndInstall(): Promise<void> {
    const state = this.statusState().state;
    if (state === 'downloaded') {
      await this.installAndRestart();
      return;
    }
    if (state === 'downloading' || state === 'checking') {
      return;
    }
    if (state !== 'available') {
      return;
    }

    this.downloadAndInstallPending = true;
    await this.download();
  }

  async installAndRestart(): Promise<void> {
    if (this.isDevSimulationStatus()) {
      this.beginInstalling();
      await this.delayDevInstallPreview();
      this.endInstalling();
      this.notifications.showSuccess('Dev preview: restart to install was not run.');
      this.clearDevSimulation();
      this.statusState.set(IDLE_STATUS);
      return;
    }

    this.beginInstalling();
    await this.config.patchSettings({ updates: { ignoredOfferVersion: null } });
    const bridge = this.electron.bridge()?.updater;
    if (!bridge) {
      this.endInstalling();
      return;
    }
    await bridge.install();
  }

  async setChannel(channel: UpdateChannel): Promise<void> {
    await this.config.patchSettings({ updates: { channel } });
    const bridge = this.electron.bridge()?.updater;
    if (bridge) {
      await bridge.setChannel(channel);
    }
  }

  openReleaseNotes(): void {
    const url = this.statusState().info?.releasePageUrl ?? UPDATER_DOWNLOAD_RELEASES_PAGE_URL;
    const bridge = this.electron.bridge();
    if (bridge) {
      void bridge.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async ignoreCurrentOffer(): Promise<void> {
    const version = this.statusState().info?.version;
    if (!version) {
      return;
    }
    this.downloadAndInstallPending = false;
    this.clearDevSimulation();
    await this.config.patchSettings({ updates: { ignoredOfferVersion: version } });
  }

  /** Dev toolkit only — drives the global update banner without touching electron-updater. */
  async simulateUpdateAvailable(): Promise<void> {
    if (!this.isDevSimulationAllowed()) {
      return;
    }

    await this.applyDevSimulation({
      state: 'available',
      info: this.devSimulationInfo(),
    });
  }

  /**
   * Dev toolkit only — animates download progress, then lands on “ready to install”.
   */
  async simulateUpdateDownloading(): Promise<void> {
    if (!this.isDevSimulationAllowed()) {
      return;
    }

    await this.runDevDownloadInstallSimulation();
  }

  /** Dev toolkit only — shows the full-screen install overlay without quitting. */
  async simulateUpdateInstalling(): Promise<void> {
    if (!this.isDevSimulationAllowed()) {
      return;
    }

    const baseInfo = this.devSimulationInfo();
    await this.applyDevSimulation({ state: 'downloaded', info: baseInfo });
    this.beginInstalling();
    this.scheduleDevSimulationStep(() => {
      this.endInstalling();
      this.clearDevSimulation();
      this.statusState.set(IDLE_STATUS);
    }, DEV_INSTALL_PREVIEW_MS);
  }

  private async applyDevSimulation(status: UpdaterStatus): Promise<void> {
    this.cancelDevSimulationTimers();
    this.devSimulationActive.set(true);
    this.bannerContext.clearPanelSuppression();
    await this.clearIgnoredOfferForSimulation();
    this.statusState.set(status);
  }

  private async maybeFinishDownloadAndInstall(status: UpdaterStatus): Promise<void> {
    if (!this.downloadAndInstallPending || status.state !== 'downloaded') {
      return;
    }
    this.downloadAndInstallPending = false;
    await this.installAndRestart();
  }

  private async runDevDownloadInstallSimulation(autoInstallWhenDone = false): Promise<void> {
    const version = this.devSimulationVersion();
    const baseInfo = this.devSimulationInfo(version);
    await this.applyDevSimulation({
      state: 'downloading',
      info: this.devSimulationDownloadInfo(baseInfo, 0),
    });

    const steps = Math.max(1, Math.round(DEV_DOWNLOAD_SIMULATION_MS / DEV_DOWNLOAD_TICK_MS));
    let step = 0;

    const tick = (): void => {
      step += 1;
      const t = Math.min(1, step / steps);
      const percent = Math.round((1 - (1 - t) ** 2) * 100);

      this.statusState.set({
        state: 'downloading',
        info: this.devSimulationDownloadInfo(baseInfo, percent),
      });

      if (percent < 100) {
        this.scheduleDevSimulationStep(tick, DEV_DOWNLOAD_TICK_MS);
        return;
      }

      this.scheduleDevSimulationStep(() => {
        this.statusState.set({
          state: 'downloaded',
          info: baseInfo,
        });
        if (autoInstallWhenDone) {
          void this.maybeFinishDownloadAndInstall({ state: 'downloaded', info: baseInfo });
        }
      }, 280);
    };

    this.scheduleDevSimulationStep(tick, DEV_DOWNLOAD_TICK_MS);
  }

  private scheduleDevSimulationStep(fn: () => void, delayMs: number): void {
    const id = setTimeout(() => this.zone.run(fn), delayMs);
    this.devSimulationTimers.push(id);
  }

  private cancelDevSimulationTimers(): void {
    for (const id of this.devSimulationTimers) {
      clearTimeout(id);
    }
    this.devSimulationTimers = [];
  }

  private async clearIgnoredOfferForSimulation(): Promise<void> {
    const bridge = this.electron.bridge();
    if (bridge?.config?.setSettings) {
      await this.config.patchSettings({ updates: { ignoredOfferVersion: null } });
      return;
    }

    const current = this.config.settings() ?? createDefaultSettings();
    this.config.syncSettings({
      ...current,
      updates: { ...current.updates, ignoredOfferVersion: null },
    });
  }

  private clearDevSimulation(): void {
    this.cancelDevSimulationTimers();
    this.devSimulationActive.set(false);
    this.downloadAndInstallPending = false;
    this.endInstalling();
  }

  private beginInstalling(): void {
    this.installingState.set(true);
  }

  private endInstalling(): void {
    this.installingState.set(false);
  }

  private delayDevInstallPreview(): Promise<void> {
    return new Promise((resolve) => {
      this.scheduleDevSimulationStep(() => resolve(), DEV_INSTALL_PREVIEW_MS);
    });
  }

  private isDevSimulationStatus(): boolean {
    return this.statusState().info?.devPreviewOnly === true;
  }

  private isDevSimulationAllowed(): boolean {
    return (
      typeof ngDevMode !== 'undefined' &&
      !!ngDevMode &&
      this.electron.isDevToolkit()
    );
  }

  private devSimulationVersion(): string {
    const appVersion = this.electron.bridge()?.versions.app;
    return appVersion ? `${appVersion}-sim` : '0.99.0-sim';
  }

  private devSimulationInfo(version = this.devSimulationVersion()) {
    return {
      version,
      devPreviewOnly: true as const,
      releasePageUrl: UPDATER_DOWNLOAD_RELEASES_PAGE_URL,
    };
  }

  private devSimulationDownloadInfo(
    baseInfo: NonNullable<UpdaterStatus['info']>,
    percent: number,
  ): NonNullable<UpdaterStatus['info']> {
    const transferred = Math.round((DEV_SIMULATED_TOTAL_BYTES * percent) / 100);
    return {
      ...baseInfo,
      percent,
      bytesPerSecond: Math.round(1.1 * 1024 * 1024),
      transferred,
      total: DEV_SIMULATED_TOTAL_BYTES,
    };
  }
}
