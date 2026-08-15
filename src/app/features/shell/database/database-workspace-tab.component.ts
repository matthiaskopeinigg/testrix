import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TeamsPanelService } from '@app/core/collaboration/teams-panel.service';
import { CommandRegistryService } from '@app/core/commands/command-registry.service';
import { ConfigService } from '@app/core/config/config.service';
import { DatabaseCatalogService } from '@app/core/database/database-catalog.service';
import { DatabaseQueriesService } from '@app/core/database/database-queries.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { formatChordForDisplay } from '@app/core/keyboard/keyboard-shortcut-catalog';
import { KeyboardShortcutsService } from '@app/core/keyboard/keyboard-shortcuts.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { FileDialogService } from '@app/core/platform/file-dialog.service';
import { CommandPaletteService } from '@app/core/ui/command-palette.service';
import { HelpPopupService } from '@app/core/ui/help-popup.service';
import { SettingsPopupService } from '@app/core/ui/settings-popup.service';
import { TxDataGridComponent } from '@app/shared/components/data/tx-data-grid/tx-data-grid.component';
import type { TxDataGridExportEvent } from '@app/shared/components/data/tx-data-grid/tx-data-grid.types';
import { TxCodeEditorComponent } from '@app/shared/components/editors/tx-code-editor/tx-code-editor.component';
import type { TxCodeEditorCompletionItem } from '@app/shared/components/editors/tx-code-editor/tx-code-editor-completion';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxSpinnerComponent } from '@app/shared/components/feedback/tx-spinner/tx-spinner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxVerticalSplitPaneComponent } from '@app/shared/components/chrome/tx-vertical-split-pane/tx-vertical-split-pane.component';
import { TxConfirmDialogComponent } from '@app/shared/components/overlays/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxContextMenuComponent } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem, TxContextMenuPosition } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.types';

import {
  canExplainSql,
  DATABASE_QUERY_EXPORT_FORMATS,
  DATABASE_QUERY_PAGE_SIZE_DEFAULT,
  DATABASE_QUERY_PAGE_SIZES,
  databaseQueryEditorLanguage,
  databaseQueryEditorLanguageLabel,
  databaseQueryEditorPlaceholder,
  filterDatabaseQueryRows,
  formatDatabaseConnectionError,
  formatDatabaseQueryResult,
  catalogPrefetchTarget,
  isFullDatabaseQuerySelection,
  mergeDatabaseQueryCompletions,
  normalizeDatabaseQueryResult,
  parseDatabaseConnectionTabResourceId,
  parseDatabaseQueryTabResourceId,
  parseDatabaseTableTabResourceId,
  resolveDatabaseExecuteQuery,
  type DatabaseQueryCellRange,
  type DatabaseQueryExportFormat,
  type DatabaseQueryTable,
} from '@shared/database';
import { resolveDatabaseQueryTabSession } from '@shared/config';

import { DatabaseConnectionEditorComponent } from './database-connection-editor.component';
import { DatabaseTableDataTabComponent } from './database-table-data-tab.component';

