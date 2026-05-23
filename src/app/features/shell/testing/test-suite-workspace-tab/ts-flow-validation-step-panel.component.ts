import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  defaultValidationRuleForReferenceStepType,
  findFlowStepById,
  sanitizeValidationRulesForReferenceStepType,
  type FlowStepRunCapture,
  type TestSuiteFlow,
  type TestSuiteStepType,
} from '@shared/testing';
import type { ValidationStepConfig } from '@shared/testing/test-suite-steps.schema';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxSuggestInputComponent } from '@app/shared/components/tx-suggest-input/tx-suggest-input.component';

import { FLOW_STEP_VALIDATION_OPERATOR_OPTIONS } from './flow-step-editor-options';
import {
  buildValidationSourceOptions,
  validationExpressionLabel,
  validationExpressionSuggestions,
  validationReferenceHint,
} from './flow-step-validation-options';

@Component({
  selector: 'app-ts-flow-validation-step-panel',
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
  templateUrl: './ts-flow-validation-step-panel.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowValidationStepPanelComponent {
  readonly config = input<Record<string, unknown>>({});
  readonly flow = input<TestSuiteFlow | null>(null);
  readonly refStepOptions = input<readonly TxDropdownOption[]>([]);

  readonly configChange = output<Record<string, unknown>>();

  protected readonly operatorOptions = FLOW_STEP_VALIDATION_OPERATOR_OPTIONS;

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

  protected readonly sourceOptions = computed(() =>
    buildValidationSourceOptions(this.refStepType()),
  );

  protected readonly referenceHint = computed(() => validationReferenceHint(this.refStepType()));

  protected cfg(): ValidationStepConfig {
    return (this.config() ?? { refStepId: null, rules: [] }) as ValidationStepConfig;
  }

  protected rules(): ValidationStepConfig['rules'] {
    return this.cfg().rules ?? [];
  }

  protected patch(patch: Partial<ValidationStepConfig>): void {
    this.configChange.emit({ ...this.cfg(), ...patch });
  }

  protected patchRule(index: number, patch: Partial<ValidationStepConfig['rules'][number]>): void {
    const rules = [...this.rules()];
    rules[index] = { ...rules[index], ...patch };
    this.patch({ rules });
  }

  protected expressionLabel(source: ValidationStepConfig['rules'][number]['source']): string | null {
    return validationExpressionLabel(source);
  }

  protected expressionSuggestions(
    source: ValidationStepConfig['rules'][number]['source'],
  ): readonly string[] | null {
    return validationExpressionSuggestions(source);
  }

  protected handleRefStepChange(refStepId: string): void {
    const nextRefId = refStepId || null;
    const flow = this.flow();
    const refStep = nextRefId && flow ? findFlowStepById(flow.nodes, nextRefId) : null;
    const rules = nextRefId
      ? sanitizeValidationRulesForReferenceStepType(refStep?.stepType, this.rules())
      : [];
    if (rules.length === 0) {
      const fallback = defaultValidationRuleForReferenceStepType(refStep?.stepType);
      this.patch({ refStepId: nextRefId, rules: fallback ? [fallback] : [] });
      return;
    }
    this.patch({ refStepId: nextRefId, rules });
  }

  protected handleAddRule(): void {
    const fallback = defaultValidationRuleForReferenceStepType(this.refStepType());
    if (!fallback) {
      return;
    }
    this.patch({ rules: [...this.rules(), fallback] });
  }

  protected handleRemoveRule(index: number): void {
    this.patch({ rules: this.rules().filter((_, i) => i !== index) });
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
    const usesPageUrl = this.rules().some((rule) => rule.source === 'e2e_page_url');
    if (usesPageUrl && capture.pageUrl.trim()) {
      return capture.pageUrl.trim();
    }
    if (capture.elementExists) {
      const preview = capture.elementText.trim() || capture.elementHtml.trim();
      return preview.length > 0 ? preview.slice(0, 120) : 'Element found (empty text)';
    }
    return capture.pageUrl || 'No element capture yet';
  }
}
