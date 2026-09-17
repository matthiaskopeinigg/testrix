import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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
import { DatabaseStore } from './database.store';
import { DatabaseTxnTracker } from './database-txn.tracker';

const RUN_MENU_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
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

const CONSOLE_HEIGHT_DEFAULT = 168;
const CONSOLE_HEIGHT_MIN = 80;

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

  readonly ghost = computed(() =>
    sqlGhost(this.query()?.query ?? '', this.caret(), this.suggestions()[this.completeIndex()] ?? this.suggestions()[0]),
  );

  readonly highlightTokens = computed(() => tokenizeSqlHighlight(this.query()?.query ?? ''));

  readonly lineNumbers = computed(() => {
    const count = Math.max(1, (this.query()?.query ?? '').split('\n').length);
    return Array.from({ length: count }, (_, index) => index + 1);
  });

  readonly hasConsoleContent = computed(
    () => this.result() != null || this.error() != null || this.running(),
  );

  readonly showConsole = computed(() => this.hasConsoleContent() && !this.consoleHidden());

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
      if (last.consoleHeight)
        this.consoleHeight.set(last.consoleHeight);
    });
  }

  handleSql(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    this.writeSql(target.value, target.selectionStart);
    if (target.value[target.selectionStart - 1] === '.') {
      this.completeOpen.set(true);
      this.completeIndex.set(0);
    }
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

  hideConsole(): void {
    this.consoleHidden.set(true);
    this.persistLastResult();
  }

  revealConsole(): void {
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
    const shell = sash.parentElement;
    if (!shell)
      return;
    this.resizing = true;
    const rect = shell.getBoundingClientRect();
    const startY = event.clientY;
    const startHeight = this.consoleHeight();
    const onMove = (moveEvent: PointerEvent): void => {
      if (!this.resizing)
        return;
      const maxHeight = Math.max(CONSOLE_HEIGHT_MIN, Math.floor(rect.height * 0.5));
      this.consoleHeight.set(
        Math.min(maxHeight, Math.max(CONSOLE_HEIGHT_MIN, startHeight - (moveEvent.clientY - startY))),
      );
    };
    const onUp = (): void => {
      this.resizing = false;
      this.persistLastResult();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
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
        consoleHeight: this.consoleHeight(),
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
