import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type {
  CollectionDescribedKeyValueRow,
  CollectionFolderAuth,
  CollectionFolderScriptPaneId,
  CollectionFolderScripts,
  CollectionRequestTransportSettings,
  CollectionWebsocketSettings,
  HttpKeyValueRow,
  WebsocketTabSectionId,
} from '@shared/config';
import {
  createDefaultCollectionWebsocketSettings,
  resolveCollectionWebsocketTabUi,
  type WorkspaceEditorLayoutId,
} from '@shared/config';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { freezeWhileTabInactive } from '@app/core/ui/workspace-tab-active.util';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { openEnvironmentVariableTab } from '@app/core/workspace/open-environment-variable-tab';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import {
  collectAncestorFolders,
  findCollectionNode,
} from '@app/features/shell/collections/collection-tree.mutations';
import { getEnvironmentDefinition } from '@app/features/shell/environments/environment-profile.utils';
import { FolderTabAuthPanelComponent } from '@app/features/shell/workspace/collection-folder-workspace-tab/folder-tab-auth-panel.component';
import { FolderTabDocsPanelComponent } from '@app/features/shell/workspace/collection-folder-workspace-tab/folder-tab-docs-panel.component';
import { RequestTabUrlInputComponent } from '@app/features/shell/workspace/request-workspace-tab/request-tab-url-input.component';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxKeyValueDescriptionListComponent } from '@app/shared/components/tx-key-value-description-list/tx-key-value-description-list.component';
import type { TxKeyValueDescriptionRow } from '@app/shared/components/tx-key-value-description-list/tx-key-value-description-list.types';
import { TxVerticalSplitPaneComponent } from '@app/shared/components/tx-vertical-split-pane/tx-vertical-split-pane.component';

import { WsTabMessagesPanelComponent, type WsConnectionState } from './ws-tab-messages-panel.component';
import { WsTabOverviewPanelComponent } from './ws-tab-overview-panel.component';
import { WsTabSettingsPanelComponent } from './ws-tab-settings-panel.component';
import { buildWsVariableCatalog } from './ws-variable-catalog';

interface WsTabNavItem {
  readonly id: WebsocketTabSectionId;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEMS: readonly WsTabNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'info' },
  { id: 'params', label: 'Params', icon: 'hash' },
  { id: 'auth', label: 'Auth', icon: 'lock' },
  { id: 'headers', label: 'Headers', icon: 'layers' },
  { id: 'message', label: 'Message', icon: 'file-text' },
  { id: 'scripts', label: 'Scripts', icon: 'code' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
  { id: 'docs', label: 'Docs', icon: 'file-text' },
];

const LINE_SAVE_DEBOUNCE_MS = 300;
const SESSION_UI_DEBOUNCE_MS = 150;
const MESSAGE_EDITOR_PLACEHOLDER = `{
  "type": "hello"
}`;
const SCRIPT_EDITOR_PLACEHOLDER = `// Postman-style script APIs (Ctrl+Space for suggestions)
// pm.variables — script cache for the current run
// pm.environment — active environment variables`;

