import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import type { httpInterceptorStepConfigSchema } from '@shared/testing/test-suite-steps.schema';
import type { z } from 'zod';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { txCodeEditorLanguageLabel } from '@app/shared/components/tx-code-editor/tx-code-editor-language';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxKeyValueListComponent } from '@app/shared/components/tx-key-value-list/tx-key-value-list.component';
import { TxVariableInputComponent } from '@app/shared/components/tx-variable-input/tx-variable-input.component';
import type { TxKeyValueRow } from '@app/shared/components/tx-key-value-list/tx-key-value-list.types';

import { interceptorBodyEditorLanguage } from './flow-interceptor-body-language';
import {
  FLOW_STEP_BODY_TYPE_OPTIONS,
  FLOW_STEP_HTTP_METHOD_OPTIONS,
  FLOW_STEP_INTERCEPTOR_ACTION_OPTIONS,
  FLOW_STEP_LISTENER_PHASE_OPTIONS,
} from './flow-step-editor-options';
import { kvPairsToRows, rowsToKvPairs } from './flow-step-kv';

@Component({
  selector: 'app-ts-flow-http-interceptor-step-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxCodeEditorComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxKeyValueListComponent,
    TxVariableInputComponent,
  ],
  templateUrl: './ts-flow-http-interceptor-step-panel.component.html',
  styleUrl: './ts-flow-http-interceptor-step-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowHttpInterceptorStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);

  readonly configChange = output<Record<string, unknown>>();

  protected readonly methodOptions = FLOW_STEP_HTTP_METHOD_OPTIONS;
  protected readonly phaseOptions = FLOW_STEP_LISTENER_PHASE_OPTIONS;
  protected readonly actionOptions = FLOW_STEP_INTERCEPTOR_ACTION_OPTIONS;
  protected readonly bodyTypeOptions = FLOW_STEP_BODY_TYPE_OPTIONS;

  protected readonly cfg = computed(
    () => (this.config() ?? {}) as z.infer<typeof httpInterceptorStepConfigSchema>,
  );

  protected readonly isModifyAction = computed(() => this.cfg().interceptAction !== 'block');

  protected readonly bodyEditorLanguage = computed(() =>
    interceptorBodyEditorLanguage(this.cfg().replaceBodyType),
  );

  protected readonly bodyEditorLanguageLabel = computed(() =>
    txCodeEditorLanguageLabel(this.bodyEditorLanguage()),
  );

  protected readonly showBodyEditor = computed(() => {
    const bodyType = this.cfg().replaceBodyType ?? 'none';
    return this.isModifyAction() && bodyType !== 'none';
  });

  protected patch(patch: Record<string, unknown>): void {
    this.configChange.emit({ ...this.config(), ...patch });
  }

  protected headerRows(): readonly TxKeyValueRow[] {
    return kvPairsToRows(this.cfg().amendHeaders ?? []);
  }

  protected queryRows(): readonly TxKeyValueRow[] {
    return kvPairsToRows(this.cfg().amendQueryParams ?? []);
  }

  protected handleHeadersChange(rows: readonly TxKeyValueRow[]): void {
    this.patch({ amendHeaders: rowsToKvPairs(rows) });
  }

  protected handleQueryChange(rows: readonly TxKeyValueRow[]): void {
    this.patch({ amendQueryParams: rowsToKvPairs(rows) });
  }
}
