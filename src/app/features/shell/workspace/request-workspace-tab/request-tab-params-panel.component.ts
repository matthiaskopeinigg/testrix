import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionRequestPathParam } from '@shared/config';
import type { HttpKeyValueRow } from '@shared/config';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxKeyValueListComponent } from '@app/shared/components/tx-key-value-list/tx-key-value-list.component';
import type { TxKeyValueRow } from '@app/shared/components/tx-key-value-list/tx-key-value-list.types';
import { TxVariableInputComponent } from '@app/shared/components/tx-variable-input/tx-variable-input.component';
import { DYNAMIC_VARIABLES, type DynamicVariableCatalogItem } from '@shared/dynamic-variables';

@Component({
  selector: 'app-request-tab-params-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxFormFieldComponent,
    TxInputComponent,
    TxKeyValueListComponent,
    TxVariableInputComponent,
  ],
  template: `
    <div class="request-panel">
      <h2 class="request-panel__title">Path variables</h2>
      <p class="request-panel__hint">
        Defined by <code>:name</code> segments in the URL. Values support <code>$</code> dynamic
        variables and environment placeholders from the bar above.
      </p>
      @if (pathParams().length === 0) {
        <p class="request-panel__empty">No path variables in the current URL.</p>
      } @else {
        <ul class="request-panel__path-list">
          @for (row of pathParams(); track row.id) {
            <li class="request-panel__path-row">
              <tx-form-field [label]="':' + row.key" [controlId]="'path-val-' + row.id">
                <tx-variable-input
                  [controlId]="'path-val-' + row.id"
                  [catalog]="variableCatalog()"
                  [ngModel]="row.value"
                  (ngModelChange)="handlePathValueChange(row.id, $event)"
                  (environmentVariableClick)="environmentVariableClick.emit($event)"
                  placeholder="Value"
                />
              </tx-form-field>
              <tx-form-field label="Description" [controlId]="'path-desc-' + row.id">
                <tx-input
                  [controlId]="'path-desc-' + row.id"
                  [ngModel]="row.description ?? ''"
                  (ngModelChange)="handlePathDescriptionChange(row.id, $event)"
                  placeholder="Optional notes"
                />
              </tx-form-field>
            </li>
          }
        </ul>
      }

      <h2 class="request-panel__title">Query parameters</h2>
      <tx-key-value-list
        [compact]="true"
        keyLabel="Key"
        keyInput="query-params"
        valueLabel="Value"
        descriptionLabel="Description"
        addLabel="Add query param"
        valueInput="variables"
        [showDescription]="true"
        [showEnabled]="true"
        [maxRows]="64"
        [rows]="queryRows()"
        [variableCatalog]="variableCatalog()"
        (rowsChange)="handleQueryChange($event)"
        (environmentVariableClick)="environmentVariableClick.emit($event)"
      />
    </div>
  `,
  styleUrl: './request-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabParamsPanelComponent {
  readonly pathParams = input.required<readonly CollectionRequestPathParam[]>();
  readonly queryParams = input.required<readonly HttpKeyValueRow[]>();
  readonly variableCatalog = input<readonly DynamicVariableCatalogItem[]>(DYNAMIC_VARIABLES);

  readonly pathParamsChange = output<readonly CollectionRequestPathParam[]>();
  readonly queryParamsChange = output<readonly HttpKeyValueRow[]>();
  readonly environmentVariableClick = output<{ readonly key: string }>();

  protected queryRows(): readonly TxKeyValueRow[] {
    return this.queryParams().map((row) => ({
      id: row.id,
      enabled: row.enabled,
      key: row.key,
      value: row.value,
      description: row.description,
    }));
  }

  protected handlePathValueChange(id: string, value: string): void {
    this.pathParamsChange.emit(
      this.pathParams().map((row) => (row.id === id ? { ...row, value } : row)),
    );
  }

  protected handlePathDescriptionChange(id: string, description: string): void {
    const trimmed = description.trim();
    this.pathParamsChange.emit(
      this.pathParams().map((row) =>
        row.id === id ? { ...row, description: trimmed || undefined } : row,
      ),
    );
  }

  protected handleQueryChange(rows: readonly TxKeyValueRow[]): void {
    this.queryParamsChange.emit(
      rows.map((row) => ({
        id: row.id,
        enabled: row.enabled ?? true,
        key: row.key,
        value: row.value,
        description: row.description,
      })),
    );
  }
}
