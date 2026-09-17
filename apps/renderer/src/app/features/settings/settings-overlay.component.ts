import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxEmptyStateComponent,
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
  createClientCertificate,
  type AnimationSpeed,
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
  type SettingsResetScope,
  type ShortcutId,
  type ThemePreference,
  type TypeScale,
} from '@testrix/contracts';

import { DesktopApiService } from '../../core/desktop-api.service';
import { formatShortcut } from '../../core/shortcut-match';
import { ShellStateService } from '../../core/shell-state.service';
import { DatabaseStore } from '../database/database.store';
import {
  SETTINGS_NAV,
  SETTINGS_NAV_GROUPS,
  filterSettingsHits,
  type SettingsCategory,
} from './settings-registry';

const FONT_UI_LABELS: Record<FontUi, string> = {
  'segoe-variable': 'Segoe UI Variable',
  segoe: 'Segoe UI',
  system: 'System UI',
};

const FONT_UI_STACKS: Record<FontUi, string> = {
  'segoe-variable':
    "'Segoe UI Variable Text', 'Segoe UI Variable Display', 'Segoe UI Variable', 'Segoe UI', sans-serif",
  segoe: "'Segoe UI', sans-serif",
  system: 'Tahoma, Geneva, Verdana, sans-serif',
};

const FONT_MONO_LABELS: Record<FontMono, string> = {
  cascadia: 'Cascadia Code',
  consolas: 'Consolas',
  'ui-monospace': 'UI Monospace',
};

const FONT_MONO_STACKS: Record<FontMono, string> = {
  cascadia: "'Cascadia Code', 'Cascadia Mono', 'Segoe UI Mono', ui-monospace, monospace",
  consolas: "Consolas, 'Courier New', ui-monospace, monospace",
  'ui-monospace': "ui-monospace, 'Courier New', monospace",
};

const SCALE_LABELS: Record<TypeScale, string> = {
  sm: 'S',
  md: 'M',
  lg: 'L',
};

const SCALE_PREVIEW: Record<TypeScale, string> = {
  sm: '0.85em',
  md: '1em',
  lg: '1.45em',
};

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  error: 'Error',
  warn: 'Warn',
  info: 'Info',
  debug: 'Debug',
};

const PROXY_MODE_LABELS: Record<ProxyMode, string> = {
  system: 'System',
  none: 'Off',
  http: 'HTTP',
  socks5: 'SOCKS5',
};

const DNS_MODE_LABELS: Record<DnsMode, string> = {
  system: 'System',
  custom: 'Custom',
};

@Component({
  selector: 'tx-settings-overlay',
  standalone: true,
  imports: [
    TxOverlayComponent,
    TxButtonComponent,
    TxCheckComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
  ],
  templateUrl: './settings-overlay.component.html',
  styleUrl: './settings-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class SettingsOverlayComponent {
  readonly desktop = inject(DesktopApiService);
  readonly database = inject(DatabaseStore);
  readonly shell = inject(ShellStateService);

  constructor() {
    const onKey = (event: Event) => this.handleCaptureKey(event);
    window.addEventListener('keydown', onKey, true);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('keydown', onKey, true));
  }

  readonly category = signal<SettingsCategory>('appearance');
  readonly query = signal('');
  readonly highlightId = signal<string | null>(null);
  readonly recordingId = signal<ShortcutId | null>(null);
  readonly shortcutError = signal<string | null>(null);
  readonly nav = SETTINGS_NAV;
  readonly groups = SETTINGS_NAV_GROUPS;
  readonly catalog = SHORTCUT_CATALOG;
  readonly themes: readonly ThemePreference[] = ['dark', 'light', 'system'];
  readonly speeds: readonly AnimationSpeed[] = ['none', 'slow', 'normal', 'fast'];
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
  readonly rollbackMin = DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MIN;
  readonly rollbackMax = DATABASE_UNCOMMITTED_ROLLBACK_SECONDS_MAX;
  readonly rollbackUnit = signal<'seconds' | 'minutes'>('seconds');
  readonly logFileMaxMbDraft = signal<number | null>(null);
  readonly lastLogs = signal<readonly string[]>([]);
  readonly logFileMaxMb = computed(
    () => this.logFileMaxMbDraft() ?? this.desktop.settings().logFileMaxMb,
  );

  readonly hits = computed(() => filterSettingsHits(this.query()));
  readonly matchingCategories = computed(
    () => new Set(this.hits().map((hit) => hit.category)),
  );
  readonly title = computed(() => {
    if (this.query().trim())
      return 'Search';
    return this.nav.find((item) => item.id === this.category())?.label ?? 'Settings';
  });
  readonly subtitle = computed(() => {
    if (this.query().trim())
      return 'Jump to a matching preference.';
    switch (this.category()) {
      case 'appearance':
        return 'Theme, motion, and type for the shell.';
      case 'keyboard':
        return this.recordingId()
          ? 'Press the new chord. Esc cancels.'
          : 'Click a chord to record a new shortcut.';
      case 'collections':
        return 'Coming soon.';
      case 'environments':
        return 'Coming soon.';
      case 'database':
        return 'Startup connect, idle pools, and uncommitted rollback.';
      case 'proxy':
        return 'How Testrix reaches hosts on the network.';
      case 'dns':
        return 'Name servers for outgoing lookups.';
      case 'certificates':
        return 'TLS trust and client certificates.';
      case 'logging':
        return 'How much Testrix writes, and where.';
      case 'data':
        return 'JSON files in the local config folder.';
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
      id === 'data'
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
      default:
        return 'all';
    }
  });

  handleSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  navItemsFor(groupIds: readonly SettingsCategory[]) {
    return this.nav.filter((item) => groupIds.includes(item.id));
  }

  isNavQuiet(id: SettingsCategory): boolean {
    return this.query().trim().length > 0 && !this.matchingCategories().has(id);
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
    this.category.set(id);
    this.highlightId.set(null);
    this.recordingId.set(null);
    this.shortcutError.set(null);
    if (id === 'logging')
      void this.refreshLogs();
  }

  openHit(id: string, category: SettingsCategory): void {
    this.category.set(category);
    this.highlightId.set(id);
    this.query.set('');
    if (category === 'logging')
      void this.refreshLogs();
  }

  isHighlighted(id: string): boolean {
    return this.highlightId() === id;
  }

  handleReset(): void {
    this.logFileMaxMbDraft.set(null);
    void this.desktop.resetSettings(this.resetScope()).then(() => {
      if (this.category() === 'logging')
        void this.refreshLogs();
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

  handleCheckUpdates(): void {
    this.desktop.checkForUpdates();
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
}
