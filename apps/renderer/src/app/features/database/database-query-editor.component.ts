import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  databaseErrorContext,
  databaseQueryEditorLanguage,
  databaseQueryEditorPlaceholder,
  formatDatabaseError,
  DATABASE_QUERY_PAGE_SIZE_DEFAULT,
  DATABASE_QUERY_PAGE_SIZES,
  formatDatabaseQueryResult,
  buildRelationWhere,
  foreignKeyJumpByColumn,
  isSqlTransactionEngine,
  isTransactionalWriteSql,
  parseDatabaseQueryTabNodeId,
  resolveDatabaseExecuteHighlightRanges,
  resolveDatabaseExecuteQuery,
  shouldHoldSqlSession,
  shouldPromptDatabaseExecuteChooser,
  sqlTransactionControl,
  toSavedQueryLastResult,
  type DatabaseExecuteChooserMode,
  type DatabaseQueryEnvelope,
} from '@testrix/contracts';
import { TxHintComponent, TxSelectComponent, TxSpinnerComponent } from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import { WorkbenchStore, type WorkbenchTab } from '../workbench/workbench.store';
import { DatabaseQueryActionsService } from './database-query-actions.service';
import { DatabaseResultGridComponent } from './database-result-grid.component';
import { applyQueryResultView, inferSqlFromTable } from './database-query-result-view';
import { catalogTableKey } from './database-nav';
import {
  applyClauseSuggestion,
  clauseGhost,
  pairSqlKey as pairClauseKey,
  suggestClause,
  unpairSqlKey as unpairClauseKey,
  type ClauseCompleteMode,
  type ClauseGhost,
  type ClauseSuggestion,
} from './database-clause-complete';
import { DatabaseStore } from './database.store';
import { DatabaseTxnTracker } from './database-txn.tracker';

const RUN_MENU_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
];
const CLAUSE_MENU_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];
import {
  applySqlSuggestion,
  formatSql,
  pairSqlKey,
  sqlGhost,
  suggestSql,
  tokenizeSqlHighlight,
  unpairSqlKey,
  type SqlCompleteContext,
  type SqlSuggestion,
} from './database-sql-complete';

const CONSOLE_HEIGHT_DEFAULT = 236;
const CONSOLE_HEIGHT_MIN = 120;

