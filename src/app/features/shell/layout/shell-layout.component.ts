import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  HostListener,
  afterNextRender,
  computed,
  DestroyRef,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import type { OnboardingCompletePayload } from '../../../shared/components/tx-layout-onboarding-overlay/tx-layout-onboarding-overlay.component';

import { ProfileService } from '@app/core/profile/profile.service';
import { AppReadyService } from '@app/core/electron/app-ready.service';
import { KeyboardShortcutsService } from '@app/core/keyboard/keyboard-shortcuts.service';
import { LayoutOnboardingService } from '@app/core/ui/layout-onboarding.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { SettingsPopupService } from '@app/core/ui/settings-popup.service';
import { HelpPopupService } from '@app/core/ui/help-popup.service';
import { CommandPaletteService } from '@app/core/ui/command-palette.service';
import { TeamsPanelService } from '@app/core/collaboration/teams-panel.service';
import { TeamSyncService } from '@app/core/collaboration/team-sync.service';
import { UpdateService } from '@app/core/updater/update.service';
import { ElectronService } from '@app/core/electron/electron.service';

import { TxErrorBannerComponent } from '../../../shared/components/tx-error-banner/tx-error-banner.component';
import { TxNotificationHostComponent } from '../../../shared/components/tx-notification-host/tx-notification-host.component';
import { TxSettingsPopupComponent } from '../../../shared/components/tx-settings-popup/tx-settings-popup.component';
import { TxHelpPopupComponent } from '../../../shared/components/tx-help-popup/tx-help-popup.component';
import { TxTeamsPanelComponent } from '../../../shared/components/tx-teams-panel/tx-teams-panel.component';
import { TxCommandPaletteComponent } from '../../../shared/components/tx-command-palette/tx-command-palette.component';
import { TxProfileSwitchOverlayComponent } from '../../../shared/components/tx-profile-switch-overlay/tx-profile-switch-overlay.component';
import { TxLayoutOnboardingOverlayComponent } from '../../../shared/components/tx-layout-onboarding-overlay/tx-layout-onboarding-overlay.component';
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
    TxLayoutOnboardingOverlayComponent,
    TxNotificationHostComponent,
    TxSettingsPopupComponent,
    TxHelpPopupComponent,
    TxTeamsPanelComponent,
    TxCommandPaletteComponent,
    TxImportExportDialogComponent,
    TxBatchImportDialogComponent,
  ],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellLayoutComponent implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly electron = inject(ElectronService);
  private readonly appReady = inject(AppReadyService);
  private readonly notifications = inject(TxNotificationService);
  private readonly keyboardShortcuts = inject(KeyboardShortcutsService);
  protected readonly updates = inject(UpdateService);
  protected readonly settingsPopup = inject(SettingsPopupService);
  protected readonly helpPopup = inject(HelpPopupService);
  protected readonly commandPalette = inject(CommandPaletteService);
  protected readonly teamsPanel = inject(TeamsPanelService);
  private readonly teamSync = inject(TeamSyncService);
  protected readonly profiles = inject(ProfileService);
  protected readonly layoutOnboarding = inject(LayoutOnboardingService);

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

    const unregisterShortcuts = [
      this.keyboardShortcuts.register('global.commandPaletteToggle', () => {
        this.commandPalette.toggle();
      }),
      this.keyboardShortcuts.register('global.settingsOpen', () => {
        this.settingsPopup.show();
      }),
      this.keyboardShortcuts.register('global.teamsPanelToggle', () => {
        this.teamsPanel.toggle();
      }),
    ];
    this.destroyRef.onDestroy(() => unregisterShortcuts.forEach((unregister) => unregister()));
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

  protected handleOnboardingCompleted(payload: OnboardingCompletePayload): void {
    void this.layoutOnboarding.applyOnboarding(payload.theme, payload.layout);
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

  protected handleCloseCommandPalette(): void {
    this.commandPalette.hide();
  }

  @HostListener('window:focus')
  protected handleWindowFocus(): void {
    void this.teamSync.onAppFocus();
  }
}
