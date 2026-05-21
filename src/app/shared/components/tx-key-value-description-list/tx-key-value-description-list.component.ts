import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxTooltipDirective } from '../tx-tooltip/tx-tooltip.directive';
import { TxVariableInputComponent } from '../tx-variable-input/tx-variable-input.component';

import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import { TX_KEY_VALUE_DESCRIPTION_LIST_VALUE_HINT } from './tx-key-value-description-list-value-hint';
import type { TxKeyValueDescriptionRow } from './tx-key-value-description-list.types';

export type TxKeyValueDescriptionListValueInput = 'text' | 'variables';

@Component({
  selector: 'tx-key-value-description-list',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxTooltipDirective,
    TxVariableInputComponent,
  ],
  templateUrl: './tx-key-value-description-list.component.html',
  styleUrl: './tx-key-value-description-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-key-value-description-list-host',
  },
})
export class TxKeyValueDescriptionListComponent {
  readonly rows = input<readonly TxKeyValueDescriptionRow[]>([]);
  readonly maxRows = input(64);
  readonly keyLabel = input('Key');
  readonly valueLabel = input('Value');
  readonly descriptionLabel = input('Description');
  readonly addLabel = input('Add row');
  readonly valueInput = input<TxKeyValueDescriptionListValueInput>('text');
  readonly valueHintTooltip = input(TX_KEY_VALUE_DESCRIPTION_LIST_VALUE_HINT);
  /** Query-param style rows: checkbox toggles inclusion in the URL. */
  readonly showEnabled = input(false);
  /** Catalog for value column when {@link valueInput} is `variables`. */
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);

  readonly rowsChange = output<readonly TxKeyValueDescriptionRow[]>();
  readonly environmentVariableClick = output<{ readonly key: string }>();

  protected canAdd(): boolean {
    return this.rows().length < this.maxRows();
  }

  protected handleAdd(): void {
    if (!this.canAdd()) {
      return;
    }
    const id =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `kv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.rowsChange.emit([
      ...this.rows(),
      { id, key: '', value: '', ...(this.showEnabled() ? { enabled: true } : {}) },
    ]);
  }

  protected handleRemove(id: string): void {
    this.rowsChange.emit(this.rows().filter((row) => row.id !== id));
  }

  protected handleKeyChange(id: string, key: string): void {
    this.emitRowPatch(id, { key });
  }

  protected handleValueChange(id: string, value: string): void {
    this.emitRowPatch(id, { value });
  }

  protected handleDescriptionChange(id: string, description: string): void {
    this.emitRowPatch(id, { description: description.trim() || undefined });
  }

  protected handleEnabledChange(id: string, enabled: boolean): void {
    this.emitRowPatch(id, { enabled });
  }

  private emitRowPatch(
    id: string,
    patch: Partial<Pick<TxKeyValueDescriptionRow, 'key' | 'value' | 'description' | 'enabled'>>,
  ): void {
    this.rowsChange.emit(
      this.rows().map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
}
