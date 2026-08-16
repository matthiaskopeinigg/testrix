import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  DATABASE_IDLE_DISCONNECT_MINUTES_MAX,
  DATABASE_IDLE_DISCONNECT_MINUTES_MIN,
  type DatabaseSettings,
} from '@shared/config';

import { TxFormFieldComponent } from '../../../forms/tx-form-field/tx-form-field.component';
import { TxSliderComponent } from '../../../forms/tx-slider/tx-slider.component';

/**
 * Global Database preferences in Settings (idle disconnect, etc.).
 */
@Component({
  selector: 'tx-settings-databases-section',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxSliderComponent],
  templateUrl: './tx-settings-databases-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsDatabasesSectionComponent {
  readonly databases = input.required<DatabaseSettings>();
  readonly databasesChange = output<Pick<DatabaseSettings, 'idleDisconnectMinutes'>>();

  protected readonly idleMin = DATABASE_IDLE_DISCONNECT_MINUTES_MIN;
  protected readonly idleMax = DATABASE_IDLE_DISCONNECT_MINUTES_MAX;

  protected emitIdleDisconnectMinutes(value: number): void {
    this.databasesChange.emit({ idleDisconnectMinutes: value });
  }
}
