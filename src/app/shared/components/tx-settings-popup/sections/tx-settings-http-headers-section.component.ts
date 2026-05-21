import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { buildResolvedDefaultHeaders } from '@app/core/http/build-resolved-default-headers';
import type { HttpHeadersSettings, HttpKeyValueRow } from '@shared/config';

import { TxButtonComponent } from '../../tx-button/tx-button.component';
import { TxKeyValueListComponent } from '../../tx-key-value-list/tx-key-value-list.component';
import { TxToggleComponent } from '../../tx-toggle/tx-toggle.component';

@Component({
  selector: 'tx-settings-http-headers-section',
  standalone: true,
  imports: [FormsModule, TxButtonComponent, TxKeyValueListComponent, TxToggleComponent],
  templateUrl: './tx-settings-http-headers-section.component.html',
  styleUrl: './tx-settings-http-headers-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsHttpHeadersSectionComponent {
  readonly headers = input.required<HttpHeadersSettings>();
  readonly headersChange = output<Partial<HttpHeadersSettings>>();

  protected readonly showResolvedPreview = signal(false);

  protected readonly resolvedPreviewRows = computed(() => {
    const resolved = buildResolvedDefaultHeaders(this.headers());
    return Object.entries(resolved).map(([key, value]) => ({ key, value }));
  });

  protected emit(patch: Partial<HttpHeadersSettings>): void {
    this.headersChange.emit(patch);
  }

  protected handleRowsChange(rows: readonly HttpKeyValueRow[]): void {
    this.headersChange.emit({ rows: [...rows] });
  }

  protected handleToggleResolvedPreview(): void {
    this.showResolvedPreview.update((open) => !open);
  }
}
