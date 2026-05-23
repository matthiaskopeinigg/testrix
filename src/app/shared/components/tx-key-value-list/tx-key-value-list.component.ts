import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxSuggestInputComponent } from '../tx-suggest-input/tx-suggest-input.component';
import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import { COMMON_HTTP_HEADER_NAMES } from '@shared/http/common-http-header-names';
import { getHttpHeaderValueSuggestions } from '@shared/http/common-http-header-values';
import { COMMON_HTTP_QUERY_PARAM_NAMES } from '@shared/http/common-http-query-param-names';
import {
  resolveKeyValueSuggestKeyInput,
  type KeyValueSuggestKeyInput,
} from '@shared/http/key-value-suggest-key-input';

import {
  TX_COMPLETION_PLACEMENT_DEFAULT,
  type TxCompletionPlacement,
} from '../tx-completion-popup/tx-completion-popup-placement';
import { TxVariableInputComponent } from '../tx-variable-input/tx-variable-input.component';

import type { TxKeyValueRow } from './tx-key-value-list.types';

export type TxKeyValueListValueInput = 'text' | 'variables';
export type TxKeyValueListKeyInput = KeyValueSuggestKeyInput;

@Component({
  selector: 'tx-key-value-list',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxSuggestInputComponent,
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
  /** Single-line rows without per-row Key/Value labels (e.g. request headers). */
  readonly compact = input(false);
  readonly showEnabled = input(true);
  readonly addLabel = input('Add row');
  /** Key column control: plain text or common HTTP header name autocomplete. */
  readonly keyInput = input<TxKeyValueListKeyInput>('text');
  /** Shows a description field per row (on by default for {@link keyInput} `http-headers`). */
  readonly showDescription = input<boolean | undefined>(undefined);
  readonly descriptionLabel = input('Description');
  /** Value column control: plain text or `$` variable autocomplete. */
  readonly valueInput = input<TxKeyValueListValueInput>('text');
  /** Catalog for value column when {@link valueInput} is `variables`. */
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);
  /** Placement of key/value autocomplete panels (`above` avoids covering the row below). */
  readonly completionPlacement = input<TxCompletionPlacement>(TX_COMPLETION_PLACEMENT_DEFAULT);

  protected readonly headerNameSuggestions = COMMON_HTTP_HEADER_NAMES;
  protected readonly queryParamNameSuggestions = COMMON_HTTP_QUERY_PARAM_NAMES;

  protected readonly effectiveKeyInput = computed(() =>
    resolveKeyValueSuggestKeyInput(this.keyInput(), {
      keyLabel: this.keyLabel(),
      addLabel: this.addLabel(),
    }),
  );

  protected keySuggestions(): readonly string[] {
    switch (this.effectiveKeyInput()) {
      case 'http-headers':
        return this.headerNameSuggestions;
      case 'query-params':
        return this.queryParamNameSuggestions;
      default:
        return [];
    }
  }

  protected keyCompletionLabel(): string {
    switch (this.effectiveKeyInput()) {
      case 'http-headers':
        return 'HTTP header names';
      case 'query-params':
        return 'Query parameter names';
      default:
        return 'Suggestions';
    }
  }

  protected keyPlaceholder(): string {
    switch (this.effectiveKeyInput()) {
      case 'http-headers':
        return 'Header name';
      case 'query-params':
        return 'Param name';
      default:
        return this.keyLabel();
    }
  }

  protected effectiveShowDescription(): boolean {
    const mode = this.showDescription();
    if (mode !== undefined) {
      return mode;
    }
    return this.effectiveKeyInput() === 'http-headers';
  }

  /** Common values for the value column when the row key is a known HTTP header. */
  protected headerValueSuggestionsFor(key: string): readonly string[] {
    if (this.effectiveKeyInput() !== 'http-headers') {
      return [];
    }
    return getHttpHeaderValueSuggestions(key);
  }

  protected usesKeySuggestions(): boolean {
    return this.effectiveKeyInput() !== 'text';
  }

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

  protected handleDescriptionChange(id: string, description: string): void {
    this.emitRowPatch(id, { description });
  }

  private emitRowPatch(
    id: string,
    patch: Partial<Pick<TxKeyValueRow, 'enabled' | 'key' | 'value' | 'description'>>,
  ): void {
    this.rowsChange.emit(
      this.rows().map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
}
