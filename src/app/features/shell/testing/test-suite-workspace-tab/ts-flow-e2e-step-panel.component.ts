import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import {
  getPrecedingEnabledE2eStepsForPick,
  type E2eStepConfig,
  type TestSuiteFlow,
} from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxVariableInputComponent } from '@app/shared/components/tx-variable-input/tx-variable-input.component';

import {
  e2eSelectorFieldLabel,
  layoutForE2eAction,
} from './flow-e2e-action-fields';
import { FLOW_STEP_E2E_ACTION_OPTIONS } from './flow-step-editor-options';

@Component({
  selector: 'app-ts-flow-e2e-step-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxDropdownComponent,
    TxVariableInputComponent,
  ],
  templateUrl: './ts-flow-e2e-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowE2eStepPanelComponent {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);
  private readonly configService = inject(ConfigService);

  readonly config = input<Record<string, unknown>>({});
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);
  readonly flow = input<TestSuiteFlow | null>(null);
  readonly stepId = input<string | null>(null);

  readonly configChange = output<Record<string, unknown>>();

  protected readonly e2eActionOptions = FLOW_STEP_E2E_ACTION_OPTIONS;
  protected readonly picking = signal(false);

  protected readonly fields = computed(() => layoutForE2eAction(this.cfg().action));

  protected readonly selectorLabel = computed(() => e2eSelectorFieldLabel(this.cfg().action));

  protected readonly expectedUrlLabel = computed(() =>
    this.cfg().action === 'WAIT_FOR_URL' ? 'URL pattern' : 'Expected URL',
  );

  protected cfg(): E2eStepConfig {
    return (this.config() ?? {
      action: 'NAVIGATE_TO',
      selector: '',
      value: '',
      timeout: 5000,
    }) as E2eStepConfig;
  }

  protected patch(patch: Partial<E2eStepConfig>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }

  protected toNumber(value: unknown): number {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) ? n : 0;
  }

  protected async handlePickOnPage(): Promise<void> {
    if (this.picking()) {
      return;
    }

    const api = this.electron.bridge()?.testing;
    if (!api?.e2ePickElement) {
      this.notifier.reportUnknown(new Error('Element picker is only available in the desktop app.'));
      return;
    }

    const flow = this.flow();
    const stepId = this.stepId();
    if (!flow || !stepId) {
      this.notifier.reportUnknown(new Error('Save the flow step before picking an element.'));
      return;
    }

    const e2eScreenshotFolder = this.configService.settings()?.http.testing.e2eScreenshotFolder;
    const precedingE2eSteps = getPrecedingEnabledE2eStepsForPick(
      flow.nodes,
      stepId,
      (raw) => raw,
      e2eScreenshotFolder,
      flow,
    );

    this.picking.set(true);
    try {
      const result = await api.e2ePickElement({ precedingE2eSteps });
      if (result.cancelled) {
        return;
      }
      if (result.ok && result.selector) {
        this.patch({ selector: result.selector });
        return;
      }
      if (result.error) {
        this.notifier.reportUnknown(new Error(result.error));
      }
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    } finally {
      this.picking.set(false);
    }
  }
}
