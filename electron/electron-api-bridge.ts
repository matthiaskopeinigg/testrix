import type {
  CollectionsFile,
  DatabaseConnection,
  EnvironmentsFile,
  HistoryFile,
  PathsAnchor,
  ProfilesState,
  SessionFile,
  SettingsFile,
} from '../shared/config';
import type { IpcErrorPayload } from '../shared/errors';
import type { UpdateChannel, UpdaterStatus } from '../shared/updater/updater-status.schema';
import type { OutgoingHttpResponse } from '../shared/http/outgoing-request.schema';
import type { SendHttpRequestPayload } from '../shared/http/outgoing-request.schema';
import type { StoredCookie } from '../shared/http/stored-cookie.schema';
import type {
  CaptureFile,
  InterceptorFile,
  LoadTestRunMetrics,
  LoadTestStartOptions,
  LoadTestsFile,
  MockServerFile,
  RegressionsFile,
  TestSuitesFile,
} from '../shared/testing';

export interface ConfigFilePaths {
  readonly configDir: string;
  readonly sharedConfigDir: string;
  readonly settingsPath: string;
  readonly sessionPath: string;
  readonly collectionsPath: string;
  readonly environmentsPath: string;
  readonly historyPath: string;
  readonly pathsAnchorPath: string;
  readonly profilesManifestPath: string;
  readonly profilesRoot: string;
}

export interface LogPaths {
  readonly logDir: string;
  readonly mainLogFile: string;
}

/** Contract exposed via preload (`contextBridge.exposeInMainWorld`). */

