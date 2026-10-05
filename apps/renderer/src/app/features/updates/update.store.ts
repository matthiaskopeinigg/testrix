import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { UpdateChannel, UpdatePrefsPatch, UpdateStatus } from '@testrix/contracts';
import { TxToastService } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';
import { DirtyTabsRegistry } from '../../core/dirty-tabs.registry';
import { SessionPersistenceService } from '../../core/session-persistence.service';
import { idleUpdateStatus, isDownloadFinishing, shortVersion, updateBannerCopy } from './update-view';

/** Stays until Later, or until the download finishes. */
const STICKY_TOAST_MS = 0;

/**
 * Update state pushed from the main process, plus the one-off "ready" toast and the
 * What's new dialog after an update. The main process owns timers and downloads.
 */
@Injectable({ providedIn: 'root' })
export class UpdateStore {
  private readonly desktop = inject(DesktopApiService);
  private readonly toasts = inject(TxToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly dirtyTabs = inject(DirtyTabsRegistry);
  private readonly session = inject(SessionPersistenceService);

  readonly status = signal<UpdateStatus>(idleUpdateStatus());
  readonly whatsNewOpen = signal(false);

  readonly isReady = computed(() => this.status().phase === 'ready');
  readonly isBusy = computed(() => ['checking', 'downloading'].includes(this.status().phase));
  readonly readyVersion = computed(() => (this.isReady() ? (this.status().release?.version ?? null) : null));
  readonly availableVersion = computed(() =>
    this.status().phase === 'available' ? (this.status().release?.version ?? null) : null,
  );
  readonly noticeLabel = computed(() => updateBannerCopy(this.status())?.message ?? null);
  readonly banner = computed(() => updateBannerCopy(this.status()));

  private toastedVersion: string | null = null;
  private toastedAvailableVersion: string | null = null;
  private updateToastId: string | null = null;
  private installAfterDownload = false;
  private hasShownWhatsNew = false;

  constructor() {
    const off = this.desktop.api.update.onStatus((status) => this.apply(status));
    inject(DestroyRef).onDestroy(() => off());
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.apply(await this.desktop.api.update.getStatus());
    } catch {
      // The bridge may still be starting; the next pushed status fills this in.
    }
  }

  async check(): Promise<void> {
    this.apply(await this.desktop.api.update.check());
  }

  async download(): Promise<void> {
    this.apply(await this.desktop.api.update.download());
  }

  /** Downloads the waiting release, then starts Setup when the file is ready. */
  async downloadAndInstall(): Promise<void> {
    if (this.installAfterDownload || this.status().phase === 'downloading')
      return;
    this.installAfterDownload = true;
    try {
      const version = this.status().release?.version;
      if (version && this.status().phase !== 'ready') {
        this.putUpdateToast(`Downloading Testrix ${shortVersion(version)}`, {
          action: null,
          dismissLabel: null,
          progress: null,
        });
      }
      if (this.status().phase !== 'ready')
        this.apply(await this.desktop.api.update.download());
      if (this.status().phase === 'ready')
        await this.install();
    } finally {
      this.installAfterDownload = false;
    }
  }

  async install(): Promise<void> {
    const unsaved = this.dirtyTabs.count();
    if (unsaved > 0) {
      const ok = await this.confirm.ask({
        title: 'Install update with unsaved changes?',
        body: `${unsaved === 1 ? 'One tab has' : `${unsaved} tabs have`} changes that are not saved. They are lost when the update installs.`,
        confirmLabel: 'Install anyway',
        cancelLabel: 'Cancel',
      });
      if (!ok)
        return;
    }
    this.putUpdateToast('Installing update…', {
      action: null,
      dismissLabel: null,
      progress: null,
    });
    await this.session.flush();
    const isStarted = await this.desktop.api.update.install();
    if (!isStarted) {
      this.putUpdateToast('The update is no longer ready. Check for updates again.', {
        action: null,
        dismissLabel: 'Later',
        progress: undefined,
      });
    }
  }

  async setChannel(channel: UpdateChannel): Promise<void> {
    await this.setPrefs({ channel });
  }

  async setAutoCheck(autoCheck: boolean): Promise<void> {
    await this.setPrefs({ autoCheck });
  }

  async setAutoDownload(autoDownload: boolean): Promise<void> {
    await this.setPrefs({ autoDownload });
  }

  closeWhatsNew(): void {
    this.whatsNewOpen.set(false);
  }

  private async setPrefs(patch: UpdatePrefsPatch): Promise<void> {
    this.apply(await this.desktop.api.update.setPrefs(patch));
  }

  private apply(status: UpdateStatus): void {
    this.status.set(status);
    this.syncUpdateToast(status);
    this.announceUpdated(status);
  }

  /** Keeps one toast: available → progress → preparing → installing or Install. */
  private syncUpdateToast(status: UpdateStatus): void {
    const version = status.release?.version;
    const short = version ? shortVersion(version) : '';
    if (status.phase === 'downloading' && version) {
      if (isDownloadFinishing(status)) {
        this.putUpdateToast('Preparing the update…', {
          action: null,
          dismissLabel: null,
          progress: null,
        });
        return;
      }
      this.putUpdateToast(`Downloading Testrix ${short}`, {
        action: null,
        dismissLabel: null,
        progress: status.percent == null ? null : Math.round(status.percent),
      });
      return;
    }
    if (status.phase === 'available' && version && version !== this.toastedAvailableVersion) {
      this.toastedAvailableVersion = version;
      this.updateToastId = this.toasts.show({
        message: `Testrix ${short} is available.`,
        durationMs: STICKY_TOAST_MS,
        dismissOnAction: false,
        action: { label: 'Download & Install', onClick: () => void this.downloadAndInstall() },
        dismissLabel: 'Later',
      });
      return;
    }
    if (status.phase === 'ready' && version) {
      if (this.installAfterDownload) {
        this.putUpdateToast('Installing update…', {
          action: null,
          dismissLabel: null,
          progress: null,
        });
        return;
      }
      if (version === this.toastedVersion)
        return;
      this.toastedVersion = version;
      const ready = {
        message: `Testrix ${short} is ready to install.`,
        action: { label: 'Install', onClick: () => void this.install() },
        dismissLabel: 'Later' as const,
        progress: undefined,
      };
      if (this.updateToastId && this.toasts.update(this.updateToastId, ready))
        return;
      this.updateToastId = this.toasts.show({
        ...ready,
        durationMs: STICKY_TOAST_MS,
      });
      return;
    }
    if (status.phase === 'error') {
      this.putUpdateToast(status.error ?? 'The update check failed.', {
        action: null,
        dismissLabel: 'Later',
        progress: undefined,
      });
    }
  }

  /** Rewrites the live update toast, or opens a new one if Later already closed it. */
  private putUpdateToast(
    message: string,
    patch: { action: null; dismissLabel: string | null; progress?: number | null },
  ): void {
    if (this.updateToastId && this.toasts.update(this.updateToastId, { message, ...patch }))
      return;
    this.updateToastId = this.toasts.show({
      message,
      durationMs: STICKY_TOAST_MS,
      dismissLabel: patch.dismissLabel ?? undefined,
      progress: patch.progress,
    });
  }

  private clearUpdateToast(): void {
    if (!this.updateToastId)
      return;
    this.toasts.dismiss(this.updateToastId);
    this.updateToastId = null;
  }

  private announceUpdated(status: UpdateStatus): void {
    if (this.hasShownWhatsNew || !status.updatedFrom || status.updatedFrom === status.currentVersion)
      return;
    this.hasShownWhatsNew = true;
    this.whatsNewOpen.set(true);
  }
}
