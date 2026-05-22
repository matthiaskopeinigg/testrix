import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-ts-flow-manual-step-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent, TxTextareaComponent],
  templateUrl: './ts-flow-manual-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowManualStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});

  readonly configChange = output<Record<string, unknown>>();

  protected cfg(): { prompt: string; variableName: string } {
    return (this.config() ?? { prompt: '', variableName: 'userInput' }) as {
      prompt: string;
      variableName: string;
    };
  }

  protected patch(patch: Record<string, unknown>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }
}
