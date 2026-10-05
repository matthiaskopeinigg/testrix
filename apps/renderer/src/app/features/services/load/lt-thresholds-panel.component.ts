import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TxInputComponent } from '@testrix/ui';

export interface LtThresholdsPatch {
  readonly maxErrorRate?: number;
  readonly maxP95Ms?: number;
  readonly minSuccessRate?: number;
  readonly minRps?: number;
}

@Component({
  selector: 'tx-lt-thresholds-panel',
  standalone: true,
  imports: [TxInputComponent],
  templateUrl: './lt-thresholds-panel.component.html',
  styleUrl: './lt-thresholds-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtThresholdsPanelComponent {
  readonly maxErrorRate = input(5);
  readonly maxP95Ms = input(2000);
  readonly minSuccessRate = input(0);
  readonly minRps = input(0);

  readonly patch = output<LtThresholdsPatch>();

  handleNumber(field: 'maxErrorRate' | 'maxP95Ms' | 'minSuccessRate' | 'minRps', raw: string): void {
    const value = Number(raw);
    if (!Number.isFinite(value))
      return;
    this.patch.emit({ [field]: Math.max(0, value) });
  }
}
