import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { LoadTestProfile, LoadTestThresholds } from '@shared/testing';
import {
  LOAD_TEST_PROFILE_PRESETS,
  applyLoadTestProfilePreset,
  detectLoadTestProfilePreset,
  type LoadTestProfilePresetId,
} from '@shared/testing';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

@Component({
  selector: 'app-lt-tab-profile-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent, TxTagComponent, TxToggleComponent],
  template: `
    <div class="request-panel">
      <h2 class="request-panel__title">Profile presets</h2>
      <p class="request-panel__hint">
        Click a preset to apply smoke, load, stress, spike, or soak settings instantly.
      </p>

      <div class="lt-profile-presets">
        @for (preset of presets; track preset.id) {
          <button
            type="button"
            class="lt-profile-presets__card"
            [class.is-active]="activePresetId() === preset.id"
            (click)="handleSelectPreset(preset.id)"
          >
            <span class="lt-profile-presets__label">{{ preset.label }}</span>
            <span class="lt-profile-presets__desc">{{ preset.description }}</span>
            <span class="lt-profile-presets__meta">
              {{ preset.profile.virtualUsers }} VUs · {{ preset.profile.durationSec }}s ·
              {{ preset.profile.rampUpSec }}s ramp
            </span>
          </button>
        }
      </div>

      <div class="lt-profile-presets__actions">
        <tx-toggle
          label="Also apply suggested thresholds"
          [ngModel]="applySuggestedThresholds()"
          (ngModelChange)="applySuggestedThresholds.set($event)"
        />
        @if (activePresetId()) {
          <tx-tag variant="info" casing="normal">Active: {{ activePresetId() }}</tx-tag>
        }
      </div>

      <h2 class="request-panel__title">Custom profile</h2>
      <p class="request-panel__hint">
        Virtual users, duration, and ramp-up used when the load test runs.
      </p>

      <tx-form-field label="Virtual users" controlId="lt-virtual-users">
        <tx-input
          id="lt-virtual-users"
          type="number"
          min="1"
          max="10000"
          [ngModel]="profile().virtualUsers"
          (ngModelChange)="handleProfileChange({ virtualUsers: toInt($event, profile().virtualUsers) })"
        />
      </tx-form-field>

      <tx-form-field label="Duration (seconds)" controlId="lt-duration">
        <tx-input
          id="lt-duration"
          type="number"
          min="1"
          max="86400"
          [ngModel]="profile().durationSec"
          (ngModelChange)="handleProfileChange({ durationSec: toInt($event, profile().durationSec) })"
        />
      </tx-form-field>

      <tx-form-field label="Ramp-up (seconds)" controlId="lt-ramp-up">
        <tx-input
          id="lt-ramp-up"
          type="number"
          min="0"
          [ngModel]="profile().rampUpSec"
          (ngModelChange)="handleProfileChange({ rampUpSec: toInt($event, profile().rampUpSec) })"
        />
      </tx-form-field>
    </div>
  `,
  styleUrl: './lt-tab-profile-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabProfilePanelComponent {
  readonly profile = input.required<LoadTestProfile>();

  readonly profileChange = output<Partial<LoadTestProfile>>();
  readonly presetApply = output<{ profile: LoadTestProfile; thresholds?: LoadTestThresholds }>();

  protected readonly presets = LOAD_TEST_PROFILE_PRESETS;
  protected readonly applySuggestedThresholds = signal(true);

  protected readonly activePresetId = computed(() => detectLoadTestProfilePreset(this.profile()));

  protected handleSelectPreset(id: LoadTestProfilePresetId): void {
    const applied = applyLoadTestProfilePreset(id);
    this.presetApply.emit({
      profile: applied.profile,
      thresholds: this.applySuggestedThresholds() ? applied.suggestedThresholds : undefined,
    });
  }

  protected handleProfileChange(patch: Partial<LoadTestProfile>): void {
    this.profileChange.emit(patch);
  }

  protected toInt(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
