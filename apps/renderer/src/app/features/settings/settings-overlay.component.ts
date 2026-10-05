import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxHintComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
  TxSelectComponent,
  type TxSelectOption,
} from '@testrix/ui';
import {
  DATABASE_IDLE_DISCONNECT_MINUTES_MAX,
  DATABASE_IDLE_DISCONNECT_MINUTES_MIN,
  DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MAX,
  DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MIN,
  FONT_MONO_OPTIONS,
  FONT_UI_OPTIONS,
  LOG_FILE_MAX_MB_MAX,
  LOG_FILE_MAX_MB_MIN,
  LOG_LEVEL_OPTIONS,
  PROXY_MODE_OPTIONS,
  SHORTCUT_CATALOG,
  TYPE_SCALE_OPTIONS,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  UI_ZOOM_STEP,
  ANDROID_SDK_LICENSE_SUMMARY,
  androidSystemImageTagLabel,
  CONFIG_GLOBAL_FILES,
  CONFIG_WORKSPACE_FILES,
  clampUiZoom,
  emptyAndroidToolchainStatus,
  createClientCertificate,
  type AnimationSpeed,
  type MotionPreset,
  type SaveMode,
  motionPresetFromSpeeds,
  speedsForMotionPreset,
  type CertFileKind,
  type CertificateSettings,
  type ClientCertificate,
  type ConfigRevealTarget,
  type DatabasePrefs,
  type DnsMode,
  type DnsSettings,
  type FontMono,
  type FontUi,
  type LogLevel,
  type ProxyMode,
  type ProxySettings,
  type AndroidSystemImageTag,
  type AndroidToolchainEvent,
  type AndroidToolchainStatus,
  type SettingsResetScope,
  type ShortcutId,
  type ThemePreference,
  type TypeScale,
  type WorkspaceFootprintDto,
} from '@testrix/contracts';

import { DesktopApiService } from '../../core/desktop-api.service';
import { persistMockRows, withTrailingRow, type MockKeyValue } from '../workbench/request/request-mock';
import { CollabSettingsPaneComponent } from '../collab/collab-settings-pane.component';
import { UpdateSettingsPaneComponent } from '../updates/update-settings-pane.component';
import { UpdateStore } from '../updates/update.store';
import { updateStatusLine } from '../updates/update-view';
import { RequestKvTableComponent } from '../workbench/request/request-kv-table.component';
import { formatShortcut } from '../../core/shortcut-match';
import { ShellStateService } from '../../core/shell-state.service';
import { CookieAuthDialogService } from '../cookie-auth/cookie-auth-dialog.service';
import { ExportWorkspaceDialogService } from '../workspace-transfer/export-workspace-dialog.service';
import { ImportWorkspaceDialogService } from '../workspace-transfer/import-workspace-dialog.service';
import { DatabaseStore } from '../database/database.store';
import { HistoryStore } from '../history/history.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import {
  SETTINGS_NAV,
  SETTINGS_NAV_GROUPS,
  filterSettingsHits,
  type SettingsCategory,
} from './settings-registry';
import {
  fullStepIndexForCategory,
  NETWORK_ESSENTIALS_PHASES,
  resolveSettingsDeepLink,
  wizardStepsForMode,
  type SettingsWizardMode,
} from './settings-wizard';
import { ServicesStore } from '../services/services.store';
import {
  DNS_MODE_LABELS,
  FONT_MONO_LABELS,
  FONT_MONO_STACKS,
  FONT_UI_LABELS,
  FONT_UI_STACKS,
  LOG_LEVEL_LABELS,
  PROXY_MODE_LABELS,
  SCALE_LABELS,
  SCALE_PREVIEW,
  TAB_WARN_THRESHOLD_MAX,
  TAB_WARN_THRESHOLD_MIN,
} from './settings-overlay.options';

