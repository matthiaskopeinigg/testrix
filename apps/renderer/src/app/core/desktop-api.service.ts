import { Injectable, signal } from '@angular/core';

import type { TestrixDesktopApi } from '@testrix/contracts';
import {
  APPEARANCE_SETTING_KEYS,
  CONFIG_FILE_NAMES,
  CONFIG_SCHEMA_VERSION,
  DEFAULT_COLLECTIONS_FILE,
  DEFAULT_DATABASES_FILE,
  DEFAULT_QUERIES_FILE,
  DEFAULT_SESSION_FILE,
  DEFAULT_SHORTCUTS,
  DEFAULT_USER_SETTINGS,
  cloneDefaultUserSettings,
  createDefaultEnvironmentsFile,
  createDefaultWorkspacesFile,
  duplicateWorkspaceName,
  mergeUserSettingsPatch,
  motionScaleForSpeed,
  nextWorkspaceFolder,
  nextWorkspaceId,
  parseCollectionsFile,
  parseDatabasesFile,
  parseEnvironmentsFile,
  parseQueriesFile,
  parseSettingsFile,
  removeWorkspaceFromCatalog,
  toUserSettings,
  type ChooseFileKind,
  type CollectionsFile,
  type DatabasesFile,
  type QueriesFile,
  type ConfigPaths,
  type ConfigRevealTarget,
  type EnvironmentsFile,
  type SessionFile,
  type SettingsResetScope,
  type ThemeSnapshot,
  type UserSettings,
  type WorkspacesFile,
  type WorkspaceSnapshot,
  type DatabaseQueryEnvelope,
} from '@testrix/contracts';

const memoryPaths = (): ConfigPaths => ({
  folder: '(in-memory)',
  configsFolder: '(in-memory)/configs',
  workspacesFolder: '(in-memory)/workspaces',
  logsFolder: '(in-memory)/logs',
  files: CONFIG_FILE_NAMES.map((name) => ({
    name,
    path: `(in-memory)/${name}`,
    directory: '(in-memory)',
    schemaVersion: CONFIG_SCHEMA_VERSION,
    exists: false,
  })),
});

let memorySettings: UserSettings = cloneDefaultUserSettings();

let memoryWorkspaces: WorkspacesFile = createDefaultWorkspacesFile();
let memoryEnvironments: EnvironmentsFile = createDefaultEnvironmentsFile();
let memoryCollections: CollectionsFile = { ...DEFAULT_COLLECTIONS_FILE };
let memoryDatabases: DatabasesFile = { ...DEFAULT_DATABASES_FILE, nodes: [] };
let memoryQueries: QueriesFile = { ...DEFAULT_QUERIES_FILE, nodes: [] };

function emptyQueryEnvelope(): DatabaseQueryEnvelope {
  return { table: { columns: [], rows: [], hasMore: false }, durationMs: 0 };
}

function memorySnapshot(): WorkspaceSnapshot {
  return {
    workspaces: memoryWorkspaces,
    environments: memoryEnvironments,
    collections: memoryCollections,
    databases: memoryDatabases,
    queries: memoryQueries,
  };
}

