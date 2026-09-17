import { app, nativeTheme, shell } from 'electron';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  APPEARANCE_SETTING_KEYS,
  CONFIG_FILE_NAMES,
  CONFIG_SCHEMA_VERSION,
  CONFIGS_DIR,
  DEFAULT_CERTIFICATE_SETTINGS,
  DEFAULT_COLLECTIONS_FILE,
  DEFAULT_DATABASES_FILE,
  DEFAULT_DNS_SETTINGS,
  DEFAULT_PROXY_SETTINGS,
  DEFAULT_QUERIES_FILE,
  DEFAULT_SESSION_FILE,
  DEFAULT_SHORTCUTS,
  DEFAULT_USER_SETTINGS,
  DEFAULT_WORKSPACE_FOLDER,
  WORKSPACES_DIR,
  WORKSPACES_FILE_NAME,
  cloneDefaultUserSettings,
  createDefaultEnvironmentsFile,
  createDefaultWorkspacesFile,
  duplicateWorkspaceName,
  nextWorkspaceFolder,
  nextWorkspaceId,
  parseCollectionsFile,
  parseDatabasesFile,
  parseEnvironmentsFile,
  parseQueriesFile,
  parseSessionFile,
  parseSettingsFile,
  parseWorkspacesFile,
  mergeUserSettingsPatch,
  removeWorkspaceFromCatalog,
  resolveActiveWorkspace,
  toUserSettings,
  type CollectionsFile,
  type ConfigFileName,
  type ConfigPaths,
  type ConfigRevealTarget,
  type DatabasesFile,
  type EnvironmentsFile,
  type QueriesFile,
  type SessionFile,
  type SettingsResetScope,
  type ThemePreference,
  type ThemeSnapshot,
  type UserSettings,
  type Workspace,
  type WorkspacesFile,
  type WorkspaceSnapshot,
} from '@testrix/contracts';

import { readJsonFile, writeJsonFile } from './json-file';
import { migrateLegacyConfigLayout } from './config-layout';

/**
 * Owns global configs and the active workspace JSON files.
 */
export class ConfigStore {
  settings: UserSettings = cloneDefaultUserSettings();
  session: SessionFile = { ...DEFAULT_SESSION_FILE };
  workspaces: WorkspacesFile = createDefaultWorkspacesFile();
  environments: EnvironmentsFile = parseEnvironmentsFile(null);
  collections: CollectionsFile = { ...DEFAULT_COLLECTIONS_FILE };
  databases: DatabasesFile = { ...DEFAULT_DATABASES_FILE, nodes: [] };
  queries: QueriesFile = { ...DEFAULT_QUERIES_FILE, nodes: [] };
  private customFolder: string | null = null;
  private customConfigsFolder: string | null = null;

  constructor(private readonly electronApp: typeof app) {}

  folder(): string {
    return this.customFolder ?? this.defaultFolder();
  }

  configsPath(): string {
    const custom = this.customConfigsFolder?.trim();
    if (custom)
      return custom;
    return path.join(this.folder(), CONFIGS_DIR);
  }

  workspacesRoot(): string {
    return path.join(this.folder(), WORKSPACES_DIR);
  }

  logsFolder(): string {
    const custom = this.settings.logsFolder.trim();
    if (custom)
      return custom;
    return path.join(this.folder(), 'logs');
  }

  logFilePath(): string {
    return path.join(this.logsFolder(), 'testrix.log');
  }

  activeWorkspace(): Workspace | null {
    return resolveActiveWorkspace(this.workspaces);
  }

  workspaceDir(item: Workspace): string {
    return path.join(this.workspacesRoot(), item.folder);
  }

  filePath(name: ConfigFileName): string {
    if (name === 'settings.json' || name === 'session.json') {
      return path.join(this.configsPath(), name);
    }
    if (name === 'workspaces.json') {
      return path.join(this.workspacesRoot(), WORKSPACES_FILE_NAME);
    }
    const workspace = this.activeWorkspace();
    const folder = workspace?.folder ?? DEFAULT_WORKSPACE_FOLDER;
    return path.join(this.workspacesRoot(), folder, name);
  }

  paths(): ConfigPaths {
    return {
      folder: this.folder(),
      configsFolder: this.configsPath(),
      workspacesFolder: this.workspacesRoot(),
      logsFolder: this.logsFolder(),
      files: CONFIG_FILE_NAMES.map((name) => {
        const filePath = this.filePath(name);
        return {
          name,
          path: filePath,
          directory: path.dirname(filePath),
          schemaVersion: this.schemaVersionFor(name),
          exists: existsSync(filePath),
        };
      }),
    };
  }

  workspaceSnapshot(): WorkspaceSnapshot {
    return {
      workspaces: this.workspaces,
      environments: this.environments,
      collections: this.collections,
      databases: this.databases,
      queries: this.queries,
    };
  }

