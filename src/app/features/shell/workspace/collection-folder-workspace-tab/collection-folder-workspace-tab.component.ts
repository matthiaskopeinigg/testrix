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
  CollectionFolderTabSectionId,
  CollectionRequestTransportSettings,
} from '@shared/config';
import {
  createDefaultCollectionFolderSettings,
  resolveCollectionFolderTabUi,
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
import { findCollectionNode } from '@app/features/shell/collections/collection-tree.mutations';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxKeyValueDescriptionListComponent } from '@app/shared/components/tx-key-value-description-list/tx-key-value-description-list.component';
import type { TxKeyValueDescriptionRow } from '@app/shared/components/tx-key-value-description-list/tx-key-value-description-list.types';

import type { TxCodeEditorCompletionItem } from '@app/shared/components/tx-code-editor/tx-code-editor-completion';

import { buildFolderVariableCatalog } from './folder-variable-catalog';
import { FolderTabAuthPanelComponent } from './folder-tab-auth-panel.component';
import { FolderTabOverviewPanelComponent } from './folder-tab-overview-panel.component';
import { FolderTabDocsPanelComponent } from './folder-tab-docs-panel.component';
import { FolderTabSettingsPanelComponent } from './folder-tab-settings-panel.component';

export type FolderTabSectionId = CollectionFolderTabSectionId;
export type FolderScriptPaneId = CollectionFolderScriptPaneId;

const SCRIPT_EDITOR_PLACEHOLDER = `// Postman-style script APIs (Ctrl+Space for suggestions)
// pm.variables — script cache for the current run
// pm.environment — active environment variables
// pm.collectionVariables — collection-scoped variables`;

interface FolderTabNavItem {
  readonly id: FolderTabSectionId;
  readonly label: string;
  readonly icon: string;
}

const DESCRIPTION_SAVE_DEBOUNCE_MS = 300;

const NAV_ITEMS: readonly FolderTabNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'info' },
  { id: 'variables', label: 'Variables', icon: 'hash' },
  { id: 'headers', label: 'Headers', icon: 'layers' },
  { id: 'auth', label: 'Auth', icon: 'lock' },
  { id: 'script', label: 'Scripts', icon: 'code' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
  { id: 'docs', label: 'Docs', icon: 'file-text' },
];

