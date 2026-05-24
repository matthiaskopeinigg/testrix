import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionRequestBody } from '@shared/config';
import {
  createDefaultRequestStepConfig,
  flowRequestStepCollectionBody,
  patchRequestStepFromCollectionBody,
  type RequestStepConfig,
} from '@shared/testing';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import { WorkspaceSectionNavSliderDirective } from '@app/features/shell/workspace/workspace-section-nav-slider.directive';
import { RequestTabBodyPanelComponent } from '@app/features/shell/workspace/request-workspace-tab/request-tab-body-panel.component';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxKeyValueListComponent } from '@app/shared/components/tx-key-value-list/tx-key-value-list.component';
import type { TxKeyValueRow } from '@app/shared/components/tx-key-value-list/tx-key-value-list.types';
import { TxVariableInputComponent } from '@app/shared/components/tx-variable-input/tx-variable-input.component';

import {
  FLOW_REQUEST_STEP_NAV_ITEMS,
  type FlowRequestStepSection,
} from './flow-request-step-sections';
import {
  FLOW_REQUEST_SOURCE_OPTIONS,
  resolveFlowRequestStepSource,
  type FlowRequestStepSource,
} from './flow-request-source';
import { FLOW_STEP_HTTP_METHOD_OPTIONS } from './flow-step-editor-options';
import { kvPairsToRows, rowsToKvPairs } from './flow-step-kv';
import { TsFlowCollectionRequestPickerComponent } from './ts-flow-collection-request-picker.component';

@Component({
  selector: 'app-ts-flow-request-step-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    RequestTabBodyPanelComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxKeyValueListComponent,
    TxVariableInputComponent,
    TsFlowCollectionRequestPickerComponent,
    WorkspaceSectionNavSliderDirective,
  ],
  templateUrl: './ts-flow-request-step-panel.component.html',
  styleUrl: './ts-flow-request-step-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowRequestStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);

  readonly configChange = output<Record<string, unknown>>();

  protected readonly httpMethodOptions = FLOW_STEP_HTTP_METHOD_OPTIONS;
  protected readonly requestSourceOptions = FLOW_REQUEST_SOURCE_OPTIONS;
  protected readonly navItems = FLOW_REQUEST_STEP_NAV_ITEMS;

  protected readonly activeSection = signal<FlowRequestStepSection>('params');

  protected readonly requestSource = computed(() => resolveFlowRequestStepSource(this.cfg()));

  protected readonly needsManualUrl = computed(
    () => this.requestSource() === 'manual' && !String(this.cfg().url ?? '').trim(),
  );

  protected readonly needsCollectionRequest = computed(
    () => this.requestSource() === 'collection' && !this.cfg().collectionRequestId,
  );

  protected readonly collectionBody = computed(() => flowRequestStepCollectionBody(this.cfg()));

  protected cfg(): RequestStepConfig {
    return (this.config() ?? createDefaultRequestStepConfig()) as RequestStepConfig;
  }

  protected headerRows(): readonly TxKeyValueRow[] {
    return kvPairsToRows(this.cfg().headers ?? []);
  }

  protected queryRows(): readonly TxKeyValueRow[] {
    return kvPairsToRows(this.cfg().queryParams ?? []);
  }

  protected patch(patch: Partial<RequestStepConfig>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }

  protected handleRequestSourceChange(source: FlowRequestStepSource): void {
    if (source === 'manual') {
      this.patch({
        requestSource: 'manual',
        collectionRequestId: undefined,
      });
      return;
    }
    this.patch({
      requestSource: 'collection',
      url: '',
    });
  }

  protected handleSectionSelect(section: FlowRequestStepSection): void {
    this.activeSection.set(section);
  }

  protected handleHeadersChange(rows: readonly TxKeyValueRow[]): void {
    this.patch({ headers: rowsToKvPairs(rows) });
  }

  protected handleQueryChange(rows: readonly TxKeyValueRow[]): void {
    this.patch({ queryParams: rowsToKvPairs(rows) });
  }

  protected handleBodyChange(body: CollectionRequestBody): void {
    this.patch(patchRequestStepFromCollectionBody(body));
  }
}
