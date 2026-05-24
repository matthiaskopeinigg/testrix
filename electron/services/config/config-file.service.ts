import { app, type App } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  CAPTURE_FILE_NAME,
  COLLECTIONS_FILE_NAME,
  ENVIRONMENTS_FILE_NAME,
  HISTORY_FILE_NAME,
  INTERCEPTOR_FILE_NAME,
  LOAD_TESTS_FILE_NAME,
  MOCK_SERVER_FILE_NAME,
  REGRESSIONS_FILE_NAME,
  SESSION_FILE_NAME,
  SETTINGS_FILE_NAME,
  TEST_SUITES_FILE_NAME,
  createDefaultCollections,
  createDefaultEnvironments,
  createDefaultHistory,
  createDefaultSession,
  createDefaultSettings,
  deepMerge,
  migrateCollections,
  migrateEnvironments,
  migrateSession,
  migrateSettings,
  collectionsFileSchema,
  environmentsFileSchema,
  historyFileSchema,
  sessionFileSchema,
  sessionPatchSchema,
  settingsFileSchema,
  settingsPatchSchema,
  type CollectionsFile,
  type EnvironmentsFile,
  type HistoryFile,
  type SessionFile,
  type SessionPatch,
  type SettingsFile,
  type SettingsPatch,
} from '../../../shared/config';
import {
  captureFileSchema,
  createDefaultCaptureFile,
  migrateCaptureFile,
  createDefaultInterceptorFile,
  migrateInterceptorFile,
  createDefaultLoadTestsFile,
  createDefaultMockServerFile,
  createDefaultRegressionsFile,
  createDefaultTestSuitesFile,
  migrateMockServerFile,
  migrateRegressionsFile,
  interceptorFileSchema,
  loadTestsFileSchema,
  mockServerFileSchema,
  regressionsFileSchema,
  testSuitesFileSchema,
  type CaptureFile,
  type InterceptorFile,
  type LoadTestsFile,
  type MockServerFile,
  type RegressionsFile,
  type TestSuitesFile,
} from '../../../shared/testing';

import { ErrorCodes, TestrixError } from '../../../shared/errors';

import { notifyTeamConfigFileSaved, TEAM_SYNC_FILE_NAMES } from '../collaboration/team-file-notify';
import { getMainSettings, setMainSettings } from '../settings-runtime';

const ATOMIC_WRITE_MAX_ATTEMPTS = process.platform === 'win32' ? 8 : 3;
const ATOMIC_WRITE_RETRY_BASE_MS = 25;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetriableWriteError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY' || code === 'ENOENT';
}

export class ConfigFileService {
  /** Serializes read-modify-write per file path to avoid concurrent rename races. */
  private readonly fileWriteChains = new Map<string, Promise<void>>();

  constructor(
    private readonly getPath: App['getPath'],
    private readonly getSharedConfigDir: () => string,
    private readonly getActiveProfileDir: () => string,
  ) {}

  private settingsPath(): string {
    return path.join(this.getSharedConfigDir(), SETTINGS_FILE_NAME);
  }

  private sessionPath(): string {
    return path.join(this.getActiveProfileDir(), SESSION_FILE_NAME);
  }

  private collectionsPath(): string {
    return path.join(this.getActiveProfileDir(), COLLECTIONS_FILE_NAME);
  }

  private environmentsPath(): string {
    return path.join(this.getActiveProfileDir(), ENVIRONMENTS_FILE_NAME);
  }

  private historyPath(): string {
    return path.join(this.getActiveProfileDir(), HISTORY_FILE_NAME);
  }

  private testSuitesPath(): string {
    return path.join(this.getActiveProfileDir(), TEST_SUITES_FILE_NAME);
  }

  private loadTestsPath(): string {
    return path.join(this.getActiveProfileDir(), LOAD_TESTS_FILE_NAME);
  }

  private regressionsPath(): string {
    return path.join(this.getActiveProfileDir(), REGRESSIONS_FILE_NAME);
  }

  private mockServerPath(): string {
    return path.join(this.getActiveProfileDir(), MOCK_SERVER_FILE_NAME);
  }

  private capturePath(): string {
    return path.join(this.getActiveProfileDir(), CAPTURE_FILE_NAME);
  }

  private interceptorPath(): string {
    return path.join(this.getActiveProfileDir(), INTERCEPTOR_FILE_NAME);
  }

