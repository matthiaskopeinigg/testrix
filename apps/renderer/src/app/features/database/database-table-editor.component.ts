import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  databaseErrorContext,
  DATABASE_QUERY_PAGE_SIZE_DEFAULT,
  DATABASE_QUERY_PAGE_SIZES,
  addTableDataInsertRow,
  addTableDataInsertRows,
  applyTableDataCellEdit,
  applyTableDataRowDeletes,
  buildRelationWhere,
  buildTableDataDisplayRows,
  buildTableDataSelectSql,
  buildTableDmlStatements,
  emptyTableDataDraft,
  foreignKeyJumpByColumn,
  isTableDataDraftDirty,
  normalizeTableDataOrderBy,
  normalizeTableDataWhereFilter,
  parseDatabaseTableTabNodeId,
  formatDatabaseError,
  refuseTableDml,
  tableDataOrderByError,
  tableDataPkIndexes,
  tableDataWhereFilterError,
  type DatabaseQueryEnvelope,
  type TableDataDraft,
} from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import type { WorkbenchTab } from '../workbench/workbench.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import {
  applyClauseSuggestion,
  clauseGhost,
  pairSqlKey,
  suggestClause,
  unpairSqlKey,
  type ClauseCompleteMode,
  type ClauseGhost,
  type ClauseSuggestion,
} from './database-clause-complete';
import { DatabaseResultGridComponent } from './database-result-grid.component';
import { DatabaseStore, type DatabaseTableFocus, type DatabaseTableViewState } from './database.store';
import { catalogTableKey } from './database-nav';
import { DatabaseTxnTracker } from './database-txn.tracker';

const CLAUSE_MENU_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

