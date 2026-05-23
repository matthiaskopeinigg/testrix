import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  createDefaultLoadTestManualTarget,
  type LoadTestManualTarget,
} from '@shared/testing';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxKeyValueListComponent } from '@app/shared/components/tx-key-value-list/tx-key-value-list.component';
import type { TxKeyValueRow } from '@app/shared/components/tx-key-value-list/tx-key-value-list.types';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxVariableInputComponent } from '@app/shared/components/tx-variable-input/tx-variable-input.component';

import {
  FLOW_STEP_BODY_TYPE_OPTIONS,
  FLOW_STEP_HTTP_METHOD_OPTIONS,
} from '../test-suite-workspace-tab/flow-step-editor-options';
import { kvPairsToRows, rowsToKvPairs } from '../test-suite-workspace-tab/flow-step-kv';

@Component({
  selector: 'app-lt-tab-manual-target-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxFormFieldComponent,
    TxTextareaComponent,
    TxDropdownComponent,
    TxVariableInputComponent,
    TxKeyValueListComponent,
  ],
  templateUrl: './lt-tab-manual-target-panel.component.html',
  styleUrl: './lt-tab-manual-target-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabManualTargetPanelComponent {
  readonly manualTarget = input<LoadTestManualTarget | undefined>(undefined);
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);

  readonly manualTargetChange = output<LoadTestManualTarget>();

  protected readonly httpMethodOptions = FLOW_STEP_HTTP_METHOD_OPTIONS;
  protected readonly bodyTypeOptions = FLOW_STEP_BODY_TYPE_OPTIONS;

  protected readonly needsUrl = computed(() => !String(this.cfg().url ?? '').trim());

  protected cfg(): LoadTestManualTarget {
    return this.manualTarget() ?? createDefaultLoadTestManualTarget();
  }

  protected headerRows(): readonly TxKeyValueRow[] {
    return kvPairsToRows(this.cfg().headers ?? []);
  }

  protected queryRows(): readonly TxKeyValueRow[] {
    return kvPairsToRows(this.cfg().queryParams ?? []);
  }

  protected patch(patch: Partial<LoadTestManualTarget>): void {
    this.manualTargetChange.emit({ ...this.cfg(), ...patch });
  }

  protected handleHeadersChange(rows: readonly TxKeyValueRow[]): void {
    this.patch({ headers: rowsToKvPairs(rows) });
  }

  protected handleQueryChange(rows: readonly TxKeyValueRow[]): void {
    this.patch({ queryParams: rowsToKvPairs(rows) });
  }
}
