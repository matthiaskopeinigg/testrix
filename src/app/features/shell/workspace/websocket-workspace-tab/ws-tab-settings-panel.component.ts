import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionRequestTransportSettings } from '@shared/config';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

@Component({
  selector: 'app-ws-tab-settings-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent, TxToggleComponent],
  template: `
    <div class="request-panel">
      <h2 class="request-panel__title">Connection</h2>
      <p class="request-panel__hint">
        Options applied during the WebSocket handshake. Unset values inherit from global HTTP
        transport settings where applicable.
      </p>

      <tx-form-field label="Handshake timeout (ms)" controlId="ws-handshake-timeout">
        <tx-input
          id="ws-handshake-timeout"
          type="number"
          [ngModel]="transport().timeoutMs ?? ''"
          (ngModelChange)="handleOptionalNumber('timeoutMs', $event)"
          placeholder="Inherit"
        />
      </tx-form-field>

      <tx-toggle
        label="Strict SSL"
        [ngModel]="transport().strictSsl ?? false"
        (ngModelChange)="handleOptionalBool('strictSsl', $event)"
      />
      <tx-toggle
        label="Ignore invalid SSL"
        [ngModel]="transport().ignoreInvalidSsl ?? false"
        (ngModelChange)="handleOptionalBool('ignoreInvalidSsl', $event)"
      />
    </div>
  `,
  styleUrl: './ws-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WsTabSettingsPanelComponent {
  readonly transport = input.required<CollectionRequestTransportSettings>();

  readonly transportChange = output<CollectionRequestTransportSettings>();

  protected handleOptionalNumber(key: 'timeoutMs', raw: string): void {
    const trimmed = raw.trim();
    const patch: CollectionRequestTransportSettings = { ...this.transport() };
    if (trimmed === '') {
      delete patch[key];
    } else {
      const n = Number(trimmed);
      if (!Number.isNaN(n)) {
        patch[key] = n;
      }
    }
    this.transportChange.emit(patch);
  }

  protected handleOptionalBool(
    key: keyof Pick<CollectionRequestTransportSettings, 'strictSsl' | 'ignoreInvalidSsl'>,
    value: boolean,
  ): void {
    this.transportChange.emit({ ...this.transport(), [key]: value });
  }
}
