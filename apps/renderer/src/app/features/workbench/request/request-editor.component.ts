import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { OverlayModule } from '@angular/cdk/overlay';
import {
  ancestorFolderConfigs,
  ancestorFolderOrigins,
  applyQueryToUrl,
  cookiesFromSetCookie,
  DEFAULT_FOLDER_AUTH,
  defaultHttpTiming,
  environmentVariableMap,
  findNodePath,
  folderConfigOf,
  historyDayLabel,
  HTTP_METHODS,
  inheritedKvRows,
  detectUrlPasteIngest,
  mergeFolderConfigs,
  type UrlPasteIngestPreview,
  OAUTH_GRANT_TYPES,
  parseCollectionRequestConfig,
  redactSnapshot,
  REQUEST_AUTH_MODES,
  REQUEST_BODY_MODES,
  requestConfigOf,
  requestResponseTabSlideDir,
  requestSectionSlideDir,
  SETTINGS_KV_SOURCE_ID,
  snippetFor,
  syncPathParams,
  type CollectionCookie,
  type CollectionFolderAuth,
  type FolderDocsMode,
  type CollectionFolderAuthType,
  type HistoryEntry,
  type HttpMethod,
  type OAuthGrantType,
  type RequestAuthMode,
  type RequestBody,
  type RequestBodyMode,
  type RequestExample,
  type RequestFormRow,
  type RequestResponseTab,
  type RequestRunSnapshot,
  type RequestTabSection,
} from '@testrix/contracts';
import {
  TxCheckComponent,
  TxEmptyStateComponent,
  TxHintComponent,
  TxInputComponent,
  TxTagsInputComponent,
  TxOverlayComponent,
  TxSelectComponent,
  type TxSelectOption,
} from '@testrix/ui';

import { DesktopApiService } from '../../../core/desktop-api.service';
import { HttpInflightRegistry } from '../../../core/http-inflight.registry';
import { DirtyTabsRegistry } from '../../../core/dirty-tabs.registry';
import { isManualSaveMode, shouldHandleManualSaveHotkey } from '../../../core/save-mode';
import { isEditableKeyboardTarget, isModKey } from '../../../core/selection-hotkeys';
import { ShellStateService } from '../../../core/shell-state.service';
import { HelpContextService } from '../../help/help-context.service';
import { CookieAuthDialogService } from '../../cookie-auth/cookie-auth-dialog.service';
import { CollectionsStore } from '../../collections/collections.store';
import { EnvironmentsStore } from '../../environments/environments.store';
import { DocsEditorComponent } from '../../collections/docs-editor.component';
import { CodeEditorShellComponent } from './code-editor-shell.component';
import { CodeHighlightComponent } from './code-highlight.component';
import { canFormatLanguage, codeEditorLanguageFromBodyMode, languageFromContentType } from './code-editor-language';
import { formatResponseBody } from './code-editor-format';
import { HistoryStore } from '../../history/history.store';
import { RequestKvTableComponent } from './request-kv-table.component';
import { openInheritedKvSource } from './inherited-source';
import {
  openPlaceholderOrigin,
  PLACEHOLDER_ORIGIN_HOST,
  shouldOpenPlaceholderOrigin,
  winningVariableOrigins,
  type PlaceholderActivate,
  type PlaceholderOrigin,
  type PlaceholderOriginHost,
} from './placeholder-origin';
import { PlaceholderHighlightComponent } from './placeholder-highlight.component';
import { CookieJarStore } from './cookie-jar.store';
import { planHttpSend } from './http-send';
import { networkErrorSettingsLink } from './network-error-settings';
import { diffSideBySide, formatHeadersForDiff } from './response-diff';
import { formatHistoryDateTime } from '../../history/history-display';
import {
  overflowResponseTabs,
  primaryResponseTabs,
  responseTabLabel,
  type ResponseTabLayoutInput,
} from './request-response-tabs';
import { sendOutcomeHints, type SendOutcomeHint } from './request-send-outcomes';
import { canPreviewResponse, previewDocument } from './response-preview';
import { TIMELINE_PHASES, timelineShare } from './response-timeline';
import {
  applyPlaceholderSuggestion,
  hasPlaceholderTokens,
  segmentAtOffset,
  suggestPlaceholders,
  tokenAtCaret,
  type PlaceholderSuggestion,
} from './placeholder-complete';
import { PlaceholderSuggestComponent } from './placeholder-suggest.component';
import { TokenFieldComponent } from './token-field.component';
import { persistMockRows, withTrailingRow, type MockKeyValue, type MockResponse } from './request-mock';
import { WorkbenchStore, type WorkbenchTab } from '../workbench.store';
import {
  AUTH_MODE_OPTIONS,
  BODY_MODE_OPTIONS,
  COMPLETE_POSITIONS,
  DIFF_CURRENT,
  GRANT_LABELS,
  type OverlayKind,
  POST_SCRIPT_PLACEHOLDER,
  PRE_SCRIPT_PLACEHOLDER,
  SCRIPT_SNIPPETS,
  type ScriptPane,
  type ScriptSnippet,
  SECTIONS,
  type SendState,
  SNIPPET_LANGS,
} from './request-editor.options';
import {
  atobSafe,
  countEnabled,
  lineCount,
  paneSlideVertical,
  parseQueryKeep,
  persistForm,
  withTrailingForm,
} from './request-editor-rows';

