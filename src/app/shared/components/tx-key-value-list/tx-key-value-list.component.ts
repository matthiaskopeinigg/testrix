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
import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import { TxVariableInputComponent } from '../tx-variable-input/tx-variable-input.component';

import type { TxKeyValueRow } from './tx-key-value-list.types';

export type TxKeyValueListValueInput = 'text' | 'variables';

@Component({
  selector: 'tx-key-value-list',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxVariableInputComponent,
  ],
  templateUrl: './tx-key-value-list.component.html',
  styleUrl: './tx-key-value-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-key-value-list-host',
  },
})
export class TxKeyValueListComponent {
  readonly rows = input<readonly TxKeyValueRow[]>([]);
  readonly maxRows = input(32);
  readonly keyLabel = input('Key');
  readonly valueLabel = input('Value');
  readonly showEnabled = input(true);
  readonly addLabel = input('Add row');
  /** Value column control: plain text or `$` variable autocomplete. */
  readonly valueInput = input<TxKeyValueListValueInput>('text');
  /** Catalog for value column when {@link valueInput} is `variables`. */
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);

  readonly rowsChange = output<readonly TxKeyValueRow[]>();
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
      { id, enabled: true, key: '', value: '' },
    ]);
  }

  protected handleRemove(id: string): void {
    this.rowsChange.emit(this.rows().filter((row) => row.id !== id));
  }

  protected handleEnabledChange(id: string, enabled: boolean): void {
    this.emitRowPatch(id, { enabled });
  }

  protected handleKeyChange(id: string, key: string): void {
    this.emitRowPatch(id, { key });
  }

  protected handleValueChange(id: string, value: string): void {
    this.emitRowPatch(id, { value });
  }

  private emitRowPatch(id: string, patch: Partial<Pick<TxKeyValueRow, 'enabled' | 'key' | 'value'>>): void {
    this.rowsChange.emit(
      this.rows().map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
}
