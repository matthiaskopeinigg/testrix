import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';

import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';

import { FLOW_STEP_TRIGGER_TARGET_OPTIONS } from './flow-step-editor-options';

@Component({
  selector: 'app-ts-flow-trigger-step-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxDropdownComponent],
  templateUrl: './ts-flow-trigger-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowTriggerStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});
  readonly targetOptions = input<readonly TxDropdownOption[]>([]);

  readonly configChange = output<Record<string, unknown>>();

  protected readonly targetTypeOptions = FLOW_STEP_TRIGGER_TARGET_OPTIONS;

  protected cfg(): { targetType: string; targetId: string } {
    return (this.config() ?? { targetType: 'flow', targetId: '' }) as {
      targetType: string;
      targetId: string;
    };
  }

  protected patch(patch: Record<string, unknown>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }
}
