import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  HostListener,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  COLLECTION_FOLDER_AUTH_TYPES,
  DEFAULT_FOLDER_CONFIG,
  DEFAULT_API_KEY_HEADER,
  OAUTH_GRANT_TYPES,
  SETTINGS_KV_SOURCE_ID,
  environmentVariableMap,
  findNodePath,
  folderConfigOf,
  inheritedKvRows,
  parentFolderOrigins,
  parseCollectionFolderConfig,
  type CollectionFolderAuth,
  type CollectionFolderAuthType,
  type CollectionFolderConfig,
  type CollectionKvRow,
  type OAuthClientConfig,
  type OAuthGrantType,
  type OAuthTokenResult,
} from '@testrix/contracts';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxEmptyStateComponent,
  TxHintComponent,
  TxInputComponent,
  TxSelectComponent,
  TxTagsInputComponent,
  type TxSelectOption,
} from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import { DirtyTabsRegistry } from '../../core/dirty-tabs.registry';
import { isManualSaveMode, shouldHandleManualSaveHotkey } from '../../core/save-mode';
import { isEditableKeyboardTarget, isModKey } from '../../core/selection-hotkeys';
import { ShellStateService } from '../../core/shell-state.service';
import { EnvironmentsStore } from '../environments/environments.store';
import { persistMockRows, withTrailingRow, type MockKeyValue } from '../workbench/request/request-mock';
import { RequestKvTableComponent } from '../workbench/request/request-kv-table.component';
import { TokenFieldComponent } from '../workbench/request/token-field.component';
import { PlaceholderHighlightComponent } from '../workbench/request/placeholder-highlight.component';
import { hasPlaceholderTokens } from '../workbench/request/placeholder-complete';
import { openInheritedKvSource } from '../workbench/request/inherited-source';
import {
  openPlaceholderOrigin,
  PLACEHOLDER_ORIGIN_HOST,
  winningVariableOrigins,
  type PlaceholderActivate,
  type PlaceholderOrigin,
  type PlaceholderOriginHost,
} from '../workbench/request/placeholder-origin';
import { WorkbenchStore, type WorkbenchTab } from '../workbench/workbench.store';
import { CollectionsStore } from './collections.store';
import { FolderDocsPreviewComponent } from './folder-docs-preview.component';

type FolderSubTab = 'overview' | 'variables' | 'headers' | 'auth' | 'scripts' | 'settings' | 'docs';
type ScriptPane = 'pre' | 'post';
type DocsMode = 'write' | 'split' | 'preview';

interface FolderSection {
  readonly id: FolderSubTab;
  readonly label: string;
}

interface ScriptSnippet {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly pane: ScriptPane | 'both';
  readonly code: string;
}

const FOLDER_SECTIONS: readonly FolderSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'variables', label: 'Variables' },
  { id: 'headers', label: 'Headers' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'settings', label: 'Settings' },
  { id: 'docs', label: 'Docs' },
];

const AUTH_LABELS: Record<CollectionFolderAuthType, string> = {
  none: 'No auth',
  bearer: 'Bearer token',
  basic: 'Basic',
  apikey: 'API key',
  digest: 'Digest',
  oauth2: 'OAuth 2.0',
};

const GRANT_LABELS: Record<OAuthGrantType, string> = {
  authorization_code: 'Authorization code',
  client_credentials: 'Client credentials',
  password: 'Password',
  device_code: 'Device code',
};

