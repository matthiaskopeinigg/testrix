import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ElectronService } from '@app/core/electron/electron.service';
import { ProfileService } from '@app/core/profile/profile.service';

import { TxBrandLogoComponent } from '../tx-brand-logo/tx-brand-logo.component';
import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxDropdownComponent } from '../tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxModalComponent } from '../tx-modal/tx-modal.component';
import { TxCookieManagerComponent } from '../tx-cookie-manager/tx-cookie-manager.component';
import { TxSettingsPopupComponent } from '../tx-settings-popup/tx-settings-popup.component';
import { TxTooltipDirective } from '../tx-tooltip/tx-tooltip.directive';

@Component({
  selector: 'app-tx-window-titlebar',
  standalone: true,
  imports: [
    FormsModule,
    TxBrandLogoComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxModalComponent,
    TxCookieManagerComponent,
    TxSettingsPopupComponent,
    TxTooltipDirective,
  ],
  templateUrl: './tx-window-titlebar.component.html',
  styleUrl: './tx-window-titlebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxWindowTitlebarComponent {
  private readonly electron = inject(ElectronService);
  private readonly profiles = inject(ProfileService);

  readonly settingsOpen = signal(false);
  readonly cookiesOpen = signal(false);
  readonly newProfileModalOpen = signal(false);
  readonly newProfileName = signal('New profile');

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
    this.settingsOpen.set(true);
  }

  protected handleCloseSettings(): void {
    this.settingsOpen.set(false);
  }

  protected handleMinimize(): void {
    const ctrls = this.electron.bridge()?.windowControls;
    if (!ctrls) return;
    void ctrls.minimize();
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
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.closest('button, a, input, select, textarea, .tx-titlebar__profile, .tx-titlebar__trailing')) {
      return;
    }
    const ctrls = bridge.windowControls;
    if (!ctrls?.dragStart) {
      return;
    }

    event.preventDefault();
    ctrls.dragStart({ offsetX: event.clientX, offsetY: event.clientY });

    const onMove = (move: MouseEvent): void => {
      ctrls.dragMove({ screenX: move.screenX, screenY: move.screenY });
    };
    const onUp = (): void => {
      ctrls.dragEnd();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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

  protected handleNewProfile(): void {
    if (this.profileSwitching()) {
      return;
    }
    this.newProfileName.set('New profile');
    this.newProfileModalOpen.set(true);
  }

  protected handleCloseNewProfileModal(): void {
    this.newProfileModalOpen.set(false);
  }

  protected handleConfirmNewProfile(): void {
    const name = this.newProfileName().trim();
    if (!name || this.profileSwitching()) {
      return;
    }
    this.newProfileModalOpen.set(false);
    void this.profiles.createProfile(name);
  }
}
