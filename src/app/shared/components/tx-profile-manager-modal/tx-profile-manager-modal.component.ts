import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ProfileService } from '@app/core/profile/profile.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxConfirmDialogComponent } from '../tx-confirm-dialog/tx-confirm-dialog.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxModalComponent } from '../tx-modal/tx-modal.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';

@Component({
  selector: 'tx-profile-manager-modal',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxConfirmDialogComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxModalComponent,
    TxTagComponent,
  ],
  templateUrl: './tx-profile-manager-modal.component.html',
  styleUrl: './tx-profile-manager-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxProfileManagerModalComponent {
  readonly open = input(false);

  readonly closed = output<void>();

  private readonly profiles = inject(ProfileService);
  private readonly notifications = inject(TxNotificationService);

  protected readonly workspaceProfiles = this.profiles.profiles;
  protected readonly activeProfileId = this.profiles.activeProfileId;
  protected readonly profileSwitching = this.profiles.switching;

  protected readonly newProfileModalOpen = signal(false);
  protected readonly newProfileName = signal('New profile');
  protected readonly renameProfileOpen = signal(false);
  protected readonly renameProfileTargetId = signal<string | null>(null);
  protected readonly renameProfileDraftName = signal('');
  protected readonly deleteConfirmOpen = signal(false);
  protected readonly deleteTargetId = signal<string | null>(null);
  protected readonly deleteTargetName = signal('');

  protected handleClose(): void {
    this.closed.emit();
  }

  protected handleAddProfile(): void {
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
    void this.profiles.createProfile(name).then(() => {
      this.notifications.showSuccess('Profile created');
    });
  }

  protected handleRenameProfile(profileId: string): void {
    const entry = this.workspaceProfiles().find((profile) => profile.id === profileId);
    if (!entry) {
      return;
    }
    this.renameProfileTargetId.set(profileId);
    this.renameProfileDraftName.set(entry.name);
    this.renameProfileOpen.set(true);
  }

  protected handleCloseRenameProfile(): void {
    this.renameProfileOpen.set(false);
    this.renameProfileTargetId.set(null);
  }

  protected async handleConfirmRenameProfile(): Promise<void> {
    const profileId = this.renameProfileTargetId();
    const name = this.renameProfileDraftName().trim();
    if (!profileId || !name) {
      return;
    }
    this.renameProfileOpen.set(false);
    this.renameProfileTargetId.set(null);
    await this.profiles.renameProfile(profileId, name);
    this.notifications.showSuccess('Profile renamed');
  }

  protected handleDeleteProfile(profileId: string): void {
    const entry = this.workspaceProfiles().find((profile) => profile.id === profileId);
    if (!entry) {
      return;
    }
    if (profileId === this.activeProfileId()) {
      this.notifications.showError('Switch to another profile before deleting the active one');
      return;
    }
    this.deleteTargetId.set(profileId);
    this.deleteTargetName.set(entry.name);
    this.deleteConfirmOpen.set(true);
  }

  protected handleCloseDeleteConfirm(): void {
    this.deleteConfirmOpen.set(false);
    this.deleteTargetId.set(null);
    this.deleteTargetName.set('');
  }

  protected async handleConfirmDeleteProfile(): Promise<void> {
    const profileId = this.deleteTargetId();
    if (!profileId) {
      return;
    }
    this.deleteConfirmOpen.set(false);
    this.deleteTargetId.set(null);
    this.deleteTargetName.set('');
    await this.profiles.deleteProfile(profileId);
    this.notifications.showSuccess('Profile deleted');
  }
}
