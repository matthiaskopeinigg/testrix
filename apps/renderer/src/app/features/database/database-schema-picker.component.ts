import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TxButtonComponent, TxCheckComponent, TxInputComponent, TxSpinnerComponent } from '@testrix/ui';

import { DATABASE_CATALOG_PAGE_SIZE } from './database-catalog-page';
import { DatabaseStore } from './database.store';

@Component({
  selector: 'tx-database-schema-picker',
  standalone: true,
  imports: [TxButtonComponent, TxCheckComponent, TxInputComponent, TxSpinnerComponent],
  templateUrl: './database-schema-picker.component.html',
  styleUrl: './database-schema-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseSchemaPickerComponent {
  readonly connectionId = input.required<string>();
  private readonly store = inject(DatabaseStore);
  readonly draft = signal<readonly string[] | null>(null);
  readonly search = signal('');
  readonly visibleCount = signal(DATABASE_CATALOG_PAGE_SIZE);

  readonly loading = computed(() => this.store.catalogBusyIds().has(this.connectionId()));
  readonly error = computed(() => this.store.catalogLoadError()[this.connectionId()] ?? null);

  readonly schemas = computed(() => {
    const id = this.connectionId();
    const cache = this.store.catalogByConnection()[id];
    const selected = this.store.connectionById(id)?.selectedSchemas ?? [];
    return [...new Set([...(cache?.schemas ?? []), ...selected])].filter((schema) => schema.trim().length > 0);
  });

  readonly filtered = computed(() => {
    const needle = this.search().trim().toLowerCase();
    const all = this.schemas();
    if (!needle)
      return all;
    return all.filter((schema) => schema.toLowerCase().includes(needle));
  });

  readonly visible = computed(() => this.filtered().slice(0, this.visibleCount()));
  readonly remaining = computed(() => Math.max(0, this.filtered().length - this.visible().length));

  isChecked(schema: string): boolean {
    return this.selected().includes(schema);
  }

  handleSearch(value: string): void {
    this.search.set(value);
    this.visibleCount.set(DATABASE_CATALOG_PAGE_SIZE);
  }

  handleLoadMore(): void {
    this.visibleCount.update((count) => Math.min(this.filtered().length, count + DATABASE_CATALOG_PAGE_SIZE));
  }

  handleToggle(schema: string, checked: boolean): void {
    const current = new Set(this.selected());
    if (checked)
      current.add(schema);
    else
      current.delete(schema);
    this.draft.set([...current]);
  }

  handleApply(): void {
    this.store.setSelectedSchemas(this.connectionId(), this.selected());
    this.store.closeSchemaPicker();
  }

  private selected(): readonly string[] {
    return this.draft() ?? this.store.connectionById(this.connectionId())?.selectedSchemas ?? [];
  }

  handleCancel(): void {
    this.store.closeSchemaPicker();
  }
}
