import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  defaultCacheEntryForReferenceStepType,
  findFlowStepById,
  sanitizeCacheEntriesForReferenceStepType,
  type FlowStepRunCapture,
  type TestSuiteFlow,
  type TestSuiteStepType,
} from '@shared/testing';
import type { CacheStepConfig } from '@shared/testing/test-suite-steps.schema';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxSuggestInputComponent } from '@app/shared/components/tx-suggest-input/tx-suggest-input.component';

import { FLOW_STEP_VALIDATION_EXTRACT_KIND_OPTIONS } from './flow-step-editor-options';
import {
  buildCacheSourceOptions,
  cacheExpressionLabel,
  cacheExpressionSuggestions,
  cacheReferenceHint,
} from './flow-step-cache-options';

@Component({
  selector: 'app-ts-flow-cache-step-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxFormFieldComponent,
    TxInputComponent,
    TxSuggestInputComponent,
    TxDropdownComponent,
    TxButtonComponent,
    TxIconComponent,
  ],
  templateUrl: './ts-flow-cache-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowCacheStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});
  readonly flow = input<TestSuiteFlow | null>(null);
  readonly refStepOptions = input<readonly TxDropdownOption[]>([]);

  readonly configChange = output<Record<string, unknown>>();

  protected readonly extractKindOptions = FLOW_STEP_VALIDATION_EXTRACT_KIND_OPTIONS;

  protected readonly refStepType = computed((): TestSuiteStepType | null => {
    const flow = this.flow();
    const refId = this.cfg().refStepId;
    if (!flow || !refId) {
      return null;
    }
    return findFlowStepById(flow.nodes, refId)?.stepType ?? null;
  });

  protected readonly refStepCapture = computed((): FlowStepRunCapture | null | undefined => {
    const flow = this.flow();
    const refId = this.cfg().refStepId;
    if (!flow || !refId) {
      return null;
    }
    return findFlowStepById(flow.nodes, refId)?.lastRunCapture ?? null;
  });

  protected readonly sourceOptions = computed(() => buildCacheSourceOptions(this.refStepType()));

  protected readonly referenceHint = computed(() => cacheReferenceHint(this.refStepType()));

  protected cfg(): CacheStepConfig {
    return (this.config() ?? { refStepId: null, entries: [] }) as CacheStepConfig;
  }

  protected entries(): CacheStepConfig['entries'] {
    return this.cfg().entries ?? [];
  }

  protected patch(patch: Partial<CacheStepConfig>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }

  protected patchEntry(index: number, patch: Partial<CacheStepConfig['entries'][number]>): void {
    const entries = [...this.entries()];
    entries[index] = { ...entries[index], ...patch };
    this.patch({ entries });
  }

  protected expressionLabel(source: CacheStepConfig['entries'][number]['source']): string | null {
    return cacheExpressionLabel(source);
  }

  protected expressionSuggestions(
    source: CacheStepConfig['entries'][number]['source'],
  ): readonly string[] | null {
    return cacheExpressionSuggestions(source);
  }

  protected handleRefStepChange(refStepId: string): void {
    const nextRefId = refStepId || null;
    const flow = this.flow();
    const refStep = nextRefId && flow ? findFlowStepById(flow.nodes, nextRefId) : null;
    const entries = nextRefId
      ? sanitizeCacheEntriesForReferenceStepType(refStep?.stepType, this.entries())
      : [];
    if (entries.length === 0) {
      const fallback = defaultCacheEntryForReferenceStepType(refStep?.stepType);
      this.patch({ refStepId: nextRefId, entries: fallback ? [fallback] : [] });
      return;
    }
    this.patch({ refStepId: nextRefId, entries });
  }

  protected handleAddEntry(): void {
    const fallback = defaultCacheEntryForReferenceStepType(this.refStepType());
    if (!fallback) {
      return;
    }
    this.patch({ entries: [...this.entries(), fallback] });
  }

  protected handleRemoveEntry(index: number): void {
    this.patch({ entries: this.entries().filter((_, i) => i !== index) });
  }

  protected capturePreview(): string | null {
    const capture = this.refStepCapture();
    if (!capture) {
      return null;
    }
    if (capture.kind === 'http_response') {
      return `Status ${capture.statusCode} · body ${capture.bodyText.length} chars`;
    }
    if (capture.kind === 'database_result') {
      return `Query result · ${capture.dbText.length} chars`;
    }
    if (capture.kind !== 'e2e_element') {
      return null;
    }
    if (capture.elementExists) {
      const preview = capture.elementText.trim() || capture.elementHtml.trim();
      return preview.length > 0 ? preview.slice(0, 120) : 'Element found (empty text)';
    }
    return capture.pageUrl || 'No element capture yet';
  }
}
