import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxSliderComponent } from '@app/shared/components/tx-slider/tx-slider.component';

@Component({
  selector: 'app-ts-flow-wait-step-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent, TxSliderComponent],
  templateUrl: './ts-flow-wait-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowWaitStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});

  readonly configChange = output<Record<string, unknown>>();

  protected cfg(): { durationMs: number | string } {
    return (this.config() ?? { durationMs: 2000 }) as { durationMs: number | string };
  }

  protected durationSeconds(): number {
    const ms = Number.parseInt(String(this.cfg().durationMs ?? ''), 10);
    return Number.isFinite(ms) ? Math.round(ms / 1000) : 2;
  }

  protected patchDurationMs(ms: number): void {
    this.configChange.emit({ ...this.cfg(), durationMs: ms });
  }

  protected handleSecondsChange(seconds: number): void {
    this.patchDurationMs(Math.round(seconds * 1000));
  }

  protected toNumber(value: unknown): number {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
}
