import { Injectable, signal } from '@angular/core';

import type { TestrixDesktopApi } from '@testrix/contracts';
import {
  DEFAULT_COLLECTIONS_FILE,
  DEFAULT_DATABASES_FILE,
  DEFAULT_FLOWS_FILE,
  DEFAULT_HISTORY_FILE,
  DEFAULT_COOKIES_FILE,
  DEFAULT_LOAD_FILE,
  DEFAULT_MOCKS_FILE,
  DEFAULT_LISTENERS_FILE,
  DEFAULT_INTERCEPT_FILE,
  DEFAULT_PLANTUML_FILE,
  DEFAULT_FLOW_TEMPLATES_FILE,
  DEFAULT_EMULATOR_FILE,
  DEFAULT_QUERIES_FILE,
  DEFAULT_REGRESSIONS_FILE,
  DEFAULT_SESSION_FILE,
  cloneDefaultUserSettings,
  clampUiZoom,
  createDefaultEnvironmentsFile,
  createDefaultWorkspacesFile,
  mergeUserSettingsPatch,
  motionScaleForSpeed,
  nudgeUiZoom,
  type ChooseFileKind,
  type CollectionsFile,
  type DatabasesFile,
  type QueriesFile,
  type ConfigPaths,
  type ConfigRevealTarget,
  type EnvironmentsFile,
  type FlowsFile,
  type HistoryFile,
  type CookiesFile,
  type LoadFile,
  type MocksFile,
  type ListenersFile,
  type InterceptFile,
  type PlantumlFile,
  type FlowTemplatesFile,
  type EmulatorFile,
  type RegressionsFile,
  type SessionFile,
  type SettingsResetScope,
  type ThemeSnapshot,
  type UserSettings,
  type WorkspacesFile,
  type WorkspaceSnapshot,
} from '@testrix/contracts';

import { browserFallback, memoryPaths, normalizeUserSettings } from './desktop-api-fallback';

@Injectable({ providedIn: 'root' })
export class DesktopApiService {
  readonly settings = signal<UserSettings>(cloneDefaultUserSettings());
  readonly theme = signal<ThemeSnapshot>({ preference: 'dark', resolved: 'dark' });
  readonly session = signal<SessionFile>({ ...DEFAULT_SESSION_FILE });
  readonly environments = signal<EnvironmentsFile>(createDefaultEnvironmentsFile());
  readonly collections = signal<CollectionsFile>({ ...DEFAULT_COLLECTIONS_FILE });
  readonly databases = signal<DatabasesFile>({ ...DEFAULT_DATABASES_FILE, nodes: [] });
  readonly queries = signal<QueriesFile>({ ...DEFAULT_QUERIES_FILE, nodes: [] });
  readonly history = signal<HistoryFile>({ ...DEFAULT_HISTORY_FILE });
  readonly cookies = signal<CookiesFile>({ ...DEFAULT_COOKIES_FILE });
  readonly flows = signal({ ...DEFAULT_FLOWS_FILE });
  readonly load = signal({ ...DEFAULT_LOAD_FILE });
  readonly mocks = signal({ ...DEFAULT_MOCKS_FILE });
  readonly listeners = signal({ ...DEFAULT_LISTENERS_FILE });
  readonly intercept = signal({ ...DEFAULT_INTERCEPT_FILE });
  readonly plantuml = signal({ ...DEFAULT_PLANTUML_FILE });
  readonly regressions = signal({ ...DEFAULT_REGRESSIONS_FILE });
  readonly flowTemplates = signal({ ...DEFAULT_FLOW_TEMPLATES_FILE });
  readonly emulator = signal({ ...DEFAULT_EMULATOR_FILE });
  readonly workspaces = signal<WorkspacesFile>(createDefaultWorkspacesFile());
  readonly configPaths = signal<ConfigPaths>(memoryPaths());
  readonly version = signal('2.0.0-beta.1');
  readonly platform = signal('win32');
  readonly isMaximized = signal(false);
  /** Bumps when the config folder changes so stores re-read persisted files. */
  readonly configGeneration = signal(0);
  /** Parts of the last hydrate that fell back to defaults because the bridge failed. */
  readonly hydrateFailures = signal<readonly string[]>([]);
  private zoomTimer: number | null = null;
  private appliedZoom = 1;

