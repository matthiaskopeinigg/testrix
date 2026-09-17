import type { CollectionsFile } from './config-files';
import type { ConfigPaths, ConfigRevealTarget } from './config-files';
import type { DatabasesFile, QueriesFile, DatabaseConnection } from './database';
import type {
  DatabaseConnectionStatusMap,
  DatabaseIntrospectLevel,
  DatabaseIntrospectResult,
  DatabaseQueryEnvelope,
  DatabaseQueryRequest,
  DatabaseSessionQueryRequest,
  DatabaseSessionState,
} from './database-sql';
import type { EnvironmentsFile } from './environment';
import type { SessionFile } from './session';
import type { ChooseFileKind } from './network-settings';
import type { SettingsResetScope, ThemeSnapshot, UserSettings } from './settings';
import type { WorkspacesFile, WorkspaceSnapshot } from './workspace';

/**
 * Narrow preload API exposed as `window.testrix`.
 */
export interface TestrixDesktopApi {
  readonly app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
    notifyReady: () => Promise<void>;
    reload: () => Promise<void>;
  };
  readonly window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    setMovable: (movable: boolean) => Promise<void>;
    onMaximizedChanged: (listener: (isMaximized: boolean) => void) => () => void;
  };
  readonly theme: {
    get: () => Promise<ThemeSnapshot>;
    set: (preference: UserSettings['theme']) => Promise<ThemeSnapshot>;
    onChanged: (listener: (snapshot: ThemeSnapshot) => void) => () => void;
  };
  readonly settings: {
    get: () => Promise<UserSettings>;
    set: (patch: Partial<UserSettings>) => Promise<UserSettings>;
    reset: (scope: SettingsResetScope) => Promise<UserSettings>;
  };
  readonly session: {
    get: () => Promise<SessionFile>;
    set: (patch: Partial<Omit<SessionFile, 'schemaVersion'>>) => Promise<SessionFile>;
  };
  readonly environments: {
    get: () => Promise<EnvironmentsFile>;
    set: (patch: Partial<Omit<EnvironmentsFile, 'schemaVersion'>>) => Promise<EnvironmentsFile>;
  };
  readonly collections: {
    get: () => Promise<CollectionsFile>;
    set: (patch: Partial<Omit<CollectionsFile, 'schemaVersion'>>) => Promise<CollectionsFile>;
  };
  readonly databases: {
    get: () => Promise<DatabasesFile>;
    set: (patch: Partial<Omit<DatabasesFile, 'schemaVersion'>>) => Promise<DatabasesFile>;
  };
  readonly queries: {
    get: () => Promise<QueriesFile>;
    set: (patch: Partial<Omit<QueriesFile, 'schemaVersion'>>) => Promise<QueriesFile>;
  };
  readonly database: {
    test: (connection: DatabaseConnection) => Promise<{ ok: true }>;
    introspect: (payload: {
      readonly connection: DatabaseConnection;
      readonly level: DatabaseIntrospectLevel;
      readonly schema?: string;
      readonly table?: string;
    }) => Promise<DatabaseIntrospectResult>;
    query: (payload: DatabaseQueryRequest) => Promise<DatabaseQueryEnvelope>;
    explain: (payload: DatabaseQueryRequest) => Promise<DatabaseQueryEnvelope>;
    disconnect: (connectionId: string) => Promise<void>;
    statuses: () => Promise<DatabaseConnectionStatusMap>;
    sessionQuery: (payload: DatabaseSessionQueryRequest) => Promise<DatabaseQueryEnvelope>;
    sessionCommit: (tabId: string) => Promise<DatabaseSessionState>;
    sessionRollback: (tabId: string) => Promise<DatabaseSessionState>;
    sessionClose: (tabId: string) => Promise<void>;
    warmBoot: () => Promise<void>;
  };
  readonly workspaces: {
    get: () => Promise<WorkspacesFile>;
    switch: (id: string) => Promise<WorkspaceSnapshot>;
    create: (name: string) => Promise<WorkspaceSnapshot>;
    rename: (id: string, name: string) => Promise<WorkspacesFile>;
    duplicate: (id: string) => Promise<WorkspaceSnapshot>;
    delete: (id: string) => Promise<WorkspaceSnapshot>;
  };
  readonly config: {
    paths: () => Promise<ConfigPaths>;
    reveal: (target: ConfigRevealTarget) => Promise<void>;
    chooseFolder: () => Promise<ConfigPaths | null>;
    chooseLogsFolder: () => Promise<ConfigPaths | null>;
    chooseConfigsFolder: () => Promise<ConfigPaths | null>;
    chooseFile: (kind: ChooseFileKind) => Promise<string | null>;
  };
  readonly logs: {
    recent: () => Promise<readonly string[]>;
  };
}

/**
 * Narrow preload API for static boot and application error windows.
 */
export interface TestrixErrorApi {
  readonly quit: () => Promise<void>;
  readonly relaunch: () => Promise<void>;
}

declare global {
  interface Window {
    testrix?: TestrixDesktopApi;
    testrixError?: TestrixErrorApi;
  }
}

export {};
