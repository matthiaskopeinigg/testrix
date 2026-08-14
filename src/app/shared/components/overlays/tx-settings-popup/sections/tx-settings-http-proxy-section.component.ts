import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { HttpProxySettings } from '@shared/config';

import { TxFormFieldComponent } from '../../../forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '../../../forms/tx-input/tx-input.component';
import { TxTextareaComponent } from '../../../forms/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '../../../forms/tx-toggle/tx-toggle.component';

@Component({
  selector: 'tx-settings-http-proxy-section',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent, TxTextareaComponent, TxToggleComponent],
  templateUrl: './tx-settings-http-proxy-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsHttpProxySectionComponent {
  readonly proxy = input.required<HttpProxySettings>();
  readonly proxyChange = output<Partial<HttpProxySettings>>();

  protected emit(patch: Partial<HttpProxySettings>): void {
    this.proxyChange.emit(patch);
  }
}