@Component({
  selector: 'app-database-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxSpinnerComponent,
    TxDataGridComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
    DatabaseConnectionEditorComponent,
    DatabaseTableDataTabComponent,
    TxVerticalSplitPaneComponent,
  ],
  templateUrl: './database-workspace-tab.component.html',
  styleUrl: './database-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseWorkspaceTabComponent {
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly queries = inject(DatabaseQueriesService);
  private readonly catalog = inject(DatabaseCatalogService);
  private readonly config = inject(ConfigService);
  private readonly electron = inject(ElectronService);
  private readonly errors = inject(ErrorNotificationService);
  private readonly files = inject(FileDialogService);
  private readonly notifications = inject(TxNotificationService);
  private readonly keyboardShortcuts = inject(KeyboardShortcutsService);
  private readonly commands = inject(CommandRegistryService);
  private readonly commandPalette = inject(CommandPaletteService);
  private readonly settingsPopup = inject(SettingsPopupService);
  private readonly helpPopup = inject(HelpPopupService);
  private readonly teamsPanel = inject(TeamsPanelService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  private readonly queryEditor = viewChild(TxCodeEditorComponent);
  private readonly resultGrid = viewChild(TxDataGridComponent);

  protected readonly isConnectionTab = computed(
    () => parseDatabaseConnectionTabResourceId(this.resourceId()) !== null,
  );

  protected readonly isTableDataTab = computed(
    () => parseDatabaseTableTabResourceId(this.resourceId()) !== null,
  );

  protected readonly resultPanelHeight = signal(320);
  protected readonly resultPanelHidden = signal(false);
  private resultPanelHeightSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionUiLoadKey: string | null = null;

  protected readonly running = signal(false);
  protected readonly runningLabel = signal('Running statement');
  protected readonly error = signal<string | null>(null);
  protected readonly durationMs = signal<number | null>(null);
  protected readonly table = signal<DatabaseQueryTable | null>(null);
  protected readonly resultFilter = signal('');
  protected readonly pageSize = signal(DATABASE_QUERY_PAGE_SIZE_DEFAULT);
  protected readonly pageOffset = signal(0);
  protected readonly loadAllOpen = signal(false);
  private lastExecutedQuery = '';
  private lastExplain = false;
  protected readonly gridSelection = signal<DatabaseQueryCellRange | null>(null);
  protected readonly exportMenuOpen = signal(false);
  protected readonly exportMenuPosition = signal<TxContextMenuPosition>({ x: 0, y: 0 });
  private readonly exportScope = signal<'all' | 'selection'>('all');

  protected readonly queryId = computed(() => parseDatabaseQueryTabResourceId(this.resourceId()));

  protected readonly saved = computed(() => {
    const id = this.queryId();
    return id ? this.queries.find(id) : null;
  });

  protected readonly connectionOptions = computed(() =>
    (this.config.settings()?.databases?.connections ?? []).map((conn) => ({
      value: conn.id,
      label: `${conn.name} (${conn.type})`,
    })),
  );

  protected readonly selectedConnection = computed(() => {
    const connectionId = this.saved()?.connectionId;
    if (!connectionId) {
      return null;
    }
    return this.config.settings()?.databases?.connections.find((conn) => conn.id === connectionId) ?? null;
  });

  protected readonly editorLanguage = computed(() =>
    databaseQueryEditorLanguage(this.selectedConnection()?.type),
  );

  protected readonly editorLanguageLabel = computed(() =>
    databaseQueryEditorLanguageLabel(this.selectedConnection()?.type),
  );

  protected readonly editorPlaceholder = computed(() =>
    databaseQueryEditorPlaceholder(this.selectedConnection()?.type),
  );

  protected readonly editorCompletions = computed((): readonly TxCodeEditorCompletionItem[] => {
    // Keep a static fallback for tools that read the catalog without a caret.
    const connection = this.selectedConnection();
    const query = this.saved()?.query ?? '';
    void this.catalog.revision();
    return mergeDatabaseQueryCompletions(
      connection?.type,
      connection ? this.catalog.completionSource(connection.id, connection) : null,
      query,
      query.length,
    );
  });

  protected readonly editorCompletionProvider = (ctx: {
    readonly value: string;
    readonly caret: number;
  }): readonly TxCodeEditorCompletionItem[] => {
    const connection = this.selectedConnection();
    void this.catalog.revision();
    const source = connection ? this.catalog.completionSource(connection.id, connection) : null;
    void this.prefetchCatalogForCompletion(ctx.value, ctx.caret);
    return mergeDatabaseQueryCompletions(connection?.type, source, ctx.value, ctx.caret);
  };

  protected readonly canExplain = computed(() => canExplainSql(this.selectedConnection()?.type));

  protected readonly pageSizeOptions = DATABASE_QUERY_PAGE_SIZES.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  protected readonly filteredTable = computed((): DatabaseQueryTable | null => {
    const table = this.table();
    if (!table) {
      return null;
    }
    const rows = filterDatabaseQueryRows(table, this.resultFilter());
    return { ...table, rows };
  });

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
    const affected =
      table.affectedRows != null && table.affectedRows > 0 ? ` · ${table.affectedRows} rows affected` : '';
    return `${range}${duration}${affected}`;
  });

  protected readonly canGoPrev = computed(() => this.pageOffset() > 0 && !this.running());

  protected readonly canGoNext = computed(() => Boolean(this.table()?.hasMore) && !this.running());

  protected readonly showResultPanel = computed(
    () => this.running() || this.table() !== null || this.error() !== null,
  );

  protected readonly runShortcutHint = computed(() => {
    const chord = this.keyboardShortcuts.effectiveChord('database.runQuery');
    const platform = this.electron.bridge()?.platform ?? navigator.platform;
    return `Run (${formatChordForDisplay(chord, platform)})`;
  });

  protected readonly exportMenuItems = computed((): readonly TxContextMenuItem[] => {
    const table = this.table();
    const selection = this.gridSelection();
    const hasPartial =
      table !== null && selection !== null && !isFullDatabaseQuerySelection(table, selection);
    if (this.exportScope() === 'selection') {
      return DATABASE_QUERY_EXPORT_FORMATS.map((format) => ({
        id: `selection:${format.id}`,
        label: format.label,
        icon: 'download' as const,
        disabled: !hasPartial && selection === null,
      }));
    }
    const allItems: TxContextMenuItem[] = DATABASE_QUERY_EXPORT_FORMATS.map((format) => ({
      id: `all:${format.id}`,
      label: hasPartial ? `All · ${format.label}` : format.label,
      icon: 'download',
    }));
    if (!hasPartial) {
      return allItems;
    }
    return [
      ...allItems,
      { id: 'sep-selection', label: '', separator: true },
      ...DATABASE_QUERY_EXPORT_FORMATS.map((format) => ({
        id: `selection:${format.id}`,
        label: `Selection · ${format.label}`,
        icon: 'download' as const,
      })),
    ];
  });

  constructor() {
    void this.queries.hydrate();
    effect(() => {
      this.resourceId();
      this.table.set(null);
      this.gridSelection.set(null);
      this.error.set(null);
      this.durationMs.set(null);
      this.resultFilter.set('');
      this.pageOffset.set(0);
      this.lastExecutedQuery = '';
    });
    effect(() => {
      const connection = this.selectedConnection();
      if (connection) {
        void this.catalog.openConnection(connection);
      }
    });
    effect(() => {
      const resourceId = this.resourceId();
      const loadKey = `${resourceId}:${this.config.sessionRevision()}`;
      if (this.sessionUiLoadKey === loadKey) {
        return;
      }
      this.sessionUiLoadKey = loadKey;
      const tab = resolveDatabaseQueryTabSession(
        this.config.session()?.workspace.database.queryTabsById,
        resourceId,
      );
      if (tab.resultPanelHeightPx != null) {
        this.resultPanelHeight.set(tab.resultPanelHeightPx);
      } else {
        this.resultPanelHeight.set(320);
      }
      this.resultPanelHidden.set(tab.isResultPanelHidden ?? false);
    });
    const unregisterShortcut = this.keyboardShortcuts.register('database.runQuery', () =>
      this.handleRunShortcut(),
    );
    this.commands.register({
      id: 'database.runQuery',
      label: 'Run database query',
      category: 'Database',
      hint: 'Execute the statement at the caret, or the selection',
      keywords: ['sql', 'redis', 'execute', 'datagrip'],
      shortcut: 'Ctrl+Enter',
      run: () => {
        if (this.isConnectionTab() || this.isTableDataTab() || !this.saved()) {
          return;
        }
        this.executeFromEditor();
      },
    });
    this.destroyRef.onDestroy(() => {
      unregisterShortcut();
      this.commands.unregister('database.runQuery');
      if (this.resultPanelHeightSaveTimer !== null) {
        clearTimeout(this.resultPanelHeightSaveTimer);
      }
    });
  }

  protected handleNameChange(name: string): void {
    const id = this.queryId();
    if (!id) {
      return;
    }
    this.queries.patchQuery(id, { name });
  }

  protected handleConnectionChange(connectionId: string): void {
    const id = this.queryId();
    if (!id) {
      return;
    }
    this.queries.patchQuery(id, { connectionId });
  }

  protected handleQueryChange(query: string): void {
    const id = this.queryId();
    if (!id) {
      return;
    }
    this.queries.patchQuery(id, { query });
  }

  protected handleRun(): void {
    this.executeFromEditor();
  }

  protected handleExplain(): void {
    this.executeFromEditor({ explain: true });
  }

  protected handleResultFilter(value: string): void {
    this.resultFilter.set(value);
  }

  protected handlePageSizeChange(value: string): void {
    const size = Number(value);
    if (!DATABASE_QUERY_PAGE_SIZES.includes(size as (typeof DATABASE_QUERY_PAGE_SIZES)[number])) {
      return;
    }
    this.pageSize.set(size);
    this.pageOffset.set(0);
    if (this.lastExecutedQuery) {
      void this.executeQuery(this.lastExecutedQuery, { explain: this.lastExplain });
    }
  }

  protected handlePrevPage(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.pageOffset.update((offset) => Math.max(0, offset - this.pageSize()));
    void this.executeQuery(this.lastExecutedQuery, { explain: this.lastExplain });
  }

  protected handleNextPage(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.pageOffset.update((offset) => offset + this.pageSize());
    void this.executeQuery(this.lastExecutedQuery, { explain: this.lastExplain });
  }

  protected handleLoadAll(): void {
    if (this.table()?.hasMore) {
      this.loadAllOpen.set(true);
      return;
    }
    void this.executeQuery(this.lastExecutedQuery, { explain: this.lastExplain, loadAll: true });
  }

  protected handleLoadAllConfirmed(): void {
    this.loadAllOpen.set(false);
    void this.executeQuery(this.lastExecutedQuery, { explain: this.lastExplain, loadAll: true });
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

  protected handleResultPanelHeight(height: number): void {
    this.resultPanelHeight.set(height);
  }

  protected handleResultPanelHidden(hidden: boolean): void {
    this.resultPanelHidden.set(hidden);
    void this.config.patchSession({
      workspace: {
        database: {
          queryTabsById: {
            [this.resourceId()]: {
              ...resolveDatabaseQueryTabSession(
                this.config.session()?.workspace.database.queryTabsById,
                this.resourceId(),
              ),
              isResultPanelHidden: hidden,
            },
          },
        },
      },
    });
  }

  protected handleResultPanelHeightCommit(height: number): void {
    this.resultPanelHeight.set(height);
    if (this.resultPanelHeightSaveTimer) {
      clearTimeout(this.resultPanelHeightSaveTimer);
    }
    this.resultPanelHeightSaveTimer = setTimeout(() => {
      this.resultPanelHeightSaveTimer = null;
      void this.config.patchSession({
        workspace: {
          database: {
            queryTabsById: {
              [this.resourceId()]: {
                ...resolveDatabaseQueryTabSession(
                  this.config.session()?.workspace.database.queryTabsById,
                  this.resourceId(),
                ),
                resultPanelHeightPx: height,
              },
            },
          },
        },
      });
    }, 300);
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
      const path = await this.files.saveText(content, `query-result.${meta.extension}`, [
        { name: meta.filterName, extensions: [meta.extension] },
      ]);
      if (path) {
        this.notifications.showSuccess(`Exported ${meta.label}`);
      }
    } catch (error) {
      this.notifications.showError('Could not export the query result.');
      this.errors.reportUnknown(error);
    }
  }

  private handleRunShortcut(): boolean {
    if (!this.canHandleRunShortcut()) {
      return false;
    }
    this.executeFromEditor();
    return true;
  }

  private async prefetchCatalogForCompletion(source: string, caret: number): Promise<void> {
    const connection = this.selectedConnection();
    if (!connection) {
      return;
    }
    const catalog = this.catalog.completionSource(connection.id, connection);
    const target = catalogPrefetchTarget(source, caret, catalog);
    if (!target?.schema) {
      return;
    }
    await this.catalog.loadSchema(connection, target.schema);
    if (target.table) {
      await this.catalog.loadTable(connection, target.schema, target.table);
    }
  }

  private executeFromEditor(options: { readonly explain?: boolean } = {}): void {
    if (this.running()) {
      return;
    }
    const live = this.queryEditor()?.getLiveSelection();
    const source = live?.value ?? this.saved()?.query ?? '';
    const query = resolveDatabaseExecuteQuery({
      source,
      selectionStart: live?.start ?? 0,
      selectionEnd: live?.end ?? 0,
      language: this.editorLanguage(),
    });
    this.pageOffset.set(0);
    void this.executeQuery(query, options);
  }

  private canHandleRunShortcut(): boolean {
    if (!this.active() || this.isConnectionTab() || this.isTableDataTab() || !this.saved()) {
      return false;
    }
    if (
      this.commandPalette.open() ||
      this.settingsPopup.open() ||
      this.helpPopup.open() ||
      this.teamsPanel.open()
    ) {
      return false;
    }
    const focused = document.activeElement;
    const inHost = focused instanceof Node && this.hostRef.nativeElement.contains(focused);
    if (inHost) {
      return true;
    }
    if (
      focused instanceof HTMLElement &&
      focused.closest('input, textarea, select, [contenteditable="true"]')
    ) {
      return false;
    }
    return true;
  }

  private async executeQuery(
    rawQuery: string,
    options: { readonly explain?: boolean; readonly loadAll?: boolean } = {},
  ): Promise<void> {
    const saved = this.saved();
    const connection = this.selectedConnection();
    const api = this.electron.bridge()?.database;
    const query = rawQuery.trim();
    if (!saved || !connection || !api) {
      this.error.set('Select a database connection before running.');
      return;
    }
    if (!query) {
      this.error.set('Enter a query to run.');
      return;
    }
    if (this.running()) {
      return;
    }
    this.lastExecutedQuery = query;
    this.lastExplain = Boolean(options.explain);
    const isScript = query.replace(/;+\s*$/g, '').includes(';');
    this.runningLabel.set(
      options.explain ? 'Running explain' : isScript ? 'Running script' : 'Running statement',
    );
    this.running.set(true);
    this.error.set(null);
    const started = performance.now();
    try {
      const result = options.explain
        ? await api.explain({ connection, query })
        : await api.query({
            connection,
            query,
            page: options.loadAll
              ? undefined
              : { limit: this.pageSize(), offset: this.pageOffset() },
          });
      this.table.set(normalizeDatabaseQueryResult(result));
      this.gridSelection.set(null);
      this.durationMs.set(Math.round(performance.now() - started));
    } catch (error) {
      this.table.set(null);
      this.gridSelection.set(null);
      this.durationMs.set(Math.round(performance.now() - started));
      this.error.set(formatDatabaseConnectionError(error));
    } finally {
      this.running.set(false);
    }
  }
}