export interface ElectronAPI {
  readonly platform: NodeJS.Platform;
  /** `true` when started with `npm run dev` (`TESTRIX_DEV=1`). Absent/false for `npm start` and production. */
  readonly devToolkit: boolean;
  /** `true` when the main window uses an opaque fill (macOS dev server only). Win32 dev uses a transparent shell. */
  readonly opaqueDevWindow: boolean;
  /** Saved theme id from disk — applied in `index.html` before Angular paints. */
  readonly bootTheme?: string;
  readonly bootThemeMode?: 'light' | 'dark';
  readonly bootThemeBg?: string;
  /** Reserved; frameless custom titlebar is used on all platforms. */
  readonly nativeDevFrame: boolean;
  readonly versions: {
    readonly app: string;
    readonly electron: string;
    readonly chrome: string;
  };
  notifyReady: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  shell: {
    pickFile: (options?: {
      readonly filters?: readonly { readonly name: string; readonly extensions: readonly string[] }[];
    }) => Promise<{ readonly filePath: string; readonly fileName: string } | null>;
  };
  config: {
    getConfigDir: () => Promise<string>;
    setConfigDir: (dir: string) => Promise<void>;
    getSettings: () => Promise<SettingsFile>;
    setSettings: (patch: unknown) => Promise<SettingsFile>;
    getSession: () => Promise<SessionFile>;
    setSession: (patch: unknown) => Promise<SessionFile>;
    getFilePaths: () => Promise<ConfigFilePaths>;
    openConfigDir: () => Promise<void>;
    pickDirectory: () => Promise<string | null>;
    exportSettings: () => Promise<string>;
    importSettings: (json: string) => Promise<SettingsFile>;
    resetSettings: () => Promise<SettingsFile>;
    resetSession: () => Promise<SessionFile>;
    getCollections: () => Promise<CollectionsFile>;
    setCollections: (data: CollectionsFile) => Promise<CollectionsFile>;
    getEnvironments: () => Promise<EnvironmentsFile>;
    setEnvironments: (data: EnvironmentsFile) => Promise<EnvironmentsFile>;
    getHistory: () => Promise<HistoryFile>;
    setHistory: (data: HistoryFile) => Promise<HistoryFile>;
    onHistoryUpdated: (listener: (payload: unknown) => void) => () => void;
    getProfiles: () => Promise<ProfilesState>;
    setActiveProfile: (profileId: string) => Promise<ProfilesState>;
    createProfile: (name: string) => Promise<ProfilesState>;
    renameProfile: (payload: { readonly id: string; readonly name: string }) => Promise<ProfilesState>;
    deleteProfile: (profileId: string) => Promise<ProfilesState>;
  };
  logging: {
    getPaths: () => Promise<LogPaths>;
    tail: (options?: { maxLines?: number }) => Promise<string>;
    clear: () => Promise<void>;
    openLogDir: () => Promise<void>;
  };
  windowControls: {
    minimize: () => Promise<void>;
    maximizeToggle: () => Promise<void>;
    close: () => Promise<void>;
    focus: () => Promise<void>;
    getChromeState: () => Promise<{ readonly edgeToEdge: boolean }>;
    onChromeStateChange: (listener: (state: { readonly edgeToEdge: boolean }) => void) => () => void;
    dragStart: (offset: { readonly offsetX: number; readonly offsetY: number }) => void;
    dragMove: (position: { readonly screenX: number; readonly screenY: number }) => void;
    dragEnd: () => void;
  };
  updater: {
    getStatus: () => Promise<UpdaterStatus>;
    check: () => Promise<UpdaterStatus>;
    download: () => Promise<UpdaterStatus>;
    install: () => Promise<void>;
    setChannel: (channel: UpdateChannel) => Promise<void>;
    onStatus: (listener: (status: UpdaterStatus) => void) => () => void;
  };
  http: {
    send: (payload: SendHttpRequestPayload) => Promise<OutgoingHttpResponse>;
    cancel: (requestId: string) => Promise<void>;
  };
  database: {
    query: (payload: {
      readonly connection: DatabaseConnection;
      readonly query: string;
      readonly timeoutMs?: number;
    }) => Promise<unknown>;
    testConnection: (connection: DatabaseConnection) => Promise<unknown>;
  };
  cookies: {
    getAll: () => Promise<readonly StoredCookie[]>;
    delete: (cookie: { readonly domain: string; readonly path: string; readonly key: string }) => Promise<void>;
    clearAll: () => Promise<void>;
  };
  testing: {
    getTestSuites: () => Promise<TestSuitesFile>;
    setTestSuites: (data: TestSuitesFile) => Promise<TestSuitesFile>;
    getLoadTests: () => Promise<LoadTestsFile>;
    setLoadTests: (data: LoadTestsFile) => Promise<LoadTestsFile>;
    getRegressions: () => Promise<RegressionsFile>;
    setRegressions: (data: RegressionsFile) => Promise<RegressionsFile>;
    getMockServer: () => Promise<MockServerFile>;
    setMockServer: (data: MockServerFile) => Promise<MockServerFile>;
    getCapture: () => Promise<CaptureFile>;
    setCapture: (data: CaptureFile) => Promise<CaptureFile>;
    getInterceptor: () => Promise<InterceptorFile>;
    setInterceptor: (data: InterceptorFile) => Promise<InterceptorFile>;
    mockStatus: () => Promise<import('@shared/testing').MockServerRuntimeStatus>;
    mockStart: () => Promise<import('@shared/testing').MockServerRuntimeStatus>;
    mockStop: () => Promise<import('@shared/testing').MockServerRuntimeStatus>;
    mockListMismatches: () => Promise<readonly import('@shared/testing').MockServerMismatchRecord[]>;
    mockClearMismatches: () => Promise<void>;
    onMockActivity: (listener: (payload: unknown) => void) => () => void;
    captureStatus: () => Promise<import('@shared/testing').CaptureRuntimeStatus>;
    captureStart: (
      options: import('@shared/testing').CaptureStartOptions,
    ) => Promise<import('@shared/testing').CaptureRuntimeStatus>;
    captureStop: () => Promise<import('@shared/testing').CaptureRuntimeStatus>;
    captureListEntries: (
      captureItemId?: string,
    ) => Promise<readonly import('@shared/testing').CaptureLogEntry[]>;
    captureClearEntries: (captureItemId?: string) => Promise<void>;
    onCaptureEntry: (listener: (entry: import('@shared/testing').CaptureLogEntry) => void) => () => void;
    onCaptureStatus: (
      listener: (status: import('@shared/testing').CaptureRuntimeStatus) => void,
    ) => () => void;
    interceptorStatus: () => Promise<import('@shared/testing').InterceptorRuntimeStatus>;
    interceptorStart: (
      options?: import('@shared/testing').InterceptorStartOptions,
    ) => Promise<import('@shared/testing').InterceptorRuntimeStatus>;
    interceptorStop: () => Promise<import('@shared/testing').InterceptorRuntimeStatus>;
    interceptorListHits: () => Promise<readonly import('@shared/testing').InterceptorHit[]>;
    interceptorClearHits: () => Promise<void>;
    onInterceptorHit: (listener: (hit: import('@shared/testing').InterceptorHit) => void) => () => void;
    onInterceptorStatus: (
      listener: (status: import('@shared/testing').InterceptorRuntimeStatus) => void,
    ) => () => void;
    loadTestStatus: () => Promise<{ readonly running: boolean }>;
    loadTestMetrics: () => Promise<LoadTestRunMetrics>;
    loadTestStart: (options?: LoadTestStartOptions) => Promise<LoadTestRunMetrics>;
    loadTestCancel: () => Promise<LoadTestRunMetrics>;
    regressionStatus: () => Promise<import('@shared/testing').RegressionRunMetrics>;
    regressionStart: (
      options?: import('@shared/testing').RegressionStartOptions,
    ) => Promise<{ readonly metrics: import('@shared/testing').RegressionRunMetrics; readonly run: import('@shared/testing').RegressionRun }>;
    regressionCancel: () => Promise<import('@shared/testing').RegressionRunMetrics>;
    onRegressionMetrics: (
      listener: (metrics: import('@shared/testing').RegressionRunMetrics) => void,
    ) => () => void;
    onRegressionRunProgress: (listener: (event: unknown) => void) => () => void;
    e2eExecuteFlow: (flowId: string) => Promise<{
      readonly ok: boolean;
      readonly message: string;
      readonly stepStatuses: Readonly<Record<string, string>>;
      readonly stepCaptures?: Readonly<Record<string, import('@shared/testing').FlowStepRunCapture>>;
      readonly stepDurations?: Readonly<Record<string, number>>;
      readonly stepErrors?: Readonly<Record<string, string>>;
      readonly durationMs?: number;
    }>;
    e2eCancel: () => Promise<void>;
    onFlowRunProgress: (
      listener: (event: import('@shared/testing').FlowRunProgressEvent) => void,
    ) => () => void;
    e2eExecute: (payload: import('@shared/testing').E2eExecutePayload) => Promise<import('@shared/testing').E2eExecuteResult>;
    e2eSignalCancel: () => void;
    clearE2eRunnerSession: () => Promise<{ readonly ok: boolean }>;
    e2ePickElement: (
      payload: import('@shared/testing').E2ePickElementPayload,
    ) => Promise<import('@shared/testing').E2ePickElementResult>;
  };
}

export type { IpcErrorPayload, SessionFile, SettingsFile, PathsAnchor };
