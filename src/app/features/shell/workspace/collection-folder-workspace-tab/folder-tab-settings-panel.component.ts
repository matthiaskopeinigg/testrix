import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionRequestTransportSettings } from '@shared/config';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

@Component({
  selector: 'app-folder-tab-settings-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxToggleComponent,
  ],
  template: `
    <div class="request-panel">
      <h2 class="request-panel__title">Transport defaults</h2>
      <p class="request-panel__hint">
        Unset options inherit from global HTTP settings. Requests in this folder and subfolders
        merge these values when sent (unless overridden per request).
      </p>

      <tx-form-field label="Timeout (ms)" controlId="folder-timeout">
        <tx-input
          id="folder-timeout"
          type="number"
          [ngModel]="transport().timeoutMs ?? ''"
          (ngModelChange)="handleOptionalNumber('timeoutMs', $event)"
          placeholder="Inherit"
        />
      </tx-form-field>

      <tx-toggle
        label="Follow redirects"
        [ngModel]="transport().followRedirects ?? false"
        (ngModelChange)="handleOptionalBool('followRedirects', $event)"
      />
      <tx-toggle
        label="Strict SSL"
        [ngModel]="transport().strictSsl ?? false"
        (ngModelChange)="handleOptionalBool('strictSsl', $event)"
      />
      <tx-toggle
        label="Use cookies"
        [ngModel]="transport().useCookies ?? false"
        (ngModelChange)="handleOptionalBool('useCookies', $event)"
      />
      <tx-toggle
        label="HTTP/2"
        [ngModel]="transport().http2Enabled ?? false"
        (ngModelChange)="handleOptionalBool('http2Enabled', $event)"
      />
      <tx-toggle
        label="Ignore invalid SSL"
        [ngModel]="transport().ignoreInvalidSsl ?? false"
        (ngModelChange)="handleOptionalBool('ignoreInvalidSsl', $event)"
      />

      <tx-banner variant="info" title="Proxy & certificates">
        Per-folder proxy and client certificate overrides inherit from global settings in this pass.
      </tx-banner>
    </div>
  `,
  styleUrl: '../request-workspace-tab/request-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderTabSettingsPanelComponent {
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
    key: keyof Pick<
      CollectionRequestTransportSettings,
      'followRedirects' | 'strictSsl' | 'useCookies' | 'http2Enabled' | 'ignoreInvalidSsl'
    >,
    value: boolean,
  ): void {
    this.transportChange.emit({ ...this.transport(), [key]: value });
  }
}