@Component({
  selector: 'app-collection-folder-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxCodeEditorComponent,
    TxIconComponent,
    TxKeyValueDescriptionListComponent,
    FolderTabAuthPanelComponent,
    FolderTabOverviewPanelComponent,
    FolderTabSettingsPanelComponent,
    FolderTabDocsPanelComponent,
  ],
  templateUrl: './collection-folder-workspace-tab.component.html',
  styleUrl: './collection-folder-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionFolderWorkspaceTabComponent {
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

  private static readonly SESSION_UI_DEBOUNCE_MS = 150;

  readonly resourceId = input.required<string>();
  readonly active = input(false);
  readonly cached = input(false);

  protected readonly navItems = NAV_ITEMS;
  protected readonly scriptEditorPlaceholder = SCRIPT_EDITOR_PLACEHOLDER;
  protected readonly activeSection = signal<FolderTabSectionId>('overview');
  protected readonly activeScriptPane = signal<FolderScriptPaneId>('pre');

  private sessionUiLoadKey: string | null = null;
  private sessionUiSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private descriptionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private syncingDescriptionFromStore = false;

  protected readonly description = signal('');

  protected readonly missing = computed(() => !this.folderLoc());

  protected readonly editorLayout = computed(
    (): WorkspaceEditorLayoutId =>
      this.configService.settings()?.collections.editorLayout ?? 'sidebar',
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');

  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  protected readonly title = computed(() => this.folderLoc()?.node.label ?? 'Folder');

  protected readonly hasParentFolder = computed(() => {
    const loc = this.folderLoc();
    if (!loc?.parent) {
      return false;
    }
    return loc.parent.data?.kind === 'folder' || loc.parent.kind === 'folder';
  });

  protected readonly settings = computed(
    () => this.folderLoc()?.node.data?.settings ?? createDefaultCollectionFolderSettings(),
  );

  protected readonly variableRows = computed(() => this.toDescriptionRows(this.settings().variables));

  protected readonly headerRows = computed(() => this.toDescriptionRows(this.settings().headers));

  protected readonly auth = computed(() => this.settings().auth);

  protected readonly variableCount = computed(
    () => this.settings().variables.filter((row) => row.key.trim()).length,
  );

  protected readonly headerCount = computed(
    () => this.settings().headers.filter((row) => row.key.trim()).length,
  );

  protected readonly tags = computed(() => this.settings().tags);

  protected readonly transport = computed(() => this.settings().transport);

  protected readonly docs = computed(() => this.settings().docs);

  protected readonly scripts = computed(() => this.settings().scripts);

  protected readonly variableCatalog = computed(() =>
    buildFolderVariableCatalog(this.environmentsService.environments()),
  );

  protected readonly activeScriptSource = computed(() => {
    const scripts = this.scripts();
    return this.activeScriptPane() === 'pre' ? scripts.pre : scripts.post;
  });

  protected readonly scriptCompletionItems = computed((): readonly TxCodeEditorCompletionItem[] => {
    const keys = new Set<string>();
    for (const row of this.settings().variables) {
      const key = row.key.trim();
      if (key) {
        keys.add(key);
      }
    }
    return [...keys].map((key) => ({
      label: key,
      insert: `pm.variables.get('${key}')`,
      detail: 'Folder variable',
    }));
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
      const ui = resolveCollectionFolderTabUi(session.workspace.collections.folderTabsById, resourceId);
      this.activeSection.set(ui.activeSection);
      this.activeScriptPane.set(ui.activeScriptPane);
    });

    effect(() => {
      if (!this.active()) {
        return;
      }
      const loc = this.folderLoc();
      const next = loc?.node.data?.description ?? '';
      this.syncingDescriptionFromStore = true;
      this.description.set(next);
      this.syncingDescriptionFromStore = false;
    });

    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadChromeChildCount(),
      { tabActive: () => this.active() },
    );
  }

  protected isSectionContentAnimating(sectionId: FolderTabSectionId): boolean {
    return this.tabMotion.isSectionContentAnimating(sectionId);
  }

  protected isSectionContentSettled(sectionId: FolderTabSectionId): boolean {
    return this.tabMotion.isSectionContentSettled(sectionId, this.activeSection() === sectionId);
  }

  private loadChromeChildCount(): number {
    let count = 1;
    if (this.useTitlebarLayout()) {
      count += 1;
    }
    return count;
  }

  private readonly folderLoc = freezeWhileTabInactive(this.active, () => {
    const loc = findCollectionNode(this.collectionsService.nodes(), this.resourceId());
    if (loc?.node.data?.kind === 'folder' || loc?.node.kind === 'folder') {
      return loc;
    }
    return null;
  });

  protected handleDescriptionChange(next: string): void {
    this.description.set(next);
    this.scheduleDescriptionSave(next);
  }

  protected handleSectionSelect(section: FolderTabSectionId): void {
    if (section !== this.activeSection()) {
      this.tabMotion.onSectionChange(section);
    }
    this.activeSection.set(section);
    this.scheduleTabUiPersist();
  }

  protected handleScriptPaneSelect(pane: FolderScriptPaneId): void {
    if (pane !== this.activeScriptPane() && this.activeSection() === 'script') {
      this.tabMotion.onSectionChange('script', 4);
    }
    this.activeScriptPane.set(pane);
    this.scheduleTabUiPersist();
  }

  private scheduleDescriptionSave(description: string): void {
    if (this.syncingDescriptionFromStore) {
      return;
    }
    if (this.descriptionSaveTimer !== null) {
      clearTimeout(this.descriptionSaveTimer);
    }
    this.descriptionSaveTimer = setTimeout(() => {
      this.descriptionSaveTimer = null;
      this.collectionsService.setFolderDescription(this.resourceId(), description);
    }, DESCRIPTION_SAVE_DEBOUNCE_MS);
  }

  private scheduleTabUiPersist(): void {
    if (this.sessionUiSaveTimer !== null) {
      clearTimeout(this.sessionUiSaveTimer);
    }
    this.sessionUiSaveTimer = setTimeout(() => {
      this.sessionUiSaveTimer = null;
      void this.persistTabUi();
    }, CollectionFolderWorkspaceTabComponent.SESSION_UI_DEBOUNCE_MS);
  }

  private async persistTabUi(): Promise<void> {
    const resourceId = this.resourceId();
    await this.configService.patchSession({
      workspace: {
        collections: {
          folderTabsById: {
            [resourceId]: {
              activeSection: this.activeSection(),
              activeScriptPane: this.activeScriptPane(),
            },
          },
        },
      },
    });
  }

  protected handleVariablesChange(rows: readonly TxKeyValueDescriptionRow[]): void {
    this.patchSettings({ variables: this.fromDescriptionRows(rows) });
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

  protected handleTransportChange(transport: CollectionRequestTransportSettings): void {
    this.patchSettings({ transport: { ...transport } });
  }

  protected handleDocsChange(docs: string): void {
    this.patchSettings({ docs });
  }

  protected handleEnvironmentVariableClick(event: { readonly key: string }): void {
    openEnvironmentVariableTab(
      this.workspaceEditor,
      this.environmentsService.environments(),
      event.key,
    );
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

  private patchSettings(
    patch: Partial<{
      tags: string[];
      docs: string;
      variables: CollectionDescribedKeyValueRow[];
      headers: CollectionDescribedKeyValueRow[];
      auth: CollectionFolderAuth;
      scripts: CollectionFolderScripts;
      transport: CollectionRequestTransportSettings;
    }>,
  ): void {
    this.collectionsService.patchFolderSettings(this.resourceId(), patch);
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
