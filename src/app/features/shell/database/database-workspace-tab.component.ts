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
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { HttpRequestService } from '@app/core/http/http-request.service';
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
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTreeSelectComponent } from '@app/shared/components/forms/tx-tree-select/tx-tree-select.component';
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
  databaseQueryEditorCompletions,
  databaseEngineFamily,
  detectDestructiveSql,
  extractNamedParameterNames,
  isFullDatabaseQuerySelection,
  isSqlDatabaseType,
  mergeDatabaseQueryCompletions,
  normalizeDatabaseQueryResult,
  parseDatabaseConnectionTabResourceId,
  parseDatabaseQueryTabResourceId,
  parseDatabaseTableTabResourceId,
  resolveDatabaseExecuteQuery,
  resolveDatabaseExecuteHighlightRanges,
  shouldPromptDatabaseExecuteChooser,
  rewriteNamedParameters,
  type DatabaseQueryCellRange,
  type DatabaseQueryExportFormat,
  type DatabaseQueryTable,
} from '@shared/database';
import {
  buildCollectionEnvironmentDropdownOptions,
  environmentIdFromDropdownValue,
  getEnvironmentDefinition,
  resolveDatabaseQueryTabSession,
  resolveRequestVariables,
  toEnvironmentDropdownValue,
} from '@shared/config';
import { resolveDynamicVariables } from '@shared/dynamic-variables/dynamic-variables';
import { resolveTemplateVariables } from '@shared/dynamic-variables/template-variables';