const SCRIPT_SNIPPETS: readonly ScriptSnippet[] = [
  {
    id: 'set-var',
    label: 'Set a variable',
    detail: 'tx.variables.set',
    pane: 'both',
    code: `tx.variables.set('token', 'value');\n`,
  },
  {
    id: 'get-var',
    label: 'Get a variable',
    detail: 'tx.variables.get',
    pane: 'both',
    code: `const token = tx.variables.get('token');\n`,
  },
  {
    id: 'add-header',
    label: 'Add a header',
    detail: 'tx.request.addHeader',
    pane: 'pre',
    code: `tx.request.addHeader('X-Request-Id', tx.variables.get('requestId') || '1');\n`,
  },
  {
    id: 'set-url',
    label: 'Set request URL',
    detail: 'tx.request.url',
    pane: 'pre',
    code: `tx.request.url = tx.request.url.replace('{{host}}', tx.variables.get('host'));\n`,
  },
  {
    id: 'set-body',
    label: 'Set JSON body',
    detail: 'tx.request.body',
    pane: 'pre',
    code: `tx.request.body = JSON.stringify({\n  ok: true,\n});\n`,
  },
  {
    id: 'status-200',
    label: 'Status is 200',
    detail: 'pm.test',
    pane: 'post',
    code: `pm.test('Status is 200', () => {\n  if (pm.response.code !== 200)\n    throw new Error('unexpected status ' + pm.response.code);\n});\n`,
  },
  {
    id: 'parse-json',
    label: 'Parse JSON body',
    detail: 'pm.response.json',
    pane: 'post',
    code: `const json = pm.response.json();\n`,
  },
  {
    id: 'save-id',
    label: 'Save a JSON field',
    detail: 'pm.variables.set',
    pane: 'post',
    code: `const json = pm.response.json();\nif (json && json.id)\n  pm.variables.set('id', json.id);\n`,
  },
  {
    id: 'header-exists',
    label: 'Response header exists',
    detail: 'pm.response.headers',
    pane: 'post',
    code: `const hasJson = pm.response.headers.some((row) => {\n  return row.key.toLowerCase() === 'content-type' && String(row.value).includes('json');\n});\nif (!hasJson)\n  throw new Error('expected JSON content-type');\n`,
  },
];

const DOCS_STARTER = `# Folder

What this group of requests is for.

## Auth

How callers authenticate.

## Notes

- Environments
- Known caveats
`;

const PRE_SCRIPT_PLACEHOLDER = '// Runs before Send\ntx.request.addHeader(\'X-Client\', \'testrix\');';
const POST_SCRIPT_PLACEHOLDER = '// Runs after the response\nif (pm.response.code !== 200)\n  throw new Error(\'unexpected status\');';
const DOCS_MODES: readonly DocsMode[] = ['write', 'split', 'preview'];

function paneSlideDir(order: readonly string[], from: string, to: string): 'left' | 'right' {
  return order.indexOf(to) > order.indexOf(from) ? 'right' : 'left';
}

function paneSlideVertical(order: readonly string[], from: string, to: string): 'up' | 'down' {
  return order.indexOf(to) > order.indexOf(from) ? 'down' : 'up';
}

function persistRows(rows: readonly MockKeyValue[]): CollectionKvRow[] {
  return persistMockRows(rows);
}

function toOAuthConfig(auth: CollectionFolderAuth, verifyTls: boolean, timeoutMs: number): OAuthClientConfig {
  return {
    grantType: auth.grantType,
    pkce: auth.pkce,
    authUrl: auth.authUrl,
    tokenUrl: auth.tokenUrl,
    deviceAuthUrl: auth.deviceAuthUrl,
    clientId: auth.clientId,
    clientSecret: auth.clientSecret,
    scope: auth.scope,
    audience: auth.audience,
    redirectUri: auth.redirectUri,
    username: auth.username,
    password: auth.password,
    refreshToken: auth.refreshToken,
    verifyTls,
    timeoutMs,
  };
}

