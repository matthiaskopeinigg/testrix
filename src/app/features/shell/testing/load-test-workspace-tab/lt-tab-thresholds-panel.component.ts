import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { LoadTestThresholds } from '@shared/testing';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';

@Component({
  selector: 'app-lt-tab-thresholds-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent],
  template: `
    <div class="request-panel">
      <p class="request-panel__hint">
        Optional pass/fail criteria evaluated when a run completes.
      </p>

      <tx-form-field label="Max error rate (%)" controlId="lt-max-error-rate">
        <tx-input
          id="lt-max-error-rate"
          type="number"
          min="0"
          max="100"
          step="0.1"
          placeholder="e.g. 1"
          [ngModel]="thresholds().maxErrorRatePercent ?? ''"
          (ngModelChange)="handleChange({ maxErrorRatePercent: toOptionalNumber($event) })"
        />
      </tx-form-field>

      <tx-form-field label="Min success rate (%)" controlId="lt-min-success-rate">
        <tx-input
          id="lt-min-success-rate"
          type="number"
          min="0"
          max="100"
          step="0.1"
          placeholder="e.g. 99"
          [ngModel]="thresholds().minSuccessRatePercent ?? ''"
          (ngModelChange)="handleChange({ minSuccessRatePercent: toOptionalNumber($event) })"
        />
      </tx-form-field>

      <tx-form-field label="Max p95 latency (ms)" controlId="lt-max-p95">
        <tx-input
          id="lt-max-p95"
          type="number"
          min="0"
          placeholder="e.g. 500"
          [ngModel]="thresholds().maxP95LatencyMs ?? ''"
          (ngModelChange)="handleChange({ maxP95LatencyMs: toOptionalInt($event) })"
        />
      </tx-form-field>

      <tx-form-field label="Min requests / sec" controlId="lt-min-rps">
        <tx-input
          id="lt-min-rps"
          type="number"
          min="0"
          step="0.1"
          placeholder="e.g. 50"
          [ngModel]="thresholds().minRequestsPerSec ?? ''"
          (ngModelChange)="handleChange({ minRequestsPerSec: toOptionalNumber($event) })"
        />
      </tx-form-field>
    </div>
  `,
  styleUrl: './lt-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabThresholdsPanelComponent {
  readonly thresholds = input.required<LoadTestThresholds>();

  readonly thresholdsChange = output<LoadTestThresholds>();

  protected handleChange(patch: Partial<LoadTestThresholds>): void {
    this.thresholdsChange.emit({ ...this.thresholds(), ...patch });
  }

  protected toOptionalNumber(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  protected toOptionalInt(value: unknown): number | undefined {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
