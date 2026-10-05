import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TxCheckComponent, TxInputComponent } from '@testrix/ui';

import { LOAD_PROFILE_PRESETS, type LoadProfilePreset } from './lt-profile-presets';

export interface LtProfilePatch {
  readonly virtualUsers?: number;
  readonly durationSec?: number;
  readonly rampUpSec?: number;
  readonly maxErrorRate?: number;
  readonly maxP95Ms?: number;
}

@Component({
  selector: 'tx-lt-profile-panel',
  standalone: true,
  imports: [TxCheckComponent, TxInputComponent],
  templateUrl: './lt-profile-panel.component.html',
  styleUrl: './lt-profile-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtProfilePanelComponent {
  readonly virtualUsers = input(5);
  readonly durationSec = input(15);
  readonly rampUpSec = input(3);

  readonly patch = output<LtProfilePatch>();
  readonly presets = LOAD_PROFILE_PRESETS;

  /** When on, applying a preset also copies its suggested thresholds. */
  readonly applySuggestedThresholds = signal(true);

  toggleSuggestedThresholds(checked: boolean): void {
    this.applySuggestedThresholds.set(checked);
  }

  handlePreset(preset: LoadProfilePreset): void {
    const includeThresholds = this.applySuggestedThresholds();
    this.patch.emit({
      virtualUsers: preset.virtualUsers,
      durationSec: preset.durationSec,
      rampUpSec: preset.rampUpSec,
      ...(includeThresholds && preset.maxErrorRate !== undefined ? { maxErrorRate: preset.maxErrorRate } : {}),
      ...(includeThresholds && preset.maxP95Ms !== undefined ? { maxP95Ms: preset.maxP95Ms } : {}),
    });
  }

  handleNumber(field: keyof LtProfilePatch, raw: string): void {
    const value = Number(raw);
    if (!Number.isFinite(value))
      return;
    this.patch.emit({ [field]: Math.max(0, value) });
  }

  isActive(preset: LoadProfilePreset): boolean {
    return (
      this.virtualUsers() === preset.virtualUsers &&
      this.durationSec() === preset.durationSec &&
      this.rampUpSec() === preset.rampUpSec
    );
  }
}
