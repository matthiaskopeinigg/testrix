import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { HttpRetriesSettings } from '@shared/config';

import { TxFormFieldComponent } from '../../tx-form-field/tx-form-field.component';
import { TxSliderComponent } from '../../tx-slider/tx-slider.component';
import { TxToggleComponent } from '../../tx-toggle/tx-toggle.component';

@Component({
  selector: 'tx-settings-http-retries-section',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxSliderComponent, TxToggleComponent],
  templateUrl: './tx-settings-http-retries-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsHttpRetriesSectionComponent {
  readonly retries = input.required<HttpRetriesSettings>();
  readonly retriesChange = output<Partial<HttpRetriesSettings>>();

  protected emit(patch: Partial<HttpRetriesSettings>): void {
    this.retriesChange.emit(patch);
  }
}