  /** Ensures default workspace files exist in a profile directory (no-op if present). */
  async ensureProfileWorkspaceDefaults(profileDir: string): Promise<void> {
    await fs.mkdir(profileDir, { recursive: true });
    const probes: { filePath: string; create: () => unknown }[] = [
      { filePath: path.join(profileDir, COLLECTIONS_FILE_NAME), create: createDefaultCollections },
      { filePath: path.join(profileDir, ENVIRONMENTS_FILE_NAME), create: createDefaultEnvironments },
      { filePath: path.join(profileDir, SESSION_FILE_NAME), create: createDefaultSession },
      { filePath: path.join(profileDir, HISTORY_FILE_NAME), create: createDefaultHistory },
      { filePath: path.join(profileDir, TEST_SUITES_FILE_NAME), create: createDefaultTestSuitesFile },
      { filePath: path.join(profileDir, LOAD_TESTS_FILE_NAME), create: createDefaultLoadTestsFile },
      { filePath: path.join(profileDir, REGRESSIONS_FILE_NAME), create: createDefaultRegressionsFile },
      { filePath: path.join(profileDir, MOCK_SERVER_FILE_NAME), create: createDefaultMockServerFile },
      { filePath: path.join(profileDir, CAPTURE_FILE_NAME), create: createDefaultCaptureFile },
      { filePath: path.join(profileDir, INTERCEPTOR_FILE_NAME), create: createDefaultInterceptorFile },
    ];
    for (const { filePath, create } of probes) {
      try {
        await fs.access(filePath);
      } catch {
        await this.atomicWriteJson(filePath, create());
      }
    }
  }

  async readSettings(): Promise<SettingsFile> {
    const settings = await this.readValidated(
      this.settingsPath(),
      () => createDefaultSettings(),
      (j: unknown) => settingsFileSchema.parse(j),
      migrateSettings,
      'settings',
    );
    setMainSettings(settings);
    return settings;
  }

  async writeSettings(data: SettingsFile): Promise<void> {
    const filePath = this.settingsPath();
    await this.runSerialized(filePath, async () => {
      await this.atomicWriteJson(filePath, data);
    });
  }

  async mergeSettingsPatch(patch: SettingsPatch): Promise<SettingsFile> {
    const filePath = this.settingsPath();
    return this.runSerialized(filePath, async () => {
      const cur = await this.readSettings();
      settingsPatchSchema.parse(patch);
      const merged = deepMerge(
        cur as unknown as Record<string, unknown>,
        patch as unknown as Record<string, unknown>,
      );
      const updated = settingsFileSchema.parse({
        ...merged,
        meta: {
          ...cur.meta,
          updatedAt: new Date().toISOString(),
        },
      });
      await this.atomicWriteJson(filePath, updated);
      setMainSettings(updated);
      return updated;
    });
  }

  async readSession(): Promise<SessionFile> {
    return this.readValidated(
      this.sessionPath(),
      () => createDefaultSession(),
      (j: unknown) => sessionFileSchema.parse(j),
      (d) => d,
      'session',
    );
  }

  async writeSession(data: SessionFile): Promise<void> {
    const filePath = this.sessionPath();
    await this.runSerialized(filePath, async () => {
      await this.atomicWriteJson(filePath, data);
    });
  }

  async mergeSessionPatch(patch: SessionPatch): Promise<SessionFile> {
    const filePath = this.sessionPath();
    return this.runSerialized(filePath, async () => {
      const cur = await this.readSession();
      sessionPatchSchema.parse(patch);
      const merged = deepMerge(
        cur as unknown as Record<string, unknown>,
        patch as unknown as Record<string, unknown>,
      );
      const updated = sessionFileSchema.parse({
        ...merged,
        meta: {
          ...cur.meta,
          ...patch.meta,
          updatedAt: new Date().toISOString(),
        },
      });
      await this.atomicWriteJson(filePath, updated);
      return updated;
    });
  }

  async mergeWindowIntoSession(partialWindow: SessionFile['window']): Promise<SessionFile> {
    return this.mergeSessionPatch({
      window: partialWindow,
    });
  }

  async readCollections(): Promise<CollectionsFile> {
    return this.readValidated(
      this.collectionsPath(),
      () => createDefaultCollections(),
      (j: unknown) => collectionsFileSchema.parse(j),
      (d) => d,
      'collections',
    );
  }

