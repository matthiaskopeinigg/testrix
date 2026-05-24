import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ElectronService } from '@app/core/electron/electron.service';
import { ProfileService } from '@app/core/profile/profile.service';
import { SettingsPopupService } from '@app/core/ui/settings-popup.service';

import { TxBrandLogoComponent } from '../tx-brand-logo/tx-brand-logo.component';
import { TxDropdownComponent } from '../tx-dropdown/tx-dropdown.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxCookieManagerComponent } from '../tx-cookie-manager/tx-cookie-manager.component';
import { TxProfileManagerModalComponent } from '../tx-profile-manager-modal/tx-profile-manager-modal.component';
import { TxTooltipDirective } from '../tx-tooltip/tx-tooltip.directive';

@Component({
  selector: 'app-tx-window-titlebar',
  standalone: true,
  imports: [
    TxBrandLogoComponent,
    TxDropdownComponent,
    TxIconComponent,
    TxCookieManagerComponent,
    TxProfileManagerModalComponent,
    TxTooltipDirective,
  ],
  templateUrl: './tx-window-titlebar.component.html',
  styleUrl: './tx-window-titlebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxWindowTitlebarComponent {
  private readonly electron = inject(ElectronService);
  private readonly profiles = inject(ProfileService);
  private readonly settingsPopup = inject(SettingsPopupService);

  readonly cookiesOpen = signal(false);
  readonly profileManagerOpen = signal(false);

  readonly isDarwin = computed(() => this.electron.bridge()?.platform === 'darwin');

  protected readonly useNativeFrame = computed(
    () => this.electron.bridge()?.nativeDevFrame === true,
  );

  protected readonly showDevToolkit = computed(
    () => typeof ngDevMode !== 'undefined' && ngDevMode && this.electron.isDevToolkit(),
  );

  protected readonly hasChromeBridge = computed(
    () =>
      this.electron.hasBridge() &&
      !!this.electron.bridge()?.windowControls &&
      !this.electron.bridge()?.nativeDevFrame,
  );

  protected readonly showProfilePicker = computed(
    () => this.electron.hasBridge() && this.profiles.profiles().length > 0,
  );

  protected readonly profileOptions = this.profiles.profileDropdownOptions;
  protected readonly activeProfileId = this.profiles.activeProfileId;
  protected readonly profileSwitching = this.profiles.switching;

  protected handleOpenCookies(): void {
    this.cookiesOpen.set(true);
  }

  protected handleCloseCookies(): void {
    this.cookiesOpen.set(false);
  }

  protected handleOpenSettings(): void {
    this.settingsPopup.show();
  }

  protected handleMinimize(): void {
    const ctrls = this.electron.bridge()?.windowControls;
    if (!ctrls) return;
    void ctrls.minimize();
  }

  /** Double-click empty titlebar chrome toggles maximize (OS-style). */
  protected handleTitlebarDoubleClick(event: MouseEvent): void {
    if (!this.isTitlebarDragTarget(event)) {
      return;
    }
    event.preventDefault();
    this.cancelTitlebarDrag();
    this.handleMaximizeToggle();
  }

  /** Win32: IPC window move — `-webkit-app-region: drag` is unreliable in frameless Electron. */
  protected handleTitlebarMouseDown(event: MouseEvent): void {
    const bridge = this.electron.bridge();
    if (bridge?.platform !== 'win32' || this.useNativeFrame()) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (!this.isTitlebarDragTarget(event)) {
      return;
    }
    const ctrls = bridge.windowControls;
    if (!ctrls?.dragStart) {
      return;
    }

    if (event.detail >= 2) {
      event.preventDefault();
      this.cancelTitlebarDrag();
      this.handleMaximizeToggle();
      return;
    }

    event.preventDefault();
    this.cancelTitlebarDrag();

    const offset = { offsetX: event.clientX, offsetY: event.clientY };
    let dragging = false;

    const startDrag = (): void => {
      if (dragging) {
        return;
      }
      dragging = true;
      ctrls.dragStart(offset);
    };

    const onMove = (move: MouseEvent): void => {
      if (!dragging) {
        const dx = Math.abs(move.clientX - offset.offsetX);
        const dy = Math.abs(move.clientY - offset.offsetY);
        if (dx < 4 && dy < 4) {
          return;
        }
        startDrag();
      }
      ctrls.dragMove({ screenX: move.screenX, screenY: move.screenY });
    };
    const onUp = (): void => {
      if (dragging) {
        ctrls.dragEnd();
      }
      this.cancelTitlebarDrag();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    this.titlebarDragCleanup = onUp;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private titlebarDragCleanup: (() => void) | null = null;

  private cancelTitlebarDrag(): void {
    this.titlebarDragCleanup?.();
    this.titlebarDragCleanup = null;
  }

  private isTitlebarDragTarget(event: MouseEvent): boolean {
    if (!this.hasChromeBridge()) {
      return false;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return !target.closest(
      'button, a, input, select, textarea, .tx-titlebar__profile, .tx-titlebar__trailing',
    );
  }

  protected handleMaximizeToggle(): void {
    const ctrls = this.electron.bridge()?.windowControls;
    if (!ctrls) return;
    void ctrls.maximizeToggle();
  }

  protected handleClose(): void {
    const ctrls = this.electron.bridge()?.windowControls;
    if (!ctrls) return;
    void ctrls.close();
  }

  protected handleProfileChange(profileId: string | null): void {
    if (!profileId || this.profileSwitching()) {
      return;
    }
    void this.profiles.switchProfile(profileId);
  }

  protected handleOpenProfileManager(): void {
    this.profileManagerOpen.set(true);
  }

  protected handleCloseProfileManager(): void {
    this.profileManagerOpen.set(false);
  }
}