@Component({
  selector: 'app-websocket-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxKeyValueDescriptionListComponent,
    TxVerticalSplitPaneComponent,
    RequestTabUrlInputComponent,
    FolderTabAuthPanelComponent,
    FolderTabDocsPanelComponent,
    WsTabOverviewPanelComponent,
    WsTabSettingsPanelComponent,
    WsTabMessagesPanelComponent,
  ],
  templateUrl: './websocket-workspace-tab.component.html',
  styleUrl: './websocket-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebsocketWorkspaceTabComponent {
  private readonly collectionsService = inject(CollectionsService);
  private readonly configService = inject(ConfigService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uiPreferences = inject(UiPreferencesService);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  readonly active = input(false);
  readonly cached = input(false);

  protected readonly navItems = NAV_ITEMS;
  protected readonly messageEditorPlaceholder = MESSAGE_EDITOR_PLACEHOLDER;
  protected readonly scriptEditorPlaceholder = SCRIPT_EDITOR_PLACEHOLDER;

  protected readonly activeSection = signal<WebsocketTabSectionId>('overview');
  protected readonly activeScriptPane = signal<CollectionFolderScriptPaneId>('pre');
  protected readonly wsPath = signal('ws://localhost/path');
  protected readonly descriptionDraft = signal('');
  protected readonly messagesPanelHeight = signal(320);
  protected readonly messagesPanelHidden = signal(false);
  protected readonly connectionState = signal<WsConnectionState>('idle');

  private sessionUiLoadKey: string | null = null;
  private sessionUiSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private lineSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private descriptionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private messagesPanelHeightSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncingFromStore = false;

  protected readonly missing = computed(() => !this.wsLoc());

  protected readonly editorLayout = computed(
    (): WorkspaceEditorLayoutId =>
      this.configService.settings()?.collections.editorLayout ?? 'sidebar',
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');

  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  protected readonly title = computed(() => this.wsLoc()?.node.label ?? 'WebSocket');

  protected readonly settings = computed(
    () =>
      this.wsLoc()?.node.data?.websocketSettings ?? createDefaultCollectionWebsocketSettings(),
  );

  protected readonly tags = computed(() => this.settings().tags);

  protected readonly auth = computed(() => this.settings().auth);

  protected readonly transport = computed(() => this.settings().transport);

  protected readonly docs = computed(() => this.settings().docs);

  protected readonly message = computed(() => this.settings().message);

  protected readonly scripts = computed(() => this.settings().scripts);

  protected readonly paramCount = computed(
    () => this.settings().queryParams.filter((row) => row.key.trim()).length,
  );

  protected readonly headerCount = computed(
    () => this.settings().headers.filter((row) => row.key.trim()).length,
  );

  protected readonly hasParentFolder = computed(() => {
    const loc = this.wsLoc();
    if (!loc?.parent) {
      return false;
    }
    return loc.parent.data?.kind === 'folder' || loc.parent.kind === 'folder';
  });

  protected readonly websocketEnvironmentId = computed(() => {
    const id = this.settings().environmentId;
    if (!id) {
      return null;
    }
    return getEnvironmentDefinition(this.environmentsService.environments(), id) ? id : null;
  });

  protected readonly environmentDropdownValue = computed(
    () => this.websocketEnvironmentId() ?? '',
  );

  protected readonly activeEnvironment = computed(() => {
    const id = this.websocketEnvironmentId();
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
    buildWsVariableCatalog(this.activeEnvironment()),
  );

  protected readonly connectButtonLabel = computed(() =>
    this.connectionState() === 'connected' ? 'Disconnect' : 'Connect',
  );

  protected readonly connectButtonVariant = computed((): 'primary' | 'secondary' =>
    this.connectionState() === 'connected' ? 'secondary' : 'primary',
  );

  protected readonly isConnecting = computed(() => this.connectionState() === 'connecting');

  protected readonly queryRows = computed((): readonly TxKeyValueDescriptionRow[] =>
    this.settings().queryParams.map((row) => ({
      id: row.id,
      enabled: row.enabled,
      key: row.key,
      value: row.value,
      description: row.description,
    })),
  );

  protected readonly headerRows = computed((): readonly TxKeyValueDescriptionRow[] =>
    this.toDescriptionRows(this.settings().headers),
  );

  protected readonly activeScriptSource = computed(() => {
    const scripts = this.scripts();
    return this.activeScriptPane() === 'pre' ? scripts.pre : scripts.post;
  });

  protected readonly showMessagesPanel = computed(() => !this.missing());

  protected readonly showMessagesSplit = computed(
    () => this.showMessagesPanel() && !this.messagesPanelHidden(),
  );

  private readonly wsLoc = freezeWhileTabInactive(this.active, () => {
    const loc = findCollectionNode(this.collectionsService.nodes(), this.resourceId());
    if (loc?.node.data?.kind === 'websocket') {
      return loc;
    }
    return null;
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
      const ui = resolveCollectionWebsocketTabUi(
        session.workspace.collections.websocketTabsById,
        resourceId,
      );
      this.activeSection.set(ui.activeSection);
      this.activeScriptPane.set(ui.activeScriptPane);
      if (ui.messagesPanelHeightPx) {
        this.messagesPanelHeight.set(ui.messagesPanelHeightPx);
      }
      this.messagesPanelHidden.set(ui.isMessagesPanelHidden);
    });

    effect(() => {
      if (!this.active()) {
        return;
      }
      const loc = this.wsLoc();
      const path = loc?.node.data?.wsPath ?? 'ws://localhost/path';
      const description = loc?.node.data?.description ?? '';
      this.syncingFromStore = true;
      this.wsPath.set(path);
      this.descriptionDraft.set(description);
      this.syncingFromStore = false;
    });

    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadChromeChildCount(),
      { tabActive: () => this.active() },
    );
  }

  protected isSectionContentAnimating(sectionId: WebsocketTabSectionId): boolean {
    return this.tabMotion.isSectionContentAnimating(sectionId);
  }

  protected isSectionContentSettled(sectionId: WebsocketTabSectionId): boolean {
    return this.tabMotion.isSectionContentSettled(sectionId, this.activeSection() === sectionId);
  }

  protected handleConnectToggle(): void {
    if (this.connectionState() === 'connected') {
      this.connectionState.set('idle');
      return;
    }
    if (this.connectionState() === 'connecting') {
      return;
    }
    this.connectionState.set('connecting');
    // Stub until Electron WebSocket IPC is wired.
    this.connectionState.set('connected');
  }

  protected handleWsPathChange(next: string): void {
    this.wsPath.set(next);
    this.scheduleLineSave({ wsPath: next });
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
      this.collectionsService.setWebsocketDescription(this.resourceId(), description);
    }, LINE_SAVE_DEBOUNCE_MS);
  }

  protected handleSectionSelect(section: WebsocketTabSectionId): void {
    if (section !== this.activeSection()) {
      this.tabMotion.onSectionChange(section);
    }
    this.activeSection.set(section);
    this.scheduleTabUiPersist();
  }

  protected handleScriptPaneSelect(pane: CollectionFolderScriptPaneId): void {
    if (pane !== this.activeScriptPane() && this.activeSection() === 'scripts') {
      this.tabMotion.onSectionChange('scripts', 4);
    }
    this.activeScriptPane.set(pane);
    this.scheduleTabUiPersist();
  }

  protected handleEnvironmentChange(value: string): void {
    this.patchSettings({ environmentId: value || null });
  }

  protected handleQueryParamsChange(rows: readonly TxKeyValueDescriptionRow[]): void {
    this.patchSettings({
      queryParams: rows.map(
        (row): HttpKeyValueRow => ({
          id: row.id,
          enabled: row.enabled ?? true,
          key: row.key,
          value: row.value,
          description: row.description,
        }),
      ),
    });
  }

  protected handleHeadersChange(rows: readonly TxKeyValueDescriptionRow[]): void {
    this.patchSettings({ headers: this.fromDescriptionRows(rows) });
  }

  protected handleAuthChange(auth: CollectionFolderAuth): void {
    this.patchSettings({ auth });
  }

  protected handleTagsChange(tags: readonly string[]): void {
    this.patchSettings({ tags: [...tags] });
  }

  protected handleMessageChange(message: string): void {
    this.patchSettings({ message });
  }

  protected handleScriptChange(source: string): void {
    const scripts: CollectionFolderScripts = { ...this.scripts() };
    if (this.activeScriptPane() === 'pre') {
      scripts.pre = source;
    } else {
      scripts.post = source;
    }
    this.patchSettings({ scripts });
  }

  protected handleTransportChange(transport: CollectionRequestTransportSettings): void {
    this.patchSettings({ transport: { ...transport } });
  }

  protected handleDocsChange(docs: string): void {
    this.patchSettings({ docs });
  }

  protected handleMessagesPanelHeight(height: number): void {
    this.messagesPanelHeight.set(height);
  }

  protected handleMessagesPanelHidden(hidden: boolean): void {
    this.messagesPanelHidden.set(hidden);
    this.scheduleTabUiPersist();
  }

  protected handleMessagesPanelHeightCommit(height: number): void {
    this.messagesPanelHeight.set(height);
    if (this.messagesPanelHeightSaveTimer) {
      clearTimeout(this.messagesPanelHeightSaveTimer);
    }
    this.messagesPanelHeightSaveTimer = setTimeout(() => {
      this.messagesPanelHeightSaveTimer = null;
      void this.persistTabUi();
    }, LINE_SAVE_DEBOUNCE_MS);
  }

  protected handleEnvironmentVariableClick(event: { readonly key: string }): void {
    openEnvironmentVariableTab(
      this.workspaceEditor,
      this.environmentsService.environments(),
      event.key,
      this.websocketEnvironmentId(),
    );
  }

  private loadChromeChildCount(): number {
    let count = 1;
    if (this.useTitlebarLayout()) {
      count += 1;
    }
    return count;
  }

  private scheduleLineSave(patch: { wsPath?: string }): void {
    if (this.syncingFromStore) {
      return;
    }
    if (this.lineSaveTimer !== null) {
      clearTimeout(this.lineSaveTimer);
    }
    this.lineSaveTimer = setTimeout(() => {
      this.lineSaveTimer = null;
      this.collectionsService.updateWebsocket(this.resourceId(), patch);
    }, LINE_SAVE_DEBOUNCE_MS);
  }

  private scheduleTabUiPersist(): void {
    if (this.sessionUiSaveTimer !== null) {
      clearTimeout(this.sessionUiSaveTimer);
    }
    this.sessionUiSaveTimer = setTimeout(() => {
      this.sessionUiSaveTimer = null;
      void this.persistTabUi();
    }, SESSION_UI_DEBOUNCE_MS);
  }

  private async persistTabUi(): Promise<void> {
    const resourceId = this.resourceId();
    await this.configService.patchSession({
      workspace: {
        collections: {
          websocketTabsById: {
            [resourceId]: {
              activeSection: this.activeSection(),
              activeScriptPane: this.activeScriptPane(),
              messagesPanelHeightPx: this.messagesPanelHeight(),
              isMessagesPanelHidden: this.messagesPanelHidden(),
            },
          },
        },
      },
    });
  }

  private patchSettings(patch: Partial<CollectionWebsocketSettings>): void {
    this.collectionsService.patchWebsocketSettings(this.resourceId(), patch);
  }

  private toDescriptionRows(rows: readonly CollectionDescribedKeyValueRow[]): TxKeyValueDescriptionRow[] {
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value,
      description: row.description,
    }));
  }

  private fromDescriptionRows(rows: readonly TxKeyValueDescriptionRow[]): CollectionDescribedKeyValueRow[] {
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value,
      description: row.description,
    }));
  }
}