@Component({
  selector: 'tx-settings-overlay',
  standalone: true,
  imports: [
    TxOverlayComponent,
    TxButtonComponent,
    TxCheckComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
    CollabSettingsPaneComponent,
    UpdateSettingsPaneComponent,
    RequestKvTableComponent,
  ],
  templateUrl: './settings-overlay.component.html',
  styleUrl: './settings-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class SettingsOverlayComponent {
  readonly desktop = inject(DesktopApiService);
  private readonly updates = inject(UpdateStore);
  readonly updateStatusLine = computed(() => updateStatusLine(this.updates.status()));
  readonly database = inject(DatabaseStore);
  readonly history = inject(HistoryStore);
  readonly workbench = inject(WorkbenchStore);
  readonly shell = inject(ShellStateService);
  private readonly services = inject(ServicesStore);
  readonly footprint = signal<WorkspaceFootprintDto | null>(null);
  readonly tabWarnMin = TAB_WARN_THRESHOLD_MIN;
  readonly tabWarnMax = TAB_WARN_THRESHOLD_MAX;
  private readonly cookieAuth = inject(CookieAuthDialogService);
  private readonly exportWorkspace = inject(ExportWorkspaceDialogService);
  private readonly importWorkspace = inject(ImportWorkspaceDialogService);

  readonly wizardMode = signal<SettingsWizardMode>('full');
  readonly wizardStepIndex = signal(0);
  readonly networkEssentialsPhase = signal(0);
  /** True after this open of Settings has applied its first-run or deep-link intent. */
  private didApplyOpen = false;

  readonly wizardSteps = computed(() => wizardStepsForMode(this.wizardMode()));
  readonly currentWizardStep = computed(() => {
    const steps = this.wizardSteps();
    const index = this.wizardStepIndex();
    return steps[Math.min(Math.max(index, 0), steps.length - 1)] ?? steps[0]!;
  });
  readonly wizardGroupIndex = computed(() => this.currentWizardStep().groupIndex);
  readonly activeGroupCategories = computed(
    () => SETTINGS_NAV_GROUPS[this.wizardGroupIndex()]?.ids ?? [],
  );
  readonly showWizardChrome = computed(
    () => !this.query().trim() && this.hits().length === 0,
  );
  readonly isFirstWizardStep = computed(() => {
    if (
      this.wizardMode() === 'abbreviated'
      && this.currentWizardStep().id === 'network-essentials'
      && this.networkEssentialsPhase() > 0
    )
      return false;
    return this.wizardStepIndex() <= 0;
  });
  readonly isLastWizardStep = computed(() => {
    if (
      this.wizardMode() === 'abbreviated'
      && this.currentWizardStep().id === 'network-essentials'
      && this.networkEssentialsPhase() < NETWORK_ESSENTIALS_PHASES.length - 1
    )
      return false;
    return this.wizardStepIndex() >= this.wizardSteps().length - 1;
  });

  constructor() {
    effect(() => {
      if (!this.shell.settingsOpen()) {
        this.didApplyOpen = false;
        return;
      }
      if (this.shell.settingsCategory() === 'android') {
        this.shell.closeOverlays();
        this.shell.openRail('services');
        this.services.drillIn('emulator');
        return;
      }
      const deepCategory = this.shell.settingsCategory();
      const deepHighlight = this.shell.settingsHighlight();
      if (deepCategory) {
        this.wizardMode.set('full');
        const { stepIndex } = resolveSettingsDeepLink(deepCategory);
        this.wizardStepIndex.set(stepIndex >= 0 ? stepIndex : 0);
        this.networkEssentialsPhase.set(0);
        this.paneSlideDir.set(this.slideDirTo(deepCategory));
        this.category.set(deepCategory);
        this.query.set('');
        this.flashHighlight(deepHighlight);
        this.applyHighlightSideEffects(deepHighlight, deepCategory);
        if (deepCategory === 'logging')
          void this.refreshLogs();
        if (deepCategory === 'data')
          void this.refreshFootprint();
        this.didApplyOpen = true;
        queueMicrotask(() => {
          this.shell.settingsCategory.set(null);
          this.shell.settingsHighlight.set(null);
        });
        return;
      }
      if (this.didApplyOpen)
        return;
      this.didApplyOpen = true;
      if (!this.desktop.settings().settingsWizardCompleted) {
        this.wizardMode.set('abbreviated');
        this.wizardStepIndex.set(0);
        this.networkEssentialsPhase.set(0);
        this.category.set('appearance');
        this.highlightId.set(null);
        this.query.set('');
      }
    });
    effect(() => {
      const tick = this.exportWorkspace.settingsFlashTick();
      if (tick <= 0)
        return;
      this.highlightId.set('export-workspace');
      window.setTimeout(() => {
        if (this.highlightId() === 'export-workspace')
          this.highlightId.set(null);
      }, 920);
    });
    const onKey = (event: Event) => this.handleCaptureKey(event);
    window.addEventListener('keydown', onKey, true);
    const stopDevice = this.desktop.api.services.onDeviceEvent((event) => {
      if (event.phase === 'done') {
        const current = this.deviceProgress();
        if (current?.phase === 'remove' || current?.phase === 'download' || current?.phase === 'extract')
          void this.refreshDeviceStatus();
        else
          this.deviceProgress.set(null);
      } else {
        this.deviceProgress.set(event);
      }
      void this.refreshDeviceStatus();
    });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', onKey, true);
      stopDevice();
    });
    void this.refreshDeviceStatus();
  }

  readonly category = signal<SettingsCategory>(
    this.shell.settingsCategory() === 'android' ? 'appearance' : (this.shell.settingsCategory() ?? 'appearance'),
  );
  readonly paneSlideDir = signal<'up' | 'down' | null>(null);
  readonly query = signal('');
  readonly highlightId = signal<string | null>(this.shell.settingsHighlight());
  readonly recordingId = signal<ShortcutId | null>(null);
  readonly shortcutError = signal<string | null>(null);
  readonly nav = SETTINGS_NAV;
  readonly groups = SETTINGS_NAV_GROUPS;
  readonly catalog = SHORTCUT_CATALOG;
  readonly themes: readonly ThemePreference[] = ['dark', 'light', 'system'];
  readonly speeds: readonly AnimationSpeed[] = ['none', 'slow', 'normal', 'fast'];
  readonly motionPresets: readonly { readonly id: MotionPreset; readonly label: string }[] = [
    { id: 'reduced', label: 'Reduced' },
    { id: 'normal', label: 'Normal' },
    { id: 'snappy', label: 'Snappy' },
  ];
  readonly saveModes: readonly { readonly id: SaveMode; readonly label: string }[] = [
    { id: 'auto', label: 'Save on change' },
    { id: 'manual', label: 'Save manually' },
  ];
  readonly appearanceCustomizeOpen = signal(false);
  readonly clientCertsOpen = signal(false);
  readonly loggingDiagnosticsOpen = signal(false);
  readonly scaleOptions = TYPE_SCALE_OPTIONS;
  readonly scaleLabels = SCALE_LABELS;
  readonly scalePreview = SCALE_PREVIEW;
  readonly fontUiSelect: readonly TxSelectOption[] = FONT_UI_OPTIONS.map((value) => ({
    value,
    label: FONT_UI_LABELS[value],
    fontFamily: FONT_UI_STACKS[value],
  }));
  readonly fontMonoSelect: readonly TxSelectOption[] = FONT_MONO_OPTIONS.map((value) => ({
    value,
    label: FONT_MONO_LABELS[value],
    fontFamily: FONT_MONO_STACKS[value],
  }));
  readonly logLevelSelect: readonly TxSelectOption[] = LOG_LEVEL_OPTIONS.map((value) => ({
    value,
    label: LOG_LEVEL_LABELS[value],
  }));
  readonly proxyModeSelect: readonly TxSelectOption[] = PROXY_MODE_OPTIONS.map((value) => ({
    value,
    label: PROXY_MODE_LABELS[value],
  }));
  readonly dnsModes: readonly DnsMode[] = ['system', 'custom'];
  readonly dnsModeLabels = DNS_MODE_LABELS;
  readonly logFileMaxMbMin = LOG_FILE_MAX_MB_MIN;
  readonly logFileMaxMbMax = LOG_FILE_MAX_MB_MAX;
  readonly idleMin = DATABASE_IDLE_DISCONNECT_MINUTES_MIN;
  readonly idleMax = DATABASE_IDLE_DISCONNECT_MINUTES_MAX;
  readonly zoomMin = UI_ZOOM_MIN;
  readonly zoomMax = UI_ZOOM_MAX;
  readonly zoomStep = UI_ZOOM_STEP;
  readonly zoomDraft = signal<number | null>(null);
  readonly rollbackMin = DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MIN;
  readonly rollbackMax = DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MAX;
  readonly rollbackUnit = signal<'seconds' | 'minutes'>('seconds');
  readonly logFileMaxMbDraft = signal<number | null>(null);
  readonly lastLogs = signal<readonly string[]>([]);
  readonly dataAppFilesOpen = signal(false);
  readonly dataWorkspaceFilesOpen = signal(false);

  readonly appConfigFiles = computed(() => {
    const names = new Set<string>([...CONFIG_GLOBAL_FILES, 'workspaces.json']);
    return this.desktop.configPaths().files.filter((file) => names.has(file.name));
  });

  readonly workspaceConfigFiles = computed(() => {
    const names = new Set<string>(CONFIG_WORKSPACE_FILES);
    return this.desktop.configPaths().files.filter((file) => names.has(file.name));
  });
  readonly deviceStatus = signal<AndroidToolchainStatus>(emptyAndroidToolchainStatus());
  readonly deviceProgress = signal<AndroidToolchainEvent | null>(null);
  readonly showLicense = signal(false);
  readonly showDeactivateConfirm = signal(false);
  readonly androidLicense = ANDROID_SDK_LICENSE_SUMMARY;
  readonly emulatorSwitchOn = computed(
    () =>
      this.deviceStatus().activated ||
      this.deviceStatus().busy ||
      this.desktop.settings().androidEmulatorActivated,
  );
  readonly logFileMaxMb = computed(
    () => this.logFileMaxMbDraft() ?? this.desktop.settings().logFileMaxMb,
  );
  /** Keeps trailing blank-row ids stable while editing; cleared on reset / reopen. */
  private readonly defaultHeaderDraft = signal<MockKeyValue[] | null>(null);
  readonly defaultHeaderRows = computed(() => {
    const draft = this.defaultHeaderDraft();
    if (draft)
      return draft;
    return withTrailingRow(this.desktop.settings().defaultHeaders ?? []);
  });
  readonly apiKeyHeaderNames = computed(() => {
    const name = this.desktop.settings().defaultApiKeyHeader.trim();
    return name ? [name] : [];
  });

  readonly hits = computed(() => filterSettingsHits(this.query()));
  readonly zoomPercent = computed(() =>
    Math.round((this.zoomDraft() ?? this.desktop.settings().uiZoom) * 100),
  );
  readonly zoomSlider = computed(() => this.zoomDraft() ?? this.desktop.settings().uiZoom);
  readonly title = computed(() => {
    if (this.query().trim())
      return 'Search';
    const step = this.currentWizardStep();
    if (this.showWizardChrome() && step.category === null)
      return step.id === 'get-started' ? 'Get started' : 'All set';
    return this.nav.find((item) => item.id === this.category())?.label ?? 'Settings';
  });
  readonly subtitle = computed(() => {
    if (this.query().trim())
      return 'Jump to a matching preference.';
    const step = this.currentWizardStep();
    if (this.showWizardChrome() && step.category === null) {
      if (step.id === 'get-started')
        return 'A quick pass over theme, save behavior, motion, and network essentials.';
      return 'Open Settings anytime from the titlebar gear or your keyboard shortcut.';
    }
    switch (this.category()) {
      case 'appearance':
        return 'Theme, motion, and type for the shell.';
      case 'keyboard':
        return this.recordingId()
          ? 'Press the new chord. Esc cancels.'
          : 'Click a chord to record a new shortcut.';
      case 'http':
        return 'Default headers, cookie jar, API key header name, and placeholder email domain.';
      case 'database':
        return 'Startup connect, idle pools, and uncommitted rollback.';
      case 'collab':
        return 'Connect repositories, update access tokens, and keep workspaces in sync after you save.';
      case 'android':
        return 'Activate a sidecar Android emulator. Testrix downloads the SDK on this PC.';
      case 'proxy':
        return 'How Testrix reaches hosts on the network.';
      case 'dns':
        return 'Name servers for outgoing lookups.';
      case 'certificates':
        return 'TLS trust and client certificates.';
      case 'logging':
        return 'How much Testrix writes, and where.';
      case 'data':
        return 'Import, export, and browse local config folders.';
      case 'updates':
        return 'Which releases Testrix installs, and when it looks for them.';
      case 'about':
        return 'Product version and local-first details.';
      default:
        return '';
    }
  });
  readonly canResetCategory = computed(() => {
    const id = this.category();
    return (
      id === 'appearance' ||
      id === 'keyboard' ||
      id === 'logging' ||
      id === 'proxy' ||
      id === 'dns' ||
      id === 'certificates' ||
      id === 'database' ||
      id === 'data' ||
      id === 'http'
    );
  });
  readonly resetLabel = computed(() =>
    this.category() === 'data' ? 'Reset all settings' : 'Reset to default',
  );
  readonly resetScope = computed((): SettingsResetScope => {
    switch (this.category()) {
      case 'appearance':
        return 'appearance';
      case 'keyboard':
        return 'keyboard';
      case 'logging':
        return 'logging';
      case 'proxy':
        return 'proxy';
      case 'dns':
        return 'dns';
      case 'certificates':
        return 'certificates';
      case 'database':
        return 'database';
      case 'http':
        return 'http';
      default:
        return 'all';
    }
  });

  handleSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  categoryLabel(id: SettingsCategory): string {
    return this.nav.find((item) => item.id === id)?.label ?? id;
  }

  platformLabel(): string {
    switch (this.desktop.platform()) {
      case 'win32':
        return 'Windows';
      case 'darwin':
        return 'macOS';
      case 'linux':
        return 'Linux';
      default:
        return this.desktop.platform();
    }
  }

  selectCategory(id: SettingsCategory): void {
    if (id === this.category())
      return;
    this.wizardMode.set('full');
    const stepIndex = fullStepIndexForCategory(id);
    if (stepIndex >= 0)
      this.wizardStepIndex.set(stepIndex);
    this.networkEssentialsPhase.set(0);
    this.paneSlideDir.set(this.slideDirTo(id));
    this.category.set(id);
    if (id === 'data')
      void this.refreshFootprint();
    this.highlightId.set(null);
    this.recordingId.set(null);
    this.shortcutError.set(null);
    if (id === 'logging')
      void this.refreshLogs();
    if (id === 'android')
      void this.refreshDeviceStatus();
    if (id === 'data')
      void this.refreshFootprint();
  }

  selectWizardGroup(groupIndex: number): void {
    if (this.wizardMode() !== 'full')
      return;
    const group = SETTINGS_NAV_GROUPS[groupIndex];
    const first = group?.ids[0];
    if (!first)
      return;
    this.selectCategory(first);
  }

  openHit(id: string, category: SettingsCategory): void {
    if (category === 'android' || id.startsWith('android')) {
      this.shell.closeOverlays();
      this.shell.selectRail('services');
      return;
    }
    this.wizardMode.set('full');
    const stepIndex = fullStepIndexForCategory(category);
    if (stepIndex >= 0)
      this.wizardStepIndex.set(stepIndex);
    this.networkEssentialsPhase.set(0);
    this.paneSlideDir.set(this.slideDirTo(category));
    this.category.set(category);
    this.query.set('');
    this.flashHighlight(id);
    this.applyHighlightSideEffects(id, category);
    if (category === 'logging')
      void this.refreshLogs();
    if (category === 'data')
      void this.refreshFootprint();
  }

  showFullWizard(): void {
    this.wizardMode.set('full');
    this.wizardStepIndex.set(0);
    this.networkEssentialsPhase.set(0);
    this.paneSlideDir.set(null);
    this.category.set('appearance');
    this.highlightId.set(null);
    this.recordingId.set(null);
    this.shortcutError.set(null);
  }

  skipToFullWizard(): void {
    this.showFullWizard();
  }

  selectNetworkEssentialsPhase(phase: number): void {
    const entry = NETWORK_ESSENTIALS_PHASES[phase];
    if (!entry)
      return;
    this.networkEssentialsPhase.set(phase);
    this.paneSlideDir.set(this.slideDirTo(entry.category));
    this.category.set(entry.category);
    this.flashHighlight(entry.highlightId);
  }

  wizardBack(): void {
    const step = this.currentWizardStep();
    if (
      this.wizardMode() === 'abbreviated'
      && step.id === 'network-essentials'
      && this.networkEssentialsPhase() > 0
    ) {
      this.networkEssentialsPhase.set(0);
      this.category.set('proxy');
      this.flashHighlight('proxy-mode');
      return;
    }
    const prev = this.wizardStepIndex() - 1;
    if (prev < 0)
      return;
    this.goToWizardStep(prev);
  }

  wizardContinue(): void {
    const step = this.currentWizardStep();
    if (
      this.wizardMode() === 'abbreviated'
      && step.id === 'network-essentials'
      && this.networkEssentialsPhase() < NETWORK_ESSENTIALS_PHASES.length - 1
    ) {
      const nextPhase = this.networkEssentialsPhase() + 1;
      this.networkEssentialsPhase.set(nextPhase);
      const phase = NETWORK_ESSENTIALS_PHASES[nextPhase]!;
      this.paneSlideDir.set(this.slideDirTo(phase.category));
      this.category.set(phase.category);
      this.flashHighlight(phase.highlightId);
      return;
    }
    const next = this.wizardStepIndex() + 1;
    if (next >= this.wizardSteps().length)
      return;
    this.goToWizardStep(next);
  }

  wizardDone(): void {
    void this.desktop.patchSettings({ settingsWizardCompleted: true }).then(() => {
      this.shell.closeOverlays();
    });
  }

  isWizardGroupActive(groupIndex: number): boolean {
    return this.wizardGroupIndex() === groupIndex;
  }

  isWizardGroupComplete(groupIndex: number): boolean {
    return this.wizardGroupIndex() > groupIndex;
  }

  private goToWizardStep(index: number): void {
    const step = this.wizardSteps()[index];
    if (!step)
      return;
    this.wizardStepIndex.set(index);
    this.networkEssentialsPhase.set(0);
    if (step.category) {
      this.paneSlideDir.set(this.slideDirTo(step.category));
      this.category.set(step.category);
      this.flashHighlight(step.highlightId);
      if (step.category === 'logging')
        void this.refreshLogs();
      if (step.category === 'data')
        void this.refreshFootprint();
      if (step.category === 'android')
        void this.refreshDeviceStatus();
    } else {
      this.highlightId.set(null);
      this.recordingId.set(null);
      this.shortcutError.set(null);
    }
  }

  private flashHighlight(id: string | null | undefined): void {
    if (!id) {
      this.highlightId.set(null);
      return;
    }
    this.highlightId.set(id);
    window.setTimeout(() => {
      if (this.highlightId() === id)
        this.highlightId.set(null);
    }, 920);
  }

  private applyHighlightSideEffects(id: string | null | undefined, category: SettingsCategory): void {
    if (id === 'client-certs')
      this.clientCertsOpen.set(true);
    if (id === 'log-max' || id === 'log-recent')
      this.loggingDiagnosticsOpen.set(true);
    if (
      id === 'font-ui'
      || id === 'font-mono'
      || id === 'font-scale'
      || id === 'icon-scale'
      || id === 'ui-zoom'
      || id === 'motion-leave'
      || id === 'tab-warn'
    )
      this.appearanceCustomizeOpen.set(true);
    if (category === 'certificates' && id === 'tls-verify')
      this.clientCertsOpen.set(false);
  }

  paneEnter(): string | undefined {
    return this.paneSlideDir() ? 'tx-sidebar-pane-in' : undefined;
  }

  private slideDirTo(id: SettingsCategory): 'up' | 'down' {
    const from = this.nav.findIndex((item) => item.id === this.category());
    const to = this.nav.findIndex((item) => item.id === id);
    return to > from ? 'down' : 'up';
  }

  isHighlighted(id: string): boolean {
    return this.highlightId() === id;
  }

  handleReset(): void {
    this.logFileMaxMbDraft.set(null);
    this.defaultHeaderDraft.set(null);
    void this.desktop.resetSettings(this.resetScope()).then(() => {
      if (this.category() === 'logging')
        void this.refreshLogs();
      if (this.resetScope() === 'all') {
        this.showLicense.set(false);
        this.showDeactivateConfirm.set(false);
        this.deviceProgress.set(null);
        void this.refreshDeviceStatus();
      }
    });
  }

  handleReveal(target: ConfigRevealTarget): void {
    void this.desktop.reveal(target);
    void this.desktop.refreshPaths();
  }

  handleChooseFolder(): void {
    void this.desktop.chooseConfigFolder();
  }

  handleChooseLogsFolder(): void {
    void this.desktop.chooseLogsFolder().then(() => this.refreshLogs());
  }

  handleChooseConfigsFolder(): void {
    void this.desktop.chooseConfigsFolder();
  }

  setFontUi(value: string): void {
    void this.desktop.patchSettings({ fontUi: value as FontUi });
  }

  setFontMono(value: string): void {
    void this.desktop.patchSettings({ fontMono: value as FontMono });
  }

  setLogLevel(value: string): void {
    void this.desktop.patchSettings({ logLevel: value as LogLevel });
  }

  usesManualProxy(): boolean {
    const mode = this.desktop.settings().proxy.mode;
    return mode === 'http' || mode === 'socks5';
  }

  setProxyMode(value: string): void {
    this.patchProxy({ mode: value as ProxyMode });
  }

  patchProxy(partial: Partial<ProxySettings>): void {
    void this.desktop.patchSettings({
      proxy: { ...this.desktop.settings().proxy, ...partial },
    });
  }

  setDnsMode(mode: DnsMode): void {
    this.patchDns({ mode });
  }

  patchDns(partial: Partial<DnsSettings>): void {
    void this.desktop.patchSettings({
      dns: { ...this.desktop.settings().dns, ...partial },
    });
  }

  patchCertificates(partial: Partial<CertificateSettings>): void {
    void this.desktop.patchSettings({
      certificates: { ...this.desktop.settings().certificates, ...partial },
    });
  }

  addClientCert(): void {
    const certificates = this.desktop.settings().certificates;
    this.patchCertificates({
      clientCerts: [...certificates.clientCerts, createClientCertificate()],
    });
  }

  removeClientCert(id: string): void {
    const certificates = this.desktop.settings().certificates;
    this.patchCertificates({
      clientCerts: certificates.clientCerts.filter((item) => item.id !== id),
    });
  }

  patchClientCert(id: string, partial: Partial<ClientCertificate>): void {
    const certificates = this.desktop.settings().certificates;
    this.patchCertificates({
      clientCerts: certificates.clientCerts.map((item) =>
        item.id === id ? { ...item, ...partial } : item,
      ),
    });
  }

  async chooseCertFile(kind: CertFileKind, id?: string): Promise<void> {
    const selected = await this.desktop.chooseFile(kind);
    if (!selected)
      return;
    if (kind === 'ca') {
      this.patchCertificates({ extraCaPath: selected });
      return;
    }
    if (!id)
      return;
    if (kind === 'cert')
      this.patchClientCert(id, { certPath: selected });
    else
      this.patchClientCert(id, { keyPath: selected });
  }

  setLogToFile(enabled: boolean): void {
    void this.desktop.patchSettings({ logToFile: enabled }).then(() => this.refreshLogs());
  }

  previewLogFileMaxMb(event: Event): void {
    this.logFileMaxMbDraft.set(Number((event.target as HTMLInputElement).value));
  }

  commitLogFileMaxMb(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.logFileMaxMbDraft.set(null);
    void this.desktop.patchSettings({ logFileMaxMb: value });
  }

  logLevelOf(line: string): string {
    if (line.includes('[error]'))
      return 'error';
    if (line.includes('[warn]'))
      return 'warn';
    if (line.includes('[debug]'))
      return 'debug';
    return 'info';
  }

  async refreshLogs(): Promise<void> {
    this.lastLogs.set(await this.desktop.recentLogs());
  }

  setScale(key: 'fontScale' | 'iconScale', value: TypeScale): void {
    void this.desktop.patchSettings({ [key]: value });
  }

  previewZoom(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.zoomDraft.set(clampUiZoom(target.value));
  }

  commitZoom(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    const next = clampUiZoom(target.value);
    this.desktop.setUiZoom(next, true);
    this.zoomDraft.set(null);
  }

  startRecord(id: ShortcutId): void {
    this.recordingId.set(id);
    this.shortcutError.set(null);
  }

  handleCaptureKey(event: Event): void {
    const id = this.recordingId();
    if (!id)
      return;
    const keyEvent = event as KeyboardEvent;
    keyEvent.preventDefault();
    keyEvent.stopImmediatePropagation();
    if (keyEvent.key === 'Escape') {
      this.recordingId.set(null);
      this.shortcutError.set(null);
      return;
    }
    const chord = formatShortcut(keyEvent);
    if (!chord)
      return;
    const usedBy = this.catalog.find(
      (item) => item.id !== id && this.desktop.settings().shortcuts[item.id] === chord,
    );
    if (usedBy) {
      this.shortcutError.set(`${chord} is already used by ${usedBy.label}.`);
      return;
    }
    void this.desktop.patchSettings({
      shortcuts: { ...this.desktop.settings().shortcuts, [id]: chord },
    });
    this.recordingId.set(null);
    this.shortcutError.set(null);
  }

  patchDatabase(partial: Partial<DatabasePrefs>): void {
    void this.desktop.patchSettings({
      database: { ...this.desktop.settings().database, ...partial },
    });
  }

  setConnectOnStartup(checked: boolean): void {
    this.patchDatabase({ connectOnStartup: checked });
  }

  handleDefaultHeaders(rows: MockKeyValue[]): void {
    this.defaultHeaderDraft.set(rows);
    void this.desktop.patchSettings({ defaultHeaders: persistMockRows(rows) });
  }

  handleEmailDomain(value: string): void {
    void this.desktop.patchSettings({ placeholderEmailDomain: value });
  }

  handleApiKeyHeader(value: string): void {
    void this.desktop.patchSettings({ defaultApiKeyHeader: value });
  }

  openCookieAuthJar(): void {
    this.shell.closeOverlays();
    this.cookieAuth.show();
  }

  handleExportWorkspace(): void {
    this.exportWorkspace.show();
  }

  handleImportWorkspace(): void {
    void this.pickImportSource();
  }

  async refreshFootprint(): Promise<void> {
    if (!this.desktop.hasDesktop) {
      this.footprint.set(null);
      return;
    }
    try {
      this.footprint.set(await this.desktop.api.config.workspaceFootprint());
    } catch {
      this.footprint.set(null);
    }
  }

  handleTrimHistory(): void {
    void this.history.removeOlderThanDays(30);
    void this.refreshFootprint();
  }

  handleCloseInactiveTabs(): void {
    this.workbench.closeInactiveTabs();
    void this.refreshFootprint();
  }

  handleTabWarnInput(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed))
      return;
    void this.desktop.patchSettings({
      tabWarnThreshold: Math.min(TAB_WARN_THRESHOLD_MAX, Math.max(TAB_WARN_THRESHOLD_MIN, parsed)),
    });
  }

  motionPreset = computed((): MotionPreset => {
    const settings = this.desktop.settings();
    return motionPresetFromSpeeds(settings.animationSpeed, settings.closeAnimationSpeed);
  });

  bootSummary = computed(() => {
    const connections = this.database.connections();
    const boot = connections.filter((item) => item.connectOnBoot).length;
    return `${boot} of ${connections.length} connect on boot`;
  });

  setMotionPreset(preset: MotionPreset): void {
    const speeds = speedsForMotionPreset(preset);
    void this.desktop.patchSettings({
      motionPreset: preset,
      animationSpeed: speeds.animationSpeed,
      closeAnimationSpeed: speeds.closeAnimationSpeed,
    });
  }

  setOpenAnimationSpeed(speed: AnimationSpeed): void {
    const close = this.desktop.settings().closeAnimationSpeed;
    void this.desktop.patchSettings({
      animationSpeed: speed,
      motionPreset: motionPresetFromSpeeds(speed, close),
    });
  }

  setCloseAnimationSpeed(speed: AnimationSpeed): void {
    const open = this.desktop.settings().animationSpeed;
    void this.desktop.patchSettings({
      closeAnimationSpeed: speed,
      motionPreset: motionPresetFromSpeeds(open, speed),
    });
  }

  toggleAppearanceCustomize(event: Event): void {
    event.preventDefault();
    this.appearanceCustomizeOpen.update((open) => !open);
  }

  toggleClientCerts(event: Event): void {
    event.preventDefault();
    this.clientCertsOpen.update((open) => !open);
  }

  toggleLoggingDiagnostics(event: Event): void {
    event.preventDefault();
    this.loggingDiagnosticsOpen.update((open) => !open);
  }

  formatFootprintBytes(bytes: number): string {
    if (bytes < 1024)
      return `${bytes} B`;
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private async pickImportSource(): Promise<void> {
    const path = await this.desktop.api.workspace.pickImportSource();
    if (!path)
      return;
    const inspected = await this.desktop.api.workspace.importInspect(path);
    this.importWorkspace.show(inspected);
  }

  setIdleMinutes(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.patchDatabase({ idleDisconnectMinutes: Number.parseInt(target.value, 10) || 0 });
  }

  rollbackSliderMax(): number {
    return this.rollbackUnit() === 'minutes' ? Math.floor(this.rollbackMax / 60) : this.rollbackMax;
  }

  rollbackDisplay(): number {
    const seconds = this.desktop.settings().database.uncommittedRollbackSeconds;
    return this.rollbackUnit() === 'minutes' ? Math.round(seconds / 60) : seconds;
  }

  setRollback(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    const raw = Number.parseInt(target.value, 10) || 0;
    const seconds = this.rollbackUnit() === 'minutes' ? raw * 60 : raw;
    this.patchDatabase({
      uncommittedRollbackSeconds: Math.min(this.rollbackMax, Math.max(this.rollbackMin, seconds)),
    });
  }

  setRollbackUnit(unit: 'seconds' | 'minutes'): void {
    this.rollbackUnit.set(unit);
  }

  setConnectOnBoot(id: string, checked: boolean): void {
    this.database.updateConnection(id, { connectOnBoot: checked });
  }

  async refreshDeviceStatus(): Promise<void> {
    const status = await this.desktop.api.services.device.refresh();
    this.deviceStatus.set(status);
  }

  requestActivate(): void {
    this.showDeactivateConfirm.set(false);
    if (!this.deviceStatus().licenseAccepted && !this.desktop.settings().androidSdkLicenseAcceptedAt) {
      this.showLicense.set(true);
      return;
    }
    void this.activateEmulator();
  }

  setPlayStoreImage(enabled: boolean): void {
    void this.desktop.patchSettings({
      androidSystemImageTag: enabled ? 'google_apis_playstore' : 'google_apis',
    });
  }

  systemImageLabel(tag: AndroidSystemImageTag | string): string {
    return androidSystemImageTagLabel(tag === 'google_apis_playstore' ? 'google_apis_playstore' : 'google_apis');
  }

  cancelLicense(): void {
    this.showLicense.set(false);
  }

  async acceptLicense(): Promise<void> {
    await this.desktop.patchSettings({
      androidSdkLicenseAcceptedAt: new Date().toISOString(),
    });
    this.showLicense.set(false);
    await this.activateEmulator();
  }

  async activateEmulator(): Promise<void> {
    this.showDeactivateConfirm.set(false);
    this.deviceProgress.set({ phase: 'download', percent: 1, message: 'Starting Android install…' });
    const result = await this.desktop.api.services.device.activate();
    this.deviceStatus.set(result.status);
    await this.syncDeviceSettings();
    if (!result.ok) {
      this.deviceProgress.set({
        phase: 'error',
        percent: 0,
        message: result.error ?? 'Activate failed.',
        error: result.error ?? undefined,
      });
      return;
    }
    this.deviceProgress.set(null);
  }

  requestDeactivate(): void {
    this.showLicense.set(false);
    this.showDeactivateConfirm.set(true);
  }

  cancelDeactivate(): void {
    this.showDeactivateConfirm.set(false);
  }

  async confirmDeactivateAndRemove(): Promise<void> {
    this.showDeactivateConfirm.set(false);
    this.deviceProgress.set({
      phase: 'remove',
      percent: 10,
      message: 'Stopping adb and removing managed Android tools…',
    });
    const result = await this.desktop.api.services.device.uninstall();
    this.deviceStatus.set(result.status);
    await this.syncDeviceSettings();
    if (!result.ok) {
      this.deviceProgress.set({
        phase: 'error',
        percent: 0,
        message: result.error ?? 'Could not remove Android tools.',
        error: result.error ?? undefined,
      });
      return;
    }
    this.deviceProgress.set(null);
  }

  private async syncDeviceSettings(): Promise<void> {
    const settings = await this.desktop.api.settings.get();
    this.desktop.settings.set(settings);
    await this.refreshDeviceStatus();
  }

  async chooseAndroidSdk(): Promise<void> {
    const status = await this.desktop.api.services.device.chooseSdkRoot();
    if (status)
      this.deviceStatus.set(status);
    const settings = await this.desktop.api.settings.get();
    this.desktop.settings.set(settings);
  }

  revealAndroidSdk(): void {
    void this.desktop.api.services.device.revealSdk();
  }

  packageLabel(id: string): string {
    if (id === 'platform-tools')
      return 'platform-tools (adb)';
    if (id === 'system-image') {
      const preferred = this.deviceStatus().preferredSystemImageTag;
      const installed = this.deviceStatus().systemImageTag;
      if (installed)
        return `System image (${this.systemImageLabel(installed)})`;
      return `System image (${this.systemImageLabel(preferred)})`;
    }
    return id;
  }
}