const browserFallback: TestrixDesktopApi = {
  app: {
    getVersion: async () => '2.0.0-beta.1',
    getPlatform: async () => 'win32',
    notifyReady: async () => undefined,
    reload: async () => window.location.reload(),
  },
  window: {
    minimize: async () => undefined,
    maximize: async () => undefined,
    close: async () => undefined,
    isMaximized: async () => false,
    setMovable: async () => undefined,
    onMaximizedChanged: () => () => undefined,
  },
  theme: {
    get: async () => ({ preference: 'dark', resolved: 'dark' }),
    set: async (preference) => ({
      preference,
      resolved: preference === 'system' ? 'dark' : preference,
    }),
    onChanged: () => () => undefined,
  },
  settings: {
    get: async () => ({ ...memorySettings, shortcuts: { ...memorySettings.shortcuts } }),
    set: async (patch) => {
      memorySettings = toUserSettings(parseSettingsFile(mergeUserSettingsPatch(memorySettings, patch)));
      return {
        ...memorySettings,
        shortcuts: { ...memorySettings.shortcuts },
        proxy: { ...memorySettings.proxy },
        dns: { ...memorySettings.dns },
        certificates: {
          ...memorySettings.certificates,
          clientCerts: memorySettings.certificates.clientCerts.map((item) => ({ ...item })),
        },
      };
    },
    reset: async (scope) => {
      if (scope === 'all') {
        memorySettings = cloneDefaultUserSettings();
      } else if (scope === 'appearance') {
        const next = { ...memorySettings };
        for (const key of APPEARANCE_SETTING_KEYS)
          (next as Record<string, unknown>)[key] = DEFAULT_USER_SETTINGS[key];
        memorySettings = next;
      } else if (scope === 'keyboard') {
        memorySettings = { ...memorySettings, shortcuts: { ...DEFAULT_SHORTCUTS } };
      } else if (scope === 'proxy') {
        memorySettings = { ...memorySettings, proxy: { ...DEFAULT_USER_SETTINGS.proxy } };
      } else if (scope === 'dns') {
        memorySettings = { ...memorySettings, dns: { ...DEFAULT_USER_SETTINGS.dns } };
      } else if (scope === 'certificates') {
        memorySettings = {
          ...memorySettings,
          certificates: { ...DEFAULT_USER_SETTINGS.certificates, clientCerts: [] },
        };
      } else if (scope === 'database') {
        memorySettings = { ...memorySettings, database: { ...DEFAULT_USER_SETTINGS.database } };
      } else {
        memorySettings = {
          ...memorySettings,
          logLevel: DEFAULT_USER_SETTINGS.logLevel,
          logToFile: DEFAULT_USER_SETTINGS.logToFile,
          logsFolder: DEFAULT_USER_SETTINGS.logsFolder,
          logFileMaxMb: DEFAULT_USER_SETTINGS.logFileMaxMb,
        };
      }
      return { ...memorySettings, shortcuts: { ...memorySettings.shortcuts } };
    },
  },
  session: {
    get: async () => ({ ...DEFAULT_SESSION_FILE }),
    set: async (patch) => ({ ...DEFAULT_SESSION_FILE, ...patch }),
  },
  environments: {
    get: async () => memoryEnvironments,
    set: async (patch) => {
      memoryEnvironments = parseEnvironmentsFile({ ...memoryEnvironments, ...patch });
      return memoryEnvironments;
    },
  },
  collections: {
    get: async () => memoryCollections,
    set: async (patch) => {
      memoryCollections = parseCollectionsFile({ ...memoryCollections, ...patch });
      return memoryCollections;
    },
  },
  databases: {
    get: async () => memoryDatabases,
    set: async (patch) => {
      memoryDatabases = parseDatabasesFile({ ...memoryDatabases, ...patch });
      return memoryDatabases;
    },
  },
  queries: {
    get: async () => memoryQueries,
    set: async (patch) => {
      memoryQueries = parseQueriesFile({ ...memoryQueries, ...patch });
      return memoryQueries;
    },
  },
  database: {
    test: async () => ({ ok: true as const }),
    introspect: async () => ({}),
    query: async () => emptyQueryEnvelope(),
    explain: async () => emptyQueryEnvelope(),
    disconnect: async () => undefined,
    statuses: async () => ({}),
    sessionQuery: async () => emptyQueryEnvelope(),
    sessionCommit: async (tabId) => ({ tabId, open: false, uncommitted: false, rollbackAt: null }),
    sessionRollback: async (tabId) => ({ tabId, open: false, uncommitted: false, rollbackAt: null }),
    sessionClose: async () => undefined,
    warmBoot: async () => undefined,
  },
  workspaces: {
    get: async () => memoryWorkspaces,
    switch: async (id) => {
      if (memoryWorkspaces.items.some((item) => item.id === id)) {
        memoryWorkspaces = { ...memoryWorkspaces, activeId: id };
      }
      return memorySnapshot();
    },
    create: async (name) => {
      const item = {
        id: nextWorkspaceId(memoryWorkspaces.items.map((entry) => entry.id)),
        name: name.trim() || 'Workspace',
        folder: nextWorkspaceFolder(memoryWorkspaces.items.map((entry) => entry.folder)),
        modifiedAt: new Date().toISOString(),
      };
      memoryWorkspaces = {
        ...memoryWorkspaces,
        items: [...memoryWorkspaces.items, item],
        orderIds: [...memoryWorkspaces.orderIds, item.id],
        activeId: item.id,
      };
      memoryEnvironments = createDefaultEnvironmentsFile();
      memoryCollections = { ...DEFAULT_COLLECTIONS_FILE };
      memoryDatabases = { ...DEFAULT_DATABASES_FILE, nodes: [] };
      memoryQueries = { ...DEFAULT_QUERIES_FILE, nodes: [] };
      return memorySnapshot();
    },
    rename: async (id, name) => {
      const nextName = name.trim();
      if (nextName) {
        memoryWorkspaces = {
          ...memoryWorkspaces,
          items: memoryWorkspaces.items.map((item) =>
            item.id === id ? { ...item, name: nextName, modifiedAt: new Date().toISOString() } : item,
          ),
        };
      }
      return memoryWorkspaces;
    },
    duplicate: async (id) => {
      const source = memoryWorkspaces.items.find((item) => item.id === id);
      if (!source) {
        return memorySnapshot();
      }
      const item = {
        id: nextWorkspaceId(memoryWorkspaces.items.map((entry) => entry.id)),
        name: duplicateWorkspaceName(
          source.name,
          memoryWorkspaces.items.map((entry) => entry.name),
        ),
        folder: nextWorkspaceFolder(memoryWorkspaces.items.map((entry) => entry.folder)),
        modifiedAt: new Date().toISOString(),
      };
      memoryWorkspaces = {
        ...memoryWorkspaces,
        items: [...memoryWorkspaces.items, item],
        orderIds: [...memoryWorkspaces.orderIds, item.id],
        activeId: item.id,
      };
      return memorySnapshot();
    },
    delete: async (id) => {
      const next = removeWorkspaceFromCatalog(memoryWorkspaces, id);
      if (next) {
        memoryWorkspaces = next;
        memoryEnvironments = createDefaultEnvironmentsFile();
        memoryCollections = { ...DEFAULT_COLLECTIONS_FILE };
        memoryDatabases = { ...DEFAULT_DATABASES_FILE, nodes: [] };
        memoryQueries = { ...DEFAULT_QUERIES_FILE, nodes: [] };
      }
      return memorySnapshot();
    },
  },
  config: {
    paths: async () => memoryPaths(),
    reveal: async () => undefined,
    chooseFolder: async () => null,
    chooseLogsFolder: async () => null,
    chooseConfigsFolder: async () => null,
    chooseFile: async () => null,
  },
  logs: {
    recent: async () => [],
  },
};

