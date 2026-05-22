/**
 * Mirrors `electron/electron-api-bridge.ts` for the Angular compilation graph.
 */

import type {
  CollectionsFile,
  EnvironmentsFile,
  HistoryFile,
  PathsAnchor,
  ProfilesState,
  SessionFile,
  SettingsFile,
} from '@shared/config';

import type { IpcErrorPayload } from '@shared/errors';
import type { UpdateChannel, UpdaterStatus } from '@shared/updater/updater-status.schema';
import type { OutgoingHttpResponse, SendHttpRequestPayload } from '@shared/http/outgoing-request.schema';
import type { StoredCookie } from '@shared/http/stored-cookie.schema';
import type {
  CaptureFile,
  InterceptorFile,
  LoadTestRunMetrics,
  LoadTestStartOptions,
  LoadTestsFile,
  MockServerFile,
  RegressionRun,
  RegressionRunMetrics,
  RegressionStartOptions,
  RegressionsFile,
  TestSuitesFile,
} from '@shared/testing';

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

export interface ElectronRendererBridge {
  readonly platform: string;

  /** Set when Electron runs with `TESTRIX_DEV=1` (`npm run dev` only). */
  readonly devToolkit: boolean;

  /** Set when the main window uses the Angular dev server (`TESTRIX_SERVE_RENDERER=1`). */
  readonly opaqueDevWindow: boolean;

  /** Saved theme id from disk — applied in `index.html` before Angular paints. */
  readonly bootTheme?: string;
  readonly bootThemeMode?: 'light' | 'dark';

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
    mockStatus: () => Promise<{ readonly running: boolean }>;
    mockStart: () => Promise<{ readonly running: boolean }>;
    mockStop: () => Promise<{ readonly running: boolean }>;
    captureStatus: () => Promise<{ readonly running: boolean }>;
    captureStart: () => Promise<{ readonly running: boolean }>;
    captureStop: () => Promise<{ readonly running: boolean }>;
    captureListEntries: () => Promise<
      readonly { readonly id: string; readonly method: string; readonly url: string; readonly at: string }[]
    >;
    interceptorStatus: () => Promise<{ readonly running: boolean }>;
    interceptorStart: () => Promise<{ readonly running: boolean }>;
    interceptorStop: () => Promise<{ readonly running: boolean }>;
    loadTestStatus: () => Promise<{ readonly running: boolean }>;
    loadTestMetrics: () => Promise<LoadTestRunMetrics>;
    loadTestStart: (options?: LoadTestStartOptions) => Promise<LoadTestRunMetrics>;
    loadTestCancel: () => Promise<LoadTestRunMetrics>;
    regressionStatus: () => Promise<RegressionRunMetrics>;
    regressionStart: (
      options?: RegressionStartOptions,
    ) => Promise<{ readonly metrics: RegressionRunMetrics; readonly run: RegressionRun }>;
    regressionCancel: () => Promise<RegressionRunMetrics>;
    onRegressionMetrics: (listener: (metrics: RegressionRunMetrics) => void) => () => void;
    onRegressionRunProgress: (listener: (event: unknown) => void) => () => void;
    e2eExecuteFlow: (flowId: string) => Promise<{
      readonly ok: boolean;
      readonly message: string;
      readonly stepStatuses?: Readonly<Record<string, import('@shared/testing').TestSuiteStepStatus>>;
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