  async load(): Promise<void> {
    await this.loadRoot();
    await migrateLegacyConfigLayout(this.folder());
    await mkdir(this.configsPath(), { recursive: true });
    await mkdir(this.workspacesRoot(), { recursive: true });

    const [settingsRaw, sessionRaw, workspacesRaw] = await Promise.all([
      readJsonFile(this.filePath('settings.json')),
      readJsonFile(this.filePath('session.json')),
      readJsonFile(this.filePath('workspaces.json')),
    ]);

    const settingsFile = parseSettingsFile(settingsRaw);
    this.settings = toUserSettings(settingsFile);
    this.session = parseSessionFile(sessionRaw);
    this.workspaces = parseWorkspacesFile(workspacesRaw);
    await this.ensureActiveWorkspaceFolder();
    await this.loadActiveWorkspaceFiles();

    await Promise.all([
      this.writeSettings(),
      writeJsonFile(this.filePath('session.json'), this.session),
      this.writeWorkspaces(),
      this.flushActiveWorkspace(),
    ]);
  }

  async patchSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
    this.settings = toUserSettings(parseSettingsFile(mergeUserSettingsPatch(this.settings, partial)));
    await this.writeSettings();
    return this.settings;
  }

  async resetSettings(scope: SettingsResetScope): Promise<UserSettings> {
    if (scope === 'all') {
      this.settings = cloneDefaultUserSettings();
    } else if (scope === 'appearance') {
      const next = { ...this.settings };
      for (const key of APPEARANCE_SETTING_KEYS) {
        (next as Record<string, unknown>)[key] = DEFAULT_USER_SETTINGS[key];
      }
      this.settings = toUserSettings(parseSettingsFile(next));
    } else if (scope === 'keyboard') {
      this.settings = {
        ...this.settings,
        shortcuts: { ...DEFAULT_SHORTCUTS },
      };
    } else if (scope === 'proxy') {
      this.settings = {
        ...this.settings,
        proxy: { ...DEFAULT_PROXY_SETTINGS },
      };
    } else if (scope === 'dns') {
      this.settings = {
        ...this.settings,
        dns: { ...DEFAULT_DNS_SETTINGS },
      };
    } else if (scope === 'certificates') {
      this.settings = {
        ...this.settings,
        certificates: { ...DEFAULT_CERTIFICATE_SETTINGS, clientCerts: [] },
      };
    } else if (scope === 'database') {
      this.settings = {
        ...this.settings,
        database: { ...DEFAULT_USER_SETTINGS.database },
      };
    } else {
      this.settings = {
        ...this.settings,
        logLevel: DEFAULT_USER_SETTINGS.logLevel,
        logToFile: DEFAULT_USER_SETTINGS.logToFile,
        logsFolder: DEFAULT_USER_SETTINGS.logsFolder,
        logFileMaxMb: DEFAULT_USER_SETTINGS.logFileMaxMb,
      };
    }
    await this.writeSettings();
    return this.settings;
  }

  async patchSession(partial: Partial<Omit<SessionFile, 'schemaVersion'>>): Promise<SessionFile> {
    this.session = parseSessionFile({
      ...this.session,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('session.json'), this.session);
    return this.session;
  }

  async patchEnvironments(
    partial: Partial<Omit<EnvironmentsFile, 'schemaVersion'>>,
  ): Promise<EnvironmentsFile> {
    this.environments = parseEnvironmentsFile({
      ...this.environments,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('environments.json'), this.environments);
    return this.environments;
  }

  async patchCollections(
    partial: Partial<Omit<CollectionsFile, 'schemaVersion'>>,
  ): Promise<CollectionsFile> {
    this.collections = parseCollectionsFile({
      ...this.collections,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('collections.json'), this.collections);
    return this.collections;
  }

  async patchDatabases(
    partial: Partial<Omit<DatabasesFile, 'schemaVersion'>>,
  ): Promise<DatabasesFile> {
    this.databases = parseDatabasesFile({
      ...this.databases,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('database.json'), this.databases);
    return this.databases;
  }

  async patchQueries(partial: Partial<Omit<QueriesFile, 'schemaVersion'>>): Promise<QueriesFile> {
    this.queries = parseQueriesFile({
      ...this.queries,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('queries.json'), this.queries);
    return this.queries;
  }

  async switchWorkspace(id: string): Promise<WorkspaceSnapshot> {
    if (!this.workspaces.items.some((item) => item.id === id)) {
      return this.workspaceSnapshot();
    }
    if (this.workspaces.activeId === id) {
      return this.workspaceSnapshot();
    }
    await this.flushActiveWorkspace();
    this.workspaces = {
      ...this.workspaces,
      activeId: id,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    };
    await this.loadActiveWorkspaceFiles();
    await this.writeWorkspaces();
    return this.workspaceSnapshot();
  }

  async createWorkspace(name: string): Promise<WorkspaceSnapshot> {
    await this.flushActiveWorkspace();
    const now = new Date().toISOString();
    const item: Workspace = {
      id: nextWorkspaceId(this.workspaces.items.map((entry) => entry.id)),
      name: name.trim() || 'Workspace',
      folder: nextWorkspaceFolder(this.workspaces.items.map((entry) => entry.folder)),
      modifiedAt: now,
    };
    await mkdir(this.workspaceDir(item), { recursive: true });
    this.workspaces = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      items: [...this.workspaces.items, item],
      orderIds: [...this.workspaces.orderIds, item.id],
      activeId: item.id,
    };
    this.environments = createDefaultEnvironmentsFile();
    this.collections = { ...DEFAULT_COLLECTIONS_FILE };
    this.databases = { ...DEFAULT_DATABASES_FILE, nodes: [] };
    this.queries = { ...DEFAULT_QUERIES_FILE, nodes: [] };
    await this.writeWorkspaces();
    await this.flushActiveWorkspace();
    return this.workspaceSnapshot();
  }

  async renameWorkspace(id: string, name: string): Promise<WorkspacesFile> {
    const nextName = name.trim();
    if (!nextName) {
      return this.workspaces;
    }
    this.workspaces = {
      ...this.workspaces,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      items: this.workspaces.items.map((item) =>
        item.id === id ? { ...item, name: nextName, modifiedAt: new Date().toISOString() } : item,
      ),
    };
    await this.writeWorkspaces();
    return this.workspaces;
  }

  async duplicateWorkspace(id: string): Promise<WorkspaceSnapshot> {
    const source = this.workspaces.items.find((item) => item.id === id);
    if (!source) {
      return this.workspaceSnapshot();
    }
    await this.flushActiveWorkspace();
    const item: Workspace = {
      id: nextWorkspaceId(this.workspaces.items.map((entry) => entry.id)),
      name: duplicateWorkspaceName(
        source.name,
        this.workspaces.items.map((entry) => entry.name),
      ),
      folder: nextWorkspaceFolder(this.workspaces.items.map((entry) => entry.folder)),
      modifiedAt: new Date().toISOString(),
    };
    await mkdir(this.workspaceDir(item), { recursive: true });
    const envRaw = await readJsonFile(path.join(this.workspaceDir(source), 'environments.json'));
    const colRaw = await readJsonFile(path.join(this.workspaceDir(source), 'collections.json'));
    const dbRaw = await readJsonFile(path.join(this.workspaceDir(source), 'database.json'));
    const queryRaw = await readJsonFile(path.join(this.workspaceDir(source), 'queries.json'));
    this.workspaces = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      items: [...this.workspaces.items, item],
      orderIds: [...this.workspaces.orderIds, item.id],
      activeId: item.id,
    };
    this.environments = parseEnvironmentsFile(envRaw);
    this.collections = parseCollectionsFile(colRaw);
    this.databases = parseDatabasesFile(dbRaw);
    this.queries = parseQueriesFile(queryRaw);
    await this.writeWorkspaces();
    await this.flushActiveWorkspace();
    return this.workspaceSnapshot();
  }

  async deleteWorkspace(id: string): Promise<WorkspaceSnapshot> {
    const target = this.workspaces.items.find((item) => item.id === id);
    const nextCatalog = removeWorkspaceFromCatalog(this.workspaces, id);
    if (!target || !nextCatalog) {
      return this.workspaceSnapshot();
    }
    await this.flushActiveWorkspace();
    const wasActive = this.workspaces.activeId === id;
    this.workspaces = nextCatalog;
    await rm(this.workspaceDir(target), { recursive: true, force: true });
    if (wasActive) {
      await this.ensureActiveWorkspaceFolder();
      await this.loadActiveWorkspaceFiles();
    }
    await this.writeWorkspaces();
    return this.workspaceSnapshot();
  }

  snapshot(): ThemeSnapshot {
    const preference = this.settings.theme;
    const resolved =
      preference === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : preference;
    return { preference, resolved };
  }

  applyTheme(preference: ThemePreference): ThemeSnapshot {
    nativeTheme.themeSource = preference === 'system' ? 'system' : preference;
    this.settings = { ...this.settings, theme: preference };
    return this.snapshot();
  }

  /**
   * Points Testrix at a different app directory and reloads configs + workspaces there.
   */
  async setFolder(nextFolder: string): Promise<ConfigPaths> {
    await mkdir(nextFolder, { recursive: true });
    this.customFolder = nextFolder;
    await this.writeRoot();
    await this.load();
    return this.paths();
  }

  /**
   * Points settings.json and session.json at a different configs directory.
   */
  async setConfigsFolder(nextFolder: string): Promise<ConfigPaths> {
    await mkdir(nextFolder, { recursive: true });
    const defaultPath = path.join(this.folder(), CONFIGS_DIR);
    this.customConfigsFolder =
      path.resolve(nextFolder) === path.resolve(defaultPath) ? null : nextFolder;
    await this.writeRoot();
    await mkdir(this.configsPath(), { recursive: true });
    await Promise.all([
      this.writeSettings(),
      writeJsonFile(this.filePath('session.json'), this.session),
    ]);
    return this.paths();
  }

  async reveal(target: ConfigRevealTarget): Promise<void> {
    if (target === 'folder') {
      await shell.openPath(this.folder());
      return;
    }
    if (target === 'configs') {
      await mkdir(this.configsPath(), { recursive: true });
      await shell.openPath(this.configsPath());
      return;
    }
    if (target === 'workspaces') {
      await mkdir(this.workspacesRoot(), { recursive: true });
      await shell.openPath(this.workspacesRoot());
      return;
    }
    if (target === 'logs') {
      await mkdir(this.logsFolder(), { recursive: true });
      const logPath = this.logFilePath();
      if (existsSync(logPath)) {
        shell.showItemInFolder(logPath);
        return;
      }
      await shell.openPath(this.logsFolder());
      return;
    }
    const filePath = this.filePath(target);
    if (existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return;
    }
    await shell.openPath(path.dirname(filePath));
  }

  private defaultFolder(): string {
    return this.electronApp.getPath('userData');
  }

  private rootFile(): string {
    return path.join(this.defaultFolder(), 'config-root.json');
  }

  private async loadRoot(): Promise<void> {
    const raw = await readJsonFile(this.rootFile());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      this.customFolder = null;
      this.customConfigsFolder = null;
      return;
    }
    const source = raw as Record<string, unknown>;
    const folder = source['folder'];
    if (typeof folder === 'string' && folder.trim() && existsSync(folder))
      this.customFolder = folder;
    else
      this.customFolder = null;
    const configsFolder = source['configsFolder'];
    if (typeof configsFolder === 'string' && configsFolder.trim() && existsSync(configsFolder))
      this.customConfigsFolder = configsFolder;
    else
      this.customConfigsFolder = null;
  }

  private async writeRoot(): Promise<void> {
    await writeJsonFile(this.rootFile(), {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      ...(this.customFolder ? { folder: this.customFolder } : {}),
      ...(this.customConfigsFolder ? { configsFolder: this.customConfigsFolder } : {}),
    });
  }

  private async ensureActiveWorkspaceFolder(): Promise<void> {
    const workspace = this.activeWorkspace();
    if (!workspace) {
      this.workspaces = createDefaultWorkspacesFile();
    }
    const active = this.activeWorkspace();
    if (!active) {
      return;
    }
    await mkdir(this.workspaceDir(active), { recursive: true });
  }

  private async loadActiveWorkspaceFiles(): Promise<void> {
    const [environmentsRaw, collectionsRaw, databasesRaw, queriesRaw] = await Promise.all([
      readJsonFile(this.filePath('environments.json')),
      readJsonFile(this.filePath('collections.json')),
      readJsonFile(this.filePath('database.json')),
      readJsonFile(this.filePath('queries.json')),
    ]);
    this.environments = parseEnvironmentsFile(environmentsRaw);
    this.collections = parseCollectionsFile(collectionsRaw);
    this.databases = parseDatabasesFile(databasesRaw);
    this.queries = parseQueriesFile(queriesRaw);
  }

  private async flushActiveWorkspace(): Promise<void> {
    await Promise.all([
      writeJsonFile(this.filePath('environments.json'), this.environments),
      writeJsonFile(this.filePath('collections.json'), this.collections),
      writeJsonFile(this.filePath('database.json'), this.databases),
      writeJsonFile(this.filePath('queries.json'), this.queries),
    ]);
  }

  private async writeWorkspaces(): Promise<void> {
    await writeJsonFile(this.filePath('workspaces.json'), this.workspaces);
  }

  private schemaVersionFor(name: ConfigFileName): number {
    switch (name) {
      case 'settings.json':
        return CONFIG_SCHEMA_VERSION;
      case 'session.json':
        return this.session.schemaVersion;
      case 'workspaces.json':
        return this.workspaces.schemaVersion;
      case 'environments.json':
        return this.environments.schemaVersion;
      case 'collections.json':
        return this.collections.schemaVersion;
      case 'database.json':
        return this.databases.schemaVersion;
      case 'queries.json':
        return this.queries.schemaVersion;
      default:
        return CONFIG_SCHEMA_VERSION;
    }
  }

  private async writeSettings(): Promise<void> {
    await writeJsonFile(this.filePath('settings.json'), {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      ...this.settings,
    });
  }
}
