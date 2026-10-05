import { type app, nativeTheme, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  COLLAB_LEGACY_WORKSPACE,
  COLLAB_REPOS_DIR,
  COLLAB_REPOS_FILE_NAME,
  collabLinkedFolder,
  createDefaultCollabReposFile,
  normalizeRemote,
  parseCollabReposFile,
  type CollabManifestWorkspace,
  type CollabRepo,
  type CollabReposFile,
  ANDROID_SETTING_KEYS,
  APPEARANCE_SETTING_KEYS,
  CONFIG_FILE_NAMES,
  CONFIG_SCHEMA_VERSION,
  CONFIGS_DIR,
  DEFAULT_CERTIFICATE_SETTINGS,
  DEFAULT_COLLECTIONS_FILE,
  DEFAULT_DATABASES_FILE,
  DEFAULT_DNS_SETTINGS,
  DEFAULT_HISTORY_FILE,
  DEFAULT_COOKIES_FILE,
  DEFAULT_FLOWS_FILE,
  DEFAULT_LOAD_FILE,
  DEFAULT_MOCKS_FILE,
  DEFAULT_LISTENERS_FILE,
  DEFAULT_INTERCEPT_FILE,
  DEFAULT_PLANTUML_FILE,
  DEFAULT_FLOW_TEMPLATES_FILE,
  DEFAULT_EMULATOR_FILE,
  DEFAULT_PROXY_SETTINGS,
  DEFAULT_QUERIES_FILE,
  DEFAULT_REGRESSIONS_FILE,
  DEFAULT_SESSION_FILE,
  DEFAULT_SHORTCUTS,
  DEFAULT_USER_SETTINGS,
  DEFAULT_WORKSPACE_FOLDER,
  WORKSPACES_DIR,
  WORKSPACES_FILE_NAME,
  cloneDefaultUserSettings,
  createDefaultEnvironmentsFile,
  createDefaultWorkspacesFile,
  createTestingWorkspaceFiles,
  TESTING_SEED_VERSION,
  applyCollabSecrets,
  applyWorkspaceOrder,
  duplicateWorkspaceName,
  nextWorkspaceFolder,
  nextWorkspaceId,
  parseCollectionsFile,
  parseDatabasesFile,
  parseEnvironmentsFile,
  parseHistoryFile,
  parseCookiesFile,
  parseFlowsFile,
  parseLoadFile,
  parseMocksFile,
  parseListenersFile,
  parseInterceptFile,
  parsePlantumlFile,
  parseFlowTemplatesFile,
  parseEmulatorFile,
  parseRegressionsFile,
  collectFolderCookies,
  parseQueriesFile,
  parseSessionFile,
  parseSettingsFile,
  peelWorkspaceSecrets,
  parseWorkspacesFile,
  mergeUserSettingsPatch,
  removeWorkspaceFromCatalog,
  resolveActiveWorkspace,
  TESTING_WORKSPACE_ID,
  toUserSettings,
  type CollectionsFile,
  type ConfigFileName,
  type ConfigPaths,
  type ConfigRevealTarget,
  type DatabasesFile,
  type EnvironmentsFile,
  type HistoryFile,
  type CookiesFile,
  type FlowsFile,
  type LoadFile,
  type MocksFile,
  type ListenersFile,
  type InterceptFile,
  type PlantumlFile,
  type FlowTemplatesFile,
  type EmulatorFile,
  type QueriesFile,
  type RegressionsFile,
  type SessionFile,
  type SettingsResetScope,
  type ThemePreference,
  type ThemeSnapshot,
  type UserSettings,
  type Workspace,
  type WorkspacesFile,
  type WorkspaceFootprintDto,
  type WorkspaceSnapshot,
  withTestingWorkspace,
} from '@testrix/contracts';

import { keepCorruptCopy, readJsonFile, writeJsonFile } from './json-file';
import { migrateLegacyConfigLayout } from './config-layout';
import {
  copyWorkspaceOut,
  migrateLegacyRepoLayout,
  moveDir,
  peelWorkspaceFolder,
  removePcOnlyFiles,
} from './collab/collab-repo-storage';
import { readSecretsFile, updateSecretsFile } from './collab/collab-secrets-file';

const SECRET_BEARING_FILES = ['environments.json', 'collections.json', 'database.json'] as const;

type SecretBearingFile = (typeof SECRET_BEARING_FILES)[number];

