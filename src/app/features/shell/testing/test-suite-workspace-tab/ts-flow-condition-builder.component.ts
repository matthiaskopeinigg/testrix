import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  FLOW_CONDITION_OPERATORS,
  createDefaultFlowCondition,
  type FlowCondition,
  type FlowConditionOperator,
} from '@shared/testing';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxVariableInputComponent } from '@app/shared/components/editors/tx-variable-input/tx-variable-input.component';

const OPERATOR_LABELS: Record<FlowConditionOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not equals',
  contains: 'Contains',
  matches_regex: 'Matches regex',
  greater_than: 'Greater than',
  less_than: 'Less than',
  is_empty: 'Is empty',
  is_not_empty: 'Is not empty',
};

@Component({
  selector: 'app-ts-flow-condition-builder',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxVariableInputComponent,
  ],
  templateUrl: './ts-flow-condition-builder.component.html',
  styleUrl: './ts-flow-step-panel.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowConditionBuilderComponent {
  readonly condition = input<FlowCondition | null | undefined>(null);
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>([]);
  readonly controlIdPrefix = input('ts-cond');

  readonly conditionChange = output<FlowCondition>();
  readonly environmentVariableClick = output<{ readonly key: string }>();

  protected readonly examplePlaceholder = '{{status}}';

  protected readonly operatorOptions: readonly TxDropdownOption[] = FLOW_CONDITION_OPERATORS.map(
    (value) => ({ value, label: OPERATOR_LABELS[value] }),
  );

  protected clauses(): FlowCondition['clauses'] {
    const clauses = this.condition()?.clauses ?? [];
    return clauses.length > 0 ? clauses : createDefaultFlowCondition().clauses;
  }

  protected unary(operator: string): boolean {
    return operator === 'is_empty' || operator === 'is_not_empty';
  }

  protected patchClause(
    index: number,
    patch: Partial<FlowCondition['clauses'][number]>,
  ): void {
    const next = this.clauses().map((clause, i) => (i === index ? { ...clause, ...patch } : clause));
    this.conditionChange.emit({ clauses: next });
  }

  protected handleAddClause(): void {
    this.conditionChange.emit({
      clauses: [...this.clauses(), { left: '', operator: 'equals', right: '' }],
    });
  }

  protected handleRemoveClause(index: number): void {
    const next = this.clauses().filter((_, i) => i !== index);
    this.conditionChange.emit({
      clauses: next.length > 0 ? next : createDefaultFlowCondition().clauses,
    });
  }
}
