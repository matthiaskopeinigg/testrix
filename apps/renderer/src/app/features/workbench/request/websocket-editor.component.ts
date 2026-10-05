import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  DEFAULT_FOLDER_AUTH,
  DEFAULT_FOLDER_SETTINGS,
  SETTINGS_KV_SOURCE_ID,
  WEBSOCKET_AUTH_MODES,
  ancestorFolderOrigins,
  environmentVariableMap,
  findNodePath,
  inheritedKvRows,
  mergeRequestSettings,
  newEntityId,
  websocketConfigOf,
  websocketTabSlideDir,
  type CollectionFolderAuth,
  type CollectionFolderSettings,
  type FolderDocsMode,
  type RequestAuthMode,
  type WebsocketEvent,
  type WebsocketTabSection,
} from '@testrix/contracts';
import {
  TxCheckComponent,
  TxEmptyStateComponent,
  TxHintComponent,
  TxInputComponent,
  TxSelectComponent,
  type TxSelectOption,
} from '@testrix/ui';

import { DesktopApiService } from '../../../core/desktop-api.service';
import { DirtyTabsRegistry } from '../../../core/dirty-tabs.registry';
import { isManualSaveMode, shouldHandleManualSaveHotkey } from '../../../core/save-mode';
import { isEditableKeyboardTarget, isModKey } from '../../../core/selection-hotkeys';
import { CollectionsStore } from '../../collections/collections.store';
import { DocsEditorComponent } from '../../collections/docs-editor.component';
import { EnvironmentsStore } from '../../environments/environments.store';
import { ShellStateService } from '../../../core/shell-state.service';
import { openInheritedKvSource } from './inherited-source';
import {
  openPlaceholderOrigin,
  PLACEHOLDER_ORIGIN_HOST,
  winningVariableOrigins,
  type PlaceholderActivate,
  type PlaceholderOrigin,
  type PlaceholderOriginHost,
} from './placeholder-origin';
import { persistMockRows, withTrailingRow, type MockKeyValue } from './request-mock';
import { RequestKvTableComponent } from './request-kv-table.component';
import { TokenFieldComponent } from './token-field.component';
import { planWebsocketConnect } from './websocket-send';
import { WorkbenchStore, type WorkbenchTab } from '../workbench.store';

interface WsLogEntry {
  readonly id: string;
  readonly kind: WebsocketEvent['kind'] | 'out';
  readonly body: string;
  readonly at: string;
}

type ConnectState = 'idle' | 'connecting' | 'open';

const SECTIONS: readonly { id: WebsocketTabSection; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'auth', label: 'Auth' },
  { id: 'settings', label: 'Settings' },
  { id: 'docs', label: 'Docs' },
];

const AUTH_MODE_OPTIONS: readonly TxSelectOption[] = WEBSOCKET_AUTH_MODES.map((value) => ({
  value,
  label: value === 'apikey' ? 'API key' : value === 'inherit' ? 'Inherit folder' : value.charAt(0).toUpperCase() + value.slice(1),
}));

function clock(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime()))
    return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

@Component({
  selector: 'tx-websocket-editor',
  standalone: true,
  imports: [
    TxHintComponent,
    TxEmptyStateComponent,
    TxCheckComponent,
    TxInputComponent,
    TxSelectComponent,
    TokenFieldComponent,
    RequestKvTableComponent,
    DocsEditorComponent,
  ],
  templateUrl: './websocket-editor.component.html',
  styleUrls: ['../../collections/collection-folder-editor.component.scss', './websocket-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown)': 'handleHotkey($event)',
  },
  providers: [
    { provide: PLACEHOLDER_ORIGIN_HOST, useExisting: forwardRef(() => WebsocketEditorComponent) },
  ],
})
export class WebsocketEditorComponent implements PlaceholderOriginHost {
  readonly tab = input.required<WorkbenchTab>();