@Injectable({ providedIn: 'root' })
export class DesktopApiService {
  readonly api: TestrixDesktopApi = window.testrix ?? browserFallback;
  readonly settings = signal<UserSettings>(cloneDefaultUserSettings());
  readonly theme = signal<ThemeSnapshot>({ preference: 'dark', resolved: 'dark' });
  readonly session = signal<SessionFile>({ ...DEFAULT_SESSION_FILE });
  readonly environments = signal<EnvironmentsFile>(createDefaultEnvironmentsFile());
  readonly collections = signal<CollectionsFile>({ ...DEFAULT_COLLECTIONS_FILE });
  readonly databases = signal<DatabasesFile>({ ...DEFAULT_DATABASES_FILE, nodes: [] });
  readonly queries = signal<QueriesFile>({ ...DEFAULT_QUERIES_FILE, nodes: [] });
  readonly workspaces = signal<WorkspacesFile>(createDefaultWorkspacesFile());
  readonly configPaths = signal<ConfigPaths>(memoryPaths());
  readonly version = signal('2.0.0-beta.1');
  readonly platform = signal('win32');
  readonly isMaximized = signal(false);
  readonly hasDesktop = Boolean(window.testrix);
  readonly updateStatus = signal('Testrix 2.0 is a local build. You’re up to date.');
  /** Bumps when the config folder changes so stores re-read persisted files. */
  readonly configGeneration = signal(0);