  /** Prefer live preload each access — HMR / late bridge must not stick on the browser stub. */
  get api(): TestrixDesktopApi {
    return window.testrix ?? browserFallback;
  }

  get hasDesktop(): boolean {
    return Boolean(window.testrix);
  }

  async hydrate(): Promise<void> {
    const failed: string[] = [];
    const recover = <T>(label: string, request: Promise<T>, fallback: () => T): Promise<T> =>
      request.catch((error: unknown) => {
        failed.push(label);
        // eslint-disable-next-line no-console -- the renderer has no log channel to main
        console.error(`[testrix] Could not load ${label}:`, error);
        return fallback();
      });
    const [
      settings,
      theme,
      version,
      platform,
      maximized,
      session,
      environments,
      collections,
      databases,
      queries,
      history,
      cookies,
      flows,
      load,
      mocks,
      listeners,
      intercept,
      plantuml,
      regressions,
      flowTemplates,
      emulator,
      workspaces,
      paths,
    ] = await Promise.all([
      recover('settings', this.api.settings.get(), cloneDefaultUserSettings),
      recover('theme', this.api.theme.get(), () => ({ preference: 'dark' as const, resolved: 'dark' as const })),
      recover('version', this.api.app.getVersion(), () => '0.0.0'),
      recover('platform', this.api.app.getPlatform(), () => 'win32'),
      recover('window', this.api.window.isMaximized(), () => false),
      recover('session', this.api.session.get(), () => ({ ...DEFAULT_SESSION_FILE })),
      recover('environments', this.api.environments.get(), createDefaultEnvironmentsFile),
      recover('collections', this.api.collections.get(), () => ({ ...DEFAULT_COLLECTIONS_FILE })),
      recover('databases', this.api.databases.get(), () => ({ ...DEFAULT_DATABASES_FILE, nodes: [] })),
      recover('queries', this.api.queries.get(), () => ({ ...DEFAULT_QUERIES_FILE, nodes: [] })),
      recover('history', this.api.history.get(), () => ({ ...DEFAULT_HISTORY_FILE })),
      recover('cookies', this.api.cookies.get(), () => ({ ...DEFAULT_COOKIES_FILE })),
      recover('flows', this.api.services.flows.get(), () => ({ ...DEFAULT_FLOWS_FILE })),
      recover('load tests', this.api.services.load.get(), () => ({ ...DEFAULT_LOAD_FILE })),
      recover('mocks', this.api.services.mocks.get(), () => ({ ...DEFAULT_MOCKS_FILE })),
      recover('listeners', this.api.services.listeners.get(), () => ({ ...DEFAULT_LISTENERS_FILE })),
      recover('intercept', this.api.services.intercept.get(), () => ({ ...DEFAULT_INTERCEPT_FILE })),
      recover('PlantUML', this.api.plantuml.get(), () => ({ ...DEFAULT_PLANTUML_FILE })),
      recover('regressions', this.api.services.regressions.get(), () => ({ ...DEFAULT_REGRESSIONS_FILE })),
      recover('flow templates', this.api.services.flowTemplates.get(), () => ({ ...DEFAULT_FLOW_TEMPLATES_FILE })),
      recover('emulator', this.api.services.emulator.get(), () => ({ ...DEFAULT_EMULATOR_FILE })),
      recover('workspaces', this.api.workspaces.get(), createDefaultWorkspacesFile),
      recover('config paths', this.api.config.paths(), memoryPaths),
    ]);
    const nextSettings = normalizeUserSettings(settings);
    this.settings.set(nextSettings);
    this.theme.set(theme);
    this.version.set(version);
    this.platform.set(platform);
    this.isMaximized.set(maximized);
    this.session.set(session);
    this.environments.set(environments);
    this.collections.set(collections);
    this.databases.set(databases);
    this.queries.set(queries);
    this.history.set(history);
    this.cookies.set(cookies);
    this.flows.set(flows);
    this.load.set(load);
    this.mocks.set(mocks);
    this.listeners.set(listeners);
    this.intercept.set(intercept);
    this.plantuml.set(plantuml);
    this.regressions.set(regressions);
    this.flowTemplates.set(flowTemplates);
    this.emulator.set(emulator);
    this.workspaces.set(workspaces);
    this.configPaths.set(paths);
    this.applyDom(theme, nextSettings, false);
    this.api.theme.onChanged((snapshot) => {
      this.theme.set(snapshot);
      this.applyDom(snapshot, this.settings(), true);
    });
    this.api.window.onMaximizedChanged((value) => this.isMaximized.set(value));
    this.hydrateFailures.set(failed);
  }

