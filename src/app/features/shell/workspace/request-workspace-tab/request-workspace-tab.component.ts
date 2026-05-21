import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Type,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type {
  CollectionRequestPathParam,
  CollectionRequestSettings,
  HttpKeyValueRow,
  HttpMethodId,
  HttpRequestSectionId,
} from '@shared/config';
import {
  collectEnvironmentVariables,
  DEFAULT_HTTP_ACTIVE_SECTION_ON_OPEN,
  HTTP_METHOD_IDS,
  buildRequestCodeSnippetInput,
  createDefaultCollectionRequestSettings,
  parseRequestUrlInput,
  resolveCollectionRequestHeaders,
  resolveCollectionRequestAuth,
  resolveCollectionRequestTabUi,
  resolveRequestRunSession,
  suggestRequestContentType,
  syncPathParamsWithUrl,
  type RequestCodeSnippetInput,
  type WorkspaceEditorLayoutId,
} from '@shared/config';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { getEnvironmentDefinition } from '@app/features/shell/environments/environment-profile.utils';
import {
  collectAncestorFolders,
  findCollectionNode,
} from '@app/features/shell/collections/collection-tree.mutations';
import { findHistoryNode } from '@app/features/shell/history/history-tree.mutations';
import { HistoryService } from '@app/core/history/history.service';
import { openEnvironmentVariableTab } from '@app/core/workspace/open-environment-variable-tab';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { freezeWhileTabInactive } from '@app/core/ui/workspace-tab-active.util';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { HttpRequestService } from '@app/core/http/http-request.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxVerticalSplitPaneComponent } from '@app/shared/components/tx-vertical-split-pane/tx-vertical-split-pane.component';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { RequestTabUrlInputComponent } from './request-tab-url-input.component';
import type { TxCodeEditorCompletionItem } from '@app/shared/components/tx-code-editor/tx-code-editor-completion';

import { FolderTabAuthPanelComponent } from '../collection-folder-workspace-tab/folder-tab-auth-panel.component';
import { RequestTabBodyPanelComponent } from './request-tab-body-panel.component';
import { RequestTabDocsPanelComponent } from './request-tab-docs-panel.component';
import { RequestTabHeadersPanelComponent } from './request-tab-headers-panel.component';
import { RequestTabOverviewPanelComponent } from './request-tab-overview-panel.component';
import { RequestTabParamsPanelComponent } from './request-tab-params-panel.component';
import { RequestTabScriptsPanelComponent } from './request-tab-scripts-panel.component';
import { RequestTabCodeSnippetModalComponent } from './request-tab-code-snippet-modal.component';
import { RequestTabSettingsPanelComponent } from './request-tab-settings-panel.component';
import { buildRequestVariableCatalog } from './request-variable-catalog';

interface RequestTabNavItem {
  readonly id: HttpRequestSectionId;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEMS: readonly RequestTabNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'info' },
  { id: 'params', label: 'Params', icon: 'hash' },
  { id: 'auth', label: 'Auth', icon: 'lock' },
  { id: 'headers', label: 'Headers', icon: 'layers' },
  { id: 'body', label: 'Body', icon: 'file-text' },
  { id: 'scripts', label: 'Scripts', icon: 'code' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
  { id: 'docs', label: 'Docs', icon: 'file-text' },
];

const METHOD_OPTIONS: readonly TxDropdownOption[] = HTTP_METHOD_IDS.map((value) => ({
  value,
  label: value,
}));

const LINE_SAVE_DEBOUNCE_MS = 300;
const SETTINGS_SAVE_DEBOUNCE_MS = 150;

