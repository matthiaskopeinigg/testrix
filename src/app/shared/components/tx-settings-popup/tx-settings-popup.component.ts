import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ConfigService } from '@app/core/config/config.service';
import { ProfileService } from '@app/core/profile/profile.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { UpdateBannerContextService } from '@app/core/updater/update-banner-context.service';
import { UpdateService } from '@app/core/updater/update.service';
import {
  formatUpdaterErrorForUser,
  UPDATER_DOWNLOAD_RELEASES_PAGE_URL,
} from '@app/core/updater/format-updater-error-for-user';
import { ThemeService } from '@app/core/theme/theme.service';
import { UiFontService, type AppearanceTypography } from '@app/core/theme/ui-font.service';
import {
  ANIMATION_SPEED_OPTIONS,
  CURRENT_SETTINGS_SCHEMA_VERSION,
  COLLECTION_FOLDER_CLICK_BEHAVIOR_IDS,
  COLLECTION_SIBLING_SORT_IDS,
  collectionFolderClickBehaviorLabel,
  LOG_LEVEL_OPTIONS,
  createDefaultSettings,
  type DatabaseConnection,
  type SettingsFile,
  type SettingsPatch,
} from '@shared/config';
import type { ConfigFilePaths, LogPaths } from '@app/core/electron/electron-renderer.types';
import {
  DEFAULT_APPEARANCE_THEME_ID,
  UI_FONT_CATALOG,
  UI_FONT_SIZE_OPTIONS,
  UI_FONT_WEIGHT_OPTIONS,
  UI_LINE_HEIGHT_OPTIONS,
  type AppearanceThemeId,
  type UiFontId,
  type UiFontSizeId,
  type UiFontWeightId,
  type UiLineHeightId,
} from '@shared/theme';

import type { UpdateChannel } from '@shared/updater/updater-status.schema';

import { TxBrandLogoComponent } from '../tx-brand-logo/tx-brand-logo.component';
import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxConfirmDialogComponent } from '../tx-confirm-dialog/tx-confirm-dialog.component';
import { TxDropdownComponent } from '../tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxModalComponent } from '../tx-modal/tx-modal.component';
import { TxSliderComponent } from '../tx-slider/tx-slider.component';
import { TxTextareaComponent } from '../tx-textarea/tx-textarea.component';
import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';
import { TxToggleComponent } from '../tx-toggle/tx-toggle.component';

import { HTTP_METHOD_DISPLAY_OPTIONS } from './sections/tx-settings-http-method-display-options';
import { WORKSPACE_EDITOR_LAYOUT_OPTIONS } from './sections/tx-settings-workspace-editor-options';
import { TxSettingsHttpCertificatesSectionComponent } from './sections/tx-settings-http-certificates-section.component';
import { TxSettingsHttpDnsSectionComponent } from './sections/tx-settings-http-dns-section.component';
import { TxSettingsHttpHeadersSectionComponent } from './sections/tx-settings-http-headers-section.component';
import { TxSettingsHttpProxySectionComponent } from './sections/tx-settings-http-proxy-section.component';
import { TxSettingsThemeGroupComponent } from './sections/tx-settings-theme-group.component';
import { SETTINGS_THEME_PICKER_GROUPS } from './sections/tx-settings-theme-picker.data';
import { TxSettingsEditorKeyboardSectionComponent } from './sections/tx-settings-editor-keyboard-section.component';
import { TxSettingsHttpRequestSectionComponent } from './sections/tx-settings-http-request-section.component';
import { TxSettingsHttpRetriesSectionComponent } from './sections/tx-settings-http-retries-section.component';
import { TxSettingsHttpTestingSectionComponent } from './sections/tx-settings-http-testing-section.component';
import { TxSettingsDatabasesSectionComponent } from './sections/tx-settings-databases-section.component';

export type SettingsPopupSection =
  | 'appearance'
  | 'ui'
  | 'editorKeyboard'
  | 'collections'
  | 'environments'
  | 'testSuite'
  | 'general'
  | 'logging'
  | 'databases'
  | 'dataConfig'
  | 'httpRequest'
  | 'httpRetries'
  | 'httpTesting'
  | 'httpHeaders'
  | 'httpCertificates'
  | 'httpDns'
  | 'httpProxy'
  | 'privacy'
  | 'about';

type ConfirmAction =
  | 'clearLogs'
  | 'resetSettings'
  | 'resetSession'
  | 'importSettings'
  | 'changeConfigDir'
  | 'deleteProfile'
  | 'discardDatabases';

interface PendingConfirm {
  readonly action: ConfirmAction;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly variant: 'default' | 'danger';
  readonly payload?: string;
  readonly pendingSection?: SettingsPopupSection;
  readonly closeAfterDiscard?: boolean;
}

export interface SettingsSidebarItem {
  readonly id: SettingsPopupSection;
  readonly label: string;
  readonly icon: string;
}

export interface SettingsSidebarSection {
  readonly title: string;
  readonly items: readonly SettingsSidebarItem[];
}

const THEME_PERSIST_DEBOUNCE_MS = 280;