import { DatabaseConnectionEditorComponent } from './database-connection-editor.component';
import { DatabaseQueryParamsDialogComponent } from './database-query-params-dialog.component';
import { DatabaseTableDataTabComponent } from './database-table-data-tab.component';
import { toConnectionTreeNodes } from './connection-tree.adapter';

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
    TxIconComponent,
    TxInputComponent,
    TxTreeSelectComponent,
    TxSpinnerComponent,
    TxDataGridComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
    DatabaseConnectionEditorComponent,
    DatabaseQueryParamsDialogComponent,
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
  private readonly environments = inject(EnvironmentsService);
  private readonly httpRequest = inject(HttpRequestService);
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

  protected readonly resultPanelHeight = signal(200);
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
  protected readonly paramsOpen = signal(false);
  protected readonly paramNames = signal<readonly string[]>([]);
  protected readonly paramInitialValues = signal<Readonly<Record<string, string>>>({});
  protected readonly destructiveOpen = signal(false);
  protected readonly destructiveTitle = signal('Run statement?');
  protected readonly destructiveMessage = signal('');
  private lastExecutedQuery = '';
  private lastExplain = false;
  private lastPrepared: PreparedDatabaseRun | null = null;
  private pendingResolvedSql = '';
  private pendingParamNames: readonly string[] = [];
  private pendingExplain = false;
  private pendingLoadAll = false;
  private pendingPrepared: PreparedDatabaseRun | null = null;
  private readonly paramMemoryByQueryId = new Map<string, Record<string, string>>();
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPrefetchKey = '';
  protected readonly gridSelection = signal<DatabaseQueryCellRange | null>(null);
  protected readonly exportMenuOpen = signal(false);
  protected readonly exportMenuPosition = signal<TxContextMenuPosition>({ x: 0, y: 0 });
  private readonly exportScope = signal<'all' | 'selection'>('all');
  protected readonly executeChooserOpen = signal(false);
  protected readonly executeChooserPosition = signal<TxContextMenuPosition>({ x: 0, y: 0 });
  protected readonly executeChooserItems: readonly TxContextMenuItem[] = [
    { id: 'caret', label: 'Run query from cursor', icon: 'play' },
    { id: 'all', label: 'Run all queries', icon: 'play' },
  ];
  private executeChooserMode: 'caret' | 'all' = 'caret';
  private executeChooserLive: { value: string; start: number; end: number } | null = null;
  private executeChooserCommitted = false;
  protected readonly executeHighlightRanges = signal<readonly { readonly start: number; readonly end: number }[]>(
    [],
  );

  protected readonly queryId = computed(() => parseDatabaseQueryTabResourceId(this.resourceId()));

  protected readonly saved = computed(() => {
    const id = this.queryId();
    return id ? this.queries.find(id) : null;
  });

  protected readonly connectionTreeNodes = computed(() =>
    toConnectionTreeNodes(this.config.settings()?.databases?.nodes ?? []),
  );

  protected readonly selectedConnection = computed(() => {
    const connectionId = this.saved()?.connectionId;
    if (!connectionId) {
      return null;
    }
    return this.config.settings()?.databases?.connections.find((conn) => conn.id === connectionId) ?? null;
  });

  protected readonly environmentOptions = computed(() =>
    buildCollectionEnvironmentDropdownOptions(this.environments.environments(), {
      includeInherit: false,
    }),
  );

  protected readonly environmentDropdownValue = computed(() =>
    toEnvironmentDropdownValue(this.saved()?.environmentId ?? ''),
  );

  protected readonly variableCatalog = computed(() => {
    const environmentId = this.saved()?.environmentId?.trim() || null;
    const environment = environmentId
      ? getEnvironmentDefinition(this.environments.environments(), environmentId)
      : null;
    return this.httpRequest.buildVariableCatalog(
      environment,
      {
        useFolderPathInKeys: this.config.settings()?.environments.useFolderPathInKeys ?? false,
      },
      environmentId,
    );
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

  protected readonly editorCompletions = computed((): readonly TxCodeEditorCompletionItem[] =>
    // Keywords only — catalog rows come from completionProvider at the caret.
    // Binding revision-reactive catalog merges here froze the editor (prefetch → revision →
    // new array → ghost refresh → prefetch loop).
    databaseQueryEditorCompletions(this.selectedConnection()?.type),
  );

  protected readonly editorCompletionProvider = (ctx: {
    readonly value: string;
    readonly caret: number;
  }): readonly TxCodeEditorCompletionItem[] => {
    const connection = this.selectedConnection();
    void this.catalog.revision();
    const source = connection ? this.catalog.completionSource(connection.id, connection) : null;
    this.schedulePrefetchCatalogForCompletion(ctx.value, ctx.caret);
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

  protected readonly rowRangeLabel = computed(() => {
    const table = this.table();
    if (!table) {
      return '';
    }
    const from = table.rows.length === 0 ? 0 : this.pageOffset() + 1;
    const to = this.pageOffset() + table.rows.length;
    const total = table.hasMore ? `${to}+` : String(to);
    return table.rows.length === 0 ? '0 of 0' : `${from}–${to} of ${total}`;
  });

  protected readonly durationLabel = computed(() => {
    const ms = this.durationMs();
    return ms == null ? '' : `${ms} ms`;
  });

  protected readonly affectedLabel = computed(() => {
    const affected = this.table()?.affectedRows;
    return affected != null && affected > 0 ? `${affected} rows affected` : '';
  });

  protected readonly resultFilterActive = computed(() => this.resultFilter().trim().length > 0);

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
    void this.environments.hydrate();
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
        this.resultPanelHeight.set(200);
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
      hint: 'Execute the statement at the caret, or choose all queries when several exist',
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
      if (this.prefetchTimer !== null) {
        clearTimeout(this.prefetchTimer);
        this.prefetchTimer = null;
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

  protected handleConnectionChange(connectionId: string | null): void {
    const id = this.queryId();
    if (!id || !connectionId) {
      return;
    }
    this.lastPrefetchKey = '';
    this.queries.patchQuery(id, { connectionId });
  }

  protected handleEnvironmentChange(value: string): void {
    const id = this.queryId();
    if (!id) {
      return;
    }
    const parsed = environmentIdFromDropdownValue(value);
    this.queries.patchQuery(id, { environmentId: parsed || undefined });
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

  protected handleFirstPage(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.pageOffset.set(0);
    void this.beginQueryRun(this.lastExecutedQuery, {
      explain: this.lastExplain,
      skipGuards: true,
    });
  }

  protected handleRefreshResults(): void {
    if (!this.lastExecutedQuery || this.running()) {
      return;
    }
    void this.beginQueryRun(this.lastExecutedQuery, {
      explain: this.lastExplain,
      skipGuards: true,
    });
  }

  protected handlePageSizeChange(value: string): void {
    const size = Number(value);
    if (!DATABASE_QUERY_PAGE_SIZES.includes(size as (typeof DATABASE_QUERY_PAGE_SIZES)[number])) {
      return;
    }
    this.pageSize.set(size);
    this.pageOffset.set(0);
    if (this.lastExecutedQuery) {
      void this.beginQueryRun(this.lastExecutedQuery, {
        explain: this.lastExplain,
        skipGuards: true,
      });
    }
  }

  protected handlePrevPage(): void {
    if (!this.canGoPrev()) {
      return;
    }
    this.pageOffset.update((offset) => Math.max(0, offset - this.pageSize()));
    void this.beginQueryRun(this.lastExecutedQuery, {
      explain: this.lastExplain,
      skipGuards: true,
    });
  }

  protected handleNextPage(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.pageOffset.update((offset) => offset + this.pageSize());
    void this.beginQueryRun(this.lastExecutedQuery, {
      explain: this.lastExplain,
      skipGuards: true,
    });
  }

  protected handleLoadAll(): void {
    if (this.table()?.hasMore) {
      this.loadAllOpen.set(true);
      return;
    }
    void this.beginQueryRun(this.lastExecutedQuery, {
      explain: this.lastExplain,
      loadAll: true,
      skipGuards: true,
    });
  }

  protected handleLoadAllConfirmed(): void {
    this.loadAllOpen.set(false);
    void this.beginQueryRun(this.lastExecutedQuery, {
      explain: this.lastExplain,
      loadAll: true,
      skipGuards: true,
    });
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
    if (this.executeChooserOpen()) {
      this.confirmExecuteChooser();
      return true;
    }
    this.executeFromEditor();
    return true;
  }

  private schedulePrefetchCatalogForCompletion(source: string, caret: number): void {
    if (this.prefetchTimer !== null) {
      clearTimeout(this.prefetchTimer);
    }
    // Debounce so typing does not kick off Oracle all_tables on every keystroke.
    this.prefetchTimer = setTimeout(() => {
      this.prefetchTimer = null;
      void this.prefetchCatalogForCompletion(source, caret);
    }, 400);
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
    const key = `${connection.id}:${target.schema}:${target.table ?? ''}`;
    if (key === this.lastPrefetchKey) {
      return;
    }
    this.lastPrefetchKey = key;
    // Warm one schema/table — never fan out across hundreds of selected schemas.
    await this.catalog.loadSchema(connection, target.schema);
    if (target.table) {
      await this.catalog.loadTable(connection, target.schema, target.table);
    }
  }

  private executeFromEditor(options: { readonly explain?: boolean } = {}): void {
    if (this.running() || this.paramsOpen() || this.destructiveOpen()) {
      return;
    }
    if (this.executeChooserOpen() && !options.explain) {
      this.confirmExecuteChooser();
      return;
    }
    const live = this.queryEditor()?.getLiveSelection();
    const source = live?.value ?? this.saved()?.query ?? '';
    const language = this.editorLanguage();
    if (
      !options.explain &&
      shouldPromptDatabaseExecuteChooser({
        source,
        selectionStart: live?.start ?? 0,
        selectionEnd: live?.end ?? 0,
        language,
      })
    ) {
      this.openExecuteChooser({
        value: source,
        start: live?.start ?? 0,
        end: live?.end ?? 0,
      });
      return;
    }
    const query = resolveDatabaseExecuteQuery({
      source,
      selectionStart: live?.start ?? 0,
      selectionEnd: live?.end ?? 0,
      language,
    });
    this.pageOffset.set(0);
    void this.beginQueryRun(query, options);
  }

  private openExecuteChooser(live: { value: string; start: number; end: number }): void {
    this.executeChooserCommitted = false;
    this.executeChooserLive = live;
    this.executeChooserMode = 'caret';
    const caret = this.queryEditor()?.getCaretViewportPosition();
    const host = this.hostRef.nativeElement.getBoundingClientRect();
    this.executeChooserPosition.set(caret ?? { x: host.left + 48, y: host.top + 96 });
    this.executeChooserOpen.set(true);
    this.applyExecuteChooserHighlight('caret');
  }

  protected handleExecuteChooserActive(id: string): void {
    if (id !== 'caret' && id !== 'all') {
      return;
    }
    this.executeChooserMode = id;
    this.applyExecuteChooserHighlight(id);
  }

  protected handleExecuteChooserSelect(id: string): void {
    if (id !== 'caret' && id !== 'all') {
      this.executeChooserOpen.set(false);
      return;
    }
    this.executeChooserMode = id;
    this.confirmExecuteChooser();
  }

  protected handleExecuteChooserClosed(): void {
    if (!this.executeChooserCommitted) {
      this.restoreExecuteChooserCaret();
    }
    this.executeChooserOpen.set(false);
    this.executeChooserLive = null;
    this.executeChooserCommitted = false;
  }

  private confirmExecuteChooser(): void {
    const live = this.executeChooserLive;
    const mode = this.executeChooserMode;
    this.executeChooserCommitted = true;
    this.executeChooserOpen.set(false);
    this.restoreExecuteChooserCaret();
    if (!live) {
      return;
    }
    const language = this.editorLanguage();
    const query = resolveDatabaseExecuteQuery({
      source: live.value,
      selectionStart: mode === 'all' ? 0 : live.start,
      selectionEnd: mode === 'all' ? live.value.length : live.end,
      language,
    });
    this.executeChooserLive = null;
    this.pageOffset.set(0);
    void this.beginQueryRun(query);
  }

  private applyExecuteChooserHighlight(mode: 'caret' | 'all'): void {
    const live = this.executeChooserLive;
    if (!live) {
      return;
    }
    this.executeHighlightRanges.set(
      resolveDatabaseExecuteHighlightRanges({
        source: live.value,
        selectionStart: live.start,
        language: this.editorLanguage(),
        mode,
      }),
    );
  }

  private restoreExecuteChooserCaret(): void {
    this.executeHighlightRanges.set([]);
    const live = this.executeChooserLive;
    const editor = this.queryEditor();
    if (!live || !editor) {
      return;
    }
    queueMicrotask(() => {
      editor.setLiveSelection(live.start, live.end);
    });
  }

  private canHandleRunShortcut(): boolean {
    if (!this.active() || this.isConnectionTab() || this.isTableDataTab() || !this.saved()) {
      return false;
    }
    if (this.paramsOpen() || this.destructiveOpen() || this.loadAllOpen()) {
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

  protected handleParamsSubmitted(values: Readonly<Record<string, string>>): void {
    this.paramsOpen.set(false);
    const resolvedSql = this.pendingResolvedSql;
    const names = this.pendingParamNames;
    const explain = this.pendingExplain;
    const loadAll = this.pendingLoadAll;
    this.clearPendingParams();
    if (!resolvedSql) {
      return;
    }
    this.paramMemoryByQueryId.set(this.resourceId(), { ...values });
    const ordered = names.map((name) => values[name] ?? '');
    const prepared = this.bindNamedSql(resolvedSql, names, ordered, explain, loadAll);
    if (!prepared) {
      return;
    }
    void this.confirmDestructiveThenRun(prepared);
  }

  protected handleParamsCancelled(): void {
    this.paramsOpen.set(false);
    this.clearPendingParams();
  }

  protected handleDestructiveConfirmed(): void {
    this.destructiveOpen.set(false);
    const prepared = this.pendingPrepared;
    this.pendingPrepared = null;
    if (prepared) {
      void this.runPrepared(prepared);
    }
  }

  protected handleDestructiveCancelled(): void {
    this.destructiveOpen.set(false);
    this.pendingPrepared = null;
  }

  private resolveQueryTemplates(query: string): string {
    const environmentId = this.saved()?.environmentId?.trim() || null;
    const environment = environmentId
      ? getEnvironmentDefinition(this.environments.environments(), environmentId)
      : null;
    const variableContext = resolveRequestVariables(
      [],
      environment,
      {},
      {
        useFolderPathInKeys: this.config.settings()?.environments.useFolderPathInKeys ?? false,
      },
    );
    return resolveDynamicVariables(resolveTemplateVariables(query, { environment: variableContext }));
  }

  private bindNamedSql(
    resolvedSql: string,
    names: readonly string[],
    values: readonly unknown[],
    explain: boolean,
    loadAll: boolean,
  ): PreparedDatabaseRun | null {
    const type = this.selectedConnection()?.type;
    const family = databaseEngineFamily(type);
    if (!family || !isSqlDatabaseType(type) || names.length === 0) {
      return {
        resolvedSql,
        boundSql: resolvedSql,
        paramNames: [],
        paramValues: [],
        explain,
        loadAll,
      };
    }
    const rewritten = rewriteNamedParameters(resolvedSql, family, names);
    return {
      resolvedSql,
      boundSql: rewritten.sql,
      paramNames: names,
      paramValues: values,
      explain,
      loadAll,
    };
  }

  private clearPendingParams(): void {
    this.pendingResolvedSql = '';
    this.pendingParamNames = [];
    this.pendingExplain = false;
    this.pendingLoadAll = false;
  }

  private async beginQueryRun(
    rawQuery: string,
    options: { readonly explain?: boolean; readonly loadAll?: boolean; readonly skipGuards?: boolean } = {},
  ): Promise<void> {
    const saved = this.saved();
    const connection = this.selectedConnection();
    const api = this.electron.bridge()?.database;
    const query = rawQuery.trim();
    if (!saved || !connection || !api) {
      this.error.set('Select a database connection before running.');
      return;
    }
    if (!query && !options.skipGuards) {
      this.error.set('Enter a query to run.');
      return;
    }
    if (this.running()) {
      return;
    }
    if (options.skipGuards && this.lastPrepared) {
      await this.runPrepared({
        ...this.lastPrepared,
        explain: Boolean(options.explain),
        loadAll: Boolean(options.loadAll),
      });
      return;
    }
    const resolvedSql = this.resolveQueryTemplates(query);
    const explain = Boolean(options.explain);
    const loadAll = Boolean(options.loadAll);
    if (!isSqlDatabaseType(connection.type)) {
      await this.runPrepared({
        resolvedSql,
        boundSql: resolvedSql,
        paramNames: [],
        paramValues: [],
        explain,
        loadAll,
      });
      return;
    }
    const names = extractNamedParameterNames(resolvedSql);
    if (names.length > 0 && !options.skipGuards) {
      const memory = this.paramMemoryByQueryId.get(this.resourceId()) ?? {};
      this.pendingResolvedSql = resolvedSql;
      this.pendingParamNames = names;
      this.pendingExplain = explain;
      this.pendingLoadAll = loadAll;
      this.paramNames.set(names);
      const initial: Record<string, string> = {};
      for (const name of names) {
        initial[name] = memory[name] ?? '';
      }
      this.paramInitialValues.set(initial);
      this.paramsOpen.set(true);
      return;
    }
    const memory = this.paramMemoryByQueryId.get(this.resourceId()) ?? {};
    const values = names.map((name) => memory[name] ?? '');
    const prepared = this.bindNamedSql(resolvedSql, names, values, explain, loadAll);
    if (!prepared) {
      return;
    }
    await this.confirmDestructiveThenRun(prepared);
  }

  private async confirmDestructiveThenRun(prepared: PreparedDatabaseRun): Promise<void> {
    const saved = this.saved();
    const connection = this.selectedConnection();
    if (!saved || !connection) {
      this.error.set('Select a database connection before running.');
      return;
    }
    if (!isSqlDatabaseType(connection.type)) {
      await this.runPrepared(prepared);
      return;
    }
    const kind = detectDestructiveSql(prepared.resolvedSql);
    if (!kind) {
      await this.runPrepared(prepared);
      return;
    }
    if (saved.readOnly) {
      this.error.set(`This query is read-only. ${kind} statements cannot run.`);
      return;
    }
    this.pendingPrepared = prepared;
    this.destructiveTitle.set(`Run ${kind}?`);
    this.destructiveMessage.set(`${kind} will run on ${connection.name}.`);
    this.destructiveOpen.set(true);
  }

  private async runPrepared(prepared: PreparedDatabaseRun): Promise<void> {
    const saved = this.saved();
    const connection = this.selectedConnection();
    const api = this.electron.bridge()?.database;
    const query = prepared.boundSql.trim();
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
    this.lastPrepared = prepared;
    this.lastExecutedQuery = prepared.resolvedSql;
    this.lastExplain = prepared.explain;
    const isScript = query.replace(/;+\s*$/g, '').includes(';');
    this.runningLabel.set(
      prepared.explain ? 'Running explain' : isScript ? 'Running script' : 'Running statement',
    );
    this.running.set(true);
    this.error.set(null);
    const started = performance.now();
    const bind =
      prepared.paramNames.length > 0
        ? { paramNames: prepared.paramNames, paramValues: prepared.paramValues }
        : {};
    try {
      const result = prepared.explain
        ? await api.explain({ connection, query, ...bind })
        : await api.query({
            connection,
            query,
            ...bind,
            page: prepared.loadAll
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

interface PreparedDatabaseRun {
  readonly resolvedSql: string;
  readonly boundSql: string;
  readonly paramNames: readonly string[];
  readonly paramValues: readonly unknown[];
  readonly explain: boolean;
  readonly loadAll: boolean;
}
