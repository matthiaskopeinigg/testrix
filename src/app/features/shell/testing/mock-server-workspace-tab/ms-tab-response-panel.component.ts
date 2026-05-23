import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionRequestBody } from '@shared/config';
import type { MockResponse } from '@shared/testing';

import { RequestTabBodyPanelComponent } from '@app/features/shell/workspace/request-workspace-tab/request-tab-body-panel.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';

/**
 * Mock endpoint response editor: status, latency, and collection-style body types with code editor.
 */
@Component({
  selector: 'app-ms-tab-response-panel',
  standalone: true,
  imports: [FormsModule, RequestTabBodyPanelComponent, TxFormFieldComponent, TxInputComponent],
  template: `
    <div class="request-panel ms-response">
      <h2 class="request-panel__title">Response</h2>
      <p class="request-panel__hint">
        Status, artificial latency, and the payload returned when a request matches this endpoint.
      </p>

      <div class="ms-response__meta">
        <tx-form-field label="Status code" controlId="ms-status">
          <tx-input
            id="ms-status"
            type="number"
            [ngModel]="response().statusCode"
            (ngModelChange)="handleStatusChange($event)"
          />
        </tx-form-field>
        <tx-form-field label="Latency (ms)" controlId="ms-latency">
          <tx-input
            id="ms-latency"
            type="number"
            [ngModel]="response().latencyMs"
            (ngModelChange)="handleLatencyChange($event)"
          />
        </tx-form-field>
      </div>

      <app-request-tab-body-panel
        bodyContext="response"
        [body]="response().body"
        (bodyChange)="handleBodyChange($event)"
      />
    </div>
  `,
  styleUrl: './ms-tab-response-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MsTabResponsePanelComponent {
  readonly response = input.required<MockResponse>();

  readonly responseChange = output<MockResponse>();

  protected handleStatusChange(value: string | number): void {
    const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) {
      return;
    }
    this.responseChange.emit({ ...this.response(), statusCode: n });
  }

  protected handleLatencyChange(value: string | number): void {
    const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(n)) {
      return;
    }
    this.responseChange.emit({ ...this.response(), latencyMs: n });
  }

  protected handleBodyChange(body: CollectionRequestBody): void {
    this.responseChange.emit({ ...this.response(), body });
  }
}
