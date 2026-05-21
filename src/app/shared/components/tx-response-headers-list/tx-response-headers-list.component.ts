import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { HttpResponseHeader } from '@shared/http/outgoing-request.schema';
import { copyTextToClipboard } from '@shared/http/response-clipboard';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';

@Component({
  selector: 'tx-response-headers-list',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent, TxButtonComponent, TxIconComponent],
  template: `
    <div class="tx-response-headers-list">
      <tx-form-field label="Filter" controlId="response-headers-filter">
        <tx-input
          id="response-headers-filter"
          placeholder="Filter headers…"
          [ngModel]="filter()"
          (ngModelChange)="filter.set($event)"
        />
      </tx-form-field>
      <ul class="tx-response-headers-list__rows" role="list">
        @for (row of filteredHeaders(); track row.key + row.value) {
          <li class="tx-response-headers-list__row" role="listitem">
            <span class="tx-response-headers-list__key">{{ row.key }}</span>
            <span class="tx-response-headers-list__value">{{ row.value }}</span>
            <tx-button
              variant="secondary"
              title="Copy header"
              [attr.aria-label]="'Copy ' + row.key"
              (pressed)="handleCopyRow(row)"
            >
              <tx-icon name="copy" [size]="14" aria-hidden="true" />
            </tx-button>
          </li>
        } @empty {
          <li class="tx-response-headers-list__empty">No headers match the filter.</li>
        }
      </ul>
    </div>
  `,
  styleUrl: './tx-response-headers-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxResponseHeadersListComponent {
  readonly headers = input<readonly HttpResponseHeader[]>([]);

  protected readonly filter = signal('');

  protected readonly filteredHeaders = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const rows = this.headers();
    if (!q) {
      return rows;
    }
    return rows.filter(
      (h) => h.key.toLowerCase().includes(q) || (h.value ?? '').toLowerCase().includes(q),
    );
  });

  protected async handleCopyRow(row: HttpResponseHeader): Promise<void> {
    await copyTextToClipboard(`${row.key}: ${row.value}`);
  }
}
