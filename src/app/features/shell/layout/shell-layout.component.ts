import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  HostListener,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { ProfileService } from '@app/core/profile/profile.service';
import { AppReadyService } from '@app/core/electron/app-ready.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { SettingsPopupService } from '@app/core/ui/settings-popup.service';
import { HelpPopupService } from '@app/core/ui/help-popup.service';
import { TeamsPanelService } from '@app/core/collaboration/teams-panel.service';
import { TeamSyncService } from '@app/core/collaboration/team-sync.service';
import { UpdateService } from '@app/core/updater/update.service';
import { ElectronService } from '@app/core/electron/electron.service';

import { TxErrorBannerComponent } from '../../../shared/components/tx-error-banner/tx-error-banner.component';
import { TxNotificationHostComponent } from '../../../shared/components/tx-notification-host/tx-notification-host.component';
import { TxSettingsPopupComponent } from '../../../shared/components/tx-settings-popup/tx-settings-popup.component';
import { TxHelpPopupComponent } from '../../../shared/components/tx-help-popup/tx-help-popup.component';
import { TxTeamsPanelComponent } from '../../../shared/components/tx-teams-panel/tx-teams-panel.component';
import { TxProfileSwitchOverlayComponent } from '../../../shared/components/tx-profile-switch-overlay/tx-profile-switch-overlay.component';
import { TxUpdateInstallOverlayComponent } from '../../../shared/components/tx-update-install-overlay/tx-update-install-overlay.component';
import { TxUpdateBannerComponent } from '../../../shared/components/tx-update-banner/tx-update-banner.component';
import { TxWindowTitlebarComponent } from '../../../shared/components/tx-window-titlebar/tx-window-titlebar.component';
import { TxImportExportDialogComponent } from '../../../shared/components/tx-import-export-dialog/tx-import-export-dialog.component';
import { TxBatchImportDialogComponent } from '../../../shared/components/tx-batch-import-dialog/tx-batch-import-dialog.component';
@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    TxWindowTitlebarComponent,
    TxErrorBannerComponent,
    TxUpdateBannerComponent,
    TxUpdateInstallOverlayComponent,
    TxProfileSwitchOverlayComponent,
    TxNotificationHostComponent,
    TxSettingsPopupComponent,
    TxHelpPopupComponent,
    TxTeamsPanelComponent,
    TxImportExportDialogComponent,
    TxBatchImportDialogComponent,
  ],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellLayoutComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly electron = inject(ElectronService);
  private readonly appReady = inject(AppReadyService);
  private readonly notifications = inject(TxNotificationService);
  protected readonly updates = inject(UpdateService);
  protected readonly settingsPopup = inject(SettingsPopupService);
  protected readonly helpPopup = inject(HelpPopupService);
  protected readonly teamsPanel = inject(TeamsPanelService);
  private readonly teamSync = inject(TeamSyncService);
  protected readonly profiles = inject(ProfileService);

  protected readonly hasNotification = computed(() => this.notifications.active() !== null);

  protected readonly showProfileSwitchOverlay = computed(() => this.profiles.switching());

  protected readonly profileSwitchTitle = computed(
    () => this.profiles.switchingTitle() ?? 'Switching profile',
  );

  protected readonly profileSwitchDescription = computed(
    () => this.profiles.switchingDescription() ?? 'Loading workspace data…',
  );

  constructor() {
    afterNextRender(() => {
      void this.appReady.completeBootstrapHandoff({ fromShell: true });
    });
  }

  protected readonly showUpdateBanner = computed(
    () => this.electron.hasBridge() && this.updates.showUpdateBanner(),
  );

  protected readonly showInstallOverlay = computed(
    () => this.electron.hasBridge() && this.updates.showInstallOverlay(),
  );

  private readonly routerUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly isDebugRoute = computed(() =>
    /^\/dev(?:\/|$)/.test(this.routerUrl() ?? ''),
  );

  protected readonly isHomeRoute = computed(() => {
    const url = this.routerUrl() ?? '';
    return url === '/home' || url.startsWith('/home?');
  });

  ngAfterViewInit(): void {
    queueMicrotask(() => window.focus());
  }

  @HostListener('document:keydown', ['$event'])
  protected handleDocumentKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      this.teamsPanel.toggle();
      return;
    }

    if (!isSettingsShortcut(event) || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    this.settingsPopup.show();
  }

  protected handleCloseSettings(): void {
    this.settingsPopup.hide();
  }

  protected handleCloseHelp(): void {
    this.helpPopup.hide();
  }

  protected handleCloseTeamsPanel(): void {
    this.teamsPanel.hide();
  }

  @HostListener('window:focus')
  protected handleWindowFocus(): void {
    void this.teamSync.onAppFocus();
  }
}

function isSettingsShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key === ',';
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('textarea, input, select, [contenteditable="true"]');
}
