import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DatabaseCatalogService } from '@app/core/database/database-catalog.service';
import { catalogTableKey } from '@app/core/database/database-catalog.types';
import { DatabaseConnectionsService } from '@app/core/database/database-connections.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { FileDialogService } from '@app/core/platform/file-dialog.service';
import { TxDataGridComponent } from '@app/shared/components/data/tx-data-grid/tx-data-grid.component';
import type {
  TxDataGridCellCommitEvent,
  TxDataGridExportEvent,
  TxDataGridRowKind,
} from '@app/shared/components/data/tx-data-grid/tx-data-grid.types';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxSpinnerComponent } from '@app/shared/components/feedback/tx-spinner/tx-spinner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxSuggestInputComponent } from '@app/shared/components/forms/tx-suggest-input/tx-suggest-input.component';
import { TxConfirmDialogComponent } from '@app/shared/components/overlays/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxContextMenuComponent } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem, TxContextMenuPosition } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.types';

import type { DatabaseCatalogColumn } from '@shared/database';
import {
  addTableDataInsertRow,
  applyTableDataCellEdit,
  buildTableDataDisplayRows,
  buildTableDataSelectSql,
  buildTableDmlStatements,
  canEditTableData,
  DATABASE_QUERY_EXPORT_FORMATS,
  DATABASE_QUERY_PAGE_SIZE_DEFAULT,
  DATABASE_QUERY_PAGE_SIZES,
  emptyTableDataDraft,
  formatDatabaseConnectionError,
  formatDatabaseQueryResult,
  isFullDatabaseQuerySelection,
  isTableDataDraftDirty,
  normalizeDatabaseQueryResult,
  normalizeTableDataWhereFilter,
  parseDatabaseTableTabResourceId,
  refuseTableDml,
  tableDataPkIndexes,
  tableDataWhereFilterError,
  tableDmlBeginSql,
  tableDmlCommitSql,
  tableDmlRollbackSql,
  toggleTableDataDelete,
  type DatabaseQueryCellRange,
  type DatabaseQueryExportFormat,
  type DatabaseQueryTable,
  type TableDataDraft,
} from '@shared/database';

/**
 * Paged table data editor opened from the Database sidebar (no saved query).
 */
