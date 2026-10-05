import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { UpdateChannel } from '@testrix/contracts';
import { TxButtonComponent, TxCheckComponent, TxSelectComponent, type TxSelectOption } from '@testrix/ui';

import { UpdateStore } from './update.store';
import { channelLabel, lastCheckedLabel, updateStatusLine } from './update-view';

const CHANNEL_OPTIONS: readonly TxSelectOption[] = [
  { value: 'stable', label: 'Stable' },
  { value: 'beta', label: 'Beta' },
];

/**
 * Settings → Updates: release channel, automatic check and download, and the live
 * state of the current check or download with Check now, Retry and Install update.
 */
@Component({
  selector: 'tx-update-settings-pane',
  standalone: true,
  imports: [TxButtonComponent, TxCheckComponent, TxSelectComponent],
  templateUrl: './update-settings-pane.component.html',
  styleUrl: './update-settings-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateSettingsPaneComponent {
  readonly updates = inject(UpdateStore);
  readonly channelOptions = CHANNEL_OPTIONS;

  readonly status = this.updates.status;
  readonly statusLine = computed(() => updateStatusLine(this.status()));
  readonly lastChecked = computed(() => lastCheckedLabel(this.status().lastCheckedAt));
  readonly channelName = computed(() => channelLabel(this.status().channel));
  readonly isOnPrerelease = computed(() => this.status().currentVersion.includes('-'));
  readonly percent = computed(() => this.status().percent ?? 0);

  setChannel(value: string): void {
    if (value === 'stable' || value === 'beta')
      void this.updates.setChannel(value satisfies UpdateChannel);
  }
}
