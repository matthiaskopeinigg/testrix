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
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxModalComponent } from '@app/shared/components/overlays/tx-modal/tx-modal.component';

export interface DatabaseSchemaPickerState {
  readonly connectionId: string;
  readonly connectionName: string;
  readonly schemas: readonly DatabaseCatalogSchemaItem[];
  readonly selectedSchemas: readonly string[];
  readonly showSystemObjects: boolean;
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
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxModalComponent,
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

  protected readonly filteredSchemas = computed(() => {
    const current = this.state();
    if (!current) {
      return [] as DatabaseCatalogSchemaItem[];
    }
    const needle = this.query().trim().toLowerCase();
    const schemas = current.showSystemObjects
      ? current.schemas
      : current.schemas.filter((schema) => !schema.system);
    if (!needle) {
      return schemas;
    }
    return schemas.filter((schema) => schema.name.toLowerCase().includes(needle));
  });

  protected readonly selectedCount = computed(() => this.draftSelected().size);

  constructor() {
    effect(() => {
      const current = this.state();
      if (!current) {
        this.query.set('');
        this.draftSelected.set(new Set());
        return;
      }
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

  protected handleSelectFiltered(): void {
    const next = new Set(this.draftSelected());
    for (const schema of this.filteredSchemas()) {
      next.add(schema.name.toLowerCase());
    }
    this.draftSelected.set(next);
  }

  protected handleClearFiltered(): void {
    const filtered = new Set(this.filteredSchemas().map((schema) => schema.name.toLowerCase()));
    const next = new Set([...this.draftSelected()].filter((name) => !filtered.has(name)));
    this.draftSelected.set(next);
  }

  protected handleApply(): void {
    const current = this.state();
    if (!current) {
      return;
    }
    const wanted = this.draftSelected();
    const selectedSchemas = current.schemas
      .filter((schema) => wanted.has(schema.name.toLowerCase()))
      .map((schema) => schema.name);
    this.applied.emit({ connectionId: current.connectionId, selectedSchemas });
  }

  protected handleCancel(): void {
    this.closed.emit();
  }
}