  private readonly environments = inject(EnvironmentsStore);
  private readonly collections = inject(CollectionsStore);
  private readonly workbench = inject(WorkbenchStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly dirtyTabs = inject(DirtyTabsRegistry);
  private readonly shell = inject(ShellStateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sections = SECTIONS;
  readonly authModeOptions = AUTH_MODE_OPTIONS;

  readonly url = signal('');
  readonly section = signal<WebsocketTabSection>('messages');
  readonly sectionSlideDir = signal<'left' | 'right' | null>(null);
  readonly connectState = signal<ConnectState>('idle');
  readonly connectError = signal<string | null>(null);
  readonly composer = signal('{ "type": "ping" }');
  readonly messages = signal<readonly WsLogEntry[]>([]);
  readonly queryParams = signal<MockKeyValue[]>([]);
  readonly headers = signal<MockKeyValue[]>([]);
  readonly protocols = signal('');
  readonly authMode = signal<RequestAuthMode>('inherit');
  readonly auth = signal<CollectionFolderAuth>({ ...DEFAULT_FOLDER_AUTH });
  readonly verifyTlsInherit = signal(true);
  readonly verifyTls = signal(true);
  readonly timeoutMs = signal('30000');
  readonly docs = signal('');
  readonly docsMode = signal<FolderDocsMode>('split');
  readonly tags = signal<readonly string[]>([]);

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private hydratedId = '';
  private hydratedNodeId = '';
  private readonly messagesByTab = new Map<string, readonly WsLogEntry[]>();
  private readonly connectByTab = new Map<string, ConnectState>();
  readonly dirty = signal(false);
  readonly isManualSave = computed(() => isManualSaveMode(this.desktop.settings()));

  readonly completeVariables = computed(() => {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    const folderKeys = ancestorFolderOrigins(this.collections.tree(), this.tab().nodeId)
      .flatMap((origin) => origin.config.variables)
      .filter((row) => row.enabled && row.key.trim())
      .map((row) => row.key.trim());
    const envKeys = env ? Object.keys(environmentVariableMap(env.variables)) : [];
    return [...new Set([...folderKeys, ...envKeys])];
  });
  readonly variableOrigins = computed(() => {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    return winningVariableOrigins({
      folders: ancestorFolderOrigins(this.collections.tree(), this.tab().nodeId).map((origin) => ({
        id: origin.id,
        name: origin.name,
        variables: origin.config.variables,
      })),
      environment: env ?? null,
    });
  });
  readonly pathLabel = computed(() => {
    const path = findNodePath(this.collections.tree(), this.tab().nodeId);
    if (!path || path.length < 2)
      return this.tab().title;
    return path.map((node) => node.name).join(' / ');
  });
  readonly inheritedHeaders = computed(() => {
    const origins = ancestorFolderOrigins(this.collections.tree(), this.tab().nodeId);
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
  readonly inheritedParams = computed(() => {
    const origins = ancestorFolderOrigins(this.collections.tree(), this.tab().nodeId);
    return inheritedKvRows(
      origins.map((origin) => ({ source: origin.name, sourceId: origin.id, rows: origin.config.params })),
      persistMockRows(this.queryParams()),
    );
  });
  readonly connectLabel = computed(() => {
    const state = this.connectState();
    if (state === 'connecting')
      return 'Connecting';
    if (state === 'open')
      return 'Disconnect';
    return 'Connect';
  });
  readonly statusLabel = computed(() => {
    if (this.connectError())
      return this.connectError();
    const state = this.connectState();
    if (state === 'connecting')
      return 'Connecting';
    if (state === 'open')
      return 'Connected';
    return 'Disconnected';
  });

  constructor() {
    const stop = this.desktop.api.websocket.onEvent((event) => this.handleSocketEvent(event));
    this.destroyRef.onDestroy(() => {
      stop();
      if (this.persistTimer)
        clearTimeout(this.persistTimer);
      if (this.connectState() === 'open' || this.connectState() === 'connecting')
        void this.desktop.api.websocket.disconnect(this.tab().id);
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
          this.flushPersist();
        else if (this.persistTimer) {
          clearTimeout(this.persistTimer);
          this.persistTimer = null;
        }
        this.hydrate(tab);
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
  }

  placeholderOrigins(): readonly PlaceholderOrigin[] {
    return this.variableOrigins();
  }

  openPlaceholder(activate: PlaceholderActivate): void {
    openPlaceholderOrigin(activate, {
      collections: this.collections,
      workbench: this.workbench,
      environments: this.environments,
    });
  }

  sectionCount(id: WebsocketTabSection): number {
    if (id === 'params')
      return this.queryParams().filter((row) => row.enabled && row.key.trim()).length;
    if (id === 'headers')
      return this.headers().filter((row) => row.enabled && row.key.trim()).length;
    if (id === 'messages')
      return this.messages().length;
    if (id === 'docs')
      return this.docs().trim() ? 1 : 0;
    return 0;
  }

  handleSection(section: WebsocketTabSection): void {
    if (section === this.section())
      return;
    this.sectionSlideDir.set(websocketTabSlideDir(this.section(), section));
    this.section.set(section);
    this.workbench.patchTab(this.tab().id, { websocketSection: section });
  }

  sectionPaneEnter(): string | undefined {
    return this.sectionSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  handleUrlChange(value: string): void {
    this.url.set(value);
    this.workbench.patchTab(this.tab().id, { url: value });
    this.schedulePersist();
  }

  handleComposerChange(value: string): void {
    this.composer.set(value);
  }

  handleQuery(rows: readonly MockKeyValue[]): void {
    this.queryParams.set(withTrailingRow(rows));
    this.schedulePersist();
  }

  handleHeaders(rows: readonly MockKeyValue[]): void {
    this.headers.set(withTrailingRow(rows));
    this.schedulePersist();
  }

  handleInherited(row: MockKeyValue, section: 'headers' | 'params'): void {
    openInheritedKvSource(row.sourceId, section === 'params' ? 'overview' : 'headers', {
      collections: this.collections,
      workbench: this.workbench,
      shell: this.shell,
    });
  }

  handleProtocols(value: string): void {
    this.protocols.set(value);
    this.schedulePersist();
  }

  handleAuthMode(value: string): void {
    if (!WEBSOCKET_AUTH_MODES.includes(value as (typeof WEBSOCKET_AUTH_MODES)[number]))
      return;
    this.authMode.set(value as RequestAuthMode);
    this.schedulePersist();
  }

  handleAuthField(field: keyof CollectionFolderAuth, value: string | boolean): void {
    this.auth.update((current) => ({ ...current, [field]: value }));
    this.schedulePersist();
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

  handleVerifyTlsInherit(checked: boolean): void {
    this.verifyTlsInherit.set(checked);
    this.schedulePersist();
  }

  handleVerifyTls(checked: boolean): void {
    this.verifyTlsInherit.set(false);
    this.verifyTls.set(checked);
    this.schedulePersist();
  }

  handleTimeout(value: string): void {
    this.timeoutMs.set(value);
    this.schedulePersist();
  }

  handleDocsValue(value: string): void {
    this.docs.set(value);
    this.schedulePersist();
  }

  handleDocsMode(mode: FolderDocsMode): void {
    this.docsMode.set(mode);
  }

  handleInheritedParams(row: MockKeyValue): void {
    this.handleInherited(row, 'params');
  }

  handleHotkey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter')
      return;
    event.preventDefault();
    void this.handleSend();
  }

  async handleConnectToggle(): Promise<void> {
    if (this.connectState() === 'open' || this.connectState() === 'connecting') {
      await this.desktop.api.websocket.disconnect(this.tab().id);
      this.setConnectState('idle');
      this.connectError.set(null);
      return;
    }
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    const plan = planWebsocketConnect({
      tree: this.collections.tree(),
      nodeId: this.tab().nodeId,
      connectionId: this.tab().id,
      url: this.url(),
      params: persistMockRows(this.queryParams()),
      headers: persistMockRows(this.headers()),
      protocols: this.protocols(),
      authMode: this.authMode(),
      requestAuth: this.auth(),
      requestSettings: this.requestSettings(),
      envVars: env ? environmentVariableMap(env.variables) : {},
      defaultHeaders: this.desktop.settings().defaultHeaders ?? [],
      emailDomain: this.desktop.settings().placeholderEmailDomain,
      workspaceVerifyTls: this.desktop.settings().certificates.verifyTls,
    });
    this.connectError.set(null);
    this.setConnectState('connecting');
    const result = await this.desktop.api.websocket.connect(plan.payload);
    if (!result.ok) {
      this.setConnectState('idle');
      this.connectError.set(result.error ?? 'Connect failed.');
    }
  }

  async handleSend(): Promise<void> {
    if (this.connectState() !== 'open')
      return;
    const body = this.composer().trim();
    if (!body)
      return;
    const result = await this.desktop.api.websocket.send({ connectionId: this.tab().id, data: body });
    if (!result.ok) {
      this.connectError.set(result.error ?? 'Send failed.');
      this.appendLog({ kind: 'error', body: result.error ?? 'Send failed.', at: new Date().toISOString() });
      return;
    }
    this.appendLog({ kind: 'out', body, at: new Date().toISOString() });
  }

  handleClearLog(): void {
    this.messages.set([]);
    this.messagesByTab.set(this.tab().id, []);
  }

  private handleSocketEvent(event: WebsocketEvent): void {
    if (event.connectionId !== this.tab().id)
      return;
    if (event.kind === 'open')
      this.setConnectState('open');
    if (event.kind === 'close')
      this.setConnectState('idle');
    if (event.kind === 'error')
      this.connectError.set(event.body || 'WebSocket error.');
    this.appendLog({ kind: event.kind, body: event.body, at: event.at });
  }

  private appendLog(entry: Omit<WsLogEntry, 'id'>): void {
    const next: WsLogEntry = {
      ...entry,
      id: newEntityId(),
      at: clock(entry.at),
    };
    this.messages.update((list) => {
      const merged = [...list, next];
      this.messagesByTab.set(this.tab().id, merged);
      return merged;
    });
  }

  private setConnectState(state: ConnectState): void {
    this.connectState.set(state);
    this.connectByTab.set(this.tab().id, state);
  }

  private requestSettings(): Partial<CollectionFolderSettings> {
    const timeout = Number.parseInt(this.timeoutMs(), 10);
    return {
      verifyTlsInherit: this.verifyTlsInherit(),
      verifyTls: this.verifyTls(),
      timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
    };
  }

  private hydrate(tab: WorkbenchTab): void {
    this.dirty.set(false);
    this.sectionSlideDir.set(null);
    const node = this.collections.websocketById(tab.nodeId);
    const config = websocketConfigOf(node ?? {});
    this.url.set(config.url || tab.url);
    this.section.set(tab.websocketSection ?? 'messages');
    this.queryParams.set(withTrailingRow(config.queryParams));
    this.headers.set(withTrailingRow(config.headers));
    this.protocols.set(config.protocols);
    this.authMode.set(
      WEBSOCKET_AUTH_MODES.includes(config.authMode as (typeof WEBSOCKET_AUTH_MODES)[number])
        ? config.authMode
        : 'inherit',
    );
    this.auth.set({ ...DEFAULT_FOLDER_AUTH, ...config.auth });
    const settings = mergeRequestSettings(DEFAULT_FOLDER_SETTINGS, config.settings);
    this.verifyTlsInherit.set(settings.verifyTlsInherit);
    this.verifyTls.set(settings.verifyTls);
    this.timeoutMs.set(String(settings.timeoutMs));
    this.docs.set(config.docs);
    this.tags.set(config.tags);
    this.composer.set('{ "type": "ping" }');
    this.messages.set(this.messagesByTab.get(tab.id) ?? []);
    this.connectState.set(this.connectByTab.get(tab.id) ?? 'idle');
    this.connectError.set(null);
    this.hydratedId = tab.id;
    this.hydratedNodeId = tab.nodeId;
  }

  private schedulePersist(): void {
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
    this.persistTimer = setTimeout(() => this.flushPersist(), 250);
  }

  saveDraft(): void {
    if (!this.dirty() || !this.hydratedNodeId)
      return;
    this.flushPersist();
    this.dirty.set(false);
  }

  discardDraft(): void {
    if (!this.dirty())
      return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.hydrate(this.tab());
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (!isModKey(event, 's'))
      return;
    if (isEditableKeyboardTarget(event.target))
      return;
    if (this.tab().kind !== 'websocket')
      return;
    if (!shouldHandleManualSaveHotkey({ settings: this.desktop.settings(), dirty: this.dirty() }))
      return;
    event.preventDefault();
    this.saveDraft();
  }

  private flushPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.hydratedNodeId)
      return;
    this.collections.updateWebsocketConfig(this.hydratedNodeId, {
      url: this.url(),
      queryParams: persistMockRows(this.queryParams()),
      headers: persistMockRows(this.headers()),
      protocols: this.protocols(),
      authMode: this.authMode(),
      auth: this.auth(),
      settings: this.requestSettings(),
      tags: [...this.tags()],
      docs: this.docs(),
    });
  }
}
