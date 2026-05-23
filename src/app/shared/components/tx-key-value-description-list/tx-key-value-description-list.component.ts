import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxSuggestInputComponent } from '../tx-suggest-input/tx-suggest-input.component';
import { TxTooltipDirective } from '../tx-tooltip/tx-tooltip.directive';
import {
  TX_COMPLETION_PLACEMENT_DEFAULT,
  type TxCompletionPlacement,
} from '../tx-completion-popup/tx-completion-popup-placement';
import { TxVariableInputComponent } from '../tx-variable-input/tx-variable-input.component';

import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';
import { COMMON_HTTP_HEADER_NAMES } from '@shared/http/common-http-header-names';
import { getHttpHeaderValueSuggestions } from '@shared/http/common-http-header-values';
import { COMMON_HTTP_QUERY_PARAM_NAMES } from '@shared/http/common-http-query-param-names';
import {
  resolveKeyValueSuggestKeyInput,
  type KeyValueSuggestKeyInput,
} from '@shared/http/key-value-suggest-key-input';

import { TX_KEY_VALUE_DESCRIPTION_LIST_VALUE_HINT } from './tx-key-value-description-list-value-hint';
import type { TxKeyValueDescriptionRow } from './tx-key-value-description-list.types';

export type TxKeyValueDescriptionListValueInput = 'text' | 'variables';
export type TxKeyValueDescriptionListKeyInput = KeyValueSuggestKeyInput;

@Component({
  selector: 'tx-key-value-description-list',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxIconComponent,
    TxInputComponent,
    TxSuggestInputComponent,
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
  readonly keyInput = input<TxKeyValueDescriptionListKeyInput>('text');
  readonly valueInput = input<TxKeyValueDescriptionListValueInput>('text');
  readonly valueHintTooltip = input(TX_KEY_VALUE_DESCRIPTION_LIST_VALUE_HINT);
  /** Query-param style rows: checkbox toggles inclusion in the URL. */
  readonly showEnabled = input(false);
  /** Catalog for value column when {@link valueInput} is `variables`. */
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);
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

  protected headerValueSuggestionsFor(key: string): readonly string[] {
    if (this.effectiveKeyInput() !== 'http-headers') {
      return [];
    }
    return getHttpHeaderValueSuggestions(key);
  }

  protected usesKeySuggestions(): boolean {
    return this.effectiveKeyInput() !== 'text';
  }

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