@Component({
  selector: 'tx-settings-popup',
  standalone: true,
  imports: [
    FormsModule,
    TxBrandLogoComponent,
    TxButtonComponent,
    TxConfirmDialogComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxModalComponent,
    TxSliderComponent,
    TxSpinnerComponent,
    TxTagComponent,
    TxTextareaComponent,
    TxToggleComponent,
    TxSettingsThemeGroupComponent,
    TxSettingsEditorKeyboardSectionComponent,
    TxSettingsHttpRequestSectionComponent,
    TxSettingsHttpRetriesSectionComponent,
    TxSettingsHttpTestingSectionComponent,
    TxSettingsHttpHeadersSectionComponent,
    TxSettingsHttpCertificatesSectionComponent,
    TxSettingsHttpDnsSectionComponent,
    TxSettingsHttpProxySectionComponent,
    TxSettingsDatabasesSectionComponent,
  ],
  templateUrl: './tx-settings-popup.component.html',
  styleUrl: './tx-settings-popup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsPopupComponent {
  readonly open = input(false);
  readonly closed = output<void>();

  private readonly config = inject(ConfigService);
  private readonly profiles = inject(ProfileService);
  private readonly themeService = inject(ThemeService);
  private readonly uiFontService = inject(UiFontService);
  private readonly electron = inject(ElectronService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly notifications = inject(TxNotificationService);
  private readonly updateService = inject(UpdateService);
  private readonly updateBannerContext = inject(UpdateBannerContextService);

  readonly activeSection = signal<SettingsPopupSection>('appearance');
  readonly configDir = signal('…');

  protected readonly activeProfileName = computed(() => this.profiles.activeProfile()?.name ?? '—');
  protected readonly workspaceProfiles = this.profiles.profiles;
  protected readonly activeProfileId = this.profiles.activeProfileId;
  readonly configFilePaths = signal<ConfigFilePaths | null>(null);
  readonly logPaths = signal<LogPaths | null>(null);
  readonly logTailPreview = signal('');
  readonly confirmOpen = signal(false);
  readonly pendingConfirm = signal<PendingConfirm | null>(null);
  readonly renameProfileOpen = signal(false);
  readonly renameProfileTargetId = signal<string | null>(null);
  readonly renameProfileDraftName = signal('');
  readonly isVisible = signal(false);
  readonly isShown = signal(false);
  readonly isClosing = signal(false);
  /** Sidebar entrance: play only during first open, then lock with settled (no --play). */
  protected readonly sidebarStaggerPlay = signal(false);
  protected readonly sidebarStaggerSettled = signal(false);
  /** Suppresses open/close transitions while crossing `animationSpeed: none`. */
  protected readonly freezePopupMotion = signal(false);
  /** After first open animation, disables dialog scale/fade transitions (section switches). */
  protected readonly dialogMotionSettled = signal(false);
  /** One-shot open keyframe on the dialog card (removed after `animationend`). */
  protected readonly popupOpening = signal(false);
  /** Active section whose content pane is playing entrance stagger (sidebar/popup stay static). */
  protected readonly contentStaggerPlay = signal<SettingsPopupSection | null>(null);
  /** Brief reset between `--play` off/on so CSS entrance animations restart on remounted panes. */
  private readonly contentStaggerArming = signal(false);
  /** Sections visited this popup session (skips entrance stagger on revisit). */
  private readonly visitedSections = signal<ReadonlySet<SettingsPopupSection>>(new Set());

  /** Draft database connections while the Databases tab is active (explicit save). */
  protected readonly databasesDraft = signal<readonly DatabaseConnection[]>([]);
  private databasesBaselineJson: string | null = null;

  readonly settings = computed(() => this.config.settings());

  /** Stable settings reference for the template so the pane is not torn down on unrelated updates. */
  protected readonly settingsView = computed(
    () => this.config.settings() ?? createDefaultSettings(),
  );

  readonly bridgeMeta = computed(() => {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return null;
    }
    return {
      platform: bridge.platform,
      app: bridge.versions.app,
      electron: bridge.versions.electron,
      chrome: bridge.versions.chrome,
      devToolkit: bridge.devToolkit,
    };
  });

  protected readonly updateStatus = this.updateService.status;
  protected readonly releasesPageUrl = UPDATER_DOWNLOAD_RELEASES_PAGE_URL;

  protected readonly updateStatusMessage = computed(() => {
    const status = this.updateStatus();
    switch (status.state) {
      case 'checking':
        return 'Checking for updates…';
      case 'available':
        return status.info?.version
          ? `Version ${status.info.version} is available.`
          : 'A new version is available.';
      case 'downloading':
        return `Downloading… ${status.info?.percent ?? 0}%`;
      case 'downloaded':
        return 'Update downloaded. Restart to install.';
      case 'not-available':
        return 'You are on the latest version.';
      case 'error':
        return formatUpdaterErrorForUser(status.message);
      case 'disabled':
        return status.message ?? 'Updates apply to installed builds.';
      default:
        return 'Check for updates to see if a new version is available.';
    }
  });

  /** Pre-resolved theme cards for the appearance grid. */
  protected readonly themePickerGroups = SETTINGS_THEME_PICKER_GROUPS;

  protected readonly appearanceSettings = computed(
    () => this.settings()?.appearance ?? createDefaultSettings().appearance,
  );

  protected readonly activeAppearanceTheme = computed(
    () =>
      this.themePreviewId() ??
      this.settings()?.appearance.theme ??
      DEFAULT_APPEARANCE_THEME_ID,
  );

  protected readonly animationSpeedOptions = ANIMATION_SPEED_OPTIONS;
  protected readonly logLevelOptions = LOG_LEVEL_OPTIONS.map((opt) => ({
    value: opt.id,
    label: opt.label,
  }));
  protected readonly collectionSortOptions = COLLECTION_SIBLING_SORT_IDS.map((id) => ({
    value: id,
    label: collectionSiblingSortLabel(id),
  }));
  protected readonly collectionFolderClickOptions = COLLECTION_FOLDER_CLICK_BEHAVIOR_IDS.map((id) => ({
    value: id,
    label: collectionFolderClickBehaviorLabel(id),
  }));
  protected readonly editorLayoutOptions = WORKSPACE_EDITOR_LAYOUT_OPTIONS;
  protected readonly httpMethodDisplayOptions = HTTP_METHOD_DISPLAY_OPTIONS;
  protected readonly uiFontOptions = UI_FONT_CATALOG.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));
  protected readonly uiFontSizeOptions = UI_FONT_SIZE_OPTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));
  protected readonly uiFontWeightOptions = UI_FONT_WEIGHT_OPTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));
  protected readonly uiLineHeightOptions = UI_LINE_HEIGHT_OPTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));
  protected readonly settingsSchemaVersion = CURRENT_SETTINGS_SCHEMA_VERSION;

  readonly hasElectronBridge = computed(() => this.electron.bridge() !== null);

  readonly activeSectionLabel = computed(
    () => this.findSidebarItem(this.activeSection())?.label ?? 'Settings',
  );

  readonly sidebarSections: readonly SettingsSidebarSection[] = [
    {
      title: 'Preferences',
      items: [
        { id: 'appearance', label: 'Appearance', icon: 'settings' },
        { id: 'ui', label: 'User Interface', icon: 'sliders' },
        { id: 'editorKeyboard', label: 'Keyboard', icon: 'code' },
        { id: 'collections', label: 'Collections', icon: 'folder' },
        { id: 'environments', label: 'Environments', icon: 'globe' },
        { id: 'testSuite', label: 'Test Suite', icon: 'testing' },
        { id: 'general', label: 'General', icon: 'folder' },
      ],
    },
    {
      title: 'HTTP',
      items: [
        { id: 'httpRequest', label: 'Request', icon: 'api' },
        { id: 'httpRetries', label: 'Retries', icon: 'refresh' },
        { id: 'httpTesting', label: 'Testing', icon: 'testing' },
        { id: 'httpHeaders', label: 'Headers', icon: 'layers' },
        { id: 'httpCertificates', label: 'Certificates', icon: 'shield' },
        { id: 'httpDns', label: 'DNS', icon: 'globe' },
        { id: 'httpProxy', label: 'Proxy', icon: 'cloud' },
      ],
    },
    {
      title: 'System',
      items: [
        { id: 'logging', label: 'Logging', icon: 'terminal' },
        { id: 'databases', label: 'Databases', icon: 'database' },
        { id: 'dataConfig', label: 'Data & Config', icon: 'folder' },
        { id: 'privacy', label: 'Privacy', icon: 'shield' },
      ],
    },
    {
      title: 'Application',
      items: [{ id: 'about', label: 'About', icon: 'info' }],
    },
  ];

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private dialogSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private staggerSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private contentStaggerTimer: ReturnType<typeof setTimeout> | null = null;
  private themePersistTimer: ReturnType<typeof setTimeout> | null = null;
  private themePersistTarget: AppearanceThemeId | null = null;
  private readonly themePreviewId = signal<AppearanceThemeId | null>(null);

  protected readonly contentScrollRef = viewChild<ElementRef<HTMLElement>>('contentScroll');

  constructor() {
    effect(() => {
      if (this.open()) {
        // Already open or mid-close — do not reset isShown / stagger.
        if (this.isVisible() || this.isClosing()) {
          return;
        }
        this.cancelCloseTimer();
        this.isClosing.set(false);
        this.isVisible.set(true);
        this.visitedSections.set(new Set([this.activeSection()]));
        this.scheduleOpenTransition();
        void this.loadConfigDir();
        void this.refreshSectionData(this.activeSection());
        return;
      }

      if (this.isVisible() && !this.isClosing()) {
        this.beginClose(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      this.cancelCloseTimer();
      this.cancelOpenTimer();
      this.cancelStaggerSettleTimer();
      this.cancelDialogSettleTimer();
      this.cancelContentStaggerTimer();
      this.cancelThemePersistTimer();
      this.updateBannerContext.setUpdatesPanelActive(false);
    });

    effect(() => {
      const onAbout = this.isVisible() && this.activeSection() === 'about';
      this.updateBannerContext.setUpdatesPanelActive(onAbout);
    });
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.isVisible() && !this.isClosing()) {
      this.handleClose();
    }
  }

  protected selectSection(id: SettingsPopupSection): void {
    if (this.activeSection() === id) {
      return;
    }
    if (this.isDatabasesDirty() && this.activeSection() === 'databases') {
      this.openConfirm({
        action: 'discardDatabases',
        title: 'Unsaved database changes',
        message: 'You have unsaved connection changes. Discard them and switch sections?',
        confirmLabel: 'Discard',
        variant: 'danger',
        pendingSection: id,
      });
      return;
    }
    this.activateSection(id);
  }

  private activateSection(id: SettingsPopupSection): void {
    const alreadyVisited = this.visitedSections().has(id);
    this.visitedSections.update((visited) => new Set([...visited, id]));
    this.activeSection.set(id);
    this.scrollContentToTop();
    if (alreadyVisited) {
      this.contentStaggerPlay.set(null);
      this.contentStaggerArming.set(false);
    } else {
      this.scheduleSectionContentStagger(id);
    }
    void this.refreshSectionData(id);
  }

  protected isDatabasesDirty(): boolean {
    if (this.databasesBaselineJson == null) {
      return false;
    }
    return this.serializeDatabasesDraft() !== this.databasesBaselineJson;
  }

  protected handleDatabasesDraftChange(connections: readonly DatabaseConnection[]): void {
    this.databasesDraft.set(connections);
  }

  protected async handleSaveDatabases(): Promise<void> {
    await this.patch({ databases: { connections: [...this.databasesDraft()] } });
    this.syncDatabasesBaselineFromSettings();
  }

  protected handleCancelDatabases(): void {
    this.loadDatabasesDraftFromSettings();
  }

  private serializeDatabasesDraft(): string {
    return JSON.stringify({ connections: this.databasesDraft() });
  }

  private loadDatabasesDraftFromSettings(): void {
    const connections = this.settingsView().databases?.connections ?? [];
    this.databasesDraft.set(structuredClone(connections));
    this.databasesBaselineJson = JSON.stringify({ connections });
  }

  private syncDatabasesBaselineFromSettings(): void {
    const connections = this.settingsView().databases?.connections ?? [];
    this.databasesDraft.set(structuredClone(connections));
    this.databasesBaselineJson = JSON.stringify({ connections });
  }

  protected isSectionContentAnimating(id: SettingsPopupSection): boolean {
    return this.contentStaggerPlay() === id;
  }

  protected isSectionContentSettled(id: SettingsPopupSection): boolean {
    const play = this.contentStaggerPlay();
    if (play === id) {
      return false;
    }
    if (this.contentStaggerArming() && this.isSectionActive(id)) {
      return false;
    }
    // Active pane mid-switch: keep hidden until stagger targets this section.
    if (this.isSectionActive(id) && play !== null && play !== id) {
      return false;
    }
    return true;
  }

  protected isSectionActive(id: SettingsPopupSection): boolean {
    return this.activeSection() === id;
  }

  protected handlePopupAnimationEnd(event: AnimationEvent): void {
    if (event.target !== event.currentTarget || event.animationName !== 'tx-settings-popup-in') {
      return;
    }
    this.markDialogMotionSettled();
  }

  protected applyTheme(themeId: AppearanceThemeId): void {
    this.themePreviewId.set(themeId);
    this.themeService.loadTheme(themeId);
    this.scheduleThemePersist(themeId);
  }

  protected async applyAppearanceTypography(patch: Partial<AppearanceTypography>): Promise<void> {
    await this.uiFontService.patchAppearanceTypography(patch, true);
  }

  protected async applyUiFont(fontId: UiFontId): Promise<void> {
    await this.applyAppearanceTypography({ uiFont: fontId });
  }

  protected async applyUiFontSize(size: UiFontSizeId): Promise<void> {
    await this.applyAppearanceTypography({ uiFontSize: size });
  }

  protected async applyUiFontWeight(weight: UiFontWeightId): Promise<void> {
    await this.applyAppearanceTypography({ uiFontWeight: weight });
  }

  protected async applyUiLineHeight(lineHeight: UiLineHeightId): Promise<void> {
    await this.applyAppearanceTypography({ uiLineHeight: lineHeight });
  }

  protected readonly isAppearanceAtDefaults = computed(() => {
    const current = this.settings()?.appearance;
    if (!current) {
      return true;
    }
    const defaults = createDefaultSettings().appearance;
    return (
      current.theme === defaults.theme &&
      current.density === defaults.density &&
      current.uiFont === defaults.uiFont &&
      current.uiFontSize === defaults.uiFontSize &&
      current.uiFontWeight === defaults.uiFontWeight &&
      current.uiLineHeight === defaults.uiLineHeight
    );
  });

  protected async resetAppearanceToDefaults(): Promise<void> {
    const appearance = createDefaultSettings().appearance;
    try {
      this.cancelThemePersistTimer();
      this.themePreviewId.set(null);
      await this.config.patchSettings({ appearance });
      this.themeService.loadTheme(appearance.theme);
      this.uiFontService.loadAppearanceTypography(appearance);
      this.notifications.showSuccess('Appearance reset to defaults');
    } catch {
      this.notifications.showError('Could not reset appearance');
    }
  }

  protected async patchGeneralToggle(
    key: keyof SettingsFile['general'],
    value: boolean,
  ): Promise<void> {
    await this.patch({ general: { [key]: value } });
  }

  protected async patchUiToggle(
    key: keyof SettingsFile['ui'],
    value: boolean,
  ): Promise<void> {
    await this.patch({ ui: { [key]: value } });
  }

  protected async patchEditorKeyboard(
    patch: Partial<SettingsFile['editor']['keyboard']>,
  ): Promise<void> {
    await this.patch({ editor: { keyboard: patch } });
  }

  protected async patchAnimationSpeed(speed: SettingsFile['ui']['animationSpeed']): Promise<void> {
    const previous = this.uiPreferences.animationSpeed();
    const crossesNone = previous === 'none' || speed === 'none';

    if (this.isVisible() && crossesNone) {
      this.freezePopupMotion.set(true);
      this.lockSidebarEntrance();
    }

    await this.patch({ ui: { animationSpeed: speed } });

    if (!this.isVisible()) {
      return;
    }

    if (crossesNone) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.freezePopupMotion.set(false));
      });
      return;
    }

    this.lockSidebarEntrance();
  }

  protected async patchPrivacyToggle(value: boolean): Promise<void> {
    await this.patch({ privacy: { telemetryEnabled: value } });
  }

  protected async patchUpdatesToggle(value: boolean): Promise<void> {
    await this.patch({ updates: { checkOnStartup: value } });
  }

  protected async patchUpdatesChannel(channel: UpdateChannel): Promise<void> {
    await this.updateService.setChannel(channel);
  }

  protected handleCheckForUpdates(): void {
    void this.updateService.checkNow();
  }

  protected handleInstallUpdate(): void {
    void this.updateService.installAndRestart();
  }

  protected isUpdatesChannel(channel: UpdateChannel): boolean {
    return this.settingsView().updates.channel === channel;
  }

  protected openReleasesPage(): void {
    this.updateService.openReleaseNotes();
  }

  protected async patchLoggingToggle(
    key: keyof SettingsFile['logging'],
    value: boolean,
  ): Promise<void> {
    await this.patch({ logging: { [key]: value } });
  }

  protected async patchLoggingLevel(level: SettingsFile['logging']['level']): Promise<void> {
    await this.patch({ logging: { level } });
  }

  protected async patchLoggingNumber(
    key: 'maxFileSizeMb' | 'retainedFiles',
    value: number,
  ): Promise<void> {
    await this.patch({ logging: { [key]: value } });
  }

  protected async patchDataConfigToggle(
    key: keyof SettingsFile['dataConfig'],
    value: boolean,
  ): Promise<void> {
    await this.patch({ dataConfig: { [key]: value } });
  }

  protected async patchCollectionsToggle(
    key:
      | 'expandFolderOnDrag'
      | 'animateMove'
      | 'animateExpand'
      | 'foldersFirst'
      | 'showDescriptions'
      | 'showTags',
    value: boolean,
  ): Promise<void> {
    await this.patch({ collections: { [key]: value } });
  }

  protected async patchCollectionsSiblingSort(
    value: SettingsFile['collections']['siblingSort'],
  ): Promise<void> {
    await this.patch({ collections: { siblingSort: value } });
  }

  protected async patchCollectionsFolderClickBehavior(
    value: SettingsFile['collections']['folderClickBehavior'],
  ): Promise<void> {
    await this.patch({ collections: { folderClickBehavior: value } });
  }

  protected async patchCollectionsEditorLayout(
    value: SettingsFile['collections']['editorLayout'],
  ): Promise<void> {
    await this.patch({ collections: { editorLayout: value } });
  }

  protected async patchCollectionsDisplayHttpMethod(
    value: SettingsFile['collections']['displayHttpMethod'],
  ): Promise<void> {
    await this.patch({ collections: { displayHttpMethod: value } });
  }

  protected async patchEnvironmentsToggle(
    key:
      | 'expandFolderOnDrag'
      | 'animateMove'
      | 'animateExpand'
      | 'foldersFirst'
      | 'showDescriptions'
      | 'useFolderPathInKeys',
    value: boolean,
  ): Promise<void> {
    await this.patch({ environments: { [key]: value } });
  }

  protected async patchEnvironmentsSiblingSort(
    value: SettingsFile['environments']['siblingSort'],
  ): Promise<void> {
    await this.patch({ environments: { siblingSort: value } });
  }

  protected async patchTestSuiteToggle(
    key:
      | 'expandFolderOnDrag'
      | 'animateMove'
      | 'animateExpand'
      | 'foldersFirst'
      | 'showDescriptions'
      | 'showTags',
    value: boolean,
  ): Promise<void> {
    await this.patch({ testSuite: { [key]: value } });
  }

  protected async patchTestSuiteSiblingSort(
    value: SettingsFile['testSuite']['siblingSort'],
  ): Promise<void> {
    await this.patch({ testSuite: { siblingSort: value } });
  }

  protected async patchHttpRequest(patch: Partial<SettingsFile['http']['request']>): Promise<void> {
    await this.patch({ http: { request: patch } });
  }

  protected async patchHttpRetries(patch: Partial<SettingsFile['http']['retries']>): Promise<void> {
    await this.patch({ http: { retries: patch } });
  }

  protected async patchHttpTesting(patch: Partial<SettingsFile['http']['testing']>): Promise<void> {
    await this.patch({ http: { testing: patch } });
  }

  protected async patchHttpHeaders(patch: Partial<SettingsFile['http']['headers']>): Promise<void> {
    await this.patch({ http: { headers: patch } });
  }

  protected async patchHttpCertificates(
    patch: Partial<SettingsFile['http']['certificates']>,
  ): Promise<void> {
    await this.patch({ http: { certificates: patch } });
  }

  protected async patchHttpDns(patch: Partial<SettingsFile['http']['dns']>): Promise<void> {
    await this.patch({ http: { dns: patch } });
  }

  protected async patchHttpProxy(patch: Partial<SettingsFile['http']['proxy']>): Promise<void> {
    await this.patch({ http: { proxy: patch } });
  }

  protected handlePickScreenshotFolder(): void {
    void this.pickDirectoryForHttpField({ testing: { e2eScreenshotFolder: '' } }, (path) => ({
      testing: { e2eScreenshotFolder: path },
    }));
  }

  private async pickDirectoryForHttpField(
    _placeholder: SettingsPatch['http'],
    buildPatch: (path: string) => NonNullable<SettingsPatch['http']>,
  ): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.notifications.showError('Available in the desktop app only');
      return;
    }
    try {
      const picked = await bridge.config.pickDirectory();
      if (!picked) {
        return;
      }
      await this.patch({ http: buildPatch(picked) });
    } catch {
      this.notifications.showError('Could not choose directory');
    }
  }

  protected requestClearLogs(): void {
    this.openConfirm({
      action: 'clearLogs',
      title: 'Clear log files',
      message: 'This removes the main log file and rotated copies. This cannot be undone.',
      confirmLabel: 'Clear logs',
      variant: 'danger',
    });
  }

  protected requestResetSettings(): void {
    this.openConfirm({
      action: 'resetSettings',
      title: 'Reset settings',
      message:
        'Restore all settings to factory defaults. Appearance, HTTP, logging, and data options will reset.',
      confirmLabel: 'Reset settings',
      variant: 'danger',
    });
  }

  protected requestResetSession(): void {
    this.openConfirm({
      action: 'resetSession',
      title: 'Reset session',
      message: 'Clear window layout, navigation, and workspace session data.',
      confirmLabel: 'Reset session',
      variant: 'danger',
    });
  }

  protected requestImportSettings(json: string): void {
    this.openConfirm({
      action: 'importSettings',
      title: 'Import settings',
      message: 'Replace your current settings file with the selected JSON. Continue?',
      confirmLabel: 'Import',
      variant: 'danger',
      payload: json,
    });
  }

  protected handleImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (text.trim().length > 0) {
        this.requestImportSettings(text);
      }
    };
    reader.readAsText(file);
  }

  protected async handleExportSettings(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.notifications.showError('Export is only available in the desktop app');
      return;
    }
    try {
      const json = await bridge.config.exportSettings();
      await navigator.clipboard.writeText(json);
      this.notifications.showSuccess('Settings JSON copied to clipboard');
    } catch {
      this.notifications.showError('Could not export settings');
    }
  }

  protected async handleOpenConfigDir(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.notifications.showError('Available in the desktop app only');
      return;
    }
    try {
      await bridge.config.openConfigDir();
    } catch {
      this.notifications.showError('Could not open config folder');
    }
  }

  protected async handleOpenLogDir(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.notifications.showError('Available in the desktop app only');
      return;
    }
    try {
      await bridge.logging.openLogDir();
    } catch {
      this.notifications.showError('Could not open logs folder');
    }
  }

  protected async handleCopyPath(pathValue: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(pathValue);
      this.notifications.showSuccess('Path copied');
    } catch {
      this.notifications.showError('Could not copy path');
    }
  }

  protected async handleChangeConfigDir(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.notifications.showError('Available in the desktop app only');
      return;
    }
    try {
      const picked = await bridge.config.pickDirectory();
      if (!picked) {
        return;
      }
      this.openConfirm({
        action: 'changeConfigDir',
        title: 'Change global settings folder',
        message: `Use "${picked}" for global settings.json? Workspace profiles (collections, session, history) stay under each profile folder. Switch profiles from the titlebar.`,
        confirmLabel: 'Change folder',
        variant: 'default',
        payload: picked,
      });
    } catch {
      this.notifications.showError('Could not choose directory');
    }
  }

  protected async handleChooseWorkspaceFolder(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.notifications.showError('Available in the desktop app only');
      return;
    }
    try {
      const picked = await bridge.config.pickDirectory();
      if (!picked) {
        return;
      }
      await this.patch({ general: { configFolderPath: picked } });
    } catch {
      this.notifications.showError('Could not choose workspace folder');
    }
  }

  protected async handleRefreshLogTail(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return;
    }
    try {
      this.logTailPreview.set(await bridge.logging.tail({ maxLines: 200 }));
    } catch {
      this.notifications.showError('Could not read log file');
    }
  }

  protected handleConfirmDialogClosed(): void {
    this.confirmOpen.set(false);
    this.pendingConfirm.set(null);
  }

  protected async handleConfirmDialogConfirmed(): Promise<void> {
    const pending = this.pendingConfirm();
    this.confirmOpen.set(false);
    this.pendingConfirm.set(null);
    if (!pending) {
      return;
    }

    const bridge = this.electron.bridge();
    try {
      switch (pending.action) {
        case 'clearLogs':
          if (bridge) {
            await bridge.logging.clear();
            this.logTailPreview.set('');
            this.notifications.showSuccess('Log files cleared');
          }
          break;
        case 'resetSettings':
          if (bridge) {
            const next = await bridge.config.resetSettings();
            this.config.syncSettings(next);
            this.themeService.loadTheme(next.appearance.theme);
            this.uiFontService.loadAppearanceTypography(next.appearance);
            this.notifications.showSuccess('Settings reset to defaults');
          }
          break;
        case 'resetSession':
          if (bridge) {
            await bridge.config.resetSession();
            this.notifications.showSuccess('Session reset');
          }
          break;
        case 'importSettings':
          if (bridge && pending.payload) {
            const next = await bridge.config.importSettings(pending.payload);
            this.config.syncSettings(next);
            this.themeService.loadTheme(next.appearance.theme);
            this.uiFontService.loadAppearanceTypography(next.appearance);
            this.notifications.showSuccess('Settings imported');
          }
          break;
        case 'changeConfigDir':
          if (bridge && pending.payload) {
            await bridge.config.setConfigDir(pending.payload);
            await this.config.hydrate();
            await this.loadConfigDir();
            await this.refreshSectionData('dataConfig');
            this.notifications.showSuccess('Config directory updated');
          }
          break;
        case 'deleteProfile':
          if (pending.payload) {
            await this.profiles.deleteProfile(pending.payload);
            await this.refreshSectionData('dataConfig');
            this.notifications.showSuccess('Profile deleted');
          }
          break;
        case 'discardDatabases':
          this.loadDatabasesDraftFromSettings();
          if (pending.pendingSection) {
            this.activateSection(pending.pendingSection);
          } else if (pending.closeAfterDiscard) {
            this.beginClose(true);
          }
          break;
      }
    } catch {
      this.notifications.showError('Action failed');
    }
  }

  protected handleBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('tx-settings')) {
      this.handleClose();
    }
  }

  protected handleClose(): void {
    if (!this.isVisible() || this.isClosing()) {
      return;
    }
    if (this.isDatabasesDirty() && this.activeSection() === 'databases') {
      this.openConfirm({
        action: 'discardDatabases',
        title: 'Unsaved database changes',
        message: 'You have unsaved connection changes. Discard them and close settings?',
        confirmLabel: 'Discard',
        variant: 'danger',
        closeAfterDiscard: true,
      });
      return;
    }
    this.beginClose(true);
  }

  protected handleRenameProfile(profileId: string): void {
    const entry = this.workspaceProfiles().find((p) => p.id === profileId);
    if (!entry) {
      return;
    }
    this.renameProfileTargetId.set(profileId);
    this.renameProfileDraftName.set(entry.name);
    this.renameProfileOpen.set(true);
  }

  protected handleCloseRenameProfile(): void {
    this.renameProfileOpen.set(false);
    this.renameProfileTargetId.set(null);
  }

  protected async handleConfirmRenameProfile(): Promise<void> {
    const profileId = this.renameProfileTargetId();
    const name = this.renameProfileDraftName().trim();
    if (!profileId || !name) {
      return;
    }
    this.renameProfileOpen.set(false);
    this.renameProfileTargetId.set(null);
    await this.profiles.renameProfile(profileId, name);
    this.notifications.showSuccess('Profile renamed');
  }

  protected handleDeleteProfile(profileId: string): void {
    const entry = this.workspaceProfiles().find((p) => p.id === profileId);
    if (!entry) {
      return;
    }
    if (profileId === this.activeProfileId()) {
      this.notifications.showError('Switch to another profile before deleting the active one');
      return;
    }
    this.openConfirm({
      action: 'deleteProfile',
      title: 'Delete profile',
      message: `Delete "${entry.name}"? This removes its workspace data and cannot be undone.`,
      confirmLabel: 'Delete profile',
      variant: 'danger',
      payload: profileId,
    });
  }

  protected async handleReloadConfig(): Promise<void> {
    try {
      await Promise.all([this.config.hydrate(), this.profiles.hydrate()]);
      await this.loadConfigDir();
      this.notifications.showSuccess('Configuration reloaded');
    } catch {
      this.notifications.showError('Could not reload configuration');
    }
  }

  private beginClose(emitClosed: boolean): void {
    if (this.isClosing()) {
      return;
    }
    if (emitClosed) {
      this.closed.emit();
    }
    if (!this.isVisible()) {
      return;
    }
    this.cancelOpenTimer();
    void this.flushThemePersist();
    this.themePreviewId.set(null);
    this.isClosing.set(true);
    this.isShown.set(false);
    this.sidebarStaggerPlay.set(false);
    this.sidebarStaggerSettled.set(false);
    this.dialogMotionSettled.set(false);
    this.popupOpening.set(false);
    this.visitedSections.set(new Set());
    this.contentStaggerPlay.set(null);
    this.contentStaggerArming.set(false);
    this.freezePopupMotion.set(false);
    this.cancelStaggerSettleTimer();
    this.cancelContentStaggerTimer();
    this.cancelDialogSettleTimer();
    this.cancelCloseTimer();

    const duration = this.uiPreferences.animationsEnabled() ? this.popupCloseMs() : 0;
    if (duration === 0) {
      this.isVisible.set(false);
      this.isClosing.set(false);
      return;
    }

    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.isVisible.set(false);
      this.isClosing.set(false);
    }, duration);
  }

  private scheduleOpenTransition(): void {
    this.cancelOpenTimer();
    this.isShown.set(false);

    if (!this.uiPreferences.entranceStaggerEnabled()) {
      this.isShown.set(true);
      this.popupOpening.set(true);
      this.lockSidebarEntrance();
      this.scheduleDialogMotionSettledFallback();
      return;
    }

    this.lockSidebarEntrance();
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      requestAnimationFrame(() => {
        if (this.isVisible() && !this.isClosing()) {
          this.isShown.set(true);
          this.popupOpening.set(true);
          this.scheduleDialogMotionSettledFallback();
          this.scheduleSectionContentStagger(this.activeSection());
        }
      });
    }, 0);
  }

  /** Fallback if `animationend` does not fire (reduced motion, old engines). */
  private scheduleDialogMotionSettledFallback(): void {
    this.cancelDialogSettleTimer();
    const motionScale =
      typeof document !== 'undefined'
        ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tx-motion-scale')) || 1
        : 1;
    const popupMs = Math.round(340 * motionScale);

    this.dialogSettleTimer = setTimeout(() => {
      this.dialogSettleTimer = null;
      if (!this.isVisible() || this.isClosing()) {
        return;
      }
      this.markDialogMotionSettled();
    }, popupMs);
  }

  /** After open motion ends, lock shell transitions (section switches animate content only). */
  private markDialogMotionSettled(): void {
    this.popupOpening.set(false);
    this.dialogMotionSettled.set(true);
  }

  /** Content-pane stagger on first visit to a section (never replays sidebar or dialog shell). */
  private scheduleSectionContentStagger(id: SettingsPopupSection): void {
    this.cancelContentStaggerTimer();

    if (!this.uiPreferences.entranceStaggerEnabled()) {
      this.contentStaggerPlay.set(null);
      this.contentStaggerArming.set(false);
      return;
    }

    if (id === 'appearance') {
      this.contentStaggerPlay.set(null);
      this.contentStaggerArming.set(false);
      return;
    }

    this.contentStaggerArming.set(false);
    this.contentStaggerPlay.set(id);
    this.scheduleContentStaggerEnd();
  }

  private scheduleContentStaggerEnd(): void {
    this.cancelContentStaggerTimer();

    if (!this.uiPreferences.entranceStaggerEnabled()) {
      return;
    }

    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const styles = root ? getComputedStyle(root) : null;
    const stepMs = styles ? Number.parseFloat(styles.getPropertyValue('--tx-entrance-stagger-step')) || 42 : 42;
    const durationMs =
      (styles ? Number.parseFloat(styles.getPropertyValue('--tx-entrance-stagger-duration')) || 0.3 : 0.3) *
      1000;
    const blockCount = 12;
    const settleMs = stepMs * blockCount + durationMs + 40;

    this.contentStaggerTimer = setTimeout(() => {
      this.contentStaggerTimer = null;
      if (this.contentStaggerPlay() === this.activeSection()) {
        this.contentStaggerPlay.set(null);
      }
    }, settleMs);
  }

  private cancelContentStaggerTimer(): void {
    if (this.contentStaggerTimer !== null) {
      clearTimeout(this.contentStaggerTimer);
      this.contentStaggerTimer = null;
    }
  }

  private scrollContentToTop(): void {
    queueMicrotask(() => {
      this.contentScrollRef()?.nativeElement.scrollTo({ top: 0 });
    });
  }

  private cancelDialogSettleTimer(): void {
    if (this.dialogSettleTimer !== null) {
      clearTimeout(this.dialogSettleTimer);
      this.dialogSettleTimer = null;
    }
  }

  /** Sidebar entrance stagger — runs once per popup open, not on section change. */
  private replaySidebarOpenStagger(): void {
    if (!this.uiPreferences.entranceStaggerEnabled()) {
      this.lockSidebarEntrance();
      return;
    }

    this.sidebarStaggerSettled.set(false);
    this.sidebarStaggerPlay.set(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.isVisible() || this.isClosing()) {
          return;
        }
        this.sidebarStaggerPlay.set(true);
        this.scheduleSidebarEntranceSettled();
      });
    });
  }

  private scheduleSidebarEntranceSettled(): void {
    this.cancelStaggerSettleTimer();

    if (!this.uiPreferences.entranceStaggerEnabled()) {
      this.lockSidebarEntrance();
      return;
    }

    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const styles = root ? getComputedStyle(root) : null;
    const stepMs = styles ? Number.parseFloat(styles.getPropertyValue('--tx-entrance-stagger-step')) || 42 : 42;
    const durationMs =
      (styles ? Number.parseFloat(styles.getPropertyValue('--tx-entrance-stagger-duration')) || 0.3 : 0.3) *
      1000;
    const settleMs = stepMs * 12 + durationMs;

    this.staggerSettleTimer = setTimeout(() => {
      this.staggerSettleTimer = null;
      if (!this.isVisible() || this.isClosing()) {
        return;
      }
      this.lockSidebarEntrance();
    }, settleMs);
  }

  /** Keeps sidebar visible with no entrance animation (section switches, after open). */
  private lockSidebarEntrance(): void {
    this.sidebarStaggerPlay.set(false);
    this.sidebarStaggerSettled.set(true);
  }

  private scheduleThemePersist(themeId: AppearanceThemeId): void {
    this.themePersistTarget = themeId;
    this.cancelThemePersistTimer();
    this.themePersistTimer = setTimeout(() => {
      this.themePersistTimer = null;
      void this.flushThemePersist();
    }, THEME_PERSIST_DEBOUNCE_MS);
  }

  private cancelThemePersistTimer(): void {
    if (this.themePersistTimer !== null) {
      clearTimeout(this.themePersistTimer);
      this.themePersistTimer = null;
    }
  }

  private async flushThemePersist(): Promise<void> {
    this.cancelThemePersistTimer();
    const themeId = this.themePersistTarget;
    this.themePersistTarget = null;
    if (!themeId) {
      return;
    }
    const persisted = this.settings()?.appearance.theme;
    if (persisted === themeId) {
      this.themePreviewId.set(null);
      return;
    }
    try {
      await this.config.patchSettings({ appearance: { theme: themeId } });
      this.themePreviewId.set(null);
    } catch {
      this.notifications.showError('Could not save theme');
    }
  }

  private cancelStaggerSettleTimer(): void {
    if (this.staggerSettleTimer !== null) {
      clearTimeout(this.staggerSettleTimer);
      this.staggerSettleTimer = null;
    }
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  /** Aligns unmount with `--tx-settings-popup-duration` (popup + backdrop close). */
  private popupCloseMs(): number {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const styles = root ? getComputedStyle(root) : null;
    const motionScale = styles ? Number.parseFloat(styles.getPropertyValue('--tx-motion-scale')) || 1 : 1;
    return Math.round(340 * motionScale);
  }

  private cancelOpenTimer(): void {
    if (this.openTimer !== null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  private findSidebarItem(id: SettingsPopupSection): SettingsSidebarItem | undefined {
    for (const group of this.sidebarSections) {
      const item = group.items.find((entry) => entry.id === id);
      if (item) {
        return item;
      }
    }
    return undefined;
  }

  private async patch(patch: SettingsPatch): Promise<void> {
    try {
      await this.config.patchSettings(patch);
      this.notifications.showSuccess(this.successMessageForPatch(patch));
    } catch {
      this.notifications.showError('Could not save settings');
    }
  }

  private successMessageForPatch(patch: SettingsPatch): string {
    if (patch.ui?.animationSpeed != null) {
      const speed = patch.ui.animationSpeed;
      const label = ANIMATION_SPEED_OPTIONS.find((entry) => entry.id === speed)?.label;
      if (speed === 'none') {
        return 'Animations disabled';
      }
      return label ? `Animation speed set to ${label.toLowerCase()}` : 'Animation speed updated';
    }

    if (patch.ui != null) {
      return 'Interface settings saved';
    }

    if (patch.general != null) {
      return 'General settings saved';
    }

    if (patch.privacy != null) {
      return 'Privacy settings saved';
    }

    if (patch.updates != null) {
      return 'Update settings saved';
    }

    if (patch.logging != null) {
      return 'Logging settings saved';
    }

    if (patch.collections != null) {
      return 'Collections settings saved';
    }

    if (patch.environments != null) {
      return 'Environments settings saved';
    }

    if (patch.testSuite != null) {
      return 'Test Suite settings saved';
    }

    if (patch.dataConfig != null) {
      return 'Data & config settings saved';
    }

    if (patch.appearance != null) {
      return 'Appearance settings saved';
    }

    if (patch.http != null) {
      return 'HTTP settings saved';
    }

    if (patch.databases != null) {
      return 'Database connections saved';
    }

    return 'Settings saved';
  }

  private openConfirm(confirm: PendingConfirm): void {
    this.pendingConfirm.set(confirm);
    this.confirmOpen.set(true);
  }

  private async refreshSectionData(section: SettingsPopupSection): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return;
    }

    if (section === 'logging') {
      try {
        this.logPaths.set(await bridge.logging.getPaths());
        await this.handleRefreshLogTail();
      } catch {
        this.logPaths.set(null);
      }
      return;
    }

    if (section === 'dataConfig') {
      try {
        await this.profiles.hydrate();
        this.configFilePaths.set(await bridge.config.getFilePaths());
        await this.loadConfigDir();
      } catch {
        this.configFilePaths.set(null);
      }
      return;
    }

    if (section === 'databases') {
      this.loadDatabasesDraftFromSettings();
    }
  }

  private async loadConfigDir(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.configDir.set('(browser harness)');
      return;
    }
    try {
      this.configDir.set(await bridge.config.getConfigDir());
    } catch {
      this.configDir.set('(unavailable)');
    }
  }
}

function collectionSiblingSortLabel(id: (typeof COLLECTION_SIBLING_SORT_IDS)[number]): string {
  switch (id) {
    case 'order':
      return 'Order';
    case 'priority':
      return 'Priority';
    case 'orderThenPriority':
      return 'Order, then priority';
    case 'manual':
      return 'Manual (drag only)';
    default:
      return id;
  }
}