@Component({
  selector: 'tx-database-query-editor',
  standalone: true,
  imports: [OverlayModule, TxHintComponent, TxSelectComponent, TxSpinnerComponent, DatabaseResultGridComponent],
  templateUrl: './database-query-editor.component.html',
  styleUrl: './database-query-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseQueryEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  private readonly store = inject(DatabaseStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly txn = inject(DatabaseTxnTracker);
  private readonly actions = inject(DatabaseQueryActionsService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');
  private readonly highlightRef = viewChild<ElementRef<HTMLElement>>('highlight');
  private readonly ghostRef = viewChild<ElementRef<HTMLElement>>('ghostPane');
  private readonly gutterRef = viewChild<ElementRef<HTMLElement>>('gutter');

  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<DatabaseQueryEnvelope | null>(null);
  readonly consoleHidden = signal(false);
  readonly consoleHeight = signal(CONSOLE_HEIGHT_DEFAULT);
  readonly resultWhere = signal('');
  readonly resultOrder = signal('');
  readonly appliedWhere = signal('');
  readonly appliedOrder = signal('');
  readonly lastSql = signal('');
  readonly resultWhereInput = viewChild<ElementRef<HTMLInputElement>>('resultWhereInput');
  readonly resultOrderInput = viewChild<ElementRef<HTMLInputElement>>('resultOrderInput');
  readonly clauseFocus = signal<ClauseCompleteMode | null>(null);
  readonly clauseMenu = signal<ClauseCompleteMode | null>(null);
  readonly clauseListOpen = signal(false);
  readonly clauseIndex = signal(0);
  readonly clauseGhostOff = signal(false);
  readonly whereCursor = signal(0);
  readonly orderCursor = signal(0);
  readonly clauseMenuPositions = CLAUSE_MENU_POSITIONS;
  readonly schema = signal('');
  readonly caret = signal(0);
  readonly completeOpen = signal(false);
  readonly completeIndex = signal(0);
  readonly suggestPos = signal({ top: 24, left: 12 });
  readonly filter = signal('');
  readonly pageSize = signal(DATABASE_QUERY_PAGE_SIZE_DEFAULT);
  readonly pageSizes = DATABASE_QUERY_PAGE_SIZES;
  readonly chooserOpen = signal(false);
  readonly chooserMode = signal<DatabaseExecuteChooserMode>('caret');
  readonly chooserPositions = RUN_MENU_POSITIONS;
  private chooserCaret = 0;
  readonly now = signal(Date.now());
  readonly rolledBack = signal(false);
  private resizing = false;
  private reopenHeight = CONSOLE_HEIGHT_DEFAULT;
  private clock: ReturnType<typeof setInterval> | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  private hydratedQueryId: string | null = null;

  readonly query = computed(() => {
    const id = parseDatabaseQueryTabNodeId(this.tab().nodeId);
    return id ? this.store.queryById(id) : null;
  });

  readonly connection = computed(() => {
    const query = this.query();
    return query?.connectionId ? this.store.connectionById(query.connectionId) : null;
  });

  readonly connectionOptions = computed(() =>
    this.store.connections().map((item) => ({ value: item.id, label: item.name })),
  );

  readonly schemaOptions = computed(() => {
    const connection = this.connection();
    const selected = connection?.selectedSchemas ?? [];
    const cache = connection ? this.store.catalogByConnection()[connection.id] : undefined;
    const schemas = selected.length ? selected : cache?.schemas ?? [];
    return schemas.map((schema) => ({ value: schema, label: schema }));
  });

  readonly placeholder = computed(() => databaseQueryEditorPlaceholder(this.connection()?.type));
  readonly uncommitted = computed(() => this.txn.isUncommitted(this.tab().id));
  readonly canTransact = computed(() => isSqlTransactionEngine(this.connection()?.type));
  readonly countdown = computed(() => {
    const at = this.txn.rollbackAt(this.tab().id);
    if (!at)
      return null;
    const remaining = Math.max(0, Math.ceil((at - this.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  });

  readonly completeContext = computed((): SqlCompleteContext => {
    const connection = this.connection();
    const cache = connection ? this.store.catalogByConnection()[connection.id] : undefined;
    const schema = this.schema();
    const tables = Object.entries(cache?.tablesBySchema ?? {}).flatMap(([itemSchema, items]) =>
      items.map((table) => ({ schema: itemSchema, name: table.name })),
    );
    const columns = Object.entries(cache?.columnsByTable ?? {})
      .filter(([key]) => !schema || key.startsWith(`${schema}.`))
      .flatMap(([, items]) => items.map((column) => ({ name: column.name, type: column.type })));
    const routines = (cache?.routinesBySchema[schema] ?? []).map((item) => ({
      name: item.name,
      kind: item.kind,
    }));
    return {
      schemas: cache?.schemas ?? connection?.selectedSchemas ?? [],
      tables: schema ? tables.filter((item) => item.schema === schema) : tables,
      columns,
      routines,
    };
  });

  readonly suggestions = computed(() =>
    suggestSql(this.query()?.query ?? '', this.caret(), this.completeContext()),
  );

  readonly ghost = computed(() => {
    if (this.completeOpen())
      return null;
    return sqlGhost(
      this.query()?.query ?? '',
      this.caret(),
      this.suggestions()[this.completeIndex()] ?? this.suggestions()[0],
    );
  });

  readonly highlightTokens = computed(() => tokenizeSqlHighlight(this.query()?.query ?? ''));

  readonly lineNumbers = computed(() => {
    const count = Math.max(1, (this.query()?.query ?? '').split('\n').length);
    return Array.from({ length: count }, (_, index) => index + 1);
  });

  readonly hasConsoleContent = computed(
    () => this.result() != null || this.error() != null || this.running(),
  );

  readonly showConsole = computed(() => this.hasConsoleContent() && !this.consoleHidden());

  readonly displayTable = computed(() => {
    const table = this.result()?.table;
    if (!table)
      return null;
    return applyQueryResultView(table, this.appliedWhere(), this.appliedOrder());
  });

  readonly resultSource = computed(() => {
    const schema = this.schema();
    const inferred = inferSqlFromTable(this.lastSql() || this.query()?.query || '');
    return {
      schema: inferred?.schema || schema,
      table: inferred?.table ?? '',
    };
  });

  readonly columnTypes = computed(() => {
    const connection = this.connection();
    const source = this.resultSource();
    const cache = connection ? this.store.catalogByConnection()[connection.id] : undefined;
    const columns = cache?.columnsByTable[catalogTableKey(source.schema, source.table)] ?? [];
    const types: Record<string, string> = {};
    for (const column of columns) {
      if (column.type)
        types[column.name] = column.type;
    }
    return types;
  });

  readonly relations = computed(() => {
    const connection = this.connection();
    const source = this.resultSource();
    if (!connection || !source.table)
      return {};
    const cache = this.store.catalogByConnection()[connection.id];
    const key = catalogTableKey(source.schema, source.table);
    const fromTable = cache?.foreignKeysByTable[key] ?? [];
    const fromSchema = (cache?.foreignKeysBySchema[source.schema] ?? []).filter(
      (fk) => !fk.table || fk.table === source.table,
    );
    return foreignKeyJumpByColumn(fromTable.length ? fromTable : fromSchema, source.schema);
  });

  readonly clauseSuggestions = computed(() => {
    const field = this.clauseMenu() ?? this.clauseFocus();
    if (!field)
      return [] as readonly ClauseSuggestion[];
    return this.suggestionsFor(field);
  });

  readonly clauseMenuOpen = computed(
    () => this.clauseListOpen() && this.clauseMenu() !== null && this.clauseSuggestions().length > 0,
  );
  readonly whereGhost = computed(() => this.ghostFor('where'));
  readonly orderGhost = computed(() => this.ghostFor('order'));

  constructor() {
    const unregister = this.actions.register(() => {
      if (this.workbench.focusedGroup()?.activeTabId === this.tab().id)
        this.executeFromEditor();
    });
    this.destroyRef.onDestroy(() => {
      unregister();
      if (this.clock)
        clearInterval(this.clock);
      this.clearErrorTimer();
    });
    this.clock = setInterval(() => {
      this.now.set(Date.now());
      const at = this.txn.rollbackAt(this.tab().id);
      if (at && Date.now() >= at && this.txn.isUncommitted(this.tab().id))
        void this.handleRollback(true);
    }, 250);
    effect(() => {
      const connection = this.connection();
      if (connection)
        this.store.loadCatalog(connection.id);
    });
    effect(() => {
      const options = this.schemaOptions();
      if (!options.some((item) => item.value === this.schema()))
        this.schema.set(options[0]?.value ?? '');
    });
    effect(() => {
      const connection = this.connection();
      const schema = this.schema();
      if (connection && schema)
        void this.store.loadSchemaObjects(connection.id, schema);
    });
    effect(() => {
      const connection = this.connection();
      const source = this.resultSource();
      if (connection && source.table)
        void this.store.loadTableDetails(connection.id, source.schema, source.table);
    });
    effect(() => {
      const value = this.query()?.query ?? '';
      const editor = this.editor()?.nativeElement;
      if (!editor || editor.value === value)
        return;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = value;
      editor.setSelectionRange(Math.min(start, value.length), Math.min(end, value.length));
    });
    effect(() => {
      const query = this.query();
      if (!query) {
        this.hydratedQueryId = null;
        return;
      }
      if (this.hydratedQueryId === query.id)
        return;
      this.hydratedQueryId = query.id;
      const last = query.lastResult;
      if (!last)
        return;
      this.result.set({ table: last.table, durationMs: last.durationMs });
      this.consoleHidden.set(last.hidden === true);
      if (last.consoleHeight) {
        this.consoleHeight.set(last.consoleHeight);
        this.reopenHeight = last.consoleHeight;
      }
    });
  }

  handleSql(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    this.writeSql(target.value, target.selectionStart);
  }

  handleCaret(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement)
      this.caret.set(target.selectionStart);
    this.updateSuggestPos();
  }

  handleScroll(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    const top = target.scrollTop;
    const left = target.scrollLeft;
    const highlight = this.highlightRef()?.nativeElement;
    const ghost = this.ghostRef()?.nativeElement;
    const gutter = this.gutterRef()?.nativeElement;
    if (highlight) {
      highlight.scrollTop = top;
      highlight.scrollLeft = left;
    }
    if (ghost) {
      ghost.scrollTop = top;
      ghost.scrollLeft = left;
    }
    if (gutter)
      gutter.scrollTop = top;
    this.updateSuggestPos();
  }

  handleConnection(value: string): void {
    const query = this.query();
    if (query)
      this.store.updateQuery(query.id, { connectionId: value });
  }

  handleSchema(value: string): void {
    this.schema.set(value);
  }

  handleEditorKey(event: KeyboardEvent): void {
    const editor = this.editor()?.nativeElement;
    if (!editor)
      return;
    if (this.chooserOpen()) {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        void this.runMode(this.chooserMode());
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.handleChooserHover('all');
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.handleChooserHover('caret');
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      this.completeOpen.set(true);
      this.completeIndex.set(0);
      this.caret.set(editor.selectionStart);
      this.updateSuggestPos();
      return;
    }
    if (this.completeOpen()) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.completeIndex.set(Math.min(this.suggestions().length - 1, this.completeIndex() + 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.completeIndex.set(Math.max(0, this.completeIndex() - 1));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = this.suggestions()[this.completeIndex()];
        if (item) {
          event.preventDefault();
          this.applySuggestion(item);
          return;
        }
      }
    }
    if (event.key === 'Tab' && this.ghost()) {
      const item = this.suggestions()[0];
      if (item) {
        event.preventDefault();
        this.applySuggestion(item);
        return;
      }
    }
    if (event.key === 'Backspace') {
      const next = unpairSqlKey(editor.value, editor.selectionStart);
      if (next) {
        event.preventDefault();
        this.writeSql(next.value, next.cursor);
      }
      return;
    }
    const paired = pairSqlKey(editor.value, editor.selectionStart, event.key);
    if (!paired)
      return;
    event.preventDefault();
    this.writeSql(paired.value, paired.cursor);
  }

  applySuggestion(item: SqlSuggestion): void {
    const editor = this.editor()?.nativeElement;
    const source = this.query()?.query ?? '';
    const applied = applySqlSuggestion(source, editor?.selectionStart ?? this.caret(), item.value);
    this.writeSql(applied.value, applied.cursor);
    this.completeOpen.set(false);
  }

  handleHotkey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter')
      return;
    event.preventDefault();
    if (this.chooserOpen()) {
      void this.runMode(this.chooserMode());
      return;
    }
    this.executeFromEditor();
  }

  handleChooserHover(mode: DatabaseExecuteChooserMode): void {
    this.chooserMode.set(mode);
    this.highlightRunRange(mode);
  }

  executeFromEditor(): void {
    const source = this.query()?.query ?? '';
    const editor = this.editor()?.nativeElement;
    const selectionStart = editor?.selectionStart ?? 0;
    const selectionEnd = editor?.selectionEnd ?? 0;
    const language = databaseQueryEditorLanguage(this.connection()?.type);
    if (
      shouldPromptDatabaseExecuteChooser({
        source,
        selectionStart,
        selectionEnd,
        language,
      })
    ) {
      this.completeOpen.set(false);
      this.chooserCaret = selectionStart;
      this.chooserOpen.set(true);
      this.chooserMode.set('caret');
      this.highlightRunRange('caret');
      return;
    }
    void this.runStatements([
      resolveDatabaseExecuteQuery({ source, selectionStart, selectionEnd, language }),
    ]);
  }

  async runMode(mode: DatabaseExecuteChooserMode): Promise<void> {
    const source = this.query()?.query ?? '';
    const language = databaseQueryEditorLanguage(this.connection()?.type);
    const ranges = resolveDatabaseExecuteHighlightRanges({
      source,
      selectionStart: this.chooserCaret,
      language,
      mode,
    });
    this.closeChooser();
    await this.runStatements(ranges.map((range) => source.slice(range.start, range.end)));
  }

  closeChooser(): void {
    this.chooserOpen.set(false);
    this.restoreChooserCaret();
  }

  @HostListener('document:pointerdown', ['$event'])
  handlePointerDown(event: PointerEvent): void {
    const target = event.target;
    if (this.chooserOpen()) {
      if (target instanceof Element && target.closest('.tx-db-query__chooser, .tx-db-query__run, .cdk-overlay-pane'))
        return;
      this.closeChooser();
    }
    if (this.completeOpen() && target instanceof Element && !target.closest('.tx-db-query__suggest'))
      this.completeOpen.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  handleEscape(event: KeyboardEvent): void {
    if (this.chooserOpen()) {
      if (event.key === 'Enter') {
        if (event.target instanceof HTMLTextAreaElement)
          return;
        event.preventDefault();
        void this.runMode(this.chooserMode());
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.handleChooserHover('all');
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.handleChooserHover('caret');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeChooser();
        return;
      }
    }
    if (event.key !== 'Escape')
      return;
    if (this.completeOpen()) {
      event.preventDefault();
      this.completeOpen.set(false);
    }
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
      this.closeClauseMenu();
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
      this.clauseListOpen.set(true);
      this.clauseIndex.set(0);
      this.clauseGhostOff.set(false);
      return;
    }
    if (event.key === 'Backspace' && input.selectionStart === input.selectionEnd) {
      const unpaired = unpairClauseKey(input.value, input.selectionStart ?? input.value.length);
      if (unpaired) {
        event.preventDefault();
        this.writeClause(field, unpaired.value, unpaired.cursor);
        return;
      }
    }
    if (input.selectionStart === input.selectionEnd) {
      const paired = pairClauseKey(input.value, input.selectionStart ?? input.value.length, event.key);
      if (paired) {
        event.preventDefault();
        this.writeClause(field, paired.value, paired.cursor);
        return;
      }
    }
    const suggestions = this.suggestionsFor(field);
    const open = this.clauseListOpen() && this.clauseMenu() === field && suggestions.length > 0;
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
          this.closeClauseMenu();
        return;
      }
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      this.acceptClauseSuggestion(field, suggestions[this.clauseIndex()] ?? suggestions[0]);
      this.closeClauseMenu();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.closeClauseMenu();
      this.applyResultClauses();
      return;
    }
    if (event.key === 'Escape' && (this.clauseMenu() || this.ghostFor(field))) {
      event.preventDefault();
      event.stopPropagation();
      this.closeClauseMenu();
      this.clauseGhostOff.set(true);
    }
  }

  handleClauseSelect(field: ClauseCompleteMode, suggestion: ClauseSuggestion): void {
    this.acceptClauseSuggestion(field, suggestion);
    this.closeClauseMenu();
    this.inputFor(field)?.focus();
  }

  private closeClauseMenu(): void {
    this.clauseMenu.set(null);
    this.clauseListOpen.set(false);
  }

  private applyResultClauses(): void {
    this.appliedWhere.set(this.resultWhere());
    this.appliedOrder.set(this.resultOrder());
  }

  private handleClauseInput(field: ClauseCompleteMode, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.syncClauseCursor(field, target);
    if (field === 'where')
      this.resultWhere.set(target.value);
    else
      this.resultOrder.set(target.value);
    this.clauseGhostOff.set(false);
    this.clauseIndex.set(0);
  }

  private writeClause(field: ClauseCompleteMode, value: string, cursor: number): void {
    if (field === 'where') {
      this.resultWhere.set(value);
      this.whereCursor.set(cursor);
    } else {
      this.resultOrder.set(value);
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
      currentSchema: this.resultSource().schema,
      currentTable: this.resultSource().table,
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
    return field === 'where' ? this.resultWhere() : this.resultOrder();
  }

  private clauseCursor(field: ClauseCompleteMode): number {
    return field === 'where' ? this.whereCursor() : this.orderCursor();
  }

  private clauseColumns(): readonly { readonly name: string; readonly type?: string }[] {
    const resultCols = this.result()?.table?.columns ?? [];
    const types = this.columnTypes();
    if (resultCols.length)
      return resultCols.map((name) => ({ name, type: types[name] }));
    const connection = this.connection();
    const source = this.resultSource();
    if (!connection || !source.table)
      return [];
    return (
      this.store.catalogByConnection()[connection.id]?.columnsByTable[
        catalogTableKey(source.schema, source.table)
      ] ?? []
    );
  }

  private clauseSchemas(): readonly string[] {
    return this.schemaOptions().map((item) => item.value);
  }

  private clauseTables(): readonly { readonly schema: string; readonly name: string }[] {
    const connection = this.connection();
    const cache = connection ? this.store.catalogByConnection()[connection.id] : undefined;
    const schema = this.schema();
    const tables = Object.entries(cache?.tablesBySchema ?? {}).flatMap(([itemSchema, items]) =>
      items.map((table) => ({ schema: itemSchema, name: table.name })),
    );
    return schema ? tables.filter((item) => item.schema === schema) : tables;
  }

  private inputFor(field: ClauseCompleteMode): HTMLInputElement | null {
    return (
      (field === 'where' ? this.resultWhereInput()?.nativeElement : this.resultOrderInput()?.nativeElement) ?? null
    );
  }

  private acceptClauseSuggestion(field: ClauseCompleteMode, suggestion: ClauseSuggestion | undefined): void {
    if (!suggestion)
      return;
    const next = applyClauseSuggestion(this.clauseValue(field), this.clauseCursor(field), suggestion.value);
    this.writeClause(field, next.value, next.cursor);
    this.clauseIndex.set(0);
  }

  handleRelationJump(event: { readonly row: number; readonly column: string }): void {
    const jump = this.relations()[event.column];
    const connection = this.connection();
    const table = this.displayTable();
    const row = table?.rows[event.row];
    if (!jump || !connection || !table || !row)
      return;
    const values: Record<string, string | null> = {};
    for (const source of jump.sourceColumns) {
      const index = table.columns.indexOf(source);
      const cell = index >= 0 ? row[index] ?? null : null;
      values[source] = cell == null ? null : String(cell);
    }
    const where = buildRelationWhere(jump, values, connection.type);
    if (where) {
      this.store.requestTableFocus({
        connectionId: connection.id,
        schema: jump.schema,
        table: jump.table,
        where,
        column: jump.referencedColumns[0],
      });
    }
    this.workbench.openFromDatabaseTable(
      { connectionId: connection.id, schema: jump.schema, table: jump.table },
      jump.schema ? `${jump.schema}.${jump.table}` : jump.table,
    );
  }

  hideConsole(reopenHeight?: number): void {
    const next = reopenHeight ?? this.consoleHeight();
    if (next > CONSOLE_HEIGHT_MIN)
      this.reopenHeight = next;
    this.consoleHidden.set(true);
    this.persistLastResult();
  }

  revealConsole(): void {
    this.consoleHeight.set(this.reopenHeight);
    this.consoleHidden.set(false);
    this.persistLastResult();
  }

  toggleConsole(): void {
    if (this.consoleHidden())
      this.revealConsole();
    else
      this.hideConsole();
  }

  async handlePush(): Promise<void> {
    await this.desktop.api.database.sessionCommit(this.tab().id);
    this.txn.clear(this.tab().id);
    this.rolledBack.set(false);
  }

  async handleRollback(timeout = false): Promise<void> {
    await this.desktop.api.database.sessionRollback(this.tab().id);
    this.txn.clear(this.tab().id);
    this.rolledBack.set(timeout);
  }

  handleFormat(): void {
    const query = this.query();
    if (!query)
      return;
    this.store.updateQuery(query.id, { query: formatSql(query.query) || query.query.replace(/\s+/g, ' ').trim() });
  }

  handleCopy(): void {
    const table = this.result()?.table;
    if (table)
      void navigator.clipboard?.writeText(formatDatabaseQueryResult(table, 'tsv'));
  }

  handlePageSize(size: number): void {
    this.pageSize.set(size);
  }

  handleResizeStart(event: PointerEvent): void {
    event.preventDefault();
    const sash = event.currentTarget;
    if (!(sash instanceof HTMLElement))
      return;
    const shell = sash.closest('.tx-db-query');
    if (!shell)
      return;
    this.resizing = true;
    const rect = shell.getBoundingClientRect();
    const startY = event.clientY;
    const startHeight = this.consoleHeight();
    const stopResize = (): void => {
      this.resizing = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    const onMove = (moveEvent: PointerEvent): void => {
      if (!this.resizing)
        return;
      const next = startHeight - (moveEvent.clientY - startY);
      if (next <= CONSOLE_HEIGHT_MIN) {
        this.hideConsole(startHeight);
        stopResize();
        return;
      }
      const maxHeight = Math.max(CONSOLE_HEIGHT_MIN, Math.floor(rect.height * 0.5));
      this.consoleHeight.set(Math.min(maxHeight, next));
    };
    const onUp = (): void => {
      stopResize();
      this.persistLastResult();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  private async runStatements(sqls: readonly string[]): Promise<void> {
    const connection = this.connection();
    const statements = sqls.map((item) => item.trim()).filter(Boolean);
    if (!connection || statements.length === 0)
      return;
    this.running.set(true);
    this.consoleHidden.set(false);
    this.dismissError();
    this.rolledBack.set(false);
    const transactional = isSqlTransactionEngine(connection.type);
    const dirty = statements.some(
      (sql) => isTransactionalWriteSql(sql, connection.type) || sqlTransactionControl(sql) === 'begin',
    );
    try {
      let last: DatabaseQueryEnvelope | null = null;
      let durationMs = 0;
      for (const sql of statements) {
        const control = sqlTransactionControl(sql);
        if (control === 'commit') {
          await this.handlePush();
          continue;
        }
        if (control === 'rollback') {
          await this.handleRollback();
          continue;
        }
        const envelope = await this.desktop.api.database.sessionQuery({
          tabId: this.tab().id,
          connection,
          query: sql,
          page: { limit: this.pageSize(), offset: 0 },
          hold: transactional || shouldHoldSqlSession(sql, connection.type),
        });
        last = envelope;
        durationMs += envelope.durationMs;
      }
      if (last) {
        this.result.set({ ...last, durationMs });
        this.lastSql.set(statements[statements.length - 1] ?? '');
        this.persistLastResult();
      }
      if (transactional && dirty) {
        const seconds = this.desktop.settings().database.uncommittedRollbackSeconds;
        const rollbackAt = seconds > 0 ? Date.now() + seconds * 1000 : null;
        this.txn.mark(this.tab().id, rollbackAt);
      }
    } catch (error) {
      this.showError(formatDatabaseError(error, databaseErrorContext(connection)));
      if (transactional) {
        await this.desktop.api.database.sessionRollback(this.tab().id);
        this.txn.clear(this.tab().id);
      }
    } finally {
      this.running.set(false);
    }
  }

  dismissError(): void {
    this.clearErrorTimer();
    this.error.set(null);
  }

  private persistLastResult(): void {
    const query = this.query();
    if (!query)
      return;
    const envelope = this.result();
    const table = envelope?.table ?? query.lastResult?.table;
    const durationMs = envelope?.durationMs ?? query.lastResult?.durationMs;
    if (!table || durationMs == null)
      return;
    this.store.updateQuery(query.id, {
      lastResult: toSavedQueryLastResult({
        table,
        durationMs,
        hidden: this.consoleHidden(),
        consoleHeight: this.consoleHidden() ? this.reopenHeight : this.consoleHeight(),
      }),
    });
  }

  private showError(message: string): void {
    this.error.set(message);
    this.consoleHidden.set(false);
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

  private writeSql(value: string, cursor: number): void {
    const query = this.query();
    if (query)
      this.store.updateQuery(query.id, { query: value });
    this.caret.set(cursor);
    const editor = this.editor()?.nativeElement;
    if (editor && editor.value !== value)
      editor.value = value;
    queueMicrotask(() => {
      const next = this.editor()?.nativeElement;
      if (!next)
        return;
      next.setSelectionRange(cursor, cursor);
      this.updateSuggestPos();
    });
  }

  private updateSuggestPos(): void {
    const editor = this.editor()?.nativeElement;
    if (!editor)
      return;
    const metrics = caretMetrics(editor);
    const maxLeft = Math.max(8, editor.clientWidth - 272);
    const maxTop = Math.max(8, editor.clientHeight - 80);
    this.suggestPos.set({
      top: Math.min(maxTop, Math.max(8, metrics.top - editor.scrollTop + 18)),
      left: Math.min(maxLeft, Math.max(8, metrics.left - editor.scrollLeft)),
    });
  }

  private highlightRunRange(mode: DatabaseExecuteChooserMode): void {
    const editor = this.editor()?.nativeElement;
    const source = this.query()?.query ?? '';
    if (!editor)
      return;
    const ranges = resolveDatabaseExecuteHighlightRanges({
      source,
      selectionStart: this.chooserCaret,
      language: databaseQueryEditorLanguage(this.connection()?.type),
      mode,
    });
    const first = ranges[0];
    const last = ranges[ranges.length - 1];
    if (!first || !last)
      return;
    editor.focus();
    editor.setSelectionRange(first.start, last.end);
  }

  private restoreChooserCaret(): void {
    const editor = this.editor()?.nativeElement;
    if (!editor)
      return;
    const caret = Math.min(this.chooserCaret, editor.value.length);
    editor.setSelectionRange(caret, caret);
  }
}

function caretMetrics(editor: HTMLTextAreaElement): { top: number; left: number } {
  const mirror = document.createElement('div');
  const style = getComputedStyle(editor);
  for (const prop of [
    'box-sizing',
    'width',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'letter-spacing',
    'line-height',
    'text-transform',
    'word-spacing',
    'white-space',
    'word-wrap',
    'tab-size',
  ])
    mirror.style.setProperty(prop, style.getPropertyValue(prop));
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  mirror.style.left = '0';
  mirror.style.top = '0';
  mirror.style.width = `${editor.clientWidth}px`;
  mirror.textContent = editor.value.slice(0, editor.selectionStart);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.append(marker);
  editor.parentElement?.append(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  mirror.remove();
  return { top, left };
}