@Component({
  selector: 'tx-database-table-editor',
  standalone: true,
  imports: [OverlayModule, TxHintComponent, DatabaseResultGridComponent],
  templateUrl: './database-table-editor.component.html',
  styleUrl: './database-table-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseTableEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  private readonly store = inject(DatabaseStore);
  private readonly workbench = inject(WorkbenchStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly txn = inject(DatabaseTxnTracker);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly filter = signal('');
  readonly where = signal('');
  readonly order = signal('');
  readonly clauseFocus = signal<ClauseCompleteMode | null>(null);
  readonly clauseMenu = signal<ClauseCompleteMode | null>(null);
  readonly clauseIndex = signal(0);
  readonly clauseGhostOff = signal(false);
  readonly whereCursor = signal(0);
  readonly orderCursor = signal(0);
  readonly whereInput = viewChild<ElementRef<HTMLInputElement>>('whereInput');
  readonly orderInput = viewChild<ElementRef<HTMLInputElement>>('orderInput');
  readonly grid = viewChild(DatabaseResultGridComponent);
  readonly offset = signal(0);
  readonly pageSize = signal(DATABASE_QUERY_PAGE_SIZE_DEFAULT);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<DatabaseQueryEnvelope | null>(null);
  readonly draft = signal<TableDataDraft>(emptyTableDataDraft());
  readonly now = signal(Date.now());
  readonly rolledBack = signal(false);
  readonly selectedRow = signal(0);
  readonly selectedRows = signal<readonly number[]>([]);
  readonly rowFocus = signal<{ readonly row: number; readonly column?: string; readonly seq: number } | null>(null);
  private clock: ReturnType<typeof setInterval> | null = null;
  private bootstrapped = false;
  private alive = true;
  private jumpFocus: DatabaseTableFocus | null = null;
  private rowFocusSeq = 0;

  readonly pageSizes = DATABASE_QUERY_PAGE_SIZES;

  readonly target = computed(() => parseDatabaseTableTabNodeId(this.tab().nodeId));
  readonly connection = computed(() => {
    const target = this.target();
    return target ? this.store.connectionById(target.connectionId) : null;
  });
  readonly refuse = computed(() =>
    refuseTableDml({
      type: this.connection()?.type,
      isView: false,
      pkColumns: this.pkColumns(),
    }),
  );
  readonly pkColumns = computed(() => {
    const target = this.target();
    if (!target)
      return [];
    const cache = this.store.catalogByConnection()[target.connectionId];
    const key = catalogTableKey(target.schema, target.table);
    return (cache?.columnsByTable[key] ?? []).filter((column) => column.primaryKey).map((column) => column.name);
  });
  readonly uncommitted = computed(() => this.txn.isUncommitted(this.tab().id));
  readonly countdown = computed(() => {
    const at = this.txn.rollbackAt(this.tab().id);
    if (!at)
      return null;
    const remaining = Math.max(0, Math.ceil((at - this.now()) / 1000));
    return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  });
  readonly displayRows = computed(() => {
    const table = this.result()?.table;
    if (!table)
      return [];
    return buildTableDataDisplayRows(
      table.rows.map((row) => row.map((cell) => (cell === null ? null : String(cell)))),
      table.columns,
      tableDataPkIndexes(table.columns, this.pkColumns()),
      this.draft(),
    );
  });
  readonly displayTable = computed(() => {
    const table = this.result()?.table;
    if (!table)
      return null;
    return {
      columns: table.columns,
      rows: this.displayRows().map((row) => row.cells),
      hasMore: table.hasMore,
      affectedRows: table.affectedRows,
    };
  });
  readonly rowKinds = computed(() => this.displayRows().map((row) => row.kind));
  readonly dirtyKeys = computed(() => {
    const keys = new Set<string>();
    this.displayRows().forEach((row, index) => {
      if (row.kind === 'inserted' || row.kind === 'deleted') {
        this.result()?.table.columns.forEach((column) => keys.add(`${index}:${column}`));
        return;
      }
      if (!row.pkKey)
        return;
      const patch = this.draft().updates[row.pkKey];
      if (!patch)
        return;
      for (const column of Object.keys(patch))
        keys.add(`${index}:${column}`);
    });
    return keys;
  });
  readonly canEdit = computed(() => !this.refuse() && !this.uncommitted() && !this.rolledBack());
  readonly dirty = computed(() => isTableDataDraftDirty(this.draft()));
  readonly canSubmit = computed(() => this.canEdit() && this.dirty() && !this.running());
  readonly canPrev = computed(() => this.offset() > 0 && !this.running());
  readonly canNext = computed(() => !!this.result()?.table?.hasMore && !this.running());
  readonly emptyLabel = computed(() => 'No rows');
  readonly columnTypes = computed(() => {
    const target = this.target();
    const table = this.result()?.table;
    if (!target || !table)
      return {} as Readonly<Record<string, string>>;
    const columns =
      this.store.catalogByConnection()[target.connectionId]?.columnsByTable[
        catalogTableKey(target.schema, target.table)
      ] ?? [];
    const types: Record<string, string> = {};
    for (const column of columns) {
      if (column.type)
        types[column.name] = column.type;
    }
    return types;
  });
  readonly relations = computed(() => {
    const target = this.target();
    if (!target)
      return {};
    const cache = this.store.catalogByConnection()[target.connectionId];
    const key = catalogTableKey(target.schema, target.table);
    return foreignKeyJumpByColumn(cache?.foreignKeysByTable[key] ?? [], target.schema);
  });
  readonly clauseSuggestions = computed(() => {
    const field = this.clauseMenu() ?? this.clauseFocus();
    if (!field)
      return [] as readonly ClauseSuggestion[];
    return this.suggestionsFor(field);
  });
  readonly clauseMenuOpen = computed(() => this.clauseMenu() !== null && this.clauseSuggestions().length > 0);
  readonly clauseMenuPositions = CLAUSE_MENU_POSITIONS;
  readonly whereGhost = computed(() => this.ghostFor('where'));
  readonly orderGhost = computed(() => this.ghostFor('order'));
  private errorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.alive = false;
      if (this.clock)
        clearInterval(this.clock);
      this.clearErrorTimer();
      if (this.bootstrapped)
        this.persistView();
    });
    this.clock = setInterval(() => {
      this.now.set(Date.now());
      const at = this.txn.rollbackAt(this.tab().id);
      if (at && Date.now() >= at && this.txn.isUncommitted(this.tab().id))
        void this.handleRollback(true);
    }, 250);
    afterNextRender(
      () => {
        this.jumpFocus = this.takeMatchingFocus();
        this.restoreView(this.jumpFocus);
        const jump = this.jumpFocus;
        const saved = jump ? null : this.store.readTableView(this.tab().nodeId);
        this.bootstrapped = true;
        const target = parseDatabaseTableTabNodeId(this.tab().nodeId);
        const load = target
          ? this.store.loadTableDetails(target.connectionId, target.schema, target.table)
          : Promise.resolve();
        void load.then(() => this.reload()).then(() => {
          if (jump)
            this.applyRowFocus(0, jump.column);
          else if (saved)
            this.applyRowFocus(saved.selectedRow, saved.selectedColumn);
        });
      },
      { injector: this.injector },
    );
    effect(() => {
      const focus = this.store.tableFocus();
      const target = this.target();
      if (!this.bootstrapped || !focus || !target)
        return;
      if (
        focus.connectionId !== target.connectionId ||
        focus.schema !== target.schema ||
        focus.table !== target.table
      )
        return;
      untracked(() => {
        const applied = this.takeMatchingFocus();
        if (!applied)
          return;
        this.restoreView(applied);
        void this.reload().then(() => this.applyRowFocus(0, applied.column));
      });
    });
  }

  handleWhere(event: Event): void {
    this.handleClauseInput('where', event);
  }

  handleOrder(event: Event): void {
    this.handleClauseInput('order', event);
  }

  handleClauseFocus(field: ClauseCompleteMode): void {
    this.clauseFocus.set(field);
    this.clauseGhostOff.set(false);
  }

  handleClauseBlur(): void {
    window.setTimeout(() => {
      this.clauseFocus.set(null);
      this.clauseMenu.set(null);
    }, 120);
  }

  handleClauseKey(field: ClauseCompleteMode, event: KeyboardEvent): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement))
      return;
    this.syncClauseCursor(field, input);
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      this.clauseMenu.set(field);
      this.clauseIndex.set(0);
      this.clauseGhostOff.set(false);
      return;
    }
    if (event.key === 'Backspace' && input.selectionStart === input.selectionEnd) {
      const unpaired = unpairSqlKey(input.value, input.selectionStart ?? input.value.length);
      if (unpaired) {
        event.preventDefault();
        this.writeClause(field, unpaired.value, unpaired.cursor);
        return;
      }
    }
    if (input.selectionStart === input.selectionEnd) {
      const paired = pairSqlKey(input.value, input.selectionStart ?? input.value.length, event.key);
      if (paired) {
        event.preventDefault();
        this.writeClause(field, paired.value, paired.cursor);
        return;
      }
    }
    const suggestions = this.suggestionsFor(field);
    const open = this.clauseMenu() === field && suggestions.length > 0;
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      this.clauseIndex.update((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      this.clauseIndex.update((index) => (index - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Tab') {
      const ghost = this.ghostSuggestion(field);
      const picked = open ? suggestions[this.clauseIndex()] ?? suggestions[0] : ghost;
      if (picked) {
        event.preventDefault();
        this.acceptClauseSuggestion(field, picked);
        if (open)
          this.clauseMenu.set(null);
        return;
      }
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      this.acceptClauseSuggestion(field, suggestions[this.clauseIndex()] ?? suggestions[0]);
      this.clauseMenu.set(null);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.clauseMenu.set(null);
      void this.handleReload();
      return;
    }
    if (event.key === 'Escape' && (this.clauseMenu() || this.ghostFor(field))) {
      event.preventDefault();
      event.stopPropagation();
      this.clauseMenu.set(null);
      this.clauseGhostOff.set(true);
    }
  }

  acceptClauseSuggestion(field: ClauseCompleteMode, suggestion: ClauseSuggestion | undefined): void {
    if (!suggestion)
      return;
    const next = applyClauseSuggestion(this.clauseValue(field), this.clauseCursor(field), suggestion.value);
    this.writeClause(field, next.value, next.cursor);
    this.clauseIndex.set(0);
  }

  handleClauseSelect(field: ClauseCompleteMode, suggestion: ClauseSuggestion): void {
    this.acceptClauseSuggestion(field, suggestion);
    this.clauseMenu.set(null);
    this.inputFor(field)?.focus();
  }

  async handleReload(): Promise<void> {
    this.offset.set(0);
    await this.reload();
  }

  async handlePage(delta: number): Promise<void> {
    this.offset.update((value) => Math.max(0, value + delta * this.pageSize()));
    await this.reload();
  }

  handlePageSize(size: number): void {
    this.pageSize.set(size);
    this.offset.set(0);
    void this.reload();
  }

  handleRelationJump(event: { readonly row: number; readonly column: string }): void {
    const jump = this.relations()[event.column];
    const target = this.target();
    const connection = this.connection();
    const table = this.result()?.table;
    const row = this.displayRows()[event.row];
    if (!jump || !target || !connection || !table || !row)
      return;
    const values: Record<string, string | null> = {};
    for (const source of jump.sourceColumns) {
      const index = table.columns.indexOf(source);
      values[source] = index >= 0 ? row.cells[index] ?? null : null;
    }
    const where = buildRelationWhere(jump, values, connection.type);
    this.selectedRow.set(event.row);
    this.selectedRows.set([event.row]);
    this.store.writeTableView(this.tab().nodeId, this.snapshotView(event.row, event.column));
    if (where) {
      this.store.requestTableFocus({
        connectionId: target.connectionId,
        schema: jump.schema,
        table: jump.table,
        where,
        column: jump.referencedColumns[0],
      });
    }
    this.workbench.openFromDatabaseTable(
      { connectionId: target.connectionId, schema: jump.schema, table: jump.table },
      jump.schema ? `${jump.schema}.${jump.table}` : jump.table,
    );
  }

  handleCellChange(event: { readonly row: number; readonly column: string; readonly value: string }): void {
    this.dismissError();
    const table = this.result()?.table;
    const display = this.displayRows()[event.row];
    if (!table || !display || !this.canEdit())
      return;
    const col = table.columns.indexOf(event.column);
    const original =
      display.kind === 'existing' || display.kind === 'deleted'
        ? table.rows[event.row]?.map((cell) => (cell === null ? null : String(cell))) ?? null
        : null;
    this.draft.set(
      applyTableDataCellEdit(this.draft(), display, table.columns, original, col, event.value === '' ? null : event.value),
    );
  }

  handleInsert(): void {
    const table = this.result()?.table;
    if (!table || !this.canEdit())
      return;
    this.draft.set(addTableDataInsertRow(this.draft(), table.columns.length));
  }

  handleDuplicate(indexes: readonly number[]): void {
    const table = this.result()?.table;
    if (!table || !this.canEdit() || indexes.length === 0)
      return;
    const display = this.displayRows();
    const rows = indexes
      .map((index) => display[index]?.cells)
      .filter((row): row is NonNullable<typeof display[number]['cells']> => row != null);
    this.draft.set(addTableDataInsertRows(this.draft(), table.columns.length, rows));
  }

  handleDeleteRows(indexes: readonly number[]): void {
    this.mutateRows(indexes, 'delete');
  }

  handleRestoreRows(indexes: readonly number[]): void {
    this.mutateRows(indexes, 'restore');
  }

  handleDeleteSelected(): void {
    const rows = this.selectedRows().length > 0 ? this.selectedRows() : [this.selectedRow()];
    const display = this.displayRows();
    const hasLive = rows.some((index) => display[index]?.kind !== 'deleted');
    this.mutateRows(rows, hasLive ? 'delete' : 'restore');
  }

  async handleSubmit(): Promise<void> {
    const connection = this.connection();
    const target = this.target();
    const table = this.result()?.table;
    if (!connection || !target || !table || !isTableDataDraftDirty(this.draft()))
      return;
    if (this.txn.isUncommitted(this.tab().id)) {
      this.showError('Push or roll back before submitting more changes.');
      return;
    }
    const reason = this.refuse();
    if (reason) {
      this.showError(reason);
      return;
    }
    this.dismissError();
    try {
      const statements = buildTableDmlStatements({
        type: connection.type,
        schema: target.schema,
        table: target.table,
        isView: false,
        columns: table.columns,
        pkColumns: this.pkColumns(),
        originalRows: table.rows.map((row) => row.map((cell) => (cell === null ? null : String(cell)))),
        draft: this.draft(),
      });
      for (const statement of statements) {
        await this.desktop.api.database.sessionQuery({
          tabId: this.tab().id,
          connection,
          query: statement.sql,
          hold: true,
        });
      }
      const seconds = this.desktop.settings().database.uncommittedRollbackSeconds;
      this.txn.mark(this.tab().id, seconds > 0 ? Date.now() + seconds * 1000 : null);
    } catch (error) {
      this.showError(formatDatabaseError(error, databaseErrorContext(connection)));
      await this.desktop.api.database.sessionRollback(this.tab().id);
      this.txn.clear(this.tab().id);
    }
  }

  async handlePush(): Promise<void> {
    await this.desktop.api.database.sessionCommit(this.tab().id);
    this.txn.clear(this.tab().id);
    this.draft.set(emptyTableDataDraft());
    this.rolledBack.set(false);
    await this.reload();
  }

  async handleRollback(timeout = false): Promise<void> {
    await this.desktop.api.database.sessionRollback(this.tab().id);
    this.txn.clear(this.tab().id);
    if (!timeout)
      this.draft.set(emptyTableDataDraft());
    this.rolledBack.set(timeout);
  }

  handleRevert(): void {
    if (this.txn.isUncommitted(this.tab().id)) {
      void this.handleRollback();
      return;
    }
    this.draft.set(emptyTableDataDraft());
    this.rolledBack.set(false);
  }

  dismissError(): void {
    this.clearErrorTimer();
    this.error.set(null);
  }

  private handleClauseInput(field: ClauseCompleteMode, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.syncClauseCursor(field, target);
    if (field === 'where')
      this.where.set(target.value);
    else
      this.order.set(target.value);
    this.clauseGhostOff.set(false);
    this.clauseIndex.set(0);
  }

  private writeClause(field: ClauseCompleteMode, value: string, cursor: number): void {
    if (field === 'where') {
      this.where.set(value);
      this.whereCursor.set(cursor);
    } else {
      this.order.set(value);
      this.orderCursor.set(cursor);
    }
    const input = this.inputFor(field);
    if (!input)
      return;
    input.value = value;
    queueMicrotask(() => input.setSelectionRange(cursor, cursor));
  }

  private syncClauseCursor(field: ClauseCompleteMode, input: HTMLInputElement): void {
    const cursor = input.selectionStart ?? input.value.length;
    if (field === 'where')
      this.whereCursor.set(cursor);
    else
      this.orderCursor.set(cursor);
  }

  private suggestionsFor(field: ClauseCompleteMode): readonly ClauseSuggestion[] {
    return suggestClause(this.clauseValue(field), this.clauseCursor(field), {
      columns: this.clauseColumns(),
      schemas: this.clauseSchemas(),
      tables: this.clauseTables(),
      currentSchema: this.target()?.schema ?? '',
      currentTable: this.target()?.table ?? '',
      mode: field,
    });
  }

  private ghostSuggestion(field: ClauseCompleteMode): ClauseSuggestion | null {
    if (this.clauseFocus() !== field || this.clauseGhostOff())
      return null;
    const value = this.clauseValue(field);
    const cursor = this.clauseCursor(field);
    const suggestions = this.suggestionsFor(field);
    if (this.clauseMenu() === field) {
      const picked = suggestions[this.clauseIndex()] ?? suggestions[0];
      return clauseGhost(value, cursor, picked) ? picked ?? null : null;
    }
    return suggestions.find((item) => clauseGhost(value, cursor, item)) ?? null;
  }

  private ghostFor(field: ClauseCompleteMode): ClauseGhost | null {
    return clauseGhost(this.clauseValue(field), this.clauseCursor(field), this.ghostSuggestion(field));
  }

  private clauseValue(field: ClauseCompleteMode): string {
    return field === 'where' ? this.where() : this.order();
  }

  private clauseCursor(field: ClauseCompleteMode): number {
    return field === 'where' ? this.whereCursor() : this.orderCursor();
  }

  private clauseColumns(): readonly { readonly name: string; readonly type?: string }[] {
    const target = this.target();
    if (!target)
      return [];
    return (
      this.store.catalogByConnection()[target.connectionId]?.columnsByTable[
        catalogTableKey(target.schema, target.table)
      ] ?? []
    );
  }

  private clauseSchemas(): readonly string[] {
    const target = this.target();
    if (!target)
      return [];
    const connection = this.store.connectionById(target.connectionId);
    const cache = this.store.catalogByConnection()[target.connectionId];
    return cache?.schemas.length ? cache.schemas : (connection?.selectedSchemas ?? []);
  }

  private clauseTables(): readonly { readonly schema: string; readonly name: string }[] {
    const target = this.target();
    if (!target)
      return [];
    const tables = this.store.catalogByConnection()[target.connectionId]?.tablesBySchema ?? {};
    return Object.values(tables).flatMap((rows) =>
      (rows ?? []).map((table) => ({ schema: table.schema, name: table.name })),
    );
  }

  private inputFor(field: ClauseCompleteMode): HTMLInputElement | null {
    return (field === 'where' ? this.whereInput()?.nativeElement : this.orderInput()?.nativeElement) ?? null;
  }

  private async reload(): Promise<void> {
    const connection = this.connection();
    const target = this.target();
    if (!connection || !target)
      return;
    const whereError = tableDataWhereFilterError(this.where(), connection.type);
    if (whereError) {
      this.showError(whereError);
      return;
    }
    const orderError = tableDataOrderByError(this.order(), connection.type);
    if (orderError) {
      this.showError(orderError);
      return;
    }
    this.running.set(true);
    this.dismissError();
    try {
      const sql = buildTableDataSelectSql({
        schema: target.schema,
        table: target.table,
        type: connection.type,
        filter: normalizeTableDataWhereFilter(this.where()),
        order: normalizeTableDataOrderBy(this.order()),
      });
      const envelope = await this.desktop.api.database.query({
        connection,
        query: sql,
        page: { limit: this.pageSize(), offset: this.offset() },
      });
      if (!this.alive)
        return;
      const current = this.target();
      if (
        !current ||
        current.connectionId !== target.connectionId ||
        current.schema !== target.schema ||
        current.table !== target.table
      )
        return;
      this.result.set(envelope);
      if (!this.uncommitted() && !this.rolledBack())
        this.draft.set(emptyTableDataDraft());
    } catch (error) {
      if (!this.alive)
        return;
      this.showError(formatDatabaseError(error, databaseErrorContext(connection)));
    } finally {
      if (this.alive)
        this.running.set(false);
    }
  }

  private takeMatchingFocus(): DatabaseTableFocus | null {
    const focus = this.store.tableFocus();
    const target = parseDatabaseTableTabNodeId(this.tab().nodeId);
    if (!focus || !target)
      return null;
    if (
      focus.connectionId !== target.connectionId ||
      focus.schema !== target.schema ||
      focus.table !== target.table
    )
      return null;
    this.store.consumeTableFocus(focus.seq);
    return focus;
  }

  private restoreView(jump: DatabaseTableFocus | null): void {
    if (jump) {
      this.where.set(jump.where);
      this.offset.set(0);
      return;
    }
    const saved = this.store.readTableView(this.tab().nodeId);
    if (!saved)
      return;
    this.where.set(saved.where);
    this.order.set(saved.order);
    this.offset.set(saved.offset);
    this.pageSize.set(saved.pageSize);
    this.filter.set(saved.filter);
  }

  private persistView(): void {
    const selected = this.selectedRows()[0] ?? this.selectedRow();
    this.store.writeTableView(this.tab().nodeId, this.snapshotView(selected));
  }

  private snapshotView(row: number, column?: string): DatabaseTableViewState {
    return {
      where: this.where(),
      order: this.order(),
      offset: this.offset(),
      pageSize: this.pageSize(),
      filter: this.filter(),
      selectedRow: row,
      selectedColumn: column,
    };
  }

  private applyRowFocus(row: number, column?: string): void {
    const table = this.result()?.table;
    const max = (table?.rows.length ?? 0) - 1;
    if (max < 0)
      return;
    const index = Math.min(Math.max(0, row), max);
    this.rowFocusSeq += 1;
    this.selectedRow.set(index);
    this.selectedRows.set([index]);
    this.rowFocus.set({ row: index, column, seq: this.rowFocusSeq });
    this.store.writeTableView(this.tab().nodeId, this.snapshotView(index, column));
    queueMicrotask(() => this.grid()?.selectFocusedRow(index, column));
    window.setTimeout(() => this.grid()?.selectFocusedRow(index, column));
  }

  private mutateRows(indexes: readonly number[], mode: 'delete' | 'restore'): void {
    if (!this.canEdit() || indexes.length === 0)
      return;
    const display = this.displayRows();
    const rows = indexes
      .map((index) => display[index])
      .filter((row): row is NonNullable<typeof display[number]> => row != null);
    this.draft.set(applyTableDataRowDeletes(this.draft(), rows, mode));
  }

  private showError(message: string): void {
    this.error.set(message);
    this.clearErrorTimer();
    this.errorTimer = setTimeout(() => {
      this.error.set(null);
      this.errorTimer = null;
    }, 8000);
  }

  private clearErrorTimer(): void {
    if (!this.errorTimer)
      return;
    clearTimeout(this.errorTimer);
    this.errorTimer = null;
  }
}