@Component({
  selector: 'app-request-workspace-tab',
  standalone: true,
  imports: [
    NgComponentOutlet,
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    RequestTabUrlInputComponent,
    FolderTabAuthPanelComponent,
    RequestTabOverviewPanelComponent,
    RequestTabParamsPanelComponent,
    RequestTabHeadersPanelComponent,
    RequestTabBodyPanelComponent,
    RequestTabScriptsPanelComponent,
    RequestTabSettingsPanelComponent,
    RequestTabDocsPanelComponent,
    RequestTabCodeSnippetModalComponent,
    TxVerticalSplitPaneComponent,
  ],
  templateUrl: './request-workspace-tab.component.html',
  styleUrl: './request-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestWorkspaceTabComponent {
  private readonly collectionsService = inject(CollectionsService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly historyService = inject(HistoryService);
  private readonly configService = inject(ConfigService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uiPreferences = inject(UiPreferencesService);
  protected readonly httpRequest = inject(HttpRequestService);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  /** True when this tab is the visible pane (see workspace editor mount cache). */
  readonly active = input(false);
  /** True when the tab host was mounted before (skip entrance stagger). */
  readonly cached = input(false);

  protected readonly responsePanelComponent = signal<Type<unknown> | null>(null);

  protected readonly navItems = NAV_ITEMS;
  protected readonly methodOptions = METHOD_OPTIONS;
  protected readonly activeSection = signal<HttpRequestSectionId>('overview');
  protected readonly activeScriptPane = signal<'pre' | 'post'>('pre');
  protected readonly codeSnippetOpen = signal(false);
  protected readonly responsePanelHeight = signal(320);
  protected readonly responsePanelHidden = signal(false);

  /** Stored path only (no query string). */
  protected readonly urlPath = signal('');
  protected readonly descriptionDraft = signal('');

  private sessionUiLoadKey: string | null = null;
  private sessionUiSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private responsePanelHeightSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lineSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private descriptionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncingFromStore = false;

  protected readonly isHistory = computed(() => this.historyMeta() !== null);

  protected readonly editorLayout = computed(
    (): WorkspaceEditorLayoutId =>
      this.configService.settings()?.collections.editorLayout ?? 'sidebar',
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');

  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  /** Response split is shown after the first send or while a request is in flight. */
  protected readonly showResponsePanel = computed(
    () => this.httpRequest.inFlight() || this.httpRequest.runs().length > 0,
  );

  protected readonly showResponseSplit = computed(
    () => this.showResponsePanel() && !this.responsePanelHidden(),
  );

  protected readonly missing = computed(
    () => !this.collectionLoc() && !this.historyMeta(),
  );

  protected readonly title = computed(
    () => this.collectionLoc()?.node.label ?? this.historyMeta()?.label ?? 'Request',
  );

  protected readonly method = computed(
    () => this.collectionLoc()?.node.data?.method ?? this.historyMeta()?.method ?? 'GET',
  );

  protected readonly settings = computed(
    () =>
      this.collectionLoc()?.node.data?.requestSettings ??
      createDefaultCollectionRequestSettings(),
  );

  protected readonly contentTypeHint = computed(() =>
    suggestRequestContentType(this.settings().body),
  );

  /** Persisted on the request in collections.json (`settings.environmentId`). */
  protected readonly requestEnvironmentId = computed(() => {
    const id = this.settings().environmentId;
    if (!id) {
      return null;
    }
    return getEnvironmentDefinition(this.environmentsService.environments(), id) ? id : null;
  });

  protected readonly environmentDropdownValue = computed(
    () => this.requestEnvironmentId() ?? '',
  );

  protected readonly activeEnvironment = computed(() => {
    const id = this.requestEnvironmentId();
    if (!id) {
      return null;
    }
    return getEnvironmentDefinition(this.environmentsService.environments(), id);
  });

  protected readonly environmentOptions = computed((): readonly TxDropdownOption[] => {
    const options: TxDropdownOption[] = [{ value: '', label: 'No environment' }];
    for (const environment of this.environmentsService.environments()) {
      options.push({ value: environment.id, label: environment.name });
    }
    return options;
  });

  protected readonly variableCatalog = computed(() =>
    buildRequestVariableCatalog(this.activeEnvironment()),
  );

  protected readonly codeSnippetInput = computed((): RequestCodeSnippetInput | null => {
    if (this.isHistory()) {
      const meta = this.historyMeta();
      if (!meta) {
        return null;
      }
      return buildRequestCodeSnippetInput({
        method: meta.method as HttpMethodId,
        urlPath: meta.url,
        queryParams: [],
        resolvedHeaders: [],
        body: { mode: 'none' },
        auth: { type: 'none' },
        contentTypeHint: null,
      });
    }

    const headerInput = this.headerResolveInput();
    if (!headerInput) {
      return null;
    }

    const ancestors = headerInput.ancestorFolders;
    const authResolved = resolveCollectionRequestAuth(this.settings().auth, ancestors);
    return buildRequestCodeSnippetInput({
      method: this.method() as HttpMethodId,
      urlPath: this.urlPath(),
      queryParams: this.settings().queryParams,
      resolvedHeaders: resolveCollectionRequestHeaders(headerInput),
      body: this.settings().body,
      auth: authResolved.auth,
      contentTypeHint: this.contentTypeHint(),
    });
  });

  protected readonly headerResolveInput = computed(() => {
    const loc = this.collectionLoc();
    if (!loc?.node.data?.requestSettings) {
      return null;
    }
    const settings = this.configService.settings();
    const ancestors = collectAncestorFolders(this.collectionsService.nodes(), loc.node.id);
    return {
      globalHeaders: settings?.http.headers ?? {
        applyDefaultHeaders: true,
        rows: [],
      },
      ancestorFolders: ancestors
        .filter((n) => n.data?.kind === 'folder' && n.data.settings)
        .map((n) => ({
          id: n.id,
          label: n.label,
          settings: n.data!.settings!,
        })),
      requestHeaders: this.settings().headers,
    };
  });

  protected readonly inheritedVariableLines = computed(() => {
    const loc = this.collectionLoc();
    if (!loc) {
      return [];
    }
    const lines: string[] = [];
    const ancestors = collectAncestorFolders(this.collectionsService.nodes(), loc.node.id);
    for (const folder of ancestors) {
      if (folder.data?.kind !== 'folder' || !folder.data.settings) {
        continue;
      }
      for (const row of folder.data.settings.variables) {
        const key = row.key.trim();
        if (key) {
          lines.push(`${folder.label} · ${key}`);
        }
      }
    }
    const environment = this.activeEnvironment();
    if (environment) {
      for (const entry of collectEnvironmentVariables(environment.nodes)) {
        lines.push(`${environment.name} · ${entry.key}`);
      }
    }
    return lines;
  });

  protected readonly hasParentFolder = computed(() => {
    const loc = this.collectionLoc();
    if (!loc?.parent) {
      return false;
    }
    return loc.parent.data?.kind === 'folder' || loc.parent.kind === 'folder';
  });

  protected readonly scriptCompletionItems = computed((): readonly TxCodeEditorCompletionItem[] => {
    const keys = new Set<string>();
    for (const line of this.inheritedVariableLines()) {
      const key = line.split(' · ')[1];
      if (key) {
        keys.add(key);
      }
    }
    return [...keys].map((key) => ({
      label: key,
      insert: `pm.variables.get('${key}')`,
      detail: 'Variable',
    }));
  });

  private readonly collectionLoc = freezeWhileTabInactive(this.active, () => {
    const loc = findCollectionNode(this.collectionsService.nodes(), this.resourceId());
    if (loc?.node.data?.kind === 'request') {
      return loc;
    }
    return null;
  });

  private readonly historyMeta = computed(() => {
    const loc = findHistoryNode(this.historyService.nodes(), this.resourceId());
    if (!loc) {
      return null;
    }
    return {
      label: loc.node.label,
      method: loc.node.data?.method ?? 'GET',
      url: loc.node.data?.url ?? '/',
    };
  });

  constructor() {
    effect(() => {
      if (!this.active()) {
        return;
      }
      const resourceId = this.resourceId();
      const revision = this.configService.sessionRevision();
      const session = untracked(() => this.configService.session());
      if (!session) {
        return;
      }
      const loadKey = `${revision}:${resourceId}`;
      if (this.sessionUiLoadKey === loadKey) {
        return;
      }
      this.sessionUiLoadKey = loadKey;
      const defaultSection =
        untracked(() => this.configService.settings())?.http.request.activeSectionOnOpen ??
        DEFAULT_HTTP_ACTIVE_SECTION_ON_OPEN;
      const ui = resolveCollectionRequestTabUi(
        session.workspace.collections.requestTabsById,
        resourceId,
        defaultSection,
      );
      this.activeSection.set(ui.activeSection);
      this.activeScriptPane.set(ui.activeScriptPane);
      const runsUi = resolveRequestRunSession(
        session.workspace.collections.requestRunsById,
        resourceId,
      );
      if (runsUi.responsePanelHeightPx) {
        this.responsePanelHeight.set(runsUi.responsePanelHeightPx);
      }
      this.responsePanelHidden.set(runsUi.isResponsePanelHidden);
    });

    effect(() => {
      if (!this.active()) {
        return;
      }
      const id = this.resourceId();
      if (this.isHistory()) {
        return;
      }
      const bound = this.httpRequest.boundRequestId();
      if (bound === id) {
        return;
      }
      this.httpRequest.bindRequest(id);
    });

    effect(() => {
      if (!this.showResponseSplit() || this.responsePanelComponent()) {
        return;
      }
      void import('./request-response-panel.component').then((module) => {
        this.responsePanelComponent.set(module.RequestResponsePanelComponent);
      });
    });

    effect(() => {
      if (!this.active()) {
        return;
      }
      const loc = this.collectionLoc();
      const url = loc?.node.data?.url ?? this.historyMeta()?.url ?? '';
      const description = loc?.node.data?.description ?? '';
      this.syncingFromStore = true;
      this.urlPath.set(url);
      this.descriptionDraft.set(description);
      this.syncingFromStore = false;
    });

    // Chrome is visible immediately; workspace editor skeleton covers first paint.
    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadChromeChildCount(),
      { tabActive: () => this.active() },
    );
  }

  protected isSectionContentAnimating(sectionId: HttpRequestSectionId): boolean {
    return this.tabMotion.isSectionContentAnimating(sectionId);
  }

  protected isSectionContentSettled(sectionId: HttpRequestSectionId): boolean {
    return this.tabMotion.isSectionContentSettled(sectionId, this.activeSection() === sectionId);
  }

  private loadChromeChildCount(): number {
    return this.useTitlebarLayout() ? 2 : 1;
  }

  protected handleSectionSelect(section: HttpRequestSectionId): void {
    if (section !== this.activeSection()) {
      this.tabMotion.onSectionChange(section);
    }
    this.activeSection.set(section);
    this.scheduleTabUiPersist();
  }

  protected handleScriptPaneSelect(pane: 'pre' | 'post'): void {
    if (pane !== this.activeScriptPane() && this.activeSection() === 'scripts') {
      this.tabMotion.onSectionChange('scripts', 3);
    }
    this.activeScriptPane.set(pane);
    this.scheduleTabUiPersist();
  }

  protected handleMethodChange(value: string): void {
    this.patchLine({ method: value as HttpMethodId });
  }

  protected handleEnvironmentChange(value: string): void {
    const nextId = value.trim() || null;
    this.patchSettings({ environmentId: nextId });
  }

  protected handleUrlPathChange(display: string): void {
    if (this.syncingFromStore) {
      return;
    }
    const parsed = parseRequestUrlInput(display, this.settings().queryParams);
    this.urlPath.set(parsed.path);
    this.scheduleLineSave({ url: parsed.path });
    const pathSynced = syncPathParamsWithUrl(parsed.path, this.settings().pathParams);
    const queryChanged =
      parsed.queryParams.length !== this.settings().queryParams.length ||
      parsed.queryParams.some(
        (row, i) =>
          row.key !== this.settings().queryParams[i]?.key ||
          row.value !== this.settings().queryParams[i]?.value,
      );
    const pathChanged =
      pathSynced.length !== this.settings().pathParams.length ||
      pathSynced.some((r, i) => r.key !== this.settings().pathParams[i]?.key);
    if (pathChanged) {
      this.patchSettings({ pathParams: pathSynced });
    }
    if (queryChanged) {
      this.patchSettings({ queryParams: parsed.queryParams });
    }
  }

  protected handlePathParamsChange(pathParams: readonly CollectionRequestPathParam[]): void {
    this.patchSettings({ pathParams: pathParams.map((row) => ({ ...row })) });
  }

  protected handleQueryParamsChange(queryParams: readonly HttpKeyValueRow[]): void {
    this.patchSettings({ queryParams: queryParams.map((row) => ({ ...row })) });
  }

  protected handleDescriptionChange(description: string): void {
    this.descriptionDraft.set(description);
    if (this.syncingFromStore) {
      return;
    }
    if (this.descriptionSaveTimer !== null) {
      clearTimeout(this.descriptionSaveTimer);
    }
    this.descriptionSaveTimer = setTimeout(() => {
      this.descriptionSaveTimer = null;
      this.collectionsService.setRequestDescription(this.resourceId(), description);
    }, LINE_SAVE_DEBOUNCE_MS);
  }

  protected handleSend(): void {
    if (this.httpRequest.inFlight()) {
      return;
    }
    void this.httpRequest.executeCollectionRequest(this.resourceId());
  }

  protected handleResponsePanelHeight(height: number): void {
    this.responsePanelHeight.set(height);
  }

  protected handleResponsePanelHidden(hidden: boolean): void {
    this.responsePanelHidden.set(hidden);
    void this.httpRequest.setResponsePanelHidden(this.resourceId(), hidden);
  }

  protected handleResponsePanelHeightCommit(height: number): void {
    this.responsePanelHeight.set(height);
    if (this.responsePanelHeightSaveTimer) {
      clearTimeout(this.responsePanelHeightSaveTimer);
    }
    this.responsePanelHeightSaveTimer = setTimeout(() => {
      this.responsePanelHeightSaveTimer = null;
      void this.configService.patchSession({
        workspace: {
          collections: {
            requestRunsById: {
              [this.resourceId()]: {
                ...resolveRequestRunSession(
                  this.configService.session()?.workspace.collections.requestRunsById,
                  this.resourceId(),
                ),
                responsePanelHeightPx: height,
              },
            },
          },
        },
      });
    }, LINE_SAVE_DEBOUNCE_MS);
  }

  protected handleOpenCodeSnippets(): void {
    this.codeSnippetOpen.set(true);
  }

  protected handleCloseCodeSnippets(): void {
    this.codeSnippetOpen.set(false);
  }

  protected handleEnvironmentVariableClick(event: { readonly key: string }): void {
    openEnvironmentVariableTab(
      this.workspaceEditor,
      this.environmentsService.environments(),
      event.key,
      this.requestEnvironmentId(),
    );
  }

  protected handleSettingsPatch(patch: Partial<CollectionRequestSettings>): void {
    this.patchSettings(patch);
  }

  protected handleTagsChange(tags: readonly string[]): void {
    this.patchSettings({ tags: [...tags] });
  }

  private scheduleLineSave(patch: { method?: HttpMethodId; url?: string }): void {
    if (this.syncingFromStore || this.isHistory()) {
      return;
    }
    if (this.lineSaveTimer !== null) {
      clearTimeout(this.lineSaveTimer);
    }
    this.lineSaveTimer = setTimeout(() => {
      this.lineSaveTimer = null;
      this.collectionsService.updateRequest(this.resourceId(), patch);
    }, LINE_SAVE_DEBOUNCE_MS);
  }

  private patchLine(patch: { method?: HttpMethodId; url?: string }): void {
    if (this.isHistory()) {
      return;
    }
    this.collectionsService.updateRequest(this.resourceId(), patch);
  }

  private patchSettings(patch: Partial<CollectionRequestSettings>): void {
    if (this.isHistory()) {
      return;
    }
    const normalized: Partial<CollectionRequestSettings> = { ...patch };
    if (patch.tags) {
      normalized.tags = [...patch.tags];
    }
    if (patch.pathParams) {
      normalized.pathParams = patch.pathParams.map((row) => ({ ...row }));
    }
    if (patch.queryParams) {
      normalized.queryParams = patch.queryParams.map((row) => ({ ...row }));
    }
    if (patch.headers) {
      normalized.headers = {
        rows: patch.headers.rows.map((row) => ({ ...row })),
        overrides: { ...patch.headers.overrides },
      };
    }
    this.collectionsService.patchRequestSettings(this.resourceId(), normalized);
  }

  private scheduleTabUiPersist(): void {
    if (this.isHistory()) {
      return;
    }
    if (this.sessionUiSaveTimer !== null) {
      clearTimeout(this.sessionUiSaveTimer);
    }
    this.sessionUiSaveTimer = setTimeout(() => {
      this.sessionUiSaveTimer = null;
      void this.persistTabUi();
    }, SETTINGS_SAVE_DEBOUNCE_MS);
  }

  private async persistTabUi(): Promise<void> {
    await this.configService.patchSession({
      workspace: {
        collections: {
          requestTabsById: {
            [this.resourceId()]: {
              activeSection: this.activeSection(),
              activeScriptPane: this.activeScriptPane(),
            },
          },
        },
      },
    });
  }
}