  applySnapshot(snapshot: WorkspaceSnapshot): void {
    this.workspaces.set(snapshot.workspaces);
    this.environments.set(snapshot.environments);
    this.collections.set(snapshot.collections);
    this.databases.set(snapshot.databases);
    this.queries.set(snapshot.queries);
    this.history.set(snapshot.history);
    this.cookies.set(snapshot.cookies);
    this.flows.set(snapshot.flows);
    this.load.set(snapshot.load);
    this.mocks.set(snapshot.mocks);
    this.listeners.set(snapshot.listeners);
    this.intercept.set(snapshot.intercept);
    this.plantuml.set(snapshot.plantuml);
    this.regressions.set(snapshot.regressions);
    this.flowTemplates.set(snapshot.flowTemplates);
    this.emulator.set(snapshot.emulator);
  }

  async setTheme(preference: UserSettings['theme']): Promise<void> {
    const resolved =
      preference === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : preference;
    const snapshot: ThemeSnapshot = { preference, resolved };
    const settings = { ...this.settings(), theme: preference };
    this.theme.set(snapshot);
    this.settings.set(normalizeUserSettings(settings));
    this.applyDom(snapshot, settings, true);
    const nextTheme = await this.api.theme.set(preference);
    const nextSettings = await this.api.settings.set({ theme: preference });
    this.theme.set(nextTheme);
    this.settings.set(normalizeUserSettings(nextSettings));
    this.applyDom(nextTheme, nextSettings, true);
  }

  async patchSettings(patch: Partial<UserSettings>): Promise<void> {
    const optimistic = normalizeUserSettings(mergeUserSettingsPatch(this.settings(), patch));
    this.settings.set(optimistic);
    this.applyDom(this.theme(), optimistic, false);
    if (patch.theme) {
      await this.setTheme(patch.theme);
      return;
    }
    const next = await this.api.settings.set(patch);
    this.settings.set(normalizeUserSettings(next));
    this.applyDom(this.theme(), next, false);
  }

  setUiZoom(value: number, persistNow = false): void {
    const next = clampUiZoom(value);
    const optimistic = { ...this.settings(), uiZoom: next };
    this.settings.set(optimistic);
    this.applyDom(this.theme(), optimistic, false);
    if (!persistNow) {
      this.queueZoomPersist(next);
      return;
    }
    this.clearZoomTimer();
    void this.persistUiZoom(next);
  }

  nudgeUiZoom(direction: 1 | -1): void {
    this.setUiZoom(nudgeUiZoom(this.settings().uiZoom, direction));
  }

  async resetSettings(scope: SettingsResetScope): Promise<void> {
    const next = await this.api.settings.reset(scope);
    this.settings.set(normalizeUserSettings(next));
    const snapshot: ThemeSnapshot = {
      preference: next.theme,
      resolved:
        next.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : next.theme,
    };
    this.theme.set(snapshot);
    this.applyDom(snapshot, next, true);
  }