  async hydrate(): Promise<void> {
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
      workspaces,
      paths,
    ] = await Promise.all([
      this.api.settings.get().catch(() => cloneDefaultUserSettings()),
      this.api.theme.get().catch(() => ({ preference: 'dark' as const, resolved: 'dark' as const })),
      this.api.app.getVersion().catch(() => '2.0.0-beta.1'),
      this.api.app.getPlatform().catch(() => 'win32'),
      this.api.window.isMaximized().catch(() => false),
      this.api.session.get().catch(() => ({ ...DEFAULT_SESSION_FILE })),
      this.api.environments.get().catch(() => createDefaultEnvironmentsFile()),
      this.api.collections.get().catch(() => ({ ...DEFAULT_COLLECTIONS_FILE })),
      this.api.databases.get().catch(() => ({ ...DEFAULT_DATABASES_FILE, nodes: [] })),
      this.api.queries.get().catch(() => ({ ...DEFAULT_QUERIES_FILE, nodes: [] })),
      this.api.workspaces.get().catch(() => createDefaultWorkspacesFile()),
      this.api.config.paths().catch(() => memoryPaths()),
    ]);
    this.settings.set(settings);
    this.theme.set(theme);
    this.version.set(version);
    this.platform.set(platform);
    this.isMaximized.set(maximized);
    this.session.set(session);
    this.environments.set(environments);
    this.collections.set(collections);
    this.databases.set(databases);
    this.queries.set(queries);
    this.workspaces.set(workspaces);
    this.configPaths.set(paths);
    this.applyDom(theme, settings, false);
    this.api.theme.onChanged((snapshot) => {
      this.theme.set(snapshot);
      this.applyDom(snapshot, this.settings(), true);
    });
    this.api.window.onMaximizedChanged((value) => this.isMaximized.set(value));
  }

  applySnapshot(snapshot: WorkspaceSnapshot): void {
    this.workspaces.set(snapshot.workspaces);
    this.environments.set(snapshot.environments);
    this.collections.set(snapshot.collections);
    this.databases.set(snapshot.databases);
    this.queries.set(snapshot.queries);
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
    this.settings.set(settings);
    this.applyDom(snapshot, settings, true);
    const nextTheme = await this.api.theme.set(preference);
    const nextSettings = await this.api.settings.set({ theme: preference });
    this.theme.set(nextTheme);
    this.settings.set(nextSettings);
    this.applyDom(nextTheme, nextSettings, true);
  }

  async patchSettings(patch: Partial<UserSettings>): Promise<void> {
    const optimistic = mergeUserSettingsPatch(this.settings(), patch);
    this.settings.set(optimistic);
    this.applyDom(this.theme(), optimistic, false);
    if (patch.theme) {
      await this.setTheme(patch.theme);
      return;
    }
    const next = await this.api.settings.set(patch);
    this.settings.set(next);
    this.applyDom(this.theme(), next, false);
  }

  async resetSettings(scope: SettingsResetScope): Promise<void> {
    const next = await this.api.settings.reset(scope);
    this.settings.set(next);
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
    this.settings.set(await this.api.settings.get());
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
    const [settings, session, environments, collections, databases, queries, workspaces] = await Promise.all([
      this.api.settings.get(),
      this.api.session.get(),
      this.api.environments.get(),
      this.api.collections.get(),
      this.api.databases.get(),
      this.api.queries.get(),
      this.api.workspaces.get(),
    ]);
    this.settings.set(settings);
    this.session.set(session);
    this.environments.set(environments);
    this.collections.set(collections);
    this.databases.set(databases);
    this.queries.set(queries);
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

  checkForUpdates(): void {
    this.updateStatus.set(`Testrix ${this.version()} is a local build. You’re up to date.`);
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
    const commit = (): void => {
      root.dataset['theme'] = theme.resolved;
      root.dataset['motion'] = settings.animationSpeed;
      root.dataset['motionLeave'] = settings.closeAnimationSpeed;
      root.dataset['fontUi'] = settings.fontUi;
      root.dataset['fontMono'] = settings.fontMono;
      root.dataset['fontScale'] = settings.fontScale;
      root.dataset['iconScale'] = settings.iconScale;
    };

    if (!themeChanged) {
      commit();
      return;
    }

    if (!animate || !this.canAnimateTheme(settings)) {
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
}
