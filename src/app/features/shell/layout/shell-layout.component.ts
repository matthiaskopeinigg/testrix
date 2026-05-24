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

import { AppReadyService } from '@app/core/electron/app-ready.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { SettingsPopupService } from '@app/core/ui/settings-popup.service';
import { UpdateService } from '@app/core/updater/update.service';
import { ElectronService } from '@app/core/electron/electron.service';

import { TxErrorBannerComponent } from '../../../shared/components/tx-error-banner/tx-error-banner.component';
import { TxNotificationHostComponent } from '../../../shared/components/tx-notification-host/tx-notification-host.component';
import { TxSettingsPopupComponent } from '../../../shared/components/tx-settings-popup/tx-settings-popup.component';
import { TxUpdateInstallOverlayComponent } from '../../../shared/components/tx-update-install-overlay/tx-update-install-overlay.component';
import { TxUpdateBannerComponent } from '../../../shared/components/tx-update-banner/tx-update-banner.component';
import { TxWindowTitlebarComponent } from '../../../shared/components/tx-window-titlebar/tx-window-titlebar.component';

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    TxWindowTitlebarComponent,
    TxErrorBannerComponent,
    TxUpdateBannerComponent,
    TxUpdateInstallOverlayComponent,
    TxNotificationHostComponent,
    TxSettingsPopupComponent,
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

  protected readonly hasNotification = computed(() => this.notifications.active() !== null);

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
    if (!isSettingsShortcut(event) || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    this.settingsPopup.show();
  }

  protected handleCloseSettings(): void {
    this.settingsPopup.hide();
  }
}

function isSettingsShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key === ',';
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('textarea, input, select, [contenteditable="true"]');
}