  async saveSession(patch: Partial<Omit<SessionFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.session.set(patch);
    this.session.set(next);
  }

  async saveEnvironments(
    patch: Partial<Omit<EnvironmentsFile, 'schemaVersion'>>,
  ): Promise<void> {
    const next = await this.api.environments.set(patch);
    this.environments.set(next);
  }

  async saveCollections(patch: Partial<Omit<CollectionsFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.collections.set(patch);
    this.collections.set(next);
  }

  async saveDatabases(patch: Partial<Omit<DatabasesFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.databases.set(patch);
    this.databases.set(next);
  }

  async saveQueries(patch: Partial<Omit<QueriesFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.queries.set(patch);
    this.queries.set(next);
  }

  async saveHistory(patch: Partial<Omit<HistoryFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.history.set(patch);
    this.history.set(next);
  }

  async saveCookies(patch: Partial<Omit<CookiesFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.cookies.set(patch);
    this.cookies.set(next);
  }

  async saveFlows(patch: Partial<Omit<FlowsFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.services.flows.set(patch);
    this.flows.set(next);
  }

  async saveLoad(patch: Partial<Omit<LoadFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.services.load.set(patch);
    this.load.set(next);
  }

  async saveMocks(patch: Partial<Omit<MocksFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.services.mocks.set(patch);
    this.mocks.set(next);
  }

  async saveListeners(patch: Partial<Omit<ListenersFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.services.listeners.set(patch);
    this.listeners.set(next);
  }

  async saveIntercept(patch: Partial<Omit<InterceptFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.services.intercept.set(patch);
    this.intercept.set(next);
  }

  async savePlantuml(patch: Partial<Omit<PlantumlFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.plantuml.set(patch);
    this.plantuml.set(next);
  }

  async saveRegressions(patch: Partial<Omit<RegressionsFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.services.regressions.set(patch);
    this.regressions.set(next);
  }

  async saveFlowTemplates(patch: Partial<Omit<FlowTemplatesFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.services.flowTemplates.set(patch);
    this.flowTemplates.set(next);
  }

  async saveEmulator(patch: Partial<Omit<EmulatorFile, 'schemaVersion'>>): Promise<void> {
    const next = await this.api.services.emulator.set(patch);
    this.emulator.set(next);
  }

  async refreshPaths(): Promise<void> {
    this.configPaths.set(await this.api.config.paths());
  }

  async reveal(target: ConfigRevealTarget): Promise<void> {
    await this.api.config.reveal(target);
  }

  async chooseLogsFolder(): Promise<void> {
    const paths = await this.api.config.chooseLogsFolder();
    if (!paths)
      return;
    this.configPaths.set(paths);
    this.settings.set(normalizeUserSettings(await this.api.settings.get()));
  }

  async chooseFile(kind: ChooseFileKind): Promise<string | null> {
    return this.api.config.chooseFile(kind);
  }

  async recentLogs(): Promise<readonly string[]> {
    return this.api.logs.recent();
  }

  async chooseConfigsFolder(): Promise<void> {
    const paths = await this.api.config.chooseConfigsFolder();
    if (!paths)
      return;
    this.configPaths.set(paths);
  }

