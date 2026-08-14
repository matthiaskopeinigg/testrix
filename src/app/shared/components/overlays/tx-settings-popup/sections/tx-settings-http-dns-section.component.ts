import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { HttpDnsSettings, HttpKeyValueRow } from '@shared/config';

import { TxFormFieldComponent } from '../../../forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '../../../forms/tx-input/tx-input.component';
import { TxKeyValueListComponent } from '../../../data/tx-key-value-list/tx-key-value-list.component';
import { TxToggleComponent } from '../../../forms/tx-toggle/tx-toggle.component';

@Component({
  selector: 'tx-settings-http-dns-section',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent, TxKeyValueListComponent, TxToggleComponent],
  templateUrl: './tx-settings-http-dns-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsHttpDnsSectionComponent {
  readonly dns = input.required<HttpDnsSettings>();
  readonly dnsChange = output<Partial<HttpDnsSettings>>();

  protected emit(patch: Partial<HttpDnsSettings>): void {
    this.dnsChange.emit(patch);
  }

  protected handleHostsChange(hosts: readonly HttpKeyValueRow[]): void {
    this.dnsChange.emit({ hosts: [...hosts] });
  }
}