  async writeCollections(data: CollectionsFile): Promise<void> {
    await this.atomicWriteJson(this.collectionsPath(), data);
  }

  async saveCollections(data: CollectionsFile): Promise<CollectionsFile> {
    const updated = collectionsFileSchema.parse({
      ...data,
      meta: {
        ...data.meta,
        updatedAt: new Date().toISOString(),
      },
    });
    await this.writeCollections(updated);
    notifyTeamConfigFileSaved(this.getActiveProfileDir(), TEAM_SYNC_FILE_NAMES.collections);
    return updated;
  }

  async readEnvironments(): Promise<EnvironmentsFile> {
    return this.readValidated(
      this.environmentsPath(),
      () => createDefaultEnvironments(),
      (j: unknown) => environmentsFileSchema.parse(j),
      (d) => d,
      'environments',
    );
  }

  async writeEnvironments(data: EnvironmentsFile): Promise<void> {
    await this.atomicWriteJson(this.environmentsPath(), data);
  }

  async saveEnvironments(data: EnvironmentsFile): Promise<EnvironmentsFile> {
    const updated = environmentsFileSchema.parse({
      ...data,
      meta: {
        ...data.meta,
        updatedAt: new Date().toISOString(),
      },
    });
    await this.writeEnvironments(updated);
    notifyTeamConfigFileSaved(this.getActiveProfileDir(), TEAM_SYNC_FILE_NAMES.environments);
    return updated;
  }

  async readHistory(): Promise<HistoryFile> {
    return this.readValidated(
      this.historyPath(),
      () => createDefaultHistory(),
      (j: unknown) => historyFileSchema.parse(j),
      (d) => d,
      'history',
    );
  }

  async writeHistory(data: HistoryFile): Promise<void> {
    await this.atomicWriteJson(this.historyPath(), data);
  }

  async saveHistory(data: HistoryFile): Promise<HistoryFile> {
    const updated = historyFileSchema.parse({
      ...data,
      meta: {
        ...data.meta,
        updatedAt: new Date().toISOString(),
      },
    });
    await this.writeHistory(updated);
    return updated;
  }

  async readTestSuites(): Promise<TestSuitesFile> {
    return this.readJsonFile(this.testSuitesPath(), createDefaultTestSuitesFile, testSuitesFileSchema);
  }

  async saveTestSuites(data: TestSuitesFile): Promise<TestSuitesFile> {
    const updated = testSuitesFileSchema.parse(data);
    await this.atomicWriteJson(this.testSuitesPath(), updated);
    notifyTeamConfigFileSaved(this.getActiveProfileDir(), TEAM_SYNC_FILE_NAMES.testSuites);
    return updated;
  }

  async readLoadTests(): Promise<LoadTestsFile> {
    return this.readJsonFile(this.loadTestsPath(), createDefaultLoadTestsFile, loadTestsFileSchema);
  }

  async saveLoadTests(data: LoadTestsFile): Promise<LoadTestsFile> {
    const updated = loadTestsFileSchema.parse(data);
    await this.atomicWriteJson(this.loadTestsPath(), updated);
    notifyTeamConfigFileSaved(this.getActiveProfileDir(), TEAM_SYNC_FILE_NAMES.loadTests);
    return updated;
  }