@Component({
  selector: 'tx-request-editor',
  standalone: true,
  imports: [
    OverlayModule,
    TxHintComponent,
    TxEmptyStateComponent,
    TxCheckComponent,
    TxInputComponent,
    TxTagsInputComponent,
    TxOverlayComponent,
    RequestKvTableComponent,
    PlaceholderHighlightComponent,
    TxSelectComponent,
    PlaceholderSuggestComponent,
    TokenFieldComponent,
    DocsEditorComponent,
    CodeEditorShellComponent,
    CodeHighlightComponent,
  ],
  templateUrl: './request-editor.component.html',
  styleUrls: ['../../collections/collection-folder-editor.component.scss', './request-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown)': 'handleHotkey($event)',
    '(document:mousedown)': 'handleDocumentDown($event)',
    '[class.is-readonly]': 'isReadonly()',
    '[class.is-resizing]': 'resizing()',
  },
  providers: [
    { provide: PLACEHOLDER_ORIGIN_HOST, useExisting: forwardRef(() => RequestEditorComponent) },
  ],
})
export class RequestEditorComponent implements PlaceholderOriginHost {
  readonly tab = input.required<WorkbenchTab>();
  private readonly collections = inject(CollectionsStore);
  private readonly environments = inject(EnvironmentsStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly dirtyTabs = inject(DirtyTabsRegistry);
  private readonly workbench = inject(WorkbenchStore);
  private readonly httpInflight = inject(HttpInflightRegistry);
  private readonly history = inject(HistoryStore);
  private readonly cookies = inject(CookieJarStore);
  readonly shell = inject(ShellStateService);
  private readonly helpContext = inject(HelpContextService);
  private readonly cookieAuth = inject(CookieAuthDialogService);
  private readonly injector = inject(Injector);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scriptArea = viewChild<ElementRef<HTMLTextAreaElement>>('scriptArea');
  private readonly scriptGutter = viewChild<ElementRef<HTMLElement>>('scriptGutter');
  private readonly bodyEditor = viewChild<CodeEditorShellComponent>('bodyEditor');
  private readonly gqlQueryEditor = viewChild<CodeEditorShellComponent>('gqlQueryEditor');
  private readonly gqlVarsEditor = viewChild<CodeEditorShellComponent>('gqlVarsEditor');

  readonly methodOptions: readonly TxSelectOption[] = HTTP_METHODS.map((value) => ({ value, label: value }));
  readonly authModeOptions = AUTH_MODE_OPTIONS;
  readonly bodyModeOptions = BODY_MODE_OPTIONS;
  readonly snippetLangOptions = SNIPPET_LANGS;
  readonly grantOptions: readonly TxSelectOption[] = OAUTH_GRANT_TYPES.map((value) => ({
    value,
    label: GRANT_LABELS[value],
  }));
  readonly apiKeyInOptions: readonly TxSelectOption[] = [
    { value: 'header', label: 'Header' },
    { value: 'query', label: 'Query' },
  ];
  readonly sections = SECTIONS;
  readonly responseTabLabel = responseTabLabel;
  readonly timelinePhases = TIMELINE_PHASES;
  readonly completePositions = COMPLETE_POSITIONS;

  readonly method = signal<HttpMethod>('GET');
  readonly url = signal('');
  readonly section = signal<RequestTabSection>('overview');
  readonly sectionSlideDir = signal<'left' | 'right' | null>(null);
  readonly responseTab = signal<RequestResponseTab>('pretty');
  readonly responseSlideDir = signal<'left' | 'right' | null>(null);
  readonly sendState = signal<SendState>('idle');
  readonly response = signal<MockResponse | null>(null);
  readonly splitRatio = signal(0.55);
  readonly splitRows = computed(() => {
    const request = Math.min(0.95, Math.max(0, this.splitRatio()));
    if (request <= 0.001)
      return '0px minmax(0, 1fr)';
    return `minmax(0, ${request}fr) minmax(0, ${1 - request}fr)`;
  });
  readonly pathParams = signal<MockKeyValue[]>([]);
  readonly queryParams = signal<MockKeyValue[]>([]);
  readonly headers = signal<MockKeyValue[]>([]);
  readonly bodyMode = signal<RequestBodyMode>('none');
  readonly bodyText = signal('');
  readonly graphqlQuery = signal('');
  readonly graphqlVariables = signal('{\n}\n');
  readonly graphqlOperation = signal('');
  readonly formRows = signal<RequestFormRow[]>([]);
  readonly binaryName = signal('');
  readonly binaryType = signal('application/octet-stream');
  readonly binaryBase64 = signal('');
  readonly authMode = signal<RequestAuthMode>('inherit');
  readonly auth = signal<CollectionFolderAuth>({ ...DEFAULT_FOLDER_AUTH });
  readonly authSlideDir = signal<'up' | 'down' | null>(null);
  readonly preRequest = signal('');
  readonly postResponse = signal('');
  readonly scriptPane = signal<ScriptPane>('pre');
  readonly scriptSlideDir = signal<'left' | 'right' | null>(null);
  readonly followRedirects = signal(true);
  readonly verifyTlsInherit = signal(true);
  readonly verifyTls = signal(true);
  readonly sendCookies = signal(true);
  readonly storeCookies = signal(true);
  readonly timeoutMs = signal('30000');
  readonly tags = signal<string[]>([]);
  readonly description = signal('');
  readonly docs = signal('');
  readonly docsMode = signal<FolderDocsMode>('split');
  readonly examples = signal<RequestExample[]>([]);
  readonly copied = signal(false);
  readonly sendError = signal<string | null>(null);
  readonly completeOpen = signal(false);
  readonly completeIndex = signal(0);
  readonly completeOrigin = signal<HTMLElement | null>(null);
  readonly completeItems = signal<readonly PlaceholderSuggestion[]>([]);
  readonly overlay = signal<OverlayKind>(null);
  readonly snippetLang = signal<'curl' | 'fetch' | 'httpie'>('curl');
  readonly overlayOrigin = computed(() => this.completeOrigin() ?? this.host.nativeElement);
  private completeField: 'url' | 'body' | 'script' = 'url';
  readonly resizing = signal(false);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private hydratedId = '';
  private abortId = '';
  private sendCancelled = false;
  private settingsDirty = false;
  private syncingUrl = false;
  readonly dirty = signal(false);
  readonly isManualSave = computed(() => isManualSaveMode(this.desktop.settings()));

  readonly isReadonly = computed(() => this.tab().kind === 'history' || this.tab().readonly === true);
  readonly bodyDisabled = computed(() => {
    const method = this.method();
    return method === 'GET' || method === 'HEAD';
  });
  readonly bodyLanguage = computed(() => codeEditorLanguageFromBodyMode(this.bodyMode()));
  readonly canFormatBody = computed(() => {
    if (this.bodyMode() === 'graphql')
      return true;
    return canFormatLanguage(this.bodyLanguage());
  });
  readonly paramCount = computed(() => countEnabled(this.pathParams()) + countEnabled(this.queryParams()));
  readonly headerCount = computed(() => countEnabled(this.headers()));
  readonly responseHidden = signal(false);
  readonly responseMoreOpen = signal(false);
  readonly urlIngestPreview = signal<UrlPasteIngestPreview | null>(null);
  readonly overviewOutcomes = signal<readonly SendOutcomeHint[]>([]);
  readonly hasResponseContent = computed(() => !!this.response() || this.sendState() === 'sending');
  readonly showResponsePane = computed(() => this.hasResponseContent() && !this.responseHidden());
  readonly responseTabLayout = computed((): ResponseTabLayoutInput => {
    const timing = this.responseTiming();
    const totalMs = timing.totalMs || this.response()?.durationMs || 0;
    return {
      hasTiming: totalMs > 0,
      runCount: this.runs().length,
      redirectCount: this.responseRedirects().length,
      canDiff: this.canShowDiff(),
    };
  });
  readonly primaryResponseTabs = computed(() => primaryResponseTabs(this.responseTabLayout()));
  readonly overflowResponseTabs = computed(() => overflowResponseTabs(this.responseTabLayout()));
  readonly responseMoreActive = computed(() => {
    const tab = this.responseTab();
    return this.overflowResponseTabs().includes(tab);
  });
  readonly networkSettingsLink = computed(() =>
    networkErrorSettingsLink(this.sendError() || this.response()?.statusText || ''),
  );
  readonly urlHasTokens = computed(() =>
    hasPlaceholderTokens(this.url(), this.completeVariables(), { pathParams: true }),
  );
  readonly prettyLanguage = computed(() => {
    const res = this.response();
    if (!res)
      return 'text' as const;
    return languageFromContentType(this.responseContentType(), res.body);
  });
  readonly pretty = computed(() => {
    if (this.responseTab() !== 'pretty')
      return '';
    const res = this.response();
    if (!res)
      return '';
    return formatResponseBody(res.body, this.prettyLanguage());
  });
  readonly responseContentType = computed(() => {
    return this.response()?.headers.find((row) => row.key.toLowerCase() === 'content-type')?.value ?? '';
  });
  readonly canPreview = computed(() => {
    const res = this.response();
    return !!res && canPreviewResponse(res.body, this.responseContentType());
  });
  readonly previewSrc = computed(() => {
    const res = this.response();
    if (!res || !this.canPreview())
      return null;
    return previewDocument(res.body);
  });
  readonly responseCookies = computed((): readonly CollectionCookie[] => {
    const res = this.response();
    if (res?.setCookies && res.setCookies.length > 0)
      return res.setCookies;
    return cookiesFromSetCookie(res?.headers ?? []).map((cookie, index) => ({
      id: `res-cookie-${index}`,
      enabled: true,
      name: cookie.name,
      value: cookie.value,
      domain: '',
      path: '/',
      expires: '',
      secure: false,
      httpOnly: false,
    }));
  });
  readonly jarCookies = computed(() => this.cookies.cookies());
  readonly responseTiming = computed(() => this.response()?.timing ?? defaultHttpTiming(this.response()?.durationMs ?? 0));
  readonly responseRedirects = computed(() => this.response()?.redirects ?? []);
  readonly runs = computed(() => this.workbench.runsFor(this.persistId()));
  readonly runGroups = computed(() => {
    const groups = new Map<string, RequestRunSnapshot[]>();
    const order: string[] = [];
    for (const run of this.runs()) {
      const label = historyDayLabel(run.at);
      const list = groups.get(label);
      if (list) {
        list.push(run);
        continue;
      }
      groups.set(label, [run]);
      order.push(label);
    }
    return order.map((label) => ({ label, runs: groups.get(label) ?? [] }));
  });
  readonly diffLeftId = signal<string | null>(null);
  readonly diffRightId = signal<string | null>(null);
  readonly diffSourceOptions = computed((): TxSelectOption[] => {
    const options: TxSelectOption[] = [];
    if (this.response())
      options.push({ value: DIFF_CURRENT, label: 'Current response' });
    for (const run of this.runs()) {
      options.push({
        value: run.id,
        label: `${run.status || 'ERR'} · ${this.formatRunTime(run.at)} · ${run.durationMs} ms`,
      });
    }
    return options;
  });
  readonly resolvedDiffLeftId = computed(() => this.resolveDiffSourceId(this.diffLeftId(), 'left'));
  readonly resolvedDiffRightId = computed(() => this.resolveDiffSourceId(this.diffRightId(), 'right'));
  readonly responseDiffRows = computed(() => {
    const left = this.diffBodyFor(this.resolvedDiffLeftId());
    const right = this.diffBodyFor(this.resolvedDiffRightId());
    if (!left && !right)
      return [];
    return diffSideBySide(left, right);
  });
  readonly responseHeaderDiffRows = computed(() => {
    const left = formatHeadersForDiff(this.diffHeadersFor(this.resolvedDiffLeftId()));
    const right = formatHeadersForDiff(this.diffHeadersFor(this.resolvedDiffRightId()));
    if (!left && !right)
      return [];
    return diffSideBySide(left, right);
  });
  readonly canShowDiff = computed(() => this.diffSourceOptions().length >= 2);
  readonly diffSameSource = computed(() => this.resolvedDiffLeftId() === this.resolvedDiffRightId());
  readonly lastRun = computed(() => this.runs()[0] ?? null);
  readonly pathLabel = computed(() => {
    const path = findNodePath(this.collections.tree(), this.tab().nodeId);
    if (!path || path.length < 2)
      return this.tab().title;
    return path.map((node) => node.name).join(' / ');
  });
  readonly scriptValue = computed(() => (this.scriptPane() === 'pre' ? this.preRequest() : this.postResponse()));
  readonly scriptLines = computed(() => lineCount(this.scriptValue()));
  readonly scriptLineNumbers = computed(() => Array.from({ length: this.scriptLines() }, (_, index) => index + 1));
  readonly snippets = computed(() => {
    const pane = this.scriptPane();
    return SCRIPT_SNIPPETS.filter((item) => item.pane === 'both' || item.pane === pane);
  });
  readonly scriptHint = computed(() => {
    return this.scriptPane() === 'pre'
      ? 'Runs locally before Send. Use tx or the Postman-shaped pm alias.'
      : 'Runs locally after the response. Assert with pm.test and read pm.response.';
  });
  readonly scriptHasTokens = computed(() =>
    hasPlaceholderTokens(this.scriptValue(), this.completeVariables()),
  );
  readonly scriptPlaceholder = computed(() => {
    return this.scriptPane() === 'pre' ? PRE_SCRIPT_PLACEHOLDER : POST_SCRIPT_PLACEHOLDER;
  });

  readonly sendPlan = computed(() => {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    const settings = this.desktop.settings();
    const timeout = Number.parseInt(this.timeoutMs(), 10);
    return planHttpSend({
      tree: this.collections.tree(),
      nodeId: this.persistId(),
      method: this.method(),
      url: this.url(),
      pathParams: persistMockRows(this.pathParams()),
      params: persistMockRows(this.queryParams()),
      headers: persistMockRows(this.headers()),
      body: this.bodyConfig(),
      authMode: this.authMode(),
      requestAuth: this.auth(),
      requestScripts: { preRequest: this.preRequest(), postResponse: this.postResponse() },
      requestSettings: this.settingsDirty
        ? {
            followRedirects: this.followRedirects(),
            verifyTlsInherit: this.verifyTlsInherit(),
            verifyTls: this.verifyTls(),
            sendCookies: this.sendCookies(),
            storeCookies: this.storeCookies(),
            timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
          }
        : undefined,
      abortId: this.abortId || undefined,
      envVars: env ? environmentVariableMap(env.variables) : {},
      defaultHeaders: settings.defaultHeaders ?? [],
      emailDomain: settings.placeholderEmailDomain,
      jarCookies: this.cookies.cookies(),
      workspaceVerifyTls: settings.certificates.verifyTls,
    });
  });

  readonly completeVariables = computed(() => {
    const names = new Set<string>();
    for (const origin of ancestorFolderOrigins(this.collections.tree(), this.persistId())) {
      for (const row of origin.config.variables) {
        if (row.enabled && row.key.trim())
          names.add(row.key.trim());
      }
    }
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    if (env) {
      for (const key of Object.keys(environmentVariableMap(env.variables)))
        names.add(key);
    }
    return [...names];
  });

  readonly variableOrigins = computed(() => {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    return winningVariableOrigins({
      folders: ancestorFolderOrigins(this.collections.tree(), this.persistId()).map((origin) => ({
        id: origin.id,
        name: origin.name,
        variables: origin.config.variables,
      })),
      environment: env ?? null,
    });
  });

  readonly apiKeyHeaderNames = computed(() => {
    const name = this.desktop.settings().defaultApiKeyHeader.trim();
    return name ? [name] : [];
  });

  readonly inheritedParams = computed(() => this.sendPlan().inheritedParams.map((row) => ({ ...row })));
  readonly inheritedHeaders = computed(() => {
    const origins = ancestorFolderOrigins(this.collections.tree(), this.persistId());
    return inheritedKvRows(
      [
        {
          source: 'Settings',
          sourceId: SETTINGS_KV_SOURCE_ID,
          rows: this.desktop.settings().defaultHeaders ?? [],
        },
        ...origins.map((origin) => ({ source: origin.name, sourceId: origin.id, rows: origin.config.headers })),
      ],
      persistMockRows(this.headers()),
    );
  });
  readonly inheritedAuthLabel = computed(() => {
    const auth = this.sendPlan().inheritedAuth;
    if (auth.type === 'none')
      return 'No folder auth';
    return `Inherited: ${auth.type}`;
  });
  readonly authSlideKey = computed(() => {
    const mode = this.authMode();
    if (mode === 'inherit' || mode === 'none')
      return mode;
    if (mode === 'oauth2')
      return `oauth2:${this.auth().grantType}`;
    return mode;
  });
  readonly snippetText = computed(() => {
    const plan = this.sendPlan();
    return snippetFor(this.snippetLang(), {
      method: plan.payload.method,
      url: plan.payload.url,
      headers: plan.payload.headers,
      body: plan.payload.body,
    });
  });
  readonly previewText = computed(() => {
    const plan = this.sendPlan();
    const headerLines = plan.payload.headers.map((row) => `${row.key}: ${row.value}`).join('\n');
    return `${plan.payload.method} ${plan.payload.url}\n${headerLines}${plan.payload.body ? `\n\n${plan.payload.body}` : ''}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.persistTimer)
        clearTimeout(this.persistTimer);
      if (this.copyTimer)
        clearTimeout(this.copyTimer);
      if (this.abortId)
        void this.desktop.api.http.abort(this.abortId);
      this.dirtyTabs.clear(this.tab().id);
    });
    effect(() => {
      const dirty = this.dirty();
      const manual = this.isManualSave();
      const tabId = this.tab().id;
      untracked(() => this.dirtyTabs.setDirty(tabId, manual && dirty));
    });
    effect(() => {
      const tab = this.tab();
      untracked(() => {
        if (tab.id === this.hydratedId)
          return;
        if (this.hydratedId && !isManualSaveMode(this.desktop.settings()))
          this.flushPersistNow();
        this.hydratedId = tab.id;
        this.hydrate(tab);
      });
    });
    effect(() => {
      const manual = isManualSaveMode(this.desktop.settings());
      untracked(() => {
        if (manual || !this.dirty())
          return;
        this.flushPersistNow();
        this.dirty.set(false);
      });
    });
  }

  persistId(): string {
    return this.tab().kind === 'history' ? this.tab().nodeId : this.tab().nodeId;
  }

  sectionCount(id: RequestTabSection): number {
    if (id === 'params')
      return this.paramCount();
    if (id === 'headers')
      return this.headerCount();
    if (id === 'scripts')
      return (this.preRequest().trim() ? 1 : 0) + (this.postResponse().trim() ? 1 : 0);
    if (id === 'docs')
      return this.docs().trim() ? 1 : 0;
    return 0;
  }

  handleSection(section: RequestTabSection): void {
    if (section === this.section())
      return;
    this.sectionSlideDir.set(requestSectionSlideDir(this.section(), section));
    this.section.set(section);
    this.workbench.patchTab(this.tab().id, { requestSection: section });
  }

  sectionPaneEnter(): string | undefined {
    return this.sectionSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  handleInherited(row: MockKeyValue, section: 'headers' | 'overview'): void {
    openInheritedKvSource(row.sourceId, section === 'overview' ? 'headers' : section, {
      collections: this.collections,
      workbench: this.workbench,
      shell: this.shell,
    });
  }

  handleInheritedAuth(): void {
    const path = findNodePath(this.collections.tree(), this.tab().nodeId);
    if (!path)
      return;
    for (let index = path.length - 2; index >= 0; index -= 1) {
      const node = path[index];
      if (node?.kind === 'folder') {
        this.workbench.openFromCollectionFolder(node, 'auth');
        return;
      }
    }
  }

  placeholderOrigins(): readonly PlaceholderOrigin[] {
    return this.variableOrigins();
  }

  openPlaceholder(activate: PlaceholderActivate): void {
    if (activate.kind === 'path') {
      this.handleSection('params');
      return;
    }
    openPlaceholderOrigin(activate, {
      collections: this.collections,
      workbench: this.workbench,
      environments: this.environments,
    });
  }

  handleMethodChange(value: string): void {
    if (this.isReadonly())
      return;
    const next = value as HttpMethod;
    if (!HTTP_METHODS.includes(next))
      return;
    this.method.set(next);
    this.collections.updateHttpMeta(this.tab().nodeId, { method: next });
    this.workbench.patchTab(this.tab().id, { method: next });
    this.persist();
  }

  handleUrlInput(event: Event): void {
    if (this.isReadonly())
      return;
    const inputEl = event.target;
    if (!(inputEl instanceof HTMLInputElement))
      return;
    this.applyUrl(inputEl.value);
    this.refreshComplete(inputEl, 'url', 'auto');
  }

  handleUrlPaste(event: ClipboardEvent): void {
    if (this.isReadonly())
      return;
    const text = event.clipboardData?.getData('text') ?? '';
    const preview = detectUrlPasteIngest(text);
    if (!preview)
      return;
    event.preventDefault();
    this.urlIngestPreview.set(preview);
  }

  applyUrlIngest(): void {
    const preview = this.urlIngestPreview();
    if (!preview)
      return;
    this.urlIngestPreview.set(null);
    if (preview.method) {
      this.method.set(preview.method);
      this.collections.updateHttpMeta(this.tab().nodeId, { method: preview.method });
      this.workbench.patchTab(this.tab().id, { method: preview.method });
    }
    if (preview.url)
      this.applyUrl(preview.url);
    if (preview.headers?.length)
      this.headers.set(withTrailingRow(preview.headers.map((row) => ({ ...row }))));
    if (preview.body) {
      this.bodyMode.set('json');
      this.bodyText.set(preview.body);
    }
    this.persist();
  }

  dismissUrlIngest(): void {
    this.urlIngestPreview.set(null);
  }

  toggleResponseMore(): void {
    this.responseMoreOpen.update((open) => !open);
  }

  closeResponseMore(): void {
    this.responseMoreOpen.set(false);
  }

  handleResponseMoreTab(tab: RequestResponseTab): void {
    this.closeResponseMore();
    this.handleResponseTab(tab);
  }

  handleOutcomeHint(hint: SendOutcomeHint): void {
    if (hint.action === 'auth') {
      this.handleSection('auth');
      return;
    }
    if (hint.action === 'body') {
      this.handleSection('body');
      return;
    }
    this.shell.selectRail('environments');
    this.shell.showSidebar();
  }

  private refreshOverviewOutcomes(
    response: MockResponse,
    plan: ReturnType<typeof planHttpSend>,
  ): void {
    this.overviewOutcomes.set(
      sendOutcomeHints({
        status: response.status,
        method: this.method(),
        url: plan.payload.url,
        headerValues: plan.payload.headers.map((row) => row.value),
        body: plan.payload.body ?? '',
      }),
    );
  }

  handleUrlClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    if (target.selectionStart !== target.selectionEnd)
      return;
    if (!shouldOpenPlaceholderOrigin(event))
      return;
    const part = segmentAtOffset(
      target.value,
      target.selectionStart ?? target.value.length,
      this.completeVariables(),
      {
        pathParams: true,
        origins: this.placeholderOrigins(),
      },
    );
    if (!part?.clickable || !part.originKind)
      return;
    this.openPlaceholder({
      kind: part.originKind,
      name: part.originName ?? '',
      sourceId: part.sourceId ?? '',
      sourceName: part.sourceName ?? '',
    });
  }

  handleUrlKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !this.completeOpen()) {
      event.preventDefault();
      void this.handleSend();
      return;
    }
    this.handleCompleteKey(event, 'url');
  }

  handleQuery(rows: MockKeyValue[]): void {
    if (this.isReadonly())
      return;
    this.queryParams.set(rows);
    this.syncingUrl = true;
    this.url.set(applyQueryToUrl(this.url(), persistMockRows(rows)));
    this.syncingUrl = false;
    this.persist();
  }

  handlePath(rows: MockKeyValue[]): void {
    if (this.isReadonly())
      return;
    this.pathParams.set(rows);
    this.persist();
  }

  handleHeaders(rows: MockKeyValue[]): void {
    if (this.isReadonly())
      return;
    this.headers.set(rows);
    this.persist();
  }

  handleBodyMode(value: string): void {
    if (this.isReadonly())
      return;
    if (!REQUEST_BODY_MODES.includes(value as RequestBodyMode))
      return;
    this.bodyMode.set(value as RequestBodyMode);
    this.persist();
  }

  handleBodyValue(value: string): void {
    if (this.isReadonly())
      return;
    this.bodyText.set(value);
    this.persist();
  }

  handleFormatBody(): void {
    if (this.isReadonly())
      return;
    this.bodyEditor()?.format();
    this.gqlQueryEditor()?.format();
    this.gqlVarsEditor()?.format();
  }

  handleGraphql(field: 'query' | 'variables' | 'operation', value: string): void {
    if (this.isReadonly())
      return;
    if (field === 'query')
      this.graphqlQuery.set(value);
    else if (field === 'variables')
      this.graphqlVariables.set(value);
    else
      this.graphqlOperation.set(value);
    this.persist();
  }

  handleFormKind(id: string, kind: string): void {
    if (this.isReadonly())
      return;
    this.formRows.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, kind: kind === 'file' ? 'file' : 'text' } : row)),
    );
    this.persist();
  }

  handleFormField(id: string, field: 'key' | 'value' | 'fileName' | 'contentType', value: string): void {
    if (this.isReadonly())
      return;
    this.formRows.update((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    this.formRows.update((rows) => withTrailingForm(rows));
    this.persist();
  }

  handleFormFile(id: string, event: Event): void {
    const inputEl = event.target;
    if (!(inputEl instanceof HTMLInputElement) || !inputEl.files?.[0])
      return;
    const file = inputEl.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const base64 = text.includes(',') ? text.slice(text.indexOf(',') + 1) : text;
      this.formRows.update((rows) =>
        rows.map((row) =>
          row.id === id
            ? { ...row, kind: 'file', fileName: file.name, contentType: file.type || row.contentType, value: atobSafe(base64) }
            : row,
        ),
      );
      this.formRows.update((rows) => withTrailingForm(rows));
      this.persist();
    };
    reader.readAsDataURL(file);
  }

  handleBinaryMeta(field: 'name' | 'type' | 'base64', value: string): void {
    if (this.isReadonly())
      return;
    if (field === 'name')
      this.binaryName.set(value);
    else if (field === 'type')
      this.binaryType.set(value);
    else
      this.binaryBase64.set(value);
    this.persist();
  }

  formValue(event: Event): string {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)
      return target.value;
    return '';
  }

  handleBinaryFile(event: Event): void {
    const inputEl = event.target;
    if (!(inputEl instanceof HTMLInputElement) || !inputEl.files?.[0])
      return;
    const file = inputEl.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const base64 = text.includes(',') ? text.slice(text.indexOf(',') + 1) : text;
      this.binaryName.set(file.name);
      this.binaryType.set(file.type || 'application/octet-stream');
      this.binaryBase64.set(base64);
      this.persist();
    };
    reader.readAsDataURL(file);
  }

  handleAuthMode(value: string): void {
    if (this.isReadonly())
      return;
    if (!REQUEST_AUTH_MODES.includes(value as RequestAuthMode))
      return;
    const next = value as RequestAuthMode;
    if (next !== this.authMode())
      this.authSlideDir.set(paneSlideVertical(REQUEST_AUTH_MODES, this.authMode(), next));
    this.authMode.set(next);
    if (next !== 'inherit' && next !== 'none')
      this.auth.update((auth) => ({ ...auth, type: next as CollectionFolderAuthType }));
    this.persist();
  }

  handleGrantType(value: string): void {
    if (this.isReadonly())
      return;
    if (!OAUTH_GRANT_TYPES.includes(value as OAuthGrantType))
      return;
    const grantType = value as OAuthGrantType;
    if (grantType !== this.auth().grantType)
      this.authSlideDir.set(paneSlideVertical(OAUTH_GRANT_TYPES, this.auth().grantType, grantType));
    this.auth.update((auth) => ({ ...auth, grantType }));
    this.persist();
  }

  handleApiKeyIn(value: string): void {
    if (this.isReadonly())
      return;
    this.auth.update((auth) => ({ ...auth, apiKeyIn: value === 'query' ? 'query' : 'header' }));
    this.persist();
  }

  authPaneEnter(): string | undefined {
    return this.authSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  handleAuthField<K extends keyof CollectionFolderAuth>(key: K, value: CollectionFolderAuth[K]): void {
    if (this.isReadonly())
      return;
    this.auth.update((auth) => ({ ...auth, [key]: value }));
    this.persist();
  }

  handleScriptPane(pane: ScriptPane): void {
    if (pane === this.scriptPane())
      return;
    this.scriptSlideDir.set(pane === 'post' ? 'right' : 'left');
    this.scriptPane.set(pane);
    this.workbench.patchTab(this.tab().id, { requestScriptPane: pane });
  }

  scriptPaneEnter(): string | undefined {
    return this.scriptSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  handleScriptInput(event: Event): void {
    if (this.isReadonly())
      return;
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    this.writeScript(target.value);
    this.refreshComplete(target, 'script', 'auto');
  }

  handleScriptKey(event: KeyboardEvent): void {
    if (this.handleCompleteKey(event, 'script'))
      return;
    if (this.isReadonly() || event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey)
      return;
    event.preventDefault();
    this.insertScript('  ');
  }

  handleScriptScroll(event: Event): void {
    const target = event.target;
    const gutter = this.scriptGutter()?.nativeElement;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    if (gutter)
      gutter.scrollTop = target.scrollTop;
    const highlight = target.parentElement?.querySelector('tx-placeholder-highlight');
    if (highlight instanceof HTMLElement)
      highlight.scrollTop = target.scrollTop;
  }

  handleInsertSnippet(snippet: ScriptSnippet): void {
    if (this.isReadonly())
      return;
    this.insertScript(snippet.code);
  }

  handleClearScript(): void {
    if (this.isReadonly())
      return;
    this.writeScript('');
  }

  handleSetting(field: 'followRedirects' | 'verifyTls' | 'sendCookies' | 'storeCookies', checked: boolean): void {
    if (this.isReadonly())
      return;
    this.settingsDirty = true;
    if (field === 'verifyTls')
      this.verifyTlsInherit.set(false);
    this[field].set(checked);
    this.persist();
  }

  handleVerifyTlsInherit(checked: boolean): void {
    if (this.isReadonly())
      return;
    this.settingsDirty = true;
    this.verifyTlsInherit.set(checked);
    this.persist();
  }

  openNetworkSettingsLink(): void {
    const link = this.networkSettingsLink();
    if (!link)
      return;
    this.shell.openSettings(link.category, link.highlightId);
  }

  handleTimeout(value: string): void {
    if (this.isReadonly())
      return;
    this.settingsDirty = true;
    this.timeoutMs.set(value);
    this.persist();
  }

  handleTagsChange(tags: readonly string[]): void {
    if (this.isReadonly())
      return;
    this.tags.set([...tags]);
    this.persist();
  }

  handleDescription(value: string): void {
    if (this.isReadonly())
      return;
    this.description.set(value);
    this.persist();
  }

  handleDocsMode(mode: FolderDocsMode): void {
    this.docsMode.set(mode);
    this.workbench.patchTab(this.tab().id, { requestDocsMode: mode });
  }

  handleDocsValue(value: string): void {
    if (this.isReadonly())
      return;
    this.docs.set(value);
    this.persist();
  }

  handleHotkey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter')
      return;
    event.preventDefault();
    void this.handleSend();
  }

  handleCompletePick(item: PlaceholderSuggestion): void {
    this.applyComplete(item);
  }

  handleDocumentDown(event: Event): void {
    const target = event.target;
    if (this.responseMoreOpen()) {
      if (target instanceof Element && !target.closest('.tx-request-editor__response-more'))
        this.closeResponseMore();
    }
    if (!this.completeOpen())
      return;
    if (!(target instanceof Node))
      return;
    if (this.completeOrigin()?.contains(target))
      return;
    if (target instanceof Element && target.closest('.tx-placeholder-suggest'))
      return;
    this.closeComplete();
  }

  async handleSend(): Promise<void> {
    if (this.sendState() === 'sending') {
      this.sendCancelled = true;
      if (this.abortId)
        await this.desktop.api.http.abort(this.abortId);
      return;
    }
    this.abortId = globalThis.crypto?.randomUUID?.() ?? `abort_${Date.now()}`;
    this.httpInflight.register(this.tab().id, this.abortId);
    this.sendCancelled = false;
    this.sendState.set('sending');
    this.sendError.set(null);
    this.overviewOutcomes.set([]);
    this.revealResponse();
    try {
      let plan = this.sendPlan();
      if (this.sendCancelled) {
        this.markCancelled();
        return;
      }
      if (plan.needsRefresh) {
        const refreshed = await this.desktop.api.oauth.refresh({
          grantType: 'authorization_code',
          pkce: true,
          authUrl: plan.payload.auth.authUrl,
          tokenUrl: plan.payload.auth.tokenUrl,
          deviceAuthUrl: plan.payload.auth.deviceAuthUrl,
          clientId: plan.payload.auth.clientId,
          clientSecret: plan.payload.auth.clientSecret,
          scope: plan.payload.auth.scope,
          audience: plan.payload.auth.audience,
          redirectUri: plan.payload.auth.redirectUri,
          username: plan.payload.auth.username,
          password: plan.payload.auth.password,
          refreshToken: plan.payload.auth.refreshToken,
          verifyTls: plan.payload.verifyTls,
          timeoutMs: plan.payload.timeoutMs,
        });
        if (refreshed.ok) {
          this.persistRefreshedToken(
            refreshed.accessToken,
            refreshed.refreshToken,
            refreshed.expiresAt,
            refreshed.tokenType,
          );
          plan = this.sendPlan();
        }
      }
      if (this.sendCancelled) {
        this.markCancelled();
        return;
      }
      const result = await this.desktop.api.http.execute({ ...plan.payload, abortId: this.abortId });
      if (plan.storeCookies && result.setCookies.length > 0)
        await this.cookies.merge(result.setCookies);
      const response: MockResponse = {
        status: result.status,
        statusText: result.statusText || (result.error ? 'Error' : ''),
        durationMs: result.durationMs,
        sizeLabel: result.sizeLabel,
        body: result.error && !result.body ? result.error : result.body,
        headers: result.headers.map((row, index) => ({
          id: `res-${index}`,
          key: row.key,
          value: row.value,
          enabled: true,
          description: '',
        })),
        url: result.url,
        httpVersion: result.httpVersion,
        timing: result.timing,
        redirects: result.redirects,
        setCookies: result.setCookies,
      };
      this.response.set(response);
      this.sendError.set(result.error);
      this.refreshOverviewOutcomes(response, plan);
      this.responseSlideDir.set(null);
      this.responseTab.set('pretty');
      const status = result.error && result.status === 0 ? null : result.status;
      this.workbench.patchTab(this.tab().id, { status: status ?? result.status, url: this.url() });
      if (this.tab().kind === 'http')
        this.collections.updateHttpMeta(this.tab().nodeId, { status: result.status || null });
      const snapshot = redactSnapshot({
        id: globalThis.crypto?.randomUUID?.() ?? `run_${Date.now()}`,
        at: new Date().toISOString(),
        method: this.method(),
        url: result.url || plan.payload.url,
        status: result.status,
        statusText: response.statusText,
        durationMs: result.durationMs,
        sizeLabel: result.sizeLabel,
        error: result.error,
        requestHeaders: plan.payload.headers,
        requestBody: plan.payload.body,
        responseHeaders: result.headers,
        responseBody: response.body,
        httpVersion: result.httpVersion,
        timing: result.timing,
        redirects: result.redirects,
        setCookies: result.setCookies,
      });
      if (this.tab().kind === 'http')
        this.workbench.prependRun(this.tab().nodeId, snapshot);
      const historyEntry: HistoryEntry = {
        ...snapshot,
        requestId: this.tab().kind === 'http' ? this.tab().nodeId : snapshot.id,
        requestName: this.tab().title,
        workspaceId: '',
      };
      await this.history.append(historyEntry);
    } catch (error) {
      this.sendError.set(error instanceof Error ? error.message : 'Request failed.');
      this.response.set({
        status: 0,
        statusText: 'Error',
        durationMs: 0,
        sizeLabel: '0 B',
        body: this.sendError() ?? 'Request failed.',
        headers: [],
      });
    } finally {
      this.sendState.set('done');
      this.httpInflight.clear(this.tab().id);
      this.abortId = '';
    }
  }

  private markCancelled(): void {
    this.sendError.set('Request cancelled.');
    this.response.set({
      status: 0,
      statusText: 'Cancelled',
      durationMs: 0,
      sizeLabel: '0 B',
      body: 'Request cancelled.',
      headers: [],
    });
  }

  handleRestoreRun(run: RequestRunSnapshot): void {
    this.response.set({
      status: run.status,
      statusText: run.statusText,
      durationMs: run.durationMs,
      sizeLabel: run.sizeLabel,
      body: run.responseBody,
      headers: run.responseHeaders.map((row, index) => ({
        id: `run-${index}`,
        key: row.key,
        value: row.value,
        enabled: true,
        description: '',
      })),
      url: run.url,
      httpVersion: run.httpVersion,
      timing: run.timing,
      redirects: run.redirects,
      setCookies: run.setCookies,
    });
    this.sendState.set('done');
    this.responseSlideDir.set(null);
    this.responseTab.set('pretty');
    this.revealResponse();
  }

  handleDiffLeft(value: string): void {
    this.diffLeftId.set(value);
  }

  handleDiffRight(value: string): void {
    this.diffRightId.set(value);
  }

  handleComparePrevious(): void {
    const runs = this.runs();
    if (runs.length >= 2) {
      this.diffLeftId.set(runs[1]!.id);
      this.diffRightId.set(runs[0]!.id);
    } else if (runs.length === 1 && this.response()) {
      this.diffLeftId.set(runs[0]!.id);
      this.diffRightId.set(DIFF_CURRENT);
    } else {
      return;
    }
    this.handleResponseTab('diff');
  }

  formatRunWhen(iso: string): string {
    return formatHistoryDateTime(iso);
  }

  formatRunTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
      return '—';
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  runTone(run: RequestRunSnapshot): 'ok' | 'err' | 'warn' | 'muted' {
    if (run.error || run.status <= 0)
      return 'err';
    if (run.status >= 400)
      return 'warn';
    if (run.status >= 200 && run.status < 300)
      return 'ok';
    return 'muted';
  }

  private resolveDiffSourceId(chosen: string | null, side: 'left' | 'right'): string {
    const runs = this.runs();
    const hasCurrent = Boolean(this.response());
    const isValid = (id: string) =>
      id === DIFF_CURRENT ? hasCurrent : runs.some((run) => run.id === id);
    if (chosen && isValid(chosen))
      return chosen;
    if (side === 'left')
      return runs[1]?.id ?? runs[0]?.id ?? (hasCurrent ? DIFF_CURRENT : '');
    if (hasCurrent)
      return DIFF_CURRENT;
    return runs[0]?.id ?? '';
  }

  private diffBodyFor(id: string): string {
    if (!id)
      return '';
    if (id === DIFF_CURRENT)
      return this.response()?.body ?? '';
    return this.runs().find((run) => run.id === id)?.responseBody ?? '';
  }

  private diffHeadersFor(id: string): readonly { key: string; value: string }[] {
    if (!id)
      return [];
    if (id === DIFF_CURRENT) {
      return (this.response()?.headers ?? []).map((row) => ({
        key: row.key,
        value: row.value,
      }));
    }
    return this.runs().find((run) => run.id === id)?.responseHeaders ?? [];
  }

  handleRestoreExample(example: RequestExample): void {
    this.response.set({
      status: example.status,
      statusText: example.statusText,
      durationMs: example.durationMs,
      sizeLabel: example.sizeLabel,
      body: example.body,
      headers: example.headers.map((row, index) => ({
        id: `ex-${index}`,
        key: row.key,
        value: row.value,
        enabled: true,
        description: '',
      })),
    });
    this.sendState.set('done');
    this.responseSlideDir.set(null);
    this.responseTab.set('pretty');
    this.revealResponse();
  }

  handleSaveExample(): void {
    if (this.isReadonly())
      return;
    const res = this.response();
    if (!res)
      return;
    const example: RequestExample = {
      id: globalThis.crypto?.randomUUID?.() ?? `ex_${Date.now()}`,
      name: `Example ${this.examples().length + 1}`,
      at: new Date().toISOString(),
      method: this.method(),
      url: this.url(),
      status: res.status,
      statusText: res.statusText,
      durationMs: res.durationMs,
      sizeLabel: res.sizeLabel,
      headers: res.headers.map((row) => ({ key: row.key, value: row.value })),
      body: res.body,
    };
    this.examples.update((items) => [example, ...items]);
    this.persist();
  }

  handleCopy(): void {
    const body =
      this.responseTab() === 'pretty'
        ? this.pretty()
        : this.responseTab() === 'headers'
          ? (this.response()?.headers.map((row) => `${row.key}: ${row.value}`).join('\n') ?? '')
          : this.responseTab() === 'cookies'
            ? this.responseCookies().map((cookie) => `${cookie.name}=${cookie.value}`).join('\n')
            : this.response()?.body;
    if (!body || !navigator.clipboard)
      return;
    void navigator.clipboard.writeText(body).then(() => {
      this.copied.set(true);
      if (this.copyTimer)
        clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copied.set(false);
        this.copyTimer = null;
      }, 1200);
    });
  }

  handleOverlay(kind: OverlayKind): void {
    this.overlay.set(kind);
  }

  handleSnippetLang(value: string): void {
    if (value !== 'curl' && value !== 'fetch' && value !== 'httpie')
      return;
    this.snippetLang.set(value);
    this.workbench.patchTab(this.tab().id, { requestSnippetLang: value });
  }

  handleResponseTab(tab: RequestResponseTab): void {
    if (tab === this.responseTab())
      return;
    this.responseSlideDir.set(requestResponseTabSlideDir(this.responseTab(), tab));
    this.responseTab.set(tab);
    this.workbench.patchTab(this.tab().id, { requestResponseTab: tab });
  }

  responsePaneEnter(): string | undefined {
    return this.responseSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  handleRemoveJarCookie(id: string): void {
    void this.cookies.remove(id);
  }

  openCookieJar(): void {
    this.cookieAuth.show();
  }

  handleWhatsThis(topic: 'body' | 'auth' | 'cookies'): void {
    if (topic === 'body')
      this.helpContext.openArticle('workbench', 'workbench-editors');
    if (topic === 'auth')
      this.helpContext.openArticle('collections', 'collection-folder');
    if (topic === 'cookies')
      this.helpContext.openArticle('workbench', 'workbench-editors');
  }

  hopShare(durationMs = 0): number {
    return timelineShare(durationMs || 0, this.responseTiming().totalMs || this.response()?.durationMs || 1);
  }

  redirectTarget(location: string): string {
    try {
      const parsed = new URL(location);
      return `${parsed.host}${parsed.pathname}${parsed.search}`;
    } catch {
      return location;
    }
  }

  cookieFlags(cookie: { readonly secure?: boolean; readonly httpOnly?: boolean }): string {
    const flags: string[] = [];
    if (cookie.secure)
      flags.push('Secure');
    if (cookie.httpOnly)
      flags.push('HttpOnly');
    return flags.join(' ');
  }

  hideResponse(): void {
    this.responseHidden.set(true);
    this.workbench.setResultsDockHidden(this.tab().nodeId, true);
    this.workbench.patchTab(this.tab().id, { requestResponseHidden: true });
  }

  revealResponse(): void {
    if (!this.responseHidden())
      return;
    this.responseHidden.set(false);
    this.workbench.setResultsDockHidden(this.tab().nodeId, false);
    this.workbench.patchTab(this.tab().id, { requestResponseHidden: false });
  }

  toggleResponse(): void {
    if (this.responseHidden())
      this.revealResponse();
    else
      this.hideResponse();
  }

  handleResizeStart(event: PointerEvent): void {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'button, a, input, select, textarea, label, [role="tab"], .tx-hint, .tx-select',
      )
    )
      return;
    event.preventDefault();
    const origin = event.currentTarget;
    if (!(origin instanceof HTMLElement))
      return;
    const shell = origin.closest('.tx-request-editor');
    const request = shell?.querySelector('.tx-request-editor__request');
    const consoleStage = shell?.querySelector('.tx-request-editor__console-stage');
    if (!(shell instanceof HTMLElement) || !(request instanceof HTMLElement) || !(consoleStage instanceof HTMLElement))
      return;
    this.resizing.set(true);
    const top = request.getBoundingClientRect().top;
    const height = consoleStage.getBoundingClientRect().bottom - top;
    const minRequestPx = 0;
    const minResponsePx = 72;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = (moveEvent: PointerEvent): void => {
      if (!this.resizing() || height <= 0)
        return;
      const maxRequestPx = Math.max(minRequestPx, height - minResponsePx);
      const requestPx = Math.min(maxRequestPx, Math.max(minRequestPx, moveEvent.clientY - top));
      this.splitRatio.set(requestPx / height);
    };
    const onUp = (): void => {
      this.resizing.set(false);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      this.workbench.patchTab(this.tab().id, { requestSplitRatio: this.splitRatio() });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  statusTone(status: number): string {
    if (status >= 500)
      return 'error';
    if (status >= 400)
      return 'warn';
    if (status >= 300)
      return 'redirect';
    if (status > 0)
      return 'ok';
    return 'idle';
  }

  private applyUrl(value: string): void {
    this.url.set(value);
    if (this.syncingUrl)
      return;
    this.pathParams.set(withTrailingRow(syncPathParams(value, persistMockRows(this.pathParams()))));
    this.queryParams.set(withTrailingRow(parseQueryKeep(value, persistMockRows(this.queryParams()))));
    this.workbench.patchTab(this.tab().id, { url: value });
    this.persist();
  }

  private bodyConfig(): RequestBody {
    return {
      mode: this.bodyMode(),
      text: this.bodyText(),
      graphql: {
        query: this.graphqlQuery(),
        variables: this.graphqlVariables(),
        operationName: this.graphqlOperation(),
      },
      formRows: persistForm(this.formRows()),
      binary: {
        fileName: this.binaryName(),
        contentType: this.binaryType(),
        base64: this.binaryBase64(),
      },
    };
  }

  private writeScript(value: string): void {
    if (this.scriptPane() === 'pre')
      this.preRequest.set(value);
    else
      this.postResponse.set(value);
    this.persist();
  }

  private insertScript(text: string): void {
    const area = this.scriptArea()?.nativeElement ?? null;
    const current = this.scriptValue();
    if (!area) {
      this.commitScript(current.endsWith('\n') || current.length === 0 ? current + text : `${current}\n${text}`);
      return;
    }
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const next = current.slice(0, start) + text + current.slice(end);
    this.commitScript(next, { start: start + text.length, end: start + text.length }, area);
  }

  private commitScript(
    value: string,
    selection?: { start: number; end: number },
    area?: HTMLTextAreaElement,
  ): void {
    this.writeScript(value);
    if (!area || !selection)
      return;
    queueMicrotask(() => {
      area.focus();
      area.setSelectionRange(selection.start, selection.end);
    });
  }

  persist(): void {
    if (this.isReadonly() || this.tab().kind !== 'http')
      return;
    if (isManualSaveMode(this.desktop.settings())) {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
      this.dirty.set(true);
      return;
    }
    if (this.persistTimer)
      clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flushPersistNow();
    }, 250);
  }

  saveDraft(): void {
    if (this.isReadonly() || this.tab().kind !== 'http' || !this.dirty())
      return;
    this.flushPersistNow();
    this.dirty.set(false);
  }

  discardDraft(): void {
    if (this.isReadonly() || !this.dirty())
      return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.hydrate(this.tab());
    this.dirty.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (!isModKey(event, 's'))
      return;
    if (isEditableKeyboardTarget(event.target))
      return;
    if (this.tab().kind !== 'http' || this.isReadonly())
      return;
    if (!shouldHandleManualSaveHotkey({ settings: this.desktop.settings(), dirty: this.dirty() }))
      return;
    event.preventDefault();
    this.saveDraft();
  }

  private flushPersistNow(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.isReadonly() || this.tab().kind !== 'http')
      return;
    const timeout = Number.parseInt(this.timeoutMs(), 10);
    const config = parseCollectionRequestConfig({
      url: this.url(),
      pathParams: persistMockRows(this.pathParams()),
      queryParams: persistMockRows(this.queryParams()),
      headers: persistMockRows(this.headers()),
      authMode: this.authMode(),
      auth: this.auth(),
      body: this.bodyConfig(),
      scripts: { preRequest: this.preRequest(), postResponse: this.postResponse() },
      settings: this.settingsDirty
        ? {
            followRedirects: this.followRedirects(),
            verifyTlsInherit: this.verifyTlsInherit(),
            verifyTls: this.verifyTls(),
            sendCookies: this.sendCookies(),
            storeCookies: this.storeCookies(),
            timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
          }
        : undefined,
      tags: this.tags(),
      description: this.description(),
      docs: this.docs(),
      examples: this.examples(),
    });
    this.collections.updateHttpConfig(this.tab().nodeId, config);
  }

  private hydrate(tab: WorkbenchTab): void {
    this.dirty.set(false);
    this.sectionSlideDir.set(null);
    this.responseSlideDir.set(null);
    this.authSlideDir.set(null);
    this.copied.set(false);
    this.sendError.set(null);
    this.overlay.set(null);
    this.closeComplete();
    if (tab.requestSection)
      this.section.set(tab.requestSection);
    else
      this.section.set('overview');
    this.scriptPane.set(tab.requestScriptPane === 'post' ? 'post' : 'pre');
    this.docsMode.set(tab.requestDocsMode === 'write' || tab.requestDocsMode === 'preview' ? tab.requestDocsMode : 'split');
    this.splitRatio.set(Math.min(0.95, Math.max(0, tab.requestSplitRatio ?? 0.55)));
    this.responseTab.set(tab.requestResponseTab ?? 'pretty');
    this.snippetLang.set(
      tab.requestSnippetLang === 'fetch' || tab.requestSnippetLang === 'httpie' ? tab.requestSnippetLang : 'curl',
    );
    if (tab.kind === 'history') {
      this.responseHidden.set(tab.requestResponseHidden === true);
      const entry = this.history.entryById(tab.nodeId);
      this.method.set(tab.method ?? entry?.method ?? 'GET');
      this.url.set(entry?.url || tab.url);
      this.pathParams.set(withTrailingRow(syncPathParams(this.url(), [])));
      this.queryParams.set(withTrailingRow(parseQueryKeep(this.url(), [])));
      this.headers.set(withTrailingRow(entry?.requestHeaders.map((row, index) => ({
        id: `h${index}`,
        key: row.key,
        value: row.value,
        enabled: true,
        description: '',
      })) ?? []));
      this.bodyMode.set('json');
      this.bodyText.set(entry?.requestBody ?? '');
      this.authMode.set('inherit');
      this.auth.set({ ...DEFAULT_FOLDER_AUTH });
      if (entry) {
        this.response.set({
          status: entry.status,
          statusText: entry.statusText,
          durationMs: entry.durationMs,
          sizeLabel: entry.sizeLabel,
          body: entry.responseBody,
          headers: entry.responseHeaders.map((row, index) => ({
            id: `rh${index}`,
            key: row.key,
            value: row.value,
            enabled: true,
            description: '',
          })),
          url: entry.url,
          httpVersion: entry.httpVersion,
          timing: entry.timing,
          redirects: entry.redirects,
          setCookies: entry.setCookies,
        });
        this.sendState.set('done');
      } else {
        this.response.set(null);
        this.sendState.set('idle');
      }
      return;
    }
    const node = this.collections.httpById(tab.nodeId);
    const config = node ? requestConfigOf(node) : parseCollectionRequestConfig({});
    const folderSettings = mergeFolderConfigs(ancestorFolderConfigs(this.collections.tree(), tab.nodeId)).settings;
    const seed = tab.replaySeed;
    this.method.set(node?.method ?? tab.method ?? 'GET');
    this.url.set(seed ? (tab.url || '') : (config.url || tab.url));
    this.pathParams.set(withTrailingRow(syncPathParams(seed ? tab.url : (config.url || tab.url), seed ? [] : config.pathParams)));
    this.queryParams.set(
      withTrailingRow(
        seed
          ? parseQueryKeep(tab.url, [])
          : config.queryParams.length
            ? config.queryParams
            : parseQueryKeep(config.url, []),
      ),
    );
    this.headers.set(
      withTrailingRow(
        seed
          ? seed.headers.map((row, index) => ({
              id: `seed-h${index}`,
              key: row.key,
              value: row.value,
              enabled: true,
              description: '',
            }))
          : config.headers,
      ),
    );
    this.bodyMode.set(seed ? 'json' : config.body.mode);
    this.bodyText.set(seed ? seed.body : config.body.text);
    this.graphqlQuery.set(config.body.graphql.query);
    this.graphqlVariables.set(config.body.graphql.variables);
    this.graphqlOperation.set(config.body.graphql.operationName);
    this.formRows.set(withTrailingForm(config.body.formRows));
    this.binaryName.set(config.body.binary.fileName);
    this.binaryType.set(config.body.binary.contentType);
    this.binaryBase64.set(config.body.binary.base64);
    this.authMode.set(config.authMode);
    this.auth.set({ ...config.auth });
    this.preRequest.set(config.scripts.preRequest);
    this.postResponse.set(config.scripts.postResponse);
    this.settingsDirty = !!config.settings;
    this.followRedirects.set(config.settings?.followRedirects ?? folderSettings.followRedirects);
    this.verifyTlsInherit.set(config.settings?.verifyTlsInherit ?? folderSettings.verifyTlsInherit);
    this.verifyTls.set(config.settings?.verifyTls ?? folderSettings.verifyTls);
    this.sendCookies.set(config.settings?.sendCookies ?? folderSettings.sendCookies);
    this.storeCookies.set(config.settings?.storeCookies ?? folderSettings.storeCookies);
    this.timeoutMs.set(String(config.settings?.timeoutMs ?? folderSettings.timeoutMs));
    this.tags.set([...config.tags]);
    this.description.set(config.description);
    this.docs.set(config.docs);
    this.examples.set([...config.examples]);
    const last = this.workbench.runsFor(tab.nodeId)[0];
    if (last) {
      this.response.set({
        status: last.status,
        statusText: last.statusText,
        durationMs: last.durationMs,
        sizeLabel: last.sizeLabel,
        body: last.responseBody,
        headers: last.responseHeaders.map((row, index) => ({
          id: `last-${index}`,
          key: row.key,
          value: row.value,
          enabled: true,
          description: '',
        })),
        url: last.url,
        httpVersion: last.httpVersion,
        timing: last.timing,
        redirects: last.redirects,
        setCookies: last.setCookies,
      });
      this.sendState.set('done');
    } else {
      this.response.set(null);
      this.sendState.set('idle');
    }
    // Prefer the tab's Hide/Open choice; fall back to per-node session prefs, then collapse when a run exists.
    this.responseHidden.set(
      tab.requestResponseHidden ??
        (this.workbench.resultsDockByNodeId()[tab.nodeId]
          ? this.workbench.isResultsDockHidden(tab.nodeId)
          : Boolean(last)),
    );
  }

  private persistRefreshedToken(
    accessToken: string,
    refreshToken: string,
    expiresAt: string,
    tokenType: string,
  ): void {
    if (this.authMode() !== 'inherit') {
      this.auth.update((auth) => ({
        ...auth,
        accessToken,
        token: accessToken,
        refreshToken: refreshToken || auth.refreshToken,
        expiresAt,
        tokenType: tokenType || auth.tokenType,
      }));
      this.persist();
      return;
    }
    const path = findNodePath(this.collections.tree(), this.tab().nodeId);
    if (!path)
      return;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const node = path[index];
      if (node.kind !== 'folder')
        continue;
      const config = folderConfigOf(node);
      if (config.auth.type !== 'oauth2')
        continue;
      this.collections.updateFolderConfig(node.id, {
        ...config,
        auth: {
          ...config.auth,
          accessToken,
          token: accessToken,
          refreshToken: refreshToken || config.auth.refreshToken,
          expiresAt,
          tokenType: tokenType || config.auth.tokenType,
        },
      });
      return;
    }
  }

  private handleCompleteKey(event: KeyboardEvent, field: 'url' | 'body' | 'script'): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement))
      return false;
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      this.refreshComplete(target, field, 'force');
      return true;
    }
    if (!this.completeOpen())
      return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveComplete(1);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveComplete(-1);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeComplete();
      return true;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const item = this.completeItems()[this.completeIndex()];
      if (item)
        this.applyComplete(item);
      else
        this.closeComplete();
      return true;
    }
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && field !== 'script') {
      event.preventDefault();
      const item = this.completeItems()[this.completeIndex()];
      if (item)
        this.applyComplete(item);
      else
        this.closeComplete();
      return true;
    }
    return false;
  }

  private refreshComplete(
    origin: HTMLInputElement | HTMLTextAreaElement,
    field: 'url' | 'body' | 'script',
    mode: 'auto' | 'force',
  ): void {
    const token = tokenAtCaret(origin.value, origin.selectionStart ?? origin.value.length);
    if (mode === 'auto' && token.kind === 'none') {
      if (this.completeOpen())
        this.closeComplete();
      return;
    }
    const items = suggestPlaceholders(
      origin.value,
      origin.selectionStart ?? origin.value.length,
      this.completeVariables(),
    );
    if (items.length === 0) {
      this.closeComplete();
      return;
    }
    const wasOpen = this.completeOpen();
    this.completeField = field;
    this.completeItems.set(items);
    this.completeIndex.set(wasOpen ? Math.min(this.completeIndex(), items.length - 1) : 0);
    this.completeOrigin.set(origin);
    this.completeOpen.set(true);
  }

  private moveComplete(delta: number): void {
    const count = this.completeItems().length;
    if (count === 0)
      return;
    this.completeIndex.set((this.completeIndex() + delta + count) % count);
  }

  private applyComplete(item: PlaceholderSuggestion): void {
    const origin = this.completeOrigin();
    if (!(origin instanceof HTMLInputElement || origin instanceof HTMLTextAreaElement)) {
      this.closeComplete();
      return;
    }
    const applied = applyPlaceholderSuggestion(
      origin.value,
      origin.selectionStart ?? origin.value.length,
      item.insert,
    );
    if (this.completeField === 'url')
      this.applyUrl(applied.value);
    else if (this.completeField === 'script')
      this.writeScript(applied.value);
    else {
      this.bodyText.set(applied.value);
      this.persist();
    }
    this.closeComplete();
    afterNextRender(
      () => {
        origin.focus();
        origin.setSelectionRange(applied.cursor, applied.cursor);
      },
      { injector: this.injector },
    );
  }

  private closeComplete(): void {
    this.completeOpen.set(false);
    this.completeOrigin.set(null);
  }
}
