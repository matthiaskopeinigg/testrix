import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AppReadyService } from '@app/core/electron/app-ready.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { UpdateService } from '@app/core/updater/update.service';
import { ElectronService } from '@app/core/electron/electron.service';

import { TxErrorBannerComponent } from '../../../shared/components/tx-error-banner/tx-error-banner.component';
import { TxNotificationHostComponent } from '../../../shared/components/tx-notification-host/tx-notification-host.component';
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
}