function lineCount(text: string): number {
  return Math.max(1, text.split('\n').length);
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

@Component({
  selector: 'tx-collection-folder-editor',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxCheckComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
    TxTagsInputComponent,
    RequestKvTableComponent,
    TokenFieldComponent,
    PlaceholderHighlightComponent,
    FolderDocsPreviewComponent,
  ],
  templateUrl: './collection-folder-editor.component.html',
  styleUrl: './collection-folder-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: PLACEHOLDER_ORIGIN_HOST, useExisting: forwardRef(() => CollectionFolderEditorComponent) },
  ],
})
export class CollectionFolderEditorComponent implements PlaceholderOriginHost {
  readonly tab = input.required<WorkbenchTab>();
  private readonly store = inject(CollectionsStore);
  private readonly workbench = inject(WorkbenchStore);
  private readonly environments = inject(EnvironmentsStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly dirtyTabs = inject(DirtyTabsRegistry);
  private readonly shell = inject(ShellStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scriptArea = viewChild<ElementRef<HTMLTextAreaElement>>('scriptArea');
  private readonly docsArea = viewChild<ElementRef<HTMLTextAreaElement>>('docsArea');
  private readonly scriptGutter = viewChild<ElementRef<HTMLElement>>('scriptGutter');
  private readonly docsGutter = viewChild<ElementRef<HTMLElement>>('docsGutter');

  readonly sections = FOLDER_SECTIONS;
  readonly variableToken = '{{name}}';
  readonly section = signal<FolderSubTab>('overview');
  readonly sectionSlideDir = signal<'left' | 'right' | null>(null);
  readonly scriptPane = signal<ScriptPane>('pre');
  readonly scriptSlideDir = signal<'left' | 'right' | null>(null);
  readonly docsMode = signal<DocsMode>('split');
  readonly docsSlideDir = signal<'left' | 'right' | null>(null);
  readonly authSlideDir = signal<'up' | 'down' | null>(null);
  readonly showSecrets = signal(false);
  readonly oauthBusy = signal(false);
  readonly oauthMessage = signal<string | null>(null);
  readonly device = signal<{
    sessionId: string;
    userCode: string;
    verificationUri: string;
    interval: number;
  } | null>(null);

  readonly name = signal('');
  readonly childCount = signal(0);
  readonly tags = signal<string[]>([]);
  readonly description = signal('');
  readonly variables = signal<MockKeyValue[]>([]);
  readonly headers = signal<MockKeyValue[]>([]);
  readonly auth = signal<CollectionFolderAuth>(DEFAULT_FOLDER_CONFIG.auth);
  readonly preRequest = signal('');
  readonly postResponse = signal('');
  readonly followRedirects = signal(true);
  readonly verifyTlsInherit = signal(true);
  readonly verifyTls = signal(true);
  readonly sendCookies = signal(true);
  readonly storeCookies = signal(true);
  readonly timeoutMs = signal('30000');
  readonly docs = signal('');

  private hydratedId = '';
  private persistedParams: CollectionKvRow[] = [];
  private deviceTimer: ReturnType<typeof setInterval> | null = null;
  readonly dirty = signal(false);
  readonly isManualSave = computed(() => isManualSaveMode(this.desktop.settings()));

  readonly authOptions: readonly TxSelectOption[] = COLLECTION_FOLDER_AUTH_TYPES.map((value) => ({
    value,
    label: AUTH_LABELS[value],
  }));
  readonly grantOptions: readonly TxSelectOption[] = OAUTH_GRANT_TYPES.map((value) => ({
    value,
    label: GRANT_LABELS[value],
  }));
  readonly apiKeyInOptions: readonly TxSelectOption[] = [
    { value: 'header', label: 'Header' },
    { value: 'query', label: 'Query' },
  ];

  readonly variableCount = computed(() => this.variables().filter((row) => row.enabled && row.key.trim()).length);
  readonly headerCount = computed(() => this.headers().filter((row) => row.enabled && row.key.trim()).length);
  readonly scriptCount = computed(() => {
    return (this.preRequest().trim() ? 1 : 0) + (this.postResponse().trim() ? 1 : 0);
  });
  readonly childLabel = computed(() => {
    const count = this.childCount();
    return count === 1 ? '1 item' : `${count} items`;
  });
  readonly authLabel = computed(() => AUTH_LABELS[this.auth().type]);
  readonly pathLabel = computed(() => {
    const id = this.tab().nodeId;
    const path = findNodePath(this.store.tree(), id);
    if (!path)
      return '';
    const folders = path.filter((node) => node.kind === 'folder');
    if (folders.length < 2)
      return '';
    return folders
      .slice(0, -1)
      .map((node) => node.name)
      .join(' / ');
  });
  readonly inheritedVariables = computed(() =>
    inheritedKvRows(
      parentFolderOrigins(this.store.tree(), this.tab().nodeId).map((origin) => ({
        source: origin.name,
        sourceId: origin.id,
        rows: origin.config.variables,
      })),
      this.variables(),
    ),
  );
  readonly inheritedHeaders = computed(() =>
    inheritedKvRows(
      [
        {
          source: 'Settings',
          sourceId: SETTINGS_KV_SOURCE_ID,
          rows: this.desktop.settings().defaultHeaders ?? [],
        },
        ...parentFolderOrigins(this.store.tree(), this.tab().nodeId).map((origin) => ({
          source: origin.name,
          sourceId: origin.id,
          rows: origin.config.headers,
        })),
      ],
      this.headers(),
    ),
  );
  readonly completeVariables = computed(() => {
    const names = new Set<string>();
    for (const row of this.variables()) {
      if (row.enabled && row.key.trim())
        names.add(row.key.trim());
    }
    for (const origin of parentFolderOrigins(this.store.tree(), this.tab().nodeId)) {
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
    const tab = this.tab();
    return winningVariableOrigins({
      folders: [
        ...parentFolderOrigins(this.store.tree(), tab.nodeId).map((origin) => ({
          id: origin.id,
          name: origin.name,
          variables: origin.config.variables,
        })),
        {
          id: tab.nodeId,
          name: tab.title,
          variables: this.variables(),
        },
      ],
      environment: env ?? null,
    });
  });
  readonly scriptHasTokens = computed(() =>
    hasPlaceholderTokens(this.scriptValue(), this.completeVariables()),
  );
  readonly apiKeyHeaderNames = computed(() => {
    const name = this.desktop.settings().defaultApiKeyHeader.trim();
    return name ? [name] : [];
  });
  readonly expiryLabel = computed(() => {
    const expiresAt = this.auth().expiresAt;
    if (!expiresAt)
      return '';
    const at = Date.parse(expiresAt);
    if (Number.isNaN(at))
      return '';
    return at <= Date.now() ? `Expired ${expiresAt}` : `Expires ${expiresAt}`;
  });
  readonly scriptValue = computed(() => (this.scriptPane() === 'pre' ? this.preRequest() : this.postResponse()));
  readonly scriptLines = computed(() => lineCount(this.scriptValue()));
  readonly scriptLineNumbers = computed(() => Array.from({ length: this.scriptLines() }, (_, index) => index + 1));
  readonly docsLines = computed(() => lineCount(this.docs()));
  readonly docsLineNumbers = computed(() => Array.from({ length: this.docsLines() }, (_, index) => index + 1));
  readonly docsWords = computed(() => wordCount(this.docs()));
  readonly snippets = computed(() => {
    const pane = this.scriptPane();
    return SCRIPT_SNIPPETS.filter((item) => item.pane === 'both' || item.pane === pane);
  });
  readonly scriptHint = computed(() => {
    return this.scriptPane() === 'pre'
      ? 'Runs locally before Send. Use tx or the Postman-shaped pm alias.'
      : 'Runs locally after the response. Assert with pm.test and read pm.response.';
  });
  readonly scriptPlaceholder = computed(() => {
    return this.scriptPane() === 'pre' ? PRE_SCRIPT_PLACEHOLDER : POST_SCRIPT_PLACEHOLDER;
  });
  readonly authSlideKey = computed(() => {
    const auth = this.auth();
    return auth.type === 'oauth2' ? `oauth2:${auth.grantType}` : auth.type;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearDeviceTimer();
      this.dirtyTabs.clear(this.tab().id);
    });
    effect(() => {
      const dirty = this.dirty();
      const manual = this.isManualSave();
      const tabId = this.tab().id;
      untracked(() => this.dirtyTabs.setDirty(tabId, manual && dirty));
    });
    effect(() => {
      const id = this.tab().nodeId;
      untracked(() => {
        if (id === this.hydratedId)
          return;
        this.hydrate(id);
      });
    });
    effect(() => {
      const manual = isManualSaveMode(this.desktop.settings());
      untracked(() => {
        if (manual || !this.dirty())
          return;
        this.flushPersist();
        this.dirty.set(false);
      });
    });
    effect(() => {
      const wanted = this.tab().folderSection;
      if (!wanted || wanted === this.section())
        return;
      if (!FOLDER_SECTIONS.some((item) => item.id === wanted))
        return;
      untracked(() => {
        const from = FOLDER_SECTIONS.findIndex((item) => item.id === this.section());
        const to = FOLDER_SECTIONS.findIndex((item) => item.id === wanted);
        this.sectionSlideDir.set(to > from ? 'right' : 'left');
        this.section.set(wanted);
      });
    });
  }

  handleInherited(row: MockKeyValue, section: 'headers' | 'variables'): void {
    openInheritedKvSource(row.sourceId, section, {
      collections: this.store,
      workbench: this.workbench,
      shell: this.shell,
    });
  }

  sectionCount(id: FolderSubTab): number {
    if (id === 'variables')
      return this.variableCount();
    if (id === 'headers')
      return this.headerCount();
    if (id === 'scripts')
      return this.scriptCount();
    return 0;
  }

  handleSection(section: FolderSubTab): void {
    if (section === this.section())
      return;
    const from = FOLDER_SECTIONS.findIndex((item) => item.id === this.section());
    const to = FOLDER_SECTIONS.findIndex((item) => item.id === section);
    this.sectionSlideDir.set(to > from ? 'right' : 'left');
    this.section.set(section);
    this.workbench.patchTab(this.tab().id, {
      folderSection: section,
      ...(section === 'scripts' ? { folderScriptPane: this.scriptPane() } : {}),
      ...(section === 'docs' ? { folderDocsMode: this.docsMode() } : {}),
    });
  }

  placeholderOrigins(): readonly PlaceholderOrigin[] {
    return this.variableOrigins();
  }

  openPlaceholder(activate: PlaceholderActivate): void {
    if (activate.kind === 'path')
      return;
    if (activate.kind === 'folder' && activate.sourceId === this.tab().nodeId) {
      this.handleSection('variables');
      return;
    }
    openPlaceholderOrigin(activate, {
      collections: this.store,
      workbench: this.workbench,
      environments: this.environments,
    });
  }

  sectionPaneEnter(): string | undefined {
    return this.sectionSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  handleScriptPane(pane: ScriptPane): void {
    if (pane === this.scriptPane())
      return;
    this.scriptSlideDir.set(pane === 'post' ? 'right' : 'left');
    this.scriptPane.set(pane);
    this.workbench.patchTab(this.tab().id, { folderScriptPane: pane });
  }

  scriptPaneEnter(): string | undefined {
    return this.scriptSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  handleDocsMode(mode: DocsMode): void {
    if (mode === this.docsMode())
      return;
    this.docsSlideDir.set(paneSlideDir(DOCS_MODES, this.docsMode(), mode));
    this.docsMode.set(mode);
    this.workbench.patchTab(this.tab().id, { folderDocsMode: mode });
  }

  docsPaneEnter(): string | undefined {
    return this.docsSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  authPaneEnter(): string | undefined {
    return this.authSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  handleTagsChange(tags: readonly string[]): void {
    this.tags.set([...tags]);
    this.persist();
  }

  handleDescription(value: string): void {
    this.description.set(value);
    this.persist();
  }

  handleVariables(rows: MockKeyValue[]): void {
    this.variables.set(rows);
    this.persist();
  }

  handleHeaders(rows: MockKeyValue[]): void {
    this.headers.set(rows);
    this.persist();
  }

  handleAuthType(value: string): void {
    const type = value as CollectionFolderAuthType;
    if (type !== this.auth().type)
      this.authSlideDir.set(paneSlideVertical(COLLECTION_FOLDER_AUTH_TYPES, this.auth().type, type));
    if (type !== 'apikey') {
      this.patchAuth({ type });
      return;
    }
    const current = this.auth().apiKeyHeader.trim();
    const fallback = this.desktop.settings().defaultApiKeyHeader.trim() || DEFAULT_API_KEY_HEADER;
    this.patchAuth({
      type,
      apiKeyHeader: !current || current === DEFAULT_API_KEY_HEADER ? fallback : current,
    });
  }

  handleGrantType(value: string): void {
    const grantType = value as OAuthGrantType;
    if (grantType !== this.auth().grantType)
      this.authSlideDir.set(paneSlideVertical(OAUTH_GRANT_TYPES, this.auth().grantType, grantType));
    this.patchAuth({ grantType });
  }

  handleApiKeyIn(value: string): void {
    this.patchAuth({ apiKeyIn: value === 'query' ? 'query' : 'header' });
  }

  handleAuthField<K extends keyof CollectionFolderAuth>(key: K, value: CollectionFolderAuth[K]): void {
    this.patchAuth({ [key]: value } as Partial<CollectionFolderAuth>);
  }

  handlePkce(checked: boolean): void {
    this.patchAuth({ pkce: checked });
  }

  handleToggleSecrets(): void {
    this.showSecrets.update((value) => !value);
  }

  handleScriptInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    this.writeScript(target.value);
  }

  handleScriptKey(event: KeyboardEvent): void {
    this.handleEditorTab(event, 'script');
  }

  handleScriptScroll(event: Event): void {
    this.syncGutter(event, this.scriptGutter()?.nativeElement);
  }

  handleInsertSnippet(snippet: ScriptSnippet): void {
    this.insertIntoEditor('script', snippet.code);
  }

  handleClearScript(): void {
    this.writeScript('');
  }

  handleFollowRedirects(checked: boolean): void {
    this.followRedirects.set(checked);
    this.persist();
  }

  handleVerifyTlsInherit(checked: boolean): void {
    this.verifyTlsInherit.set(checked);
    this.persist();
  }

  handleVerifyTls(checked: boolean): void {
    this.verifyTlsInherit.set(false);
    this.verifyTls.set(checked);
    this.persist();
  }

  handleSendCookies(checked: boolean): void {
    this.sendCookies.set(checked);
    this.persist();
  }

  handleStoreCookies(checked: boolean): void {
    this.storeCookies.set(checked);
    this.persist();
  }

  handleTimeout(value: string): void {
    this.timeoutMs.set(value);
    this.persist();
  }

  handleDocsInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    this.docs.set(target.value);
    this.persist();
  }

  handleDocsKey(event: KeyboardEvent): void {
    this.handleEditorTab(event, 'docs');
  }

  handleDocsScroll(event: Event): void {
    this.syncGutter(event, this.docsGutter()?.nativeElement);
  }

  handleDocsWrap(before: string, after = '', placeholder = 'text'): void {
    this.wrapEditor('docs', before, after, placeholder);
  }

  handleDocsInsert(text: string): void {
    this.insertIntoEditor('docs', text);
  }

  handleDocsHeading(level: 1 | 2): void {
    this.insertIntoEditor('docs', `${'#'.repeat(level)} Heading\n\n`);
  }

  handleDocsTemplate(): void {
    if (this.docs().trim()) {
      this.insertIntoEditor('docs', `\n${DOCS_STARTER}`);
      return;
    }
    this.docs.set(DOCS_STARTER);
    this.persist();
  }

  async handleGetToken(): Promise<void> {
    if (this.oauthBusy())
      return;
    const auth = this.auth();
    const config = toOAuthConfig(auth, this.verifyTls(), Number(this.timeoutMs()) || 30000);
    this.oauthMessage.set(null);
    if (auth.grantType === 'device_code') {
      await this.startDevice(config);
      return;
    }
    this.oauthBusy.set(true);
    try {
      const result =
        auth.grantType === 'authorization_code'
          ? await this.desktop.api.oauth.authorize(config)
          : await this.desktop.api.oauth.token(config);
      this.applyToken(result);
    } finally {
      this.oauthBusy.set(false);
    }
  }

  async handleRefreshToken(): Promise<void> {
    if (this.oauthBusy() || !this.auth().refreshToken.trim())
      return;
    this.oauthBusy.set(true);
    this.oauthMessage.set(null);
    try {
      const result = await this.desktop.api.oauth.refresh(
        toOAuthConfig(this.auth(), this.verifyTls(), Number(this.timeoutMs()) || 30000),
      );
      this.applyToken(result);
    } finally {
      this.oauthBusy.set(false);
    }
  }

  async handleCopyDeviceCode(): Promise<void> {
    const code = this.device()?.userCode;
    if (!code || !navigator.clipboard)
      return;
    await navigator.clipboard.writeText(code);
  }

  async handleOpenDeviceUri(): Promise<void> {
    const uri = this.device()?.verificationUri;
    if (!uri)
      return;
    await this.desktop.api.http.openUrl(uri);
  }

  async handleCancelDevice(): Promise<void> {
    const sessionId = this.device()?.sessionId;
    this.clearDeviceTimer();
    this.device.set(null);
    if (sessionId)
      await this.desktop.api.oauth.deviceCancel(sessionId);
  }

  secretType(): string {
    return this.showSecrets() ? 'text' : 'password';
  }

  private writeScript(value: string): void {
    if (this.scriptPane() === 'pre')
      this.preRequest.set(value);
    else
      this.postResponse.set(value);
    this.persist();
  }

  private editor(kind: 'script' | 'docs'): HTMLTextAreaElement | null {
    const ref = kind === 'script' ? this.scriptArea() : this.docsArea();
    return ref?.nativeElement ?? null;
  }

  private handleEditorTab(event: KeyboardEvent, kind: 'script' | 'docs'): void {
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey)
      return;
    event.preventDefault();
    this.insertIntoEditor(kind, '  ');
  }

  private wrapEditor(kind: 'script' | 'docs', before: string, after: string, placeholder: string): void {
    const area = this.editor(kind);
    const current = kind === 'script' ? this.scriptValue() : this.docs();
    if (!area) {
      this.commitEditor(kind, `${current}${before}${placeholder}${after}`);
      return;
    }
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = current.slice(start, end) || placeholder;
    const next = current.slice(0, start) + before + selected + after + current.slice(end);
    const cursor = start + before.length;
    this.commitEditor(kind, next, { start: cursor, end: cursor + selected.length }, area);
  }

  private insertIntoEditor(kind: 'script' | 'docs', text: string): void {
    const area = this.editor(kind);
    const current = kind === 'script' ? this.scriptValue() : this.docs();
    if (!area) {
      this.commitEditor(kind, current.endsWith('\n') || current.length === 0 ? current + text : `${current}\n${text}`);
      return;
    }
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const next = current.slice(0, start) + text + current.slice(end);
    const cursor = start + text.length;
    this.commitEditor(kind, next, { start: cursor, end: cursor }, area);
  }

  private commitEditor(
    kind: 'script' | 'docs',
    value: string,
    selection?: { start: number; end: number },
    area?: HTMLTextAreaElement,
  ): void {
    if (kind === 'script')
      this.writeScript(value);
    else {
      this.docs.set(value);
      this.persist();
    }
    if (!area || !selection)
      return;
    queueMicrotask(() => {
      area.focus();
      area.setSelectionRange(selection.start, selection.end);
    });
  }

  private syncGutter(event: Event, gutter: HTMLElement | undefined): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    if (gutter)
      gutter.scrollTop = target.scrollTop;
    const highlight = target.parentElement?.querySelector('tx-placeholder-highlight');
    if (highlight instanceof HTMLElement)
      highlight.scrollTop = target.scrollTop;
  }

  private patchAuth(patch: Partial<CollectionFolderAuth>): void {
    this.auth.update((current) => ({ ...current, ...patch }));
    this.persist();
  }

  private applyToken(result: OAuthTokenResult): void {
    if (!result.ok) {
      this.oauthMessage.set(result.error || 'Could not get a token.');
      return;
    }
    this.patchAuth({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || this.auth().refreshToken,
      tokenType: result.tokenType || 'Bearer',
      expiresAt: result.expiresAt,
      token: result.accessToken,
    });
    this.oauthMessage.set('Token stored on this folder.');
    this.device.set(null);
    this.clearDeviceTimer();
  }

  private async startDevice(config: OAuthClientConfig): Promise<void> {
    this.oauthBusy.set(true);
    try {
      const started = await this.desktop.api.oauth.deviceStart(config);
      if (!started.ok) {
        this.oauthMessage.set(started.error || 'Device authorization failed.');
        return;
      }
      this.device.set({
        sessionId: started.sessionId,
        userCode: started.userCode,
        verificationUri: started.verificationUriComplete || started.verificationUri,
        interval: Math.max(1, started.interval || 5),
      });
      this.oauthMessage.set('Enter the code at the verification URL.');
      this.clearDeviceTimer();
      this.deviceTimer = setInterval(() => {
        void this.pollDevice();
      }, Math.max(1, started.interval || 5) * 1000);
    } finally {
      this.oauthBusy.set(false);
    }
  }

  private async pollDevice(): Promise<void> {
    const sessionId = this.device()?.sessionId;
    if (!sessionId)
      return;
    const result = await this.desktop.api.oauth.devicePoll(sessionId);
    if (result.cancelled) {
      this.clearDeviceTimer();
      this.device.set(null);
      this.oauthMessage.set('Device authorization cancelled.');
      return;
    }
    if (result.pending)
      return;
    this.applyToken(result);
  }

  private clearDeviceTimer(): void {
    if (!this.deviceTimer)
      return;
    clearInterval(this.deviceTimer);
    this.deviceTimer = null;
  }

  private hydrate(id: string): void {
    const folder = this.store.folderById(id);
    this.hydratedId = id;
    this.dirty.set(false);
    this.clearDeviceTimer();
    this.device.set(null);
    this.oauthBusy.set(false);
    this.oauthMessage.set(null);
    this.sectionSlideDir.set(null);
    this.scriptSlideDir.set(null);
    this.docsSlideDir.set(null);
    this.authSlideDir.set(null);
    const tab = this.tab();
    this.scriptPane.set(tab.folderScriptPane === 'post' ? 'post' : 'pre');
    this.docsMode.set(
      tab.folderDocsMode === 'write' || tab.folderDocsMode === 'preview' ? tab.folderDocsMode : 'split',
    );
    const section = tab.folderSection;
    this.section.set(FOLDER_SECTIONS.some((item) => item.id === section) ? (section as FolderSubTab) : 'overview');
    if (!folder) {
      this.name.set(this.tab().title);
      this.childCount.set(0);
      this.applyConfig(DEFAULT_FOLDER_CONFIG);
      return;
    }
    this.name.set(folder.name);
    this.childCount.set(folder.children.length);
    this.applyConfig(folderConfigOf(folder));
  }

  private applyConfig(config: CollectionFolderConfig): void {
    this.tags.set([...config.tags]);
    this.description.set(config.description);
    this.variables.set(withTrailingRow(config.variables));
    this.persistedParams = config.params.map((row) => ({ ...row }));
    this.headers.set(withTrailingRow(config.headers));
    this.auth.set({ ...config.auth });
    this.preRequest.set(config.scripts.preRequest);
    this.postResponse.set(config.scripts.postResponse);
    this.followRedirects.set(config.settings.followRedirects);
    this.verifyTlsInherit.set(config.settings.verifyTlsInherit);
    this.verifyTls.set(config.settings.verifyTls);
    this.sendCookies.set(config.settings.sendCookies);
    this.storeCookies.set(config.settings.storeCookies);
    this.timeoutMs.set(String(config.settings.timeoutMs));
    this.docs.set(config.docs);
  }

  private persist(): void {
    if (isManualSaveMode(this.desktop.settings())) {
      this.dirty.set(true);
      return;
    }
    this.flushPersist();
  }

  saveDraft(): void {
    if (!this.dirty())
      return;
    this.flushPersist();
    this.dirty.set(false);
  }

  discardDraft(): void {
    if (!this.dirty())
      return;
    const id = this.tab().nodeId;
    if (!id)
      return;
    this.hydrate(id);
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (!isModKey(event, 's'))
      return;
    if (isEditableKeyboardTarget(event.target))
      return;
    if (this.tab().kind !== 'collection-folder')
      return;
    if (!shouldHandleManualSaveHotkey({ settings: this.desktop.settings(), dirty: this.dirty() }))
      return;
    event.preventDefault();
    this.saveDraft();
  }

  private flushPersist(): void {
    const id = this.tab().nodeId;
    if (!id)
      return;
    const timeout = Number.parseInt(this.timeoutMs(), 10);
    const config = parseCollectionFolderConfig({
      tags: this.tags(),
      description: this.description(),
      variables: persistRows(this.variables()),
      params: this.persistedParams,
      headers: persistRows(this.headers()),
      auth: this.auth(),
      scripts: { preRequest: this.preRequest(), postResponse: this.postResponse() },
      settings: {
        followRedirects: this.followRedirects(),
        verifyTlsInherit: this.verifyTlsInherit(),
        verifyTls: this.verifyTls(),
        sendCookies: this.sendCookies(),
        storeCookies: this.storeCookies(),
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
        cookies: [],
      },
      docs: this.docs(),
    });
    this.store.updateFolderConfig(id, config);
  }
}
