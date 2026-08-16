import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { DatabaseCatalogSchemaItem } from '@shared/database';

import { TxAutofocusDirective } from '@app/shared/directives/tx-autofocus.directive';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxModalComponent } from '@app/shared/components/overlays/tx-modal/tx-modal.component';
import { TxSpinnerComponent } from '@app/shared/components/feedback/tx-spinner/tx-spinner.component';

export interface DatabaseSchemaPickerState {
  readonly connectionId: string;
  readonly connectionName: string;
  readonly schemas: readonly DatabaseCatalogSchemaItem[];
  readonly selectedSchemas: readonly string[];
  readonly showSystemObjects: boolean;
  readonly loading: boolean;
  readonly error?: string;
}

/**
 * Puts currently selected schemas first, then the rest, each group A–Z.
 */
export function sortDatabaseSchemasSelectedFirst(
  schemas: readonly DatabaseCatalogSchemaItem[],
  selected: ReadonlySet<string>,
): DatabaseCatalogSchemaItem[] {
  return [...schemas].sort((left, right) => {
    const leftSelected = selected.has(left.name.toLowerCase()) ? 0 : 1;
    const rightSelected = selected.has(right.name.toLowerCase()) ? 0 : 1;
    if (leftSelected !== rightSelected) {
      return leftSelected - rightSelected;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

/**
 * DataGrip-style searchable schema checklist for the Database sidebar.
 */
@Component({
  selector: 'app-database-schema-picker-dialog',
  standalone: true,
  imports: [
    FormsModule,
    TxAutofocusDirective,
    TxBannerComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxModalComponent,
    TxSpinnerComponent,
  ],
  templateUrl: './database-schema-picker-dialog.component.html',
  styleUrl: './database-schema-picker-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseSchemaPickerDialogComponent {
  readonly state = input<DatabaseSchemaPickerState | null>(null);

  readonly applied = output<{ readonly connectionId: string; readonly selectedSchemas: readonly string[] }>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly draftSelected = signal<ReadonlySet<string>>(new Set());
  private lastConnectionId: string | null = null;

  protected readonly filteredSchemas = computed(() => {
    const current = this.state();
    if (!current) {
      return [] as DatabaseCatalogSchemaItem[];
    }
    const needle = this.query().trim().toLowerCase();
    const schemas = current.showSystemObjects
      ? current.schemas
      : current.schemas.filter((schema) => !schema.system);
    const visible = needle
      ? schemas.filter((schema) => schema.name.toLowerCase().includes(needle))
      : schemas;
    return sortDatabaseSchemasSelectedFirst(visible, this.draftSelected());
  });

  protected readonly selectedCount = computed(() => this.draftSelected().size);

  constructor() {
    effect(() => {
      const current = this.state();
      if (!current) {
        this.query.set('');
        this.draftSelected.set(new Set());
        this.lastConnectionId = null;
        return;
      }
      if (this.lastConnectionId === current.connectionId) {
        return;
      }
      this.lastConnectionId = current.connectionId;
      this.query.set('');
      this.draftSelected.set(
        new Set(current.selectedSchemas.map((name) => name.toLowerCase())),
      );
    });
  }

  protected dialogTitle(): string {
    const current = this.state();
    return current ? `Schemas — ${current.connectionName}` : 'Schemas';
  }

  protected isSelected(name: string): boolean {
    return this.draftSelected().has(name.toLowerCase());
  }

  protected showDividerBefore(index: number): boolean {
    if (index <= 0) {
      return false;
    }
    const rows = this.filteredSchemas();
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current) {
      return false;
    }
    return this.isSelected(previous.name) && !this.isSelected(current.name);
  }

  protected handleToggle(name: string): void {
    const key = name.toLowerCase();
    const next = new Set(this.draftSelected());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.draftSelected.set(next);
  }

  protected handleApply(): void {
    const current = this.state();
    if (!current || current.loading) {
      return;
    }
    const wanted = this.draftSelected();
    const selectedSchemas = current.schemas
      .filter((schema) => wanted.has(schema.name.toLowerCase()))
      .map((schema) => schema.name);
    const known = new Set(selectedSchemas.map((name) => name.toLowerCase()));
    for (const name of current.selectedSchemas) {
      if (wanted.has(name.toLowerCase()) && !known.has(name.toLowerCase())) {
        selectedSchemas.push(name);
        known.add(name.toLowerCase());
      }
    }
    this.applied.emit({ connectionId: current.connectionId, selectedSchemas });
  }

  protected handleCancel(): void {
    this.closed.emit();
  }
}