@Component({
  selector: 'app-database-table-data-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxSuggestInputComponent,
    TxSpinnerComponent,
    TxDataGridComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './database-table-data-tab.component.html',
  styleUrl: './database-table-data-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseTableDataTabComponent {
  private readonly catalog = inject(DatabaseCatalogService);
  private readonly connections = inject(DatabaseConnectionsService);
  private readonly electron = inject(ElectronService);
  private readonly errors = inject(ErrorNotificationService);
  private readonly files = inject(FileDialogService);
  private readonly notifications = inject(TxNotificationService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  private readonly resultGrid = viewChild(TxDataGridComponent);

  protected readonly running = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly durationMs = signal<number | null>(null);
  protected readonly table = signal<DatabaseQueryTable | null>(null);
  protected readonly columnsMeta = signal<readonly DatabaseCatalogColumn[]>([]);
  protected readonly isView = signal(false);
  protected readonly whereDraft = signal('');
  protected readonly whereApplied = signal('');
  protected readonly pageSize = signal(DATABASE_QUERY_PAGE_SIZE_DEFAULT);
  protected readonly pageOffset = signal(0);
  protected readonly loadAllOpen = signal(false);
  protected readonly draft = signal<TableDataDraft>(emptyTableDataDraft());
  protected readonly gridSelection = signal<DatabaseQueryCellRange | null>(null);
  protected readonly exportMenuOpen = signal(false);
  protected readonly exportMenuPosition = signal<TxContextMenuPosition>({ x: 0, y: 0 });
  private readonly exportScope = signal<'all' | 'selection'>('all');
  private bootKey = '';

  protected readonly target = computed(() => parseDatabaseTableTabResourceId(this.resourceId()));

  protected readonly connection = computed(() => {
    const id = this.target()?.connectionId;
    return id ? this.connections.find(id) : null;
  });

  protected readonly pkColumns = computed(() =>
    this.columnsMeta()
      .filter((column) => column.primaryKey)
      .map((column) => column.name),
  );

  protected readonly editable = computed(() =>
    canEditTableData({
      type: this.connection()?.type,
      isView: this.isView(),
      pkColumns: this.pkColumns(),
    }),
  );

  protected readonly refuseReason = computed(() =>
    refuseTableDml({
      type: this.connection()?.type,
      isView: this.isView(),
      pkColumns: this.pkColumns(),
    }),
  );

  protected readonly dirty = computed(() => isTableDataDraftDirty(this.draft()));

  protected readonly display = computed(() => {
    const table = this.table();
    if (!table) {
      return [];
    }
    const pkIndexes = tableDataPkIndexes(table.columns, this.pkColumns());
    return buildTableDataDisplayRows(table.rows, table.columns, pkIndexes, this.draft());
  });

  protected readonly displayRows = computed(() => this.display().map((row) => row.cells));

  protected readonly rowKinds = computed((): readonly TxDataGridRowKind[] =>
    this.display().map((row) => row.kind),
  );

  protected readonly dirtyCells = computed(() => {
    const keys = new Set<string>();
    const columns = this.table()?.columns ?? [];
    const draft = this.draft();
    this.display().forEach((row, rowIndex) => {
      if (row.kind === 'inserted') {
        row.cells.forEach((cell, col) => {
          if (cell !== null) {
            keys.add(`${rowIndex}:${col}`);
          }
        });
        return;
      }
      if (!row.pkKey) {
        return;
      }
      const patch = draft.updates[row.pkKey];
      if (!patch) {
        return;
      }
      columns.forEach((column, col) => {
        if (Object.prototype.hasOwnProperty.call(patch, column)) {
          keys.add(`${rowIndex}:${col}`);
        }
      });
    });
    return keys;
  });

  protected readonly gridColumns = computed(() => this.table()?.columns ?? []);

  protected readonly whereSuggestions = computed((): readonly string[] => {
    const fromMeta = this.columnsMeta().map((column) => column.name);
    if (fromMeta.length > 0) {
      return fromMeta;
    }
    return this.table()?.columns ?? [];
  });

  protected readonly pageSizeOptions = DATABASE_QUERY_PAGE_SIZES.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  protected readonly resultMeta = computed(() => {
    const table = this.table();
    if (!table) {
      return '';
    }
    const from = table.rows.length === 0 ? 0 : this.pageOffset() + 1;
    const to = this.pageOffset() + table.rows.length;
    const total = table.hasMore ? `${to}+` : String(to);
    const range = table.rows.length === 0 ? 'No rows' : `Showing ${from}–${to} of ${total}`;
    const duration = this.durationMs() != null ? ` · ${this.durationMs()} ms` : '';
    const filtered = this.whereApplied().trim() ? ' · WHERE' : '';
    return `${range}${filtered}${duration}`;
  });

  protected readonly canGoPrev = computed(() => this.pageOffset() > 0 && !this.running());

  protected readonly canGoNext = computed(() => Boolean(this.table()?.hasMore) && !this.running());

  protected readonly exportMenuItems = computed((): readonly TxContextMenuItem[] => {
    const table = this.table();
    const selection = this.gridSelection();
    const hasPartial =
      table !== null && selection !== null && !isFullDatabaseQuerySelection(table, selection);
    return DATABASE_QUERY_EXPORT_FORMATS.map((format) => ({
      id: `${this.exportScope()}:${format.id}`,
      label: format.label,
      icon: 'download' as const,
      disabled: this.exportScope() === 'selection' && !hasPartial && selection === null,
    }));
  });

  constructor() {
    effect(() => {
      const target = this.target();
      const connection = this.connection();
      const key = `${this.resourceId()}:${connection?.id ?? ''}`;
      if (!target || !connection) {
        return;
      }
      if (this.bootKey === key) {
        return;
      }
      this.bootKey = key;
      this.draft.set(emptyTableDataDraft());
      this.whereDraft.set('');
      this.whereApplied.set('');
      this.pageOffset.set(0);
      void this.bootstrap();
    });
  }

  protected handleWhereDraft(value: string): void {
    this.whereDraft.set(value);
  }

  protected handleWhereSubmit(): void {
    this.applyWhereFilter(this.whereDraft());
  }

  protected handleWhereCleared(): void {
    this.whereDraft.set('');
    this.applyWhereFilter('');
  }

  protected handlePageSizeChange(value: string): void {
    const size = Number(value);
    if (!DATABASE_QUERY_PAGE_SIZES.includes(size as (typeof DATABASE_QUERY_PAGE_SIZES)[number])) {
      return;
    }
    this.pageSize.set(size);
    this.pageOffset.set(0);
    void this.reload();
  }

  protected handlePrevPage(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.pageOffset.update((offset) => Math.max(0, offset - this.pageSize()));
    void this.reload();
  }

  protected handleNextPage(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.pageOffset.update((offset) => offset + this.pageSize());
    void this.reload();
  }

  protected handleLoadAll(): void {
    if (this.table()?.hasMore) {
      this.loadAllOpen.set(true);
      return;
    }
    void this.reload({ loadAll: true });
  }

  protected handleLoadAllConfirmed(): void {
    this.loadAllOpen.set(false);
    void this.reload({ loadAll: true });
  }

  protected handleLoadAllClosed(): void {
    this.loadAllOpen.set(false);
  }

  protected handleGridSelection(range: DatabaseQueryCellRange | null): void {
    this.gridSelection.set(range);
  }

  protected handleGridCopied(): void {
    this.notifications.showSuccess('Copied');
  }

  protected handleGridExport(event: TxDataGridExportEvent): void {
    this.exportScope.set(event.scope);
    this.exportMenuPosition.set(event.position);
    this.exportMenuOpen.set(true);
  }

  protected handleCopyAll(): void {
    void this.resultGrid()?.copyAll();
  }

  protected handleExportClick(event: MouseEvent): void {
    this.exportScope.set('all');
    this.exportMenuPosition.set({ x: event.clientX, y: event.clientY });
    this.exportMenuOpen.set(true);
  }

  protected handleExportMenuClosed(): void {
    this.exportMenuOpen.set(false);
  }

  protected handleExportMenuSelect(id: string): void {
    this.exportMenuOpen.set(false);
    const [scope, formatId] = id.split(':');
    if (scope !== 'all' && scope !== 'selection') {
      return;
    }
    if (!DATABASE_QUERY_EXPORT_FORMATS.some((format) => format.id === formatId)) {
      return;
    }
    void this.exportResult(scope, formatId as DatabaseQueryExportFormat);
  }

  protected handleCellCommit(event: TxDataGridCellCommitEvent): void {
    this.patchDraft((draft, display, table) => {
      const row = display[event.row];
      if (!row) {
        return draft;
      }
      const originalIndex = this.display().indexOf(row);
      const original =
        row.kind === 'existing' || row.kind === 'deleted'
          ? table.rows[originalIndex] ?? null
          : null;
      return applyTableDataCellEdit(draft, row, table.columns, original, event.col, event.value);
    });
  }

  protected handleSetNull(event: TxDataGridCellCommitEvent): void {
    this.handleCellCommit({ ...event, value: null });
  }

  protected handleAddRow(): void {
    const table = this.table();
    if (!table || !this.editable()) {
      return;
    }
    this.draft.update((draft) => addTableDataInsertRow(draft, table.columns.length));
  }

  protected handleDeleteRow(rowIndex: number): void {
    this.patchDraft((draft, display) => {
      const row = display[rowIndex];
      return row ? toggleTableDataDelete(draft, row) : draft;
    });
  }

  protected handleRevert(): void {
    this.draft.set(emptyTableDataDraft());
  }

  protected handleSubmit(): void {
    void this.submitDraft();
  }

  private patchDraft(
    map: (
      draft: TableDataDraft,
      display: ReturnType<typeof buildTableDataDisplayRows>,
      table: DatabaseQueryTable,
    ) => TableDataDraft,
  ): void {
    const table = this.table();
    if (!table || !this.editable()) {
      return;
    }
    const pkIndexes = tableDataPkIndexes(table.columns, this.pkColumns());
    const display = this.display();
    this.draft.update((draft) => map(draft, display, table));
  }

  private async bootstrap(): Promise<void> {
    const target = this.target();
    const connection = this.connection();
    if (!target || !connection) {
      this.error.set('Connection not found.');
      return;
    }
    void this.catalog.revision();
    await this.catalog.openConnection(connection);
    await this.catalog.loadTable(connection, target.schema, target.table);
    const snapshot = this.catalog.snapshot(connection.id);
    const tables = snapshot?.tablesBySchema[target.schema || 'main'] ?? [];
    const listed = tables.find((item) => item.name === target.table);
    this.isView.set(listed?.kind === 'view');
    const detail = snapshot?.detailsByTable[catalogTableKey(target.schema, target.table)];
    this.columnsMeta.set(detail?.columns ?? []);
    await this.reload();
  }

  private async reload(options: { readonly loadAll?: boolean } = {}): Promise<void> {
    if (this.dirty()) {
      this.draft.set(emptyTableDataDraft());
    }
    const target = this.target();
    const connection = this.connection();
    const api = this.electron.bridge()?.database;
    if (!target || !connection || !api) {
      this.error.set('Select a database connection before loading data.');
      return;
    }
    if (this.running()) {
      return;
    }
    const query = buildTableDataSelectSql({
      schema: target.schema,
      table: target.table,
      type: connection.type,
      filter: this.whereApplied(),
    });
    this.running.set(true);
    this.error.set(null);
    const started = performance.now();
    try {
      const result = await api.query({
        connection,
        query,
        page: options.loadAll ? undefined : { limit: this.pageSize(), offset: this.pageOffset() },
      });
      this.table.set(normalizeDatabaseQueryResult(result));
      this.gridSelection.set(null);
      this.durationMs.set(Math.round(performance.now() - started));
    } catch (error) {
      this.durationMs.set(Math.round(performance.now() - started));
      this.error.set(formatDatabaseConnectionError(error));
    } finally {
      this.running.set(false);
    }
  }

  private applyWhereFilter(raw: string): void {
    const invalid = tableDataWhereFilterError(raw);
    if (invalid) {
      this.error.set(invalid);
      return;
    }
    this.whereApplied.set(normalizeTableDataWhereFilter(raw));
    this.pageOffset.set(0);
    void this.reload();
  }

  private async submitDraft(): Promise<void> {
    const table = this.table();
    const target = this.target();
    const connection = this.connection();
    const api = this.electron.bridge()?.database;
    if (!table || !target || !connection || !api || !this.dirty() || this.submitting()) {
      return;
    }
    let statements;
    try {
      statements = buildTableDmlStatements({
        type: connection.type,
        schema: target.schema,
        table: target.table,
        isView: this.isView(),
        columns: table.columns,
        pkColumns: this.pkColumns(),
        originalRows: table.rows,
        draft: this.draft(),
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not build statements.');
      return;
    }
    if (statements.length === 0) {
      this.draft.set(emptyTableDataDraft());
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await api.query({ connection, query: tableDmlBeginSql(connection.type) });
      try {
        for (const statement of statements) {
          await api.query({ connection, query: statement.sql });
        }
        await api.query({ connection, query: tableDmlCommitSql(connection.type) });
      } catch (error) {
        try {
          await api.query({ connection, query: tableDmlRollbackSql(connection.type) });
        } catch {
          /* ignore rollback failure */
        }
        throw error;
      }
      this.draft.set(emptyTableDataDraft());
      this.notifications.showSuccess('Changes submitted');
      await this.reload();
    } catch (error) {
      this.error.set(formatDatabaseConnectionError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  private async exportResult(
    scope: 'all' | 'selection',
    format: DatabaseQueryExportFormat,
  ): Promise<void> {
    const table = this.table();
    if (!table) {
      return;
    }
    const range = scope === 'selection' ? this.gridSelection() : null;
    const meta = DATABASE_QUERY_EXPORT_FORMATS.find((item) => item.id === format);
    if (!meta) {
      return;
    }
    try {
      const content = formatDatabaseQueryResult(table, format, range);
      const path = await this.files.saveText(content, `${this.target()?.table ?? 'table'}.${meta.extension}`, [
        { name: meta.filterName, extensions: [meta.extension] },
      ]);
      if (path) {
        this.notifications.showSuccess(`Exported ${meta.label}`);
      }
    } catch (error) {
      this.notifications.showError('Could not export the table data.');
      this.errors.reportUnknown(error);
    }
  }
}
