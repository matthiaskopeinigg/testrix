import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { UpdateService } from '@app/core/updater/update.service';
import {
  formatUpdaterErrorBannerTitle,
  formatUpdaterErrorForUser,
} from '@app/core/updater/format-updater-error-for-user';

import { TxIconComponent } from '../tx-icon/tx-icon.component';

@Component({
  selector: 'tx-update-banner',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './tx-update-banner.component.html',
  styleUrl: './tx-update-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-update-banner-host',
    '[class.tx-update-banner-host--visible]': 'visible()',
  },
})
export class TxUpdateBannerComponent {
  private readonly updates = inject(UpdateService);
  private readonly config = inject(ConfigService);
  private readonly electron = inject(ElectronService);

  readonly visible = input(true);

  protected readonly status = this.updates.status;

  protected readonly title = computed(() => {
    const s = this.status();
    const versionSuffix = s.info?.version ? ` · v${s.info.version}` : '';

    switch (s.state) {
      case 'checking':
        return 'Software update';
      case 'available':
        return `Update available${versionSuffix}`;
      case 'downloading':
        return 'Downloading update';
      case 'downloaded':
        return `Installing update${versionSuffix}`;
      case 'error':
        return formatUpdaterErrorBannerTitle(s.message);
      default:
        return 'Updates';
    }
  });

  protected readonly metaLine = computed(() => {
    const s = this.status();
    const channel =
      this.config.settings()?.updates.channel === 'beta' ? 'Beta channel' : 'Stable channel';
    const currentVersion = this.electron.bridge()?.versions.app ?? '—';
    const base = `Current v${currentVersion} · ${channel}`;

    if (s.state === 'available') {
      return '';
    }
    if (s.state === 'downloading') {
      const percent = s.info?.percent ?? 0;
      const sim = s.info?.devPreviewOnly ? ' · simulated transfer' : '';
      return `${base} · ${percent}%${sim}`;
    }
    if (s.state === 'downloaded') {
      return `${base} · Restarting when ready`;
    }
    if (s.state === 'error') {
      return `${base} · ${formatUpdaterErrorForUser(s.message)}`;
    }
    if (s.state === 'checking') {
      return base;
    }
    return base;
  });

  protected readonly transferLine = computed(() => {
    const s = this.status();
    if (s.state !== 'downloading' || !s.info) {
      return '';
    }

    const parts: string[] = [];
    const bps = s.info.bytesPerSecond;
    if (bps != null && bps > 0) {
      parts.push(`${this.formatBytes(bps)}/s`);
    }

    const total = s.info.total;
    const transferred = s.info.transferred;
    if (total != null && total > 0 && transferred != null) {
      parts.push(`${this.formatBytes(transferred)} / ${this.formatBytes(total)}`);
    }

    return parts.join(' · ');
  });

  protected readonly progressPercent = computed(() => {
    const s = this.status();
    if (s.state === 'downloading') {
      return s.info?.percent ?? 0;
    }
    return s.state === 'downloaded' ? 100 : null;
  });

  protected readonly showPrimary = computed(() => this.status().state === 'available');

  protected readonly showReleaseNotesLink = computed(() => {
    const state = this.status().state;
    return state === 'available' || state === 'downloading' || state === 'downloaded';
  });

  protected readonly dismissDisabled = computed(() => this.status().state === 'downloading');

  protected readonly isAvailableLayout = computed(() => this.status().state === 'available');

  protected handlePrimary(): void {
    void this.updates.downloadAndInstall();
  }

  protected handleReleaseNotes(): void {
    this.updates.openReleaseNotes();
  }

  protected handleDismiss(): void {
    void this.updates.ignoreCurrentOffer();
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${Math.round(bytes)} B`;
    }

    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
  }
}
