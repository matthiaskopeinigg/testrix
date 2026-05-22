import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import { httpListenerStepConfigSchema } from '@shared/testing/test-suite-steps.schema';
import type { z } from 'zod';

import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxVariableInputComponent } from '@app/shared/components/tx-variable-input/tx-variable-input.component';

import {
  FLOW_STEP_HTTP_METHOD_OPTIONS,
  FLOW_STEP_LISTENER_PHASE_OPTIONS,
} from './flow-step-editor-options';

@Component({
  selector: 'app-ts-flow-http-middleware-step-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxFormFieldComponent,
    TxInputComponent,
    TxDropdownComponent,
    TxIconComponent,
    TxVariableInputComponent,
  ],
  templateUrl: './ts-flow-http-middleware-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowHttpMiddlewareStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);

  readonly configChange = output<Record<string, unknown>>();

  protected readonly methodOptions = FLOW_STEP_HTTP_METHOD_OPTIONS;
  protected readonly phaseOptions = FLOW_STEP_LISTENER_PHASE_OPTIONS;

  protected listenerCfg(): z.infer<typeof httpListenerStepConfigSchema> {
    return (this.config() ?? {}) as z.infer<typeof httpListenerStepConfigSchema>;
  }

  protected patch(patch: Record<string, unknown>): void {
    this.configChange.emit({ ...this.config(), ...patch });
  }
}
