import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionRequestBody } from '@shared/config';
import type { InterceptorRule } from '@shared/testing';

import { RequestTabBodyPanelComponent } from '@app/features/shell/workspace/request-workspace-tab/request-tab-body-panel.component';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';

const ACTION_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'proxy', label: 'Proxy (pass through)' },
  { value: 'mock', label: 'Mock response' },
  { value: 'block', label: 'Block request' },
];

/**
 * Interceptor rule action editor: proxy / mock / block and collection-style mock body.
 */
@Component({
  selector: 'app-int-tab-action-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    RequestTabBodyPanelComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
  ],
  template: `
    <section class="request-panel int-action" aria-label="Action settings">
      <header class="int-action__head">
        <h2 class="request-panel__title">Action</h2>
        <p class="request-panel__hint">Choose how matching requests are handled.</p>
      </header>

      <div class="int-action__controls">
        <tx-form-field class="int-action__action-field" label="Action" controlId="int-action">
          <tx-dropdown
            id="int-action"
            [options]="actionOptions"
            [ngModel]="rule().action"
            (ngModelChange)="actionChange.emit($event)"
          />
        </tx-form-field>

        @if (isMock()) {
          <tx-form-field class="int-action__status-field" label="Status code" controlId="int-mock-status">
            <tx-input
              id="int-mock-status"
              type="number"
              [ngModel]="mockStatusDisplay()"
              (ngModelChange)="handleMockStatusInput($event)"
              placeholder="200"
            />
          </tx-form-field>
        }
      </div>

      @if (isBlock()) {
        <tx-banner variant="info" title="Block">
          Matching requests are aborted; no mock or proxy settings apply.
        </tx-banner>
      }

      @if (isMock()) {
        <app-request-tab-body-panel
          class="int-action__body"
          bodyContext="response"
          [body]="rule().mockBody"
          (bodyChange)="mockBodyChange.emit($event)"
        />
      }

      @if (!isMock() && !isBlock()) {
        <tx-banner variant="info" title="Proxy">
          Matching requests are forwarded without modification. Use mock or block for other behavior.
        </tx-banner>
      }
    </section>
  `,
  styleUrl: './int-tab-action-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntTabActionPanelComponent {
  readonly rule = input.required<InterceptorRule>();

  readonly actionChange = output<InterceptorRule['action']>();
  readonly mockStatusChange = output<number | undefined>();
  readonly mockBodyChange = output<CollectionRequestBody>();

  protected readonly actionOptions = ACTION_OPTIONS;

  protected readonly isMock = computed(() => this.rule().action === 'mock');
  protected readonly isBlock = computed(() => this.rule().action === 'block');

  protected readonly mockStatusDisplay = computed(() => {
    const status = this.rule().mockStatus;
    return status === undefined ? '' : String(status);
  });

  protected handleMockStatusInput(value: string | number): void {
    if (typeof value === 'number') {
      if (value >= 100 && value <= 599) {
        this.mockStatusChange.emit(value);
      }
      return;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
      this.mockStatusChange.emit(undefined);
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (Number.isFinite(n) && n >= 100 && n <= 599) {
      this.mockStatusChange.emit(n);
    }
  }
}
