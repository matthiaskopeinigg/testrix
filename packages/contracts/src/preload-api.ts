import type { HistoryFile } from './history';
import type { CookiesFile } from './cookies-file';
import type { CollectionsFile, ConfigPaths, ConfigRevealTarget, WorkspaceFootprintDto } from './config-files';
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
import type { FlowsFile } from './flows-file';
import type { FlowScenario } from './flow-graph';
import type { LoadFile } from './load-file';
import type { MocksFile } from './mocks-file';
import type { ListenersFile } from './listeners-file';
import type { InterceptFile } from './intercept-file';
import type { PlantumlFile } from './plantuml-file';
import type { RegressionsFile } from './regressions-file';
import type { FlowTemplatesFile } from './flow-templates-file';
import type { EmulatorFile } from './emulator-file';
import type {
  WorkspaceExportPackResult,
  WorkspaceImportApplyRequest,
  WorkspaceImportInspectResult,
} from './workspace-pack-ipc';
import type { WorkspacePackSelection } from './workspace-pack';
import type {
  FlowRunEvent,
  FlowManualPromptRequest,
  FlowManualPromptReply,
  InterceptHitEvent,
  ListenerHitEvent,
  LoadMetrics,
  MockActivityEvent,
  RegressionRunOptions,
  RegressionSuiteEvent,
  ServiceRuntimeStatus,
} from './service-runtime';
import type {
  HttpExecuteRequest,
  HttpExecuteResponse,
  OAuthClientConfig,
  OAuthDevicePollResult,
  OAuthDeviceStartResult,
  OAuthTokenResult,
} from './http-execute';
import type {
  WebsocketConnectRequest,
  WebsocketConnectResult,
  WebsocketEvent,
  WebsocketSendRequest,
  WebsocketSendResult,
} from './websocket-execute';
import type { SessionFile } from './session';
import type { ChooseFileKind } from './network-settings';
import type {
  AndroidToolchainCommandResult,
  AndroidToolchainEvent,
  AndroidToolchainStatus,
} from './android-toolchain';
import type { SettingsResetScope, ThemeSnapshot, UserSettings } from './settings';
import type { WorkspacesFile, WorkspaceSnapshot } from './workspace';
import type {
  CollabAddWorkspacesRequest,
  CollabConnectRequest,
  CollabUpdateCredentialRequest,
  CollabConnectResult,
  CollabPublishWorkspaceRequest,
  CollabRemoveFromRepoRequest,
  CollabIdentityRequest,
  CollabLockRequest,
  CollabLockResult,
  CollabMutationResult,
  CollabResolveRequest,
  CollabRunPublishRequest,
  CollabStatus,
} from './collab';
import type { UpdatePrefsPatch, UpdateStatus } from './update';

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
    setZoomFactor: (factor: number) => void;
    openWorkbench: () => Promise<void>;
    onMaximizedChanged: (listener: (isMaximized: boolean) => void) => () => void;
    onWorkspaceFilesChanged: (listener: () => void) => () => void;
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
  readonly history: {
    get: () => Promise<HistoryFile>;
    set: (patch: Partial<Omit<HistoryFile, 'schemaVersion'>>) => Promise<HistoryFile>;
  };
  readonly cookies: {
    get: () => Promise<CookiesFile>;
    set: (patch: Partial<Omit<CookiesFile, 'schemaVersion'>>) => Promise<CookiesFile>;
  };
  readonly plantuml: {
    get: () => Promise<PlantumlFile>;
    set: (patch: Partial<Omit<PlantumlFile, 'schemaVersion'>>) => Promise<PlantumlFile>;
  };
  readonly services: {
    flows: {
      get: () => Promise<FlowsFile>;
      set: (patch: Partial<Omit<FlowsFile, 'schemaVersion'>>) => Promise<FlowsFile>;
      run: (flowId: string, scenarioId?: string | null) => Promise<{ ok: boolean; error: string | null }>;
      /** Run an in-memory scenario graph (template dry-run) without a saved flow. */
      runDraft: (payload: {
        readonly scenario: FlowScenario;
        readonly e2eShowWindow?: boolean;
        readonly deviceShowEmulator?: boolean;
      }) => Promise<{ ok: boolean; error: string | null }>;
      cancel: () => Promise<void>;
      pickSelector: (payload?: {
        readonly url?: string | null;
        readonly kind?: string | null;
        readonly stopBeforeNodeId?: string | null;
        readonly scenario?: FlowScenario | null;
      }) => Promise<{
        ok: boolean;
        selector?: string;
        loadedUrl?: string;
        cancelled?: boolean;
        error?: string | null;
      }>;
      pickDeviceSelector: (payload?: {
        readonly stopBeforeNodeId?: string | null;
        readonly scenario?: FlowScenario | null;
        readonly runPrevious?: boolean;
      }) => Promise<{
        ok: boolean;
        selector?: string;
        cancelled?: boolean;
        error?: string | null;
      }>;
      replyManualPrompt: (reply: FlowManualPromptReply) => Promise<void>;
    };
    load: {
      get: () => Promise<LoadFile>;
      set: (patch: Partial<Omit<LoadFile, 'schemaVersion'>>) => Promise<LoadFile>;
      start: (loadId: string) => Promise<ServiceRuntimeStatus>;
      stop: () => Promise<ServiceRuntimeStatus>;
    };
    mocks: {
      get: () => Promise<MocksFile>;
      set: (patch: Partial<Omit<MocksFile, 'schemaVersion'>>) => Promise<MocksFile>;
      start: () => Promise<ServiceRuntimeStatus>;
      stop: () => Promise<ServiceRuntimeStatus>;
    };
    listeners: {
      get: () => Promise<ListenersFile>;
      set: (patch: Partial<Omit<ListenersFile, 'schemaVersion'>>) => Promise<ListenersFile>;
      start: (listenerId: string) => Promise<ServiceRuntimeStatus>;
      stop: () => Promise<ServiceRuntimeStatus>;
    };
    intercept: {
      get: () => Promise<InterceptFile>;
      set: (patch: Partial<Omit<InterceptFile, 'schemaVersion'>>) => Promise<InterceptFile>;
      start: (ruleId: string) => Promise<ServiceRuntimeStatus>;
      stop: () => Promise<ServiceRuntimeStatus>;
    };
    regressions: {
      get: () => Promise<RegressionsFile>;
      set: (patch: Partial<Omit<RegressionsFile, 'schemaVersion'>>) => Promise<RegressionsFile>;
      run: (
        regressionId: string,
        options?: RegressionRunOptions,
      ) => Promise<{ ok: boolean; error: string | null }>;
      cancel: () => Promise<void>;
    };
    flowTemplates: {
      get: () => Promise<FlowTemplatesFile>;
      set: (patch: Partial<Omit<FlowTemplatesFile, 'schemaVersion'>>) => Promise<FlowTemplatesFile>;
    };
    emulator: {
      get: () => Promise<EmulatorFile>;
      set: (patch: Partial<Omit<EmulatorFile, 'schemaVersion'>>) => Promise<EmulatorFile>;
    };
    device: {
      status: () => Promise<AndroidToolchainStatus>;
      activate: () => Promise<AndroidToolchainCommandResult>;
      startEmulator: (payload?: {
        readonly coldBoot?: boolean;
        readonly openHome?: boolean;
      }) => Promise<AndroidToolchainCommandResult>;
      stopEmulator: () => Promise<AndroidToolchainCommandResult>;
      uninstall: () => Promise<AndroidToolchainCommandResult>;
      chooseSdkRoot: () => Promise<AndroidToolchainStatus | null>;
      revealSdk: () => Promise<void>;
      refresh: () => Promise<AndroidToolchainStatus>;
      applySystemImage: () => Promise<AndroidToolchainCommandResult>;
    };
    onFlowEvent: (listener: (event: FlowRunEvent) => void) => () => void;
    onFlowManualPrompt: (listener: (request: FlowManualPromptRequest) => void) => () => void;
    onLoadMetrics: (listener: (metrics: LoadMetrics) => void) => () => void;
    onMocksActivity: (listener: (event: MockActivityEvent) => void) => () => void;
    onListenerHit: (listener: (event: ListenerHitEvent) => void) => () => void;
    onListenerStatus: (listener: (status: ServiceRuntimeStatus) => void) => () => void;
    onInterceptHit: (listener: (event: InterceptHitEvent) => void) => () => void;
    onInterceptStatus: (listener: (status: ServiceRuntimeStatus) => void) => () => void;
    onRegressionEvent: (listener: (event: RegressionSuiteEvent) => void) => () => void;
    onDeviceEvent: (listener: (event: AndroidToolchainEvent) => void) => () => void;
  };
  readonly http: {
    execute: (payload: HttpExecuteRequest) => Promise<HttpExecuteResponse>;
    abort: (abortId: string) => Promise<void>;
    openUrl: (url: string) => Promise<void>;
  };
  readonly websocket: {
    connect: (payload: WebsocketConnectRequest) => Promise<WebsocketConnectResult>;
    disconnect: (connectionId: string) => Promise<void>;
    send: (payload: WebsocketSendRequest) => Promise<WebsocketSendResult>;
    onEvent: (listener: (event: WebsocketEvent) => void) => () => void;
  };
  readonly oauth: {
    authorize: (config: OAuthClientConfig) => Promise<OAuthTokenResult>;
    token: (config: OAuthClientConfig) => Promise<OAuthTokenResult>;
    refresh: (config: OAuthClientConfig) => Promise<OAuthTokenResult>;
    deviceStart: (config: OAuthClientConfig) => Promise<OAuthDeviceStartResult>;
    devicePoll: (sessionId: string) => Promise<OAuthDevicePollResult>;
    deviceCancel: (sessionId: string) => Promise<void>;
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
    disconnect: (connectionId: string) => Promise<void>;
    statuses: () => Promise<DatabaseConnectionStatusMap>;
    sessionQuery: (payload: DatabaseSessionQueryRequest) => Promise<DatabaseQueryEnvelope>;
    sessionCommit: (tabId: string) => Promise<DatabaseSessionState>;
    sessionRollback: (tabId: string) => Promise<DatabaseSessionState>;
    warmBoot: () => Promise<void>;
  };
  readonly workspaces: {
    get: () => Promise<WorkspacesFile>;
    switch: (id: string) => Promise<WorkspaceSnapshot>;
    create: (name: string) => Promise<WorkspaceSnapshot>;
    rename: (id: string, name: string) => Promise<WorkspacesFile>;
    reorder: (orderIds: readonly string[]) => Promise<WorkspacesFile>;
    duplicate: (id: string) => Promise<WorkspaceSnapshot>;
    delete: (id: string) => Promise<WorkspaceSnapshot>;
  };
  readonly workspace: {
    exportPack: (selection: WorkspacePackSelection) => Promise<WorkspaceExportPackResult>;
    pickImportSource: () => Promise<string | null>;
    importInspect: (path: string) => Promise<WorkspaceImportInspectResult>;
    /** Inspect a dropped file when the OS path is unavailable (contextBridge File clone). */
    importInspectBytes: (fileName: string, bytes: Uint8Array) => Promise<WorkspaceImportInspectResult>;
    importApply: (request: WorkspaceImportApplyRequest) => Promise<WorkspaceSnapshot>;
    /** Resolves a dropped File to an absolute path (Electron only). */
    pathForFile: (file: File) => string | null;
  };
  readonly config: {
    paths: () => Promise<ConfigPaths>;
    workspaceFootprint: () => Promise<WorkspaceFootprintDto>;
    reveal: (target: ConfigRevealTarget) => Promise<void>;
    chooseFolder: () => Promise<ConfigPaths | null>;
    chooseLogsFolder: () => Promise<ConfigPaths | null>;
    chooseConfigsFolder: () => Promise<ConfigPaths | null>;
    chooseFile: (kind: ChooseFileKind) => Promise<string | null>;
  };
  readonly logs: {
    recent: () => Promise<readonly string[]>;
  };
  readonly collab: {
    getStatus: () => Promise<CollabStatus>;
    onStatus: (listener: (status: CollabStatus) => void) => () => void;
    /** Connects a repository and returns the workspaces it holds; nothing is added yet. */
    connectRepo: (request: CollabConnectRequest) => Promise<CollabConnectResult>;
    disconnectRepo: (repoId: string) => Promise<CollabMutationResult<WorkspaceSnapshot>>;
    addWorkspaces: (request: CollabAddWorkspacesRequest) => Promise<CollabMutationResult<WorkspaceSnapshot>>;
    publishWorkspace: (request: CollabPublishWorkspaceRequest) => Promise<CollabMutationResult<WorkspaceSnapshot>>;
    removeFromPc: (workspaceId: string) => Promise<CollabMutationResult<WorkspaceSnapshot>>;
    removeFromRepo: (request: CollabRemoveFromRepoRequest) => Promise<CollabMutationResult<WorkspaceSnapshot>>;
    /** Repository-scoped calls default to the active workspace's repository. */
    pause: (repoId?: string) => Promise<CollabStatus>;
    resume: (repoId?: string) => Promise<CollabStatus>;
    syncNow: (repoId?: string) => Promise<CollabStatus>;
    resolve: (request: CollabResolveRequest) => Promise<CollabMutationResult<WorkspaceSnapshot>>;
    setIdentity: (request: CollabIdentityRequest) => Promise<CollabStatus>;
    forgetCredential: (repoId?: string) => Promise<CollabStatus>;
    updateCredential: (request: CollabUpdateCredentialRequest) => Promise<CollabStatus>;
    setPresenceMode: (mode: 'active' | 'offline') => Promise<CollabStatus>;
    setShareRuns: (enabled: boolean) => Promise<CollabStatus>;
    setBranch: (branch: string, repoId?: string) => Promise<CollabStatus>;
    setWatching: (watching: boolean) => Promise<CollabStatus>;
    acquireLock: (request: CollabLockRequest) => Promise<CollabLockResult>;
    renewLock: (packId: string, completed: number, total: number) => Promise<void>;
    releaseLock: (packId: string) => Promise<CollabStatus>;
    takeOverLock: (request: CollabLockRequest) => Promise<CollabLockResult>;
    publishRun: (request: CollabRunPublishRequest) => Promise<CollabStatus>;
  };
  readonly update: {
    getStatus: () => Promise<UpdateStatus>;
    onStatus: (listener: (status: UpdateStatus) => void) => () => void;
    check: () => Promise<UpdateStatus>;
    download: () => Promise<UpdateStatus>;
    /** Quits and hands over to Setup; false when no verified download is ready. */
    install: () => Promise<boolean>;
    setPrefs: (patch: UpdatePrefsPatch) => Promise<UpdateStatus>;
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