  async readRegressions(): Promise<RegressionsFile> {
    const filePath = this.regressionsPath();
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return migrateRegressionsFile(JSON.parse(raw));
    } catch {
      return createDefaultRegressionsFile();
    }
  }

  async saveRegressions(data: RegressionsFile): Promise<RegressionsFile> {
    const updated = regressionsFileSchema.parse(data);
    await this.atomicWriteJson(this.regressionsPath(), updated);
    notifyTeamConfigFileSaved(this.getActiveProfileDir(), TEAM_SYNC_FILE_NAMES.regressions);
    return updated;
  }

  async readMockServer(): Promise<MockServerFile> {
    const path = this.mockServerPath();
    try {
      const raw = await fs.readFile(path, 'utf8');
      return migrateMockServerFile(JSON.parse(raw));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return createDefaultMockServerFile();
      }
      throw err;
    }
  }

  async saveMockServer(data: MockServerFile): Promise<MockServerFile> {
    const updated = mockServerFileSchema.parse(data);
    await this.atomicWriteJson(this.mockServerPath(), updated);
    notifyTeamConfigFileSaved(this.getActiveProfileDir(), TEAM_SYNC_FILE_NAMES.mockServer);
    return updated;
  }

  async readCapture(): Promise<CaptureFile> {
    try {
      const raw = await fs.readFile(this.capturePath(), 'utf8');
      return migrateCaptureFile(JSON.parse(raw) as unknown);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return createDefaultCaptureFile();
      }
      throw err;
    }
  }

  async saveCapture(data: CaptureFile): Promise<CaptureFile> {
    const updated = captureFileSchema.parse(data);
    await this.atomicWriteJson(this.capturePath(), updated);
    return updated;
  }

  async readInterceptor(): Promise<InterceptorFile> {
    try {
      const raw = await fs.readFile(this.interceptorPath(), 'utf8');
      return migrateInterceptorFile(JSON.parse(raw) as unknown);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        const created = createDefaultInterceptorFile();
        await this.saveInterceptor(created);
        return created;
      }
      throw e;
    }
  }

  async saveInterceptor(data: InterceptorFile): Promise<InterceptorFile> {
    const updated = interceptorFileSchema.parse(data);
    await this.atomicWriteJson(this.interceptorPath(), updated);
    return updated;
  }

  private async readJsonFile<T>(
    filePath: string,
    createDefault: () => T,
    schema: { parse: (data: unknown) => T },
  ): Promise<T> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return schema.parse(JSON.parse(raw));
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        const fresh = createDefault();
        await this.atomicWriteJson(filePath, fresh);
        return fresh;
      }
      throw e;
    }
  }

  private async readValidated<T>(
    filePath: string,
    createDefault: () => T,
    validate: (data: unknown) => T,
    migrate: (data: T) => T,
    label: string,
  ): Promise<T> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const json: unknown = JSON.parse(raw);
      if (label === 'settings') {
        return migrateSettings(json, { appVersion: app.getVersion() }) as T;
      }
      if (label === 'collections') {
        return migrateCollections(json) as T;
      }
      if (label === 'environments') {
        return migrateEnvironments(json) as T;
      }
      if (label === 'session') {
        return migrateSession(json) as T;
      }
      let data = validate(json);
      data = migrate(data);
      return data;
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        const fresh = createDefault();
        await this.atomicWriteJson(filePath, fresh);
        return fresh;
      }
      await this.backupCorrupt(filePath);
      const fresh = createDefault();
      await this.atomicWriteJson(filePath, fresh);
      throw new TestrixError(
        ErrorCodes.CONFIG_VALIDATION_FAILED,
        `${label} config was reset due to invalid content.`,
        { cause: e },
      );
    }
  }

  private async backupCorrupt(src: string): Promise<void> {
    try {
      await fs.rename(src, `${src}.bak`);
    } catch {
      /* ignore */
    }
  }

  private async runSerialized<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.fileWriteChains.get(filePath) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    this.fileWriteChains.set(
      filePath,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    const { backupBeforeWrite, prettyPrintJson } = getMainSettings().dataConfig;
    const body = prettyPrintJson
      ? `${JSON.stringify(data, null, 2)}\n`
      : `${JSON.stringify(data)}\n`;

    for (let attempt = 0; attempt < ATOMIC_WRITE_MAX_ATTEMPTS; attempt++) {
      const tmp = `${filePath}.tmp`;
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        if (backupBeforeWrite) {
          try {
            await fs.access(filePath);
            await fs.copyFile(filePath, `${filePath}.bak`);
          } catch {
            /* no prior file */
          }
        }

        await fs.writeFile(tmp, body, { encoding: 'utf8', flag: 'w' });
        await this.commitAtomicReplace(tmp, filePath);
        return;
      } catch (error: unknown) {
        try {
          await fs.unlink(tmp);
        } catch {
          /* ignore */
        }
        if (!isRetriableWriteError(error) || attempt >= ATOMIC_WRITE_MAX_ATTEMPTS - 1) {
          throw error;
        }
        await delay(ATOMIC_WRITE_RETRY_BASE_MS * (attempt + 1));
      }
    }
  }

  private async commitAtomicReplace(tmp: string, filePath: string): Promise<void> {
    if (process.platform === 'win32') {
      try {
        await fs.unlink(filePath);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    try {
      await fs.rename(tmp, filePath);
      return;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (process.platform !== 'win32' || code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.copyFile(tmp, filePath);
    await fs.unlink(tmp);
  }
}