  async chooseConfigFolder(): Promise<void> {
    const paths = await this.api.config.chooseFolder();
    if (!paths)
      return;
    this.configPaths.set(paths);
    const [settings, session, environments, collections, databases, queries, history, cookies, flows, load, mocks, listeners, intercept, plantuml, regressions, flowTemplates, emulator, workspaces] = await Promise.all([
      this.api.settings.get(),
      this.api.session.get(),
      this.api.environments.get(),
      this.api.collections.get(),
      this.api.databases.get(),
      this.api.queries.get(),
      this.api.history.get(),
      this.api.cookies.get(),
      this.api.services.flows.get(),
      this.api.services.load.get(),
      this.api.services.mocks.get(),
      this.api.services.listeners.get(),
      this.api.services.intercept.get(),
      this.api.plantuml.get(),
      this.api.services.regressions.get(),
      this.api.services.flowTemplates.get(),
      this.api.services.emulator.get(),
      this.api.workspaces.get(),
    ]);
    this.settings.set(normalizeUserSettings(settings));
    this.session.set(session);
    this.environments.set(environments);
    this.collections.set(collections);
    this.databases.set(databases);
    this.queries.set(queries);
    this.history.set(history);
    this.cookies.set(cookies);
    this.flows.set(flows);
    this.load.set(load);
    this.mocks.set(mocks);
    this.listeners.set(listeners);
    this.intercept.set(intercept);
    this.plantuml.set(plantuml);
    this.regressions.set(regressions);
    this.flowTemplates.set(flowTemplates);
    this.emulator.set(emulator);
    this.workspaces.set(workspaces);
    const snapshot: ThemeSnapshot = {
      preference: settings.theme,
      resolved:
        settings.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : settings.theme,
    };
    this.theme.set(snapshot);
    this.applyDom(snapshot, settings, true);
    this.configGeneration.update((value) => value + 1);
  }

  notifyReady(): void {
    void this.api.app.notifyReady();
  }

  /**
   * Writes theme, motion, font, and icon tokens onto `document.documentElement`.
   */
  private applyDom(theme: ThemeSnapshot, settings: UserSettings, animate: boolean): void {
    const root = document.documentElement;
    const themeChanged = root.dataset['theme'] !== theme.resolved;
    const osReduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const userWantsMotion =
      settings.motionPreset === 'snappy' ||
      (settings.motionPreset === 'custom' && settings.animationSpeed !== 'none');
    const effectiveOpen = osReduce && !userWantsMotion ? 'none' : settings.animationSpeed;
    const effectiveLeave = osReduce && !userWantsMotion ? 'none' : settings.closeAnimationSpeed;
    const commit = (): void => {
      root.dataset['theme'] = theme.resolved;
      root.dataset['motion'] = effectiveOpen;
      root.dataset['motionLeave'] = effectiveLeave;
      root.dataset['fontUi'] = settings.fontUi;
      root.dataset['fontMono'] = settings.fontMono;
      root.dataset['fontScale'] = settings.fontScale;
      root.dataset['iconScale'] = settings.iconScale;
      root.style.removeProperty('zoom');
      if (this.appliedZoom === settings.uiZoom)
        return;
      this.appliedZoom = settings.uiZoom;
      if (typeof this.api.window.setZoomFactor === 'function')
        this.api.window.setZoomFactor(settings.uiZoom);
      else
        root.style.zoom = String(settings.uiZoom);
    };

    if (!themeChanged) {
      commit();
      return;
    }

    if (!animate || !this.canAnimateTheme(settings) || effectiveOpen === 'none') {
      commit();
      return;
    }

    const doc = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    };
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(commit);
      return;
    }

    root.classList.add('is-theme-changing');
    commit();
    window.setTimeout(
      () => root.classList.remove('is-theme-changing'),
      220 * motionScaleForSpeed(settings.animationSpeed),
    );
  }

  private canAnimateTheme(settings: UserSettings): boolean {
    return settings.animationSpeed !== 'none';
  }

  private async persistUiZoom(zoom: number): Promise<void> {
    const saved = await this.api.settings.set({ uiZoom: zoom });
    this.settings.set({ ...normalizeUserSettings(saved), uiZoom: zoom });
    this.applyDom(this.theme(), this.settings(), false);
  }

  private queueZoomPersist(zoom: number): void {
    this.clearZoomTimer();
    this.zoomTimer = window.setTimeout(() => {
      this.zoomTimer = null;
      void this.persistUiZoom(zoom);
    }, 280);
  }

  private clearZoomTimer(): void {
    if (!this.zoomTimer)
      return;
    window.clearTimeout(this.zoomTimer);
    this.zoomTimer = null;
  }
}