interface SecretBearingSnapshot {
  readonly 'environments.json': EnvironmentsFile;
  readonly 'collections.json': CollectionsFile;
  readonly 'database.json': DatabasesFile;
}

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
  history: HistoryFile = { ...DEFAULT_HISTORY_FILE };
  cookies: CookiesFile = { ...DEFAULT_COOKIES_FILE };
  flows: FlowsFile = { ...DEFAULT_FLOWS_FILE };
  loadFile: LoadFile = { ...DEFAULT_LOAD_FILE };
  mocksFile: MocksFile = { ...DEFAULT_MOCKS_FILE };
  listenersFile: ListenersFile = { ...DEFAULT_LISTENERS_FILE };
  interceptFile: InterceptFile = { ...DEFAULT_INTERCEPT_FILE };
  plantumlFile: PlantumlFile = { ...DEFAULT_PLANTUML_FILE };
  regressions: RegressionsFile = { ...DEFAULT_REGRESSIONS_FILE };
  flowTemplates: FlowTemplatesFile = { ...DEFAULT_FLOW_TEMPLATES_FILE };
  emulator: EmulatorFile = { ...DEFAULT_EMULATOR_FILE };
  /** Fired after any active-workspace JSON file is written (multi-window refresh). */
  onWorkspaceFilesChanged: (() => void) | null = null;
  private customFolder: string | null = null;
  private customConfigsFolder: string | null = null;
  private readonly windowSessions = new Map<number, SessionFile>();
  private collabReposFile: CollabReposFile = createDefaultCollabReposFile();
  /** Repositories reorganized on this start, so their first commit can say so. */
  private readonly migratedRepoIds = new Set<string>();

  constructor(private readonly electronApp: typeof app) {}

  private notifyWorkspaceFilesChanged(): void {
    try {
      this.onWorkspaceFilesChanged?.();
    } catch {
      // listeners must not break persistence
    }
  }

  private windowSessionPath(windowId: number): string {
    return path.join(this.configsPath(), `session-window-${windowId}.json`);
  }

  async getSessionForWindow(windowId: number): Promise<SessionFile> {
    const cached = this.windowSessions.get(windowId);
    if (cached)
      return cached;
    const filePath = this.windowSessionPath(windowId);
    if (existsSync(filePath)) {
      const raw = await readJsonFile(filePath);
      const parsed = parseSessionFile({
        ...parseSessionFile(raw),
        palettePinsByWorkspace: this.session.palettePinsByWorkspace ?? {},
      });
      this.windowSessions.set(windowId, parsed);
      return parsed;
    }
    // First window (or missing file): share the canonical session.json snapshot.
    if (this.windowSessions.size === 0) {
      this.windowSessions.set(windowId, this.session);
      return this.session;
    }
    const seeded = parseSessionFile({
      ...DEFAULT_SESSION_FILE,
      palettePinsByWorkspace: this.session.palettePinsByWorkspace ?? {},
      sidebarCollapsed: this.session.sidebarCollapsed,
      sidebarWidth: this.session.sidebarWidth,
    });
    this.windowSessions.set(windowId, seeded);
    return seeded;
  }

  async patchSessionForWindow(
    windowId: number,
    partial: Partial<Omit<SessionFile, 'schemaVersion'>>,
  ): Promise<SessionFile> {
    const current = await this.getSessionForWindow(windowId);
    let next = parseSessionFile({
      ...current,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    // Palette pins are workspace-scoped and shared across workbench windows.
    if (partial.palettePinsByWorkspace !== undefined) {
      this.session = parseSessionFile({
        ...this.session,
        palettePinsByWorkspace: next.palettePinsByWorkspace,
        schemaVersion: CONFIG_SCHEMA_VERSION,
      });
      await writeJsonFile(this.filePath('session.json'), this.session);
      for (const [id, sess] of this.windowSessions) {
        this.windowSessions.set(
          id,
          parseSessionFile({
            ...sess,
            palettePinsByWorkspace: next.palettePinsByWorkspace,
            schemaVersion: CONFIG_SCHEMA_VERSION,
          }),
        );
      }
      next = parseSessionFile({
        ...next,
        palettePinsByWorkspace: this.session.palettePinsByWorkspace,
        schemaVersion: CONFIG_SCHEMA_VERSION,
      });
      this.notifyWorkspaceFilesChanged();
    }
    this.windowSessions.set(windowId, next);
    const isPrimary = this.windowSessions.size === 1 || this.session === current;
    if (isPrimary) {
      this.session = parseSessionFile({
        ...next,
        palettePinsByWorkspace: this.session.palettePinsByWorkspace ?? next.palettePinsByWorkspace,
        schemaVersion: CONFIG_SCHEMA_VERSION,
      });
      await writeJsonFile(this.filePath('session.json'), this.session);
    } else {
      await writeJsonFile(this.windowSessionPath(windowId), next);
    }
    return next;
  }

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

  workspaceFootprint(): WorkspaceFootprintDto {
    const byCategory: Record<string, number> = {};
    let totalBytes = 0;
    for (const name of CONFIG_FILE_NAMES) {
      if (name === 'workspaces.json' || name === 'settings.json')
        continue;
      const filePath = this.filePath(name);
      let size = 0;
      try {
        if (existsSync(filePath))
          size = statSync(filePath).size;
      } catch {
        size = 0;
      }
      byCategory[name] = size;
      totalBytes += size;
    }
    const historyEntries = Array.isArray(this.history.entries) ? this.history.entries.length : 0;
    return {
      totalBytes,
      historyEntries,
      tabCount: 0,
      byCategory,
    };
  }

  workspaceSnapshot(): WorkspaceSnapshot {
    return {
      workspaces: this.workspaces,
      environments: this.environments,
      collections: this.collections,
      databases: this.databases,
      queries: this.queries,
      history: this.history,
      cookies: this.cookies,
      flows: this.flows,
      load: this.loadFile,
      mocks: this.mocksFile,
      listeners: this.listenersFile,
      intercept: this.interceptFile,
      plantuml: this.plantumlFile,
      regressions: this.regressions,
      flowTemplates: this.flowTemplates,
      emulator: this.emulator,
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
    this.collabReposFile = parseCollabReposFile(await readJsonFile(this.collabReposPath()));
    await this.migrateLegacyCollab();
    this.dropOrphanedLinks();
    await this.ensureActiveWorkspaceFolder();
    await this.ensureTestingWorkspace();
    await this.loadActiveWorkspaceFiles();

    await Promise.all([
      this.writeSettings(),
      writeJsonFile(this.filePath('session.json'), this.session),
      this.writeWorkspaces(),
      this.writeCollabRepos(),
      this.flushActiveWorkspace(),
    ]);
  }

  reposRoot(): string {
    return path.join(this.workspacesRoot(), COLLAB_REPOS_DIR);
  }

  /** Clone of one connected repository. */
  repoDir(repoId: string): string {
    return path.join(this.reposRoot(), repoId);
  }

  collabRepos(): readonly CollabRepo[] {
    return this.collabReposFile.items;
  }

  collabRepo(repoId: string): CollabRepo | null {
    return this.collabReposFile.items.find((item) => item.id === repoId) ?? null;
  }

  collabRepoByUrl(url: string): CollabRepo | null {
    const wanted = normalizeRemote(url);
    return this.collabReposFile.items.find((item) => normalizeRemote(item.remoteUrl) === wanted) ?? null;
  }

  /** Workspaces on this PC that live in the given repository. */
  linkedWorkspaces(repoId: string): Workspace[] {
    return this.workspaces.items.filter((item) => item.kind === 'shared' && item.collab?.repoId === repoId);
  }

  newCollabRepoId(): string {
    return `repo-${randomUUID().slice(0, 12)}`;
  }

  async addCollabRepo(repo: CollabRepo): Promise<void> {
    this.collabReposFile = {
      ...this.collabReposFile,
      items: [...this.collabReposFile.items.filter((item) => item.id !== repo.id), repo],
    };
    await this.writeCollabRepos();
  }

  async patchCollabRepo(repoId: string, patch: Partial<Omit<CollabRepo, 'id'>>): Promise<CollabRepo | null> {
    const current = this.collabRepo(repoId);
    if (!current)
      return null;
    const next: CollabRepo = { ...current, ...patch };
    this.collabReposFile = {
      ...this.collabReposFile,
      items: this.collabReposFile.items.map((item) => (item.id === repoId ? next : item)),
    };
    await this.writeCollabRepos();
    return next;
  }

  /** Forgets a repository and deletes its clone. Linked workspaces must be handled first. */
  async removeCollabRepo(repoId: string): Promise<void> {
    this.collabReposFile = {
      ...this.collabReposFile,
      items: this.collabReposFile.items.filter((item) => item.id !== repoId),
    };
    await this.writeCollabRepos();
    await rm(this.repoDir(repoId), { recursive: true, force: true });
  }

  /** True once per repository reorganized on this start. */
  consumeRepoMigration(repoId: string): boolean {
    return this.migratedRepoIds.delete(repoId);
  }

  /**
   * Adds a repository workspace to this PC's switcher. Its files already sit in the clone,
   * so nothing is copied. Returns the existing entry when it is already here.
   */
  async linkWorkspace(repoId: string, entry: CollabManifestWorkspace): Promise<Workspace> {
    const existing = this.linkedWorkspaces(repoId).find((item) => item.collab?.remoteId === entry.id);
    if (existing)
      return existing;
    const item: Workspace = {
      id: nextWorkspaceId(),
      name: entry.name,
      folder: collabLinkedFolder(repoId, entry.folder),
      modifiedAt: new Date().toISOString(),
      kind: 'shared',
      collab: { repoId, remoteId: entry.id },
    };
    await mkdir(this.workspaceDir(item), { recursive: true });
    this.workspaces = {
      ...this.workspaces,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      items: [...this.workspaces.items, item],
      orderIds: [...this.workspaces.orderIds, item.id],
    };
    await this.writeWorkspaces();
    return item;
  }

  /** Moves a local workspace's folder into a repository clone and links it there. */
  async moveWorkspaceIntoRepo(
    workspaceId: string,
    repoId: string,
    folder: string,
    remoteId: string,
  ): Promise<Workspace | null> {
    const item = this.workspaces.items.find((entry) => entry.id === workspaceId);
    if (!item || item.kind === 'shared')
      return null;
    const isActive = this.workspaces.activeId === workspaceId;
    if (isActive)
      await this.flushActiveWorkspace();
    const next: Workspace = {
      ...item,
      folder: collabLinkedFolder(repoId, folder),
      modifiedAt: new Date().toISOString(),
      kind: 'shared',
      collab: { repoId, remoteId },
    };
    await moveDir(this.workspaceDir(item), this.workspaceDir(next));
    this.replaceWorkspace(next);
    await this.writeWorkspaces();
    if (isActive)
      await this.flushActiveWorkspace();
    else
      await peelWorkspaceFolder(this.workspaceDir(next));
    return next;
  }

  /**
   * Turns a repository workspace into a plain local one, copying its files out of the
   * clone first. Used when a repository is disconnected or the workspace leaves it.
   */
  async detachWorkspace(workspaceId: string): Promise<Workspace | null> {
    const item = this.workspaces.items.find((entry) => entry.id === workspaceId);
    if (!item || item.kind !== 'shared')
      return null;
    const isActive = this.workspaces.activeId === workspaceId;
    if (isActive)
      await this.flushActiveWorkspace();
    const { collab: _link, legacyCollab: _legacy, ...rest } = item;
    const next: Workspace = {
      ...rest,
      folder: nextWorkspaceFolder(this.workspaces.items.map((entry) => entry.folder)),
      modifiedAt: new Date().toISOString(),
      kind: 'local',
    };
    await copyWorkspaceOut(this.workspaceDir(item), this.workspaceDir(next));
    this.replaceWorkspace(next);
    await this.writeWorkspaces();
    if (isActive) {
      await this.loadActiveWorkspaceFiles();
      this.notifyWorkspaceFilesChanged();
    }
    return next;
  }

  /**
   * Takes a repository workspace off this PC. Its team files stay in the clone because
   * the repository still holds them; what only this PC kept is deleted.
   */
  async unlinkWorkspace(workspaceId: string): Promise<WorkspaceSnapshot> {
    const target = this.workspaces.items.find((item) => item.id === workspaceId);
    const nextCatalog = removeWorkspaceFromCatalog(this.workspaces, workspaceId);
    if (!target || !nextCatalog || target.kind !== 'shared')
      return this.workspaceSnapshot();
    await this.flushActiveWorkspace();
    const wasActive = this.workspaces.activeId === workspaceId;
    this.workspaces = nextCatalog;
    await removePcOnlyFiles(this.workspaceDir(target));
    if (wasActive) {
      await this.ensureActiveWorkspaceFolder();
      await this.loadActiveWorkspaceFiles();
    }
    await this.writeWorkspaces();
    return this.workspaceSnapshot();
  }

  /** Renames the catalog entry that points at a repository workspace. */
  async renameLinkedWorkspace(repoId: string, remoteId: string, name: string): Promise<void> {
    const item = this.linkedWorkspaces(repoId).find((entry) => entry.collab?.remoteId === remoteId);
    if (!item || item.name === name)
      return;
    this.replaceWorkspace({ ...item, name });
    await this.writeWorkspaces();
  }

  private replaceWorkspace(next: Workspace): void {
    this.workspaces = {
      ...this.workspaces,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      items: this.workspaces.items.map((entry) => (entry.id === next.id ? next : entry)),
    };
  }

  private collabReposPath(): string {
    return path.join(this.workspacesRoot(), COLLAB_REPOS_FILE_NAME);
  }

  private async writeCollabRepos(): Promise<void> {
    await writeJsonFile(this.collabReposPath(), this.collabReposFile);
  }

  /**
   * Upgrades workspaces shared before one repository could hold several: each clone moves
   * to `repos/<id>` and its files move into `workspaces/workspace/`.
   */
  private async migrateLegacyCollab(): Promise<void> {
    for (const item of this.workspaces.items) {
      const legacy = item.legacyCollab;
      if (!legacy || item.collab)
        continue;
      const { legacyCollab: _legacy, ...rest } = item;
      if (this.collabRepoByUrl(legacy.remoteUrl)) {
        // Another workspace already holds this repository; keep this one as a local copy.
        this.replaceWorkspace({ ...rest, kind: 'local' });
        continue;
      }
      const repoId = this.newCollabRepoId();
      try {
        await moveDir(this.workspaceDir(item), this.repoDir(repoId));
        await migrateLegacyRepoLayout(this.repoDir(repoId), item.name);
      } catch {
        // Files in use: leave the old layout and try again on the next start.
        continue;
      }
      this.collabReposFile = {
        ...this.collabReposFile,
        items: [...this.collabReposFile.items, { id: repoId, ...legacy }],
      };
      this.replaceWorkspace({
        ...rest,
        kind: 'shared',
        folder: collabLinkedFolder(repoId, COLLAB_LEGACY_WORKSPACE.folder),
        collab: { repoId, remoteId: COLLAB_LEGACY_WORKSPACE.id },
      });
      this.migratedRepoIds.add(repoId);
    }
  }

  /** A link whose repository is gone keeps its files but stops syncing. */
  private dropOrphanedLinks(): void {
    for (const item of this.workspaces.items) {
      if (item.kind !== 'shared' || !item.collab || this.collabRepo(item.collab.repoId))
        continue;
      const { collab: _link, ...rest } = item;
      this.replaceWorkspace({ ...rest, kind: 'local' });
    }
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
    } else if (scope === 'http') {
      this.settings = {
        ...this.settings,
        defaultHeaders: DEFAULT_USER_SETTINGS.defaultHeaders.map((row) => ({ ...row })),
        placeholderEmailDomain: DEFAULT_USER_SETTINGS.placeholderEmailDomain,
        defaultApiKeyHeader: DEFAULT_USER_SETTINGS.defaultApiKeyHeader,
      };
    } else if (scope === 'android') {
      const next = { ...this.settings };
      for (const key of ANDROID_SETTING_KEYS)
        (next as Record<string, unknown>)[key] = DEFAULT_USER_SETTINGS[key];
      this.settings = toUserSettings(parseSettingsFile(next));
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
    await this.writeSecretAware(['environments.json']);
    this.notifyWorkspaceFilesChanged();
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
    await this.writeSecretAware(['collections.json']);
    this.notifyWorkspaceFilesChanged();
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
    await this.writeSecretAware(['database.json']);
    this.notifyWorkspaceFilesChanged();
    return this.databases;
  }

  async patchQueries(partial: Partial<Omit<QueriesFile, 'schemaVersion'>>): Promise<QueriesFile> {
    this.queries = parseQueriesFile({
      ...this.queries,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('queries.json'), this.queries);
    this.notifyWorkspaceFilesChanged();
    return this.queries;
  }

  async patchHistory(partial: Partial<Omit<HistoryFile, 'schemaVersion'>>): Promise<HistoryFile> {
    this.history = parseHistoryFile({
      ...this.history,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('history.json'), this.history);
    return this.history;
  }

  async patchCookies(partial: Partial<Omit<CookiesFile, 'schemaVersion'>>): Promise<CookiesFile> {
    this.cookies = parseCookiesFile({
      ...this.cookies,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('cookies.json'), this.cookies);
    return this.cookies;
  }

  async patchFlows(partial: Partial<Omit<FlowsFile, 'schemaVersion'>>): Promise<FlowsFile> {
    this.flows = parseFlowsFile({ ...this.flows, ...partial, schemaVersion: CONFIG_SCHEMA_VERSION });
    await writeJsonFile(this.filePath('flows.json'), this.flows);
    this.notifyWorkspaceFilesChanged();
    return this.flows;
  }

  async patchLoad(partial: Partial<Omit<LoadFile, 'schemaVersion'>>): Promise<LoadFile> {
    this.loadFile = parseLoadFile({ ...this.loadFile, ...partial, schemaVersion: CONFIG_SCHEMA_VERSION });
    await writeJsonFile(this.filePath('load.json'), this.loadFile);
    this.notifyWorkspaceFilesChanged();
    return this.loadFile;
  }

  async patchMocks(partial: Partial<Omit<MocksFile, 'schemaVersion'>>): Promise<MocksFile> {
    this.mocksFile = parseMocksFile({ ...this.mocksFile, ...partial, schemaVersion: CONFIG_SCHEMA_VERSION });
    await writeJsonFile(this.filePath('mocks.json'), this.mocksFile);
    this.notifyWorkspaceFilesChanged();
    return this.mocksFile;
  }

  async patchListeners(partial: Partial<Omit<ListenersFile, 'schemaVersion'>>): Promise<ListenersFile> {
    this.listenersFile = parseListenersFile({
      ...this.listenersFile,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('listeners.json'), this.listenersFile);
    this.notifyWorkspaceFilesChanged();
    return this.listenersFile;
  }

  async patchIntercept(partial: Partial<Omit<InterceptFile, 'schemaVersion'>>): Promise<InterceptFile> {
    this.interceptFile = parseInterceptFile({
      ...this.interceptFile,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('intercept.json'), this.interceptFile);
    this.notifyWorkspaceFilesChanged();
    return this.interceptFile;
  }

  async patchPlantuml(partial: Partial<Omit<PlantumlFile, 'schemaVersion'>>): Promise<PlantumlFile> {
    this.plantumlFile = parsePlantumlFile({
      ...this.plantumlFile,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('plantuml.json'), this.plantumlFile);
    this.notifyWorkspaceFilesChanged();
    return this.plantumlFile;
  }

  private activeWorkspaceDir(): string {
    const workspace = this.activeWorkspace();
    const folder = workspace?.folder ?? DEFAULT_WORKSPACE_FOLDER;
    return path.join(this.workspacesRoot(), folder);
  }

  async patchRegressions(partial: Partial<Omit<RegressionsFile, 'schemaVersion'>>): Promise<RegressionsFile> {
    this.regressions = parseRegressionsFile({
      ...this.regressions,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('regressions.json'), this.regressions);
    this.notifyWorkspaceFilesChanged();
    return this.regressions;
  }

  async patchFlowTemplates(
    partial: Partial<Omit<FlowTemplatesFile, 'schemaVersion'>>,
  ): Promise<FlowTemplatesFile> {
    this.flowTemplates = parseFlowTemplatesFile({
      ...this.flowTemplates,
      ...partial,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    });
    await writeJsonFile(this.filePath('flow-templates.json'), this.flowTemplates);
    this.notifyWorkspaceFilesChanged();
    return this.flowTemplates;
  }

  async patchEmulator(partial: Partial<Omit<EmulatorFile, 'schemaVersion'>>): Promise<EmulatorFile> {
    this.emulator = parseEmulatorFile({ ...this.emulator, ...partial, schemaVersion: CONFIG_SCHEMA_VERSION });
    await writeJsonFile(this.filePath('emulator.json'), this.emulator);
    return this.emulator;
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
    this.history = { ...DEFAULT_HISTORY_FILE };
    this.cookies = { ...DEFAULT_COOKIES_FILE };
    this.resetServiceFiles();
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

  async reorderWorkspaces(orderIds: readonly string[]): Promise<WorkspacesFile> {
    const ordered = applyWorkspaceOrder(this.workspaces.items, orderIds);
    if (ordered.length === 0) {
      return this.workspaces;
    }
    const same =
      ordered.length === this.workspaces.items.length &&
      ordered.every((item, index) => item.id === this.workspaces.items[index]?.id);
    if (same) {
      return this.workspaces;
    }
    this.workspaces = {
      ...this.workspaces,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      items: ordered,
      orderIds: ordered.map((item) => item.id),
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
    const historyRaw = await readJsonFile(path.join(this.workspaceDir(source), 'history.json'));
    const cookiesRaw = await readJsonFile(path.join(this.workspaceDir(source), 'cookies.json'));
    const flowsRaw = await readJsonFile(path.join(this.workspaceDir(source), 'flows.json'));
    const loadRaw = await readJsonFile(path.join(this.workspaceDir(source), 'load.json'));
    const mocksRaw = await readJsonFile(path.join(this.workspaceDir(source), 'mocks.json'));
    const listenersRaw = await readJsonFile(path.join(this.workspaceDir(source), 'listeners.json'));
    const interceptRaw = await readJsonFile(path.join(this.workspaceDir(source), 'intercept.json'));
    const plantumlRaw = await readJsonFile(path.join(this.workspaceDir(source), 'plantuml.json'));
    const regressionsRaw = await readJsonFile(path.join(this.workspaceDir(source), 'regressions.json'));
    const flowTemplatesRaw = await readJsonFile(
      path.join(this.workspaceDir(source), 'flow-templates.json'),
    );
    const emulatorRaw = await readJsonFile(path.join(this.workspaceDir(source), 'emulator.json'));
    this.workspaces = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      items: [...this.workspaces.items, item],
      orderIds: [...this.workspaces.orderIds, item.id],
      activeId: item.id,
    };
    this.environments = parseEnvironmentsFile(envRaw);
    this.collections = await parseCollectionsKeepingOriginal(
      path.join(this.workspaceDir(source), 'collections.json'),
      colRaw,
    );
    this.databases = parseDatabasesFile(dbRaw);
    this.queries = parseQueriesFile(queryRaw);
    this.history = parseHistoryFile(historyRaw);
    this.cookies = parseCookiesFile(cookiesRaw);
    this.flows = parseFlowsFile(flowsRaw);
    this.loadFile = parseLoadFile(loadRaw);
    this.mocksFile = parseMocksFile(mocksRaw);
    this.listenersFile = parseListenersFile(listenersRaw);
    this.interceptFile = parseInterceptFile(interceptRaw);
    this.plantumlFile = parsePlantumlFile(plantumlRaw);
    this.regressions = parseRegressionsFile(regressionsRaw);
    this.flowTemplates = parseFlowTemplatesFile(flowTemplatesRaw);
    this.emulator = parseEmulatorFile(emulatorRaw);
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
    // The clone still needs a repository workspace's files; only this PC's link goes.
    if (target.kind === 'shared' && target.collab)
      return this.unlinkWorkspace(id);
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

  private async ensureTestingWorkspace(): Promise<void> {
    const existed = this.workspaces.items.some((item) => item.id === TESTING_WORKSPACE_ID);
    this.workspaces = withTestingWorkspace(this.workspaces);
    const item = this.workspaces.items.find((entry) => entry.id === TESTING_WORKSPACE_ID);
    if (!item)
      return;
    const dir = this.workspaceDir(item);
    await mkdir(dir, { recursive: true });
    const seedMetaPath = path.join(dir, 'seed-meta.json');
    if (existed && existsSync(seedMetaPath)) {
      const meta = (await readJsonFile(seedMetaPath)) as { version?: unknown };
      if (meta.version === TESTING_SEED_VERSION)
        return;
    }
    const files = createTestingWorkspaceFiles();
    await Promise.all([
      writeJsonFile(path.join(dir, 'collections.json'), files.collections),
      writeJsonFile(path.join(dir, 'environments.json'), files.environments),
      writeJsonFile(path.join(dir, 'cookies.json'), files.cookies),
      writeJsonFile(path.join(dir, 'database.json'), files.databases),
      writeJsonFile(path.join(dir, 'queries.json'), files.queries),
      writeJsonFile(path.join(dir, 'history.json'), files.history),
      writeJsonFile(path.join(dir, 'flows.json'), files.flows),
      writeJsonFile(path.join(dir, 'load.json'), files.load),
      writeJsonFile(path.join(dir, 'mocks.json'), files.mocks),
      writeJsonFile(path.join(dir, 'listeners.json'), files.listeners),
      writeJsonFile(path.join(dir, 'intercept.json'), files.intercept),
      writeJsonFile(path.join(dir, 'plantuml.json'), { ...DEFAULT_PLANTUML_FILE }),
      writeJsonFile(path.join(dir, 'regressions.json'), files.regressions),
      writeJsonFile(path.join(dir, 'flow-templates.json'), files.flowTemplates),
      writeJsonFile(path.join(dir, 'emulator.json'), files.emulator),
      writeJsonFile(seedMetaPath, { version: TESTING_SEED_VERSION, writtenAt: new Date().toISOString() }),
    ]);
  }

  private async loadActiveWorkspaceFiles(): Promise<void> {
    const [
      environmentsRaw,
      collectionsRaw,
      databasesRaw,
      queriesRaw,
      historyRaw,
      cookiesRaw,
      flowsRaw,
      loadRaw,
      mocksRaw,
      listenersRaw,
      interceptRaw,
      plantumlRaw,
      regressionsRaw,
      flowTemplatesRaw,
      emulatorRaw,
    ] = await Promise.all([
      readJsonFile(this.filePath('environments.json')),
      readJsonFile(this.filePath('collections.json')),
      readJsonFile(this.filePath('database.json')),
      readJsonFile(this.filePath('queries.json')),
      readJsonFile(this.filePath('history.json')),
      readJsonFile(this.filePath('cookies.json')),
      readJsonFile(this.filePath('flows.json')),
      readJsonFile(this.filePath('load.json')),
      readJsonFile(this.filePath('mocks.json')),
      readJsonFile(this.filePath('listeners.json')),
      readJsonFile(this.filePath('intercept.json')),
      readJsonFile(this.filePath('plantuml.json')),
      readJsonFile(this.filePath('regressions.json')),
      readJsonFile(this.filePath('flow-templates.json')),
      readJsonFile(this.filePath('emulator.json')),
    ]);
    this.environments = parseEnvironmentsFile(environmentsRaw);
    this.collections = await parseCollectionsKeepingOriginal(this.filePath('collections.json'), collectionsRaw);
    this.databases = parseDatabasesFile(databasesRaw);
    this.queries = parseQueriesFile(queriesRaw);
    this.history = parseHistoryFile(historyRaw);
    this.cookies = parseCookiesFile(cookiesRaw);
    this.flows = parseFlowsFile(flowsRaw);
    this.loadFile = parseLoadFile(loadRaw);
    this.mocksFile = parseMocksFile(mocksRaw);
    this.listenersFile = parseListenersFile(listenersRaw);
    this.interceptFile = parseInterceptFile(interceptRaw);
    this.plantumlFile = parsePlantumlFile(plantumlRaw);
    this.regressions = parseRegressionsFile(regressionsRaw);
    this.flowTemplates = parseFlowTemplatesFile(flowTemplatesRaw);
    this.emulator = parseEmulatorFile(emulatorRaw);
    if (this.activeWorkspace()?.kind === 'shared') {
      const secrets = await readSecretsFile(this.secretsFilePath());
      const applied = applyCollabSecrets({
        environments: this.environments,
        collections: this.collections,
        databases: this.databases,
        secrets,
      });
      this.environments = applied.environments;
      this.collections = applied.collections;
      this.databases = applied.databases;
    }
    if (this.cookies.cookies.length === 0) {
      const migrated = collectFolderCookies(this.collections.collections);
      if (migrated.length > 0)
        this.cookies = { ...DEFAULT_COOKIES_FILE, cookies: migrated };
    }
  }

  private resetServiceFiles(): void {
    this.flows = { ...DEFAULT_FLOWS_FILE };
    this.loadFile = { ...DEFAULT_LOAD_FILE };
    this.mocksFile = { ...DEFAULT_MOCKS_FILE };
    this.listenersFile = { ...DEFAULT_LISTENERS_FILE };
    this.interceptFile = { ...DEFAULT_INTERCEPT_FILE };
    this.plantumlFile = { ...DEFAULT_PLANTUML_FILE };
    this.regressions = { ...DEFAULT_REGRESSIONS_FILE };
    this.flowTemplates = { ...DEFAULT_FLOW_TEMPLATES_FILE };
    this.emulator = { ...DEFAULT_EMULATOR_FILE };
  }

  /** Persists in-memory workspace JSON files to the active workspace folder. */
  async persistActiveWorkspace(): Promise<void> {
    await this.flushActiveWorkspace();
  }

  private async flushActiveWorkspace(): Promise<void> {
    await Promise.all([
      this.writeSecretAware(SECRET_BEARING_FILES),
      writeJsonFile(this.filePath('queries.json'), this.queries),
      writeJsonFile(this.filePath('history.json'), this.history),
      writeJsonFile(this.filePath('cookies.json'), this.cookies),
      writeJsonFile(this.filePath('flows.json'), this.flows),
      writeJsonFile(this.filePath('load.json'), this.loadFile),
      writeJsonFile(this.filePath('mocks.json'), this.mocksFile),
      writeJsonFile(this.filePath('listeners.json'), this.listenersFile),
      writeJsonFile(this.filePath('intercept.json'), this.interceptFile),
      writeJsonFile(this.filePath('plantuml.json'), this.plantumlFile),
      writeJsonFile(this.filePath('regressions.json'), this.regressions),
      writeJsonFile(this.filePath('flow-templates.json'), this.flowTemplates),
      writeJsonFile(this.filePath('emulator.json'), this.emulator),
    ]);
    this.notifyWorkspaceFilesChanged();
  }

  private async writeWorkspaces(): Promise<void> {
    await writeJsonFile(this.filePath('workspaces.json'), this.workspaces);
  }

  /** Persists the workspaces catalog (used by Git link metadata). */
  async writeWorkspacesPublic(): Promise<void> {
    await this.writeWorkspaces();
  }

  async flushWorkspace(): Promise<void> {
    await this.flushActiveWorkspace();
  }

  async reloadActiveWorkspace(): Promise<void> {
    await this.loadActiveWorkspaceFiles();
    this.notifyWorkspaceFilesChanged();
  }

  secretsFilePath(): string {
    const workspace = this.activeWorkspace();
    return path.join(this.workspacesRoot(), workspace?.folder ?? DEFAULT_WORKSPACE_FOLDER, 'secrets.local.json');
  }

  /**
   * Updates the active catalog entry. Pass `collab: null` to drop share metadata.
   */
  async patchActiveWorkspace(
    patch: Partial<Pick<Workspace, 'kind' | 'name'>> & { collab?: Workspace['collab'] | null },
  ): Promise<Workspace | null> {
    const active = this.activeWorkspace();
    if (!active)
      return null;
    const { collab: collabPatch, ...rest } = patch;
    const merged: Workspace = {
      ...active,
      ...rest,
      modifiedAt: new Date().toISOString(),
    };
    const { collab: _dropped, ...withoutCollab } = merged;
    const next: Workspace =
      collabPatch === null ? withoutCollab : collabPatch ? { ...merged, collab: collabPatch } : merged;
    this.workspaces = {
      ...this.workspaces,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      items: this.workspaces.items.map((item) => (item.id === active.id ? next : item)),
    };
    await this.writeWorkspaces();
    return this.activeWorkspace();
  }

  /**
   * Writes secret-bearing files. For shared workspaces all three domains are peeled
   * together from one in-memory snapshot, and the secrets file is updated in a single
   * queued step, so parallel saves cannot drop each other's secrets.
   */
  private async writeSecretAware(names: readonly SecretBearingFile[]): Promise<void> {
    const snapshot: SecretBearingSnapshot = {
      'environments.json': this.environments,
      'collections.json': this.collections,
      'database.json': this.databases,
    };
    const targets = names.map((name) => ({ name, filePath: this.filePath(name) }));
    if (this.activeWorkspace()?.kind !== 'shared') {
      await Promise.all(targets.map(({ name, filePath }) => writeJsonFile(filePath, snapshot[name])));
      return;
    }
    let peeled: SecretBearingSnapshot | null = null;
    await updateSecretsFile(this.secretsFilePath(), (secrets) => {
      const result = peelWorkspaceSecrets({
        environments: snapshot['environments.json'],
        collections: snapshot['collections.json'],
        databases: snapshot['database.json'],
        secrets,
      });
      peeled = {
        'environments.json': result.environments,
        'collections.json': result.collections,
        'database.json': result.databases,
      };
      return result.secrets;
    });
    const team = peeled as SecretBearingSnapshot | null;
    if (!team)
      return;
    await Promise.all(targets.map(({ name, filePath }) => writeJsonFile(filePath, team[name])));
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
      case 'history.json':
        return this.history.schemaVersion;
      case 'cookies.json':
        return this.cookies.schemaVersion;
      case 'flows.json':
        return this.flows.schemaVersion;
      case 'load.json':
        return this.loadFile.schemaVersion;
      case 'mocks.json':
        return this.mocksFile.schemaVersion;
      case 'listeners.json':
        return this.listenersFile.schemaVersion;
      case 'intercept.json':
        return this.interceptFile.schemaVersion;
      case 'plantuml.json':
        return this.plantumlFile.schemaVersion;
      case 'regressions.json':
        return this.regressions.schemaVersion;
      case 'flow-templates.json':
        return this.flowTemplates.schemaVersion;
      case 'emulator.json':
        return this.emulator.schemaVersion;
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

/** Parses collections and, when nodes had to be dropped, keeps the original file beside it. */
async function parseCollectionsKeepingOriginal(filePath: string, raw: unknown): Promise<CollectionsFile> {
  let droppedCount = 0;
  const parsed = parseCollectionsFile(raw, (dropped) => {
    droppedCount = dropped.length;
  });
  if (droppedCount > 0)
    await keepCorruptCopy(filePath, `Dropped ${droppedCount} invalid collection node(s)`);
  return parsed;
}
