import type { TestrixDesktopApi } from '@testrix/contracts';
import {
  ANDROID_SETTING_KEYS,
  APPEARANCE_SETTING_KEYS,
  CONFIG_FILE_NAMES,
  CONFIG_SCHEMA_VERSION,
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
  DEFAULT_SHORTCUTS,
  DEFAULT_USER_SETTINGS,
  cloneDefaultUserSettings,
  emptyAndroidToolchainStatus,
  applyWorkspaceOrder,
  clampUiZoom,
  createDefaultEnvironmentsFile,
  createDefaultWorkspacesFile,
  duplicateWorkspaceName,
  mergeUserSettingsPatch,
  nextWorkspaceFolder,
  nextWorkspaceId,
  parseCollectionsFile,
  parseDatabasesFile,
  parseEnvironmentsFile,
  parseFlowsFile,
  parseHistoryFile,
  parseCookiesFile,
  parseLoadFile,
  parseMocksFile,
  parseListenersFile,
  parseInterceptFile,
  parsePlantumlFile,
  parseFlowTemplatesFile,
  parseEmulatorFile,
  parseQueriesFile,
  parseRegressionsFile,
  parseSettingsFile,
  removeWorkspaceFromCatalog,
  toUserSettings,
  type CollectionsFile,
  type DatabasesFile,
  type QueriesFile,
  type ConfigPaths,
  type EnvironmentsFile,
  type HistoryFile,
  type CookiesFile,
  type UserSettings,
  type WorkspacesFile,
  type WorkspaceSnapshot,
  type CollabStatus,
  localCollabStatus,
  effectiveUpdateChannel,
  type UpdateStatus,
  type DatabaseQueryEnvelope,
  type HttpExecuteResponse,
  type OAuthDevicePollResult,
  type OAuthDeviceStartResult,
  type OAuthTokenResult,
} from '@testrix/contracts';

export const memoryPaths = (): ConfigPaths => ({
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

export function normalizeUserSettings(raw: unknown): UserSettings {
  return toUserSettings(parseSettingsFile(raw));
}

let memorySettings: UserSettings = cloneDefaultUserSettings();
let memoryWorkspaces: WorkspacesFile = createDefaultWorkspacesFile();
let memoryCollab: CollabStatus = localCollabStatus();
const collabListeners = new Set<(status: CollabStatus) => void>();

function emitMemoryCollab(status: CollabStatus): CollabStatus {
  memoryCollab = status;
  for (const listener of collabListeners)
    listener(status);
  return status;
}
const FALLBACK_VERSION = '2.0.0-beta.1';
const updateListeners = new Set<(status: UpdateStatus) => void>();

function memoryUpdateStatus(): UpdateStatus {
  const prefs = memorySettings.updates;
  return {
    phase: 'idle',
    currentVersion: FALLBACK_VERSION,
    channel: effectiveUpdateChannel(prefs, FALLBACK_VERSION),
    prefs,
    isSupported: false,
    unsupportedReason: 'Updates are only available in the installed desktop app.',
    lastCheckedAt: null,
    release: null,
    percent: null,
    error: null,
    updatedFrom: null,
  };
}

let memoryEnvironments: EnvironmentsFile = createDefaultEnvironmentsFile();
let memoryCollections: CollectionsFile = { ...DEFAULT_COLLECTIONS_FILE };
let memoryDatabases: DatabasesFile = { ...DEFAULT_DATABASES_FILE, nodes: [] };
let memoryQueries: QueriesFile = { ...DEFAULT_QUERIES_FILE, nodes: [] };
let memoryHistory: HistoryFile = { ...DEFAULT_HISTORY_FILE };
let memoryCookies: CookiesFile = { ...DEFAULT_COOKIES_FILE };
let memoryFlows = { ...DEFAULT_FLOWS_FILE };
let memoryLoad = { ...DEFAULT_LOAD_FILE };
let memoryMocks = { ...DEFAULT_MOCKS_FILE };
let memoryListeners = { ...DEFAULT_LISTENERS_FILE };
let memoryIntercept = { ...DEFAULT_INTERCEPT_FILE };
let memoryPlantuml = { ...DEFAULT_PLANTUML_FILE };
let memoryRegressions = { ...DEFAULT_REGRESSIONS_FILE };
let memoryFlowTemplates = { ...DEFAULT_FLOW_TEMPLATES_FILE };
let memoryEmulator = { ...DEFAULT_EMULATOR_FILE };

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
    history: memoryHistory,
    cookies: memoryCookies,
    flows: memoryFlows,
    load: memoryLoad,
    mocks: memoryMocks,
    listeners: memoryListeners,
    intercept: memoryIntercept,
    plantuml: memoryPlantuml,
    regressions: memoryRegressions,
    flowTemplates: memoryFlowTemplates,
    emulator: memoryEmulator,
  };
}

/** In-memory bridge used when the renderer runs without Electron (plain browser, tests). */
export const browserFallback: TestrixDesktopApi = {
  app: {
    getVersion: async () => FALLBACK_VERSION,
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
    setZoomFactor: (factor) => {
      document.documentElement.style.zoom = String(clampUiZoom(factor));
    },
    openWorkbench: async () => undefined,
    onMaximizedChanged: () => () => undefined,
    onWorkspaceFilesChanged: () => () => undefined,
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
      } else if (scope === 'http') {
        memorySettings = {
          ...memorySettings,
          defaultHeaders: DEFAULT_USER_SETTINGS.defaultHeaders.map((row) => ({ ...row })),
          placeholderEmailDomain: DEFAULT_USER_SETTINGS.placeholderEmailDomain,
          defaultApiKeyHeader: DEFAULT_USER_SETTINGS.defaultApiKeyHeader,
        };
      } else if (scope === 'android') {
        const next = { ...memorySettings };
        for (const key of ANDROID_SETTING_KEYS)
          (next as Record<string, unknown>)[key] = DEFAULT_USER_SETTINGS[key];
        memorySettings = next;
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
  history: {
    get: async () => memoryHistory,
    set: async (patch) => {
      memoryHistory = parseHistoryFile({ ...memoryHistory, ...patch });
      return memoryHistory;
    },
  },
  cookies: {
    get: async () => memoryCookies,
    set: async (patch) => {
      memoryCookies = parseCookiesFile({ ...memoryCookies, ...patch });
      return memoryCookies;
    },
  },
  plantuml: {
    get: async () => memoryPlantuml,
    set: async (patch) => {
      memoryPlantuml = parsePlantumlFile({ ...memoryPlantuml, ...patch });
      return memoryPlantuml;
    },
  },
  services: {
    flows: {
      get: async () => memoryFlows,
      set: async (patch) => {
        memoryFlows = parseFlowsFile({ ...memoryFlows, ...patch });
        return memoryFlows;
      },
      run: async (_flowId: string, _scenarioId?: string | null) => ({ ok: true, error: null }),
      runDraft: async () => ({ ok: true, error: null }),
      cancel: async () => undefined,
      pickSelector: async () => ({ ok: false, cancelled: true, error: 'Desktop required' }),
      pickDeviceSelector: async () => ({ ok: false, cancelled: true, error: 'Desktop required' }),
      replyManualPrompt: async () => undefined,
    },
    load: {
      get: async () => memoryLoad,
      set: async (patch) => {
        memoryLoad = parseLoadFile({ ...memoryLoad, ...patch });
        return memoryLoad;
      },
      start: async () => ({ running: false, label: 'Idle', error: null }),
      stop: async () => ({ running: false, label: 'Idle', error: null }),
    },
    mocks: {
      get: async () => memoryMocks,
      set: async (patch) => {
        memoryMocks = parseMocksFile({ ...memoryMocks, ...patch });
        return memoryMocks;
      },
      start: async () => ({ running: false, label: 'Idle', error: null }),
      stop: async () => ({ running: false, label: 'Idle', error: null }),
    },
    listeners: {
      get: async () => memoryListeners,
      set: async (patch) => {
        memoryListeners = parseListenersFile({ ...memoryListeners, ...patch });
        return memoryListeners;
      },
      start: async () => ({ running: false, label: 'Idle', error: null }),
      stop: async () => ({ running: false, label: 'Idle', error: null }),
    },
    intercept: {
      get: async () => memoryIntercept,
      set: async (patch) => {
        memoryIntercept = parseInterceptFile({ ...memoryIntercept, ...patch });
        return memoryIntercept;
      },
      start: async () => ({ running: false, label: 'Idle', error: null }),
      stop: async () => ({ running: false, label: 'Idle', error: null }),
    },
    regressions: {
      get: async () => memoryRegressions,
      set: async (patch) => {
        memoryRegressions = parseRegressionsFile({ ...memoryRegressions, ...patch });
        return memoryRegressions;
      },
      run: async (_id: string, _options?) => ({ ok: true, error: null }),
      cancel: async () => undefined,
    },
    flowTemplates: {
      get: async () => memoryFlowTemplates,
      set: async (patch) => {
        memoryFlowTemplates = parseFlowTemplatesFile({ ...memoryFlowTemplates, ...patch });
        return memoryFlowTemplates;
      },
    },
    emulator: {
      get: async () => memoryEmulator,
      set: async (patch) => {
        memoryEmulator = parseEmulatorFile({ ...memoryEmulator, ...patch });
        return memoryEmulator;
      },
    },
    device: {
      status: async () => emptyAndroidToolchainStatus(),
      activate: async () => ({
        ok: false,
        error: 'Android emulator requires the desktop app.',
        status: emptyAndroidToolchainStatus(),
      }),
      startEmulator: async (_payload?: { readonly coldBoot?: boolean; readonly openHome?: boolean }) => ({
        ok: false,
        error: 'Android emulator requires the desktop app.',
        status: emptyAndroidToolchainStatus(),
      }),
      stopEmulator: async () => ({ ok: true, error: null, status: emptyAndroidToolchainStatus() }),
      uninstall: async () => ({ ok: true, error: null, status: emptyAndroidToolchainStatus() }),
      chooseSdkRoot: async () => null,
      revealSdk: async () => undefined,
      refresh: async () => emptyAndroidToolchainStatus(),
      applySystemImage: async () => ({
        ok: false,
        error: 'Android emulator requires the desktop app.',
        status: emptyAndroidToolchainStatus(),
      }),
    },
    onFlowEvent: () => () => undefined,
    onFlowManualPrompt: () => () => undefined,
    onLoadMetrics: () => () => undefined,
    onMocksActivity: () => () => undefined,
    onListenerHit: () => () => undefined,
    onListenerStatus: () => () => undefined,
    onInterceptHit: () => () => undefined,
    onInterceptStatus: () => () => undefined,
    onRegressionEvent: () => () => undefined,
    onDeviceEvent: () => () => undefined,
  },
  http: {
    execute: async () => ({
      status: 0,
      statusText: '',
      headers: [],
      body: '',
      durationMs: 0,
      sizeLabel: '0 B',
      setCookies: [],
      error: 'HTTP send requires the desktop app.',
      variables: {},
      url: '',
      httpVersion: 'HTTP/1.1',
      timing: {
        dnsMs: 0,
        tcpMs: 0,
        tlsMs: 0,
        ttfbMs: 0,
        downloadMs: 0,
        redirectsMs: 0,
        otherMs: 0,
        totalMs: 0,
      },
      redirects: [],
    } satisfies HttpExecuteResponse),
    abort: async () => undefined,
    openUrl: async () => undefined,
  },
  websocket: {
    connect: async () => ({
      ok: false,
      error: 'WebSocket requires the desktop app.',
      protocol: '',
    }),
    disconnect: async () => undefined,
    send: async () => ({ ok: false, error: 'WebSocket requires the desktop app.' }),
    onEvent: () => () => undefined,
  },
  oauth: {
    authorize: async () => ({
      ok: false,
      error: 'OAuth requires the desktop app.',
      accessToken: '',
      refreshToken: '',
      tokenType: 'Bearer',
      expiresAt: '',
    } satisfies OAuthTokenResult),
    token: async () => ({
      ok: false,
      error: 'OAuth requires the desktop app.',
      accessToken: '',
      refreshToken: '',
      tokenType: 'Bearer',
      expiresAt: '',
    }),
    refresh: async () => ({
      ok: false,
      error: 'OAuth requires the desktop app.',
      accessToken: '',
      refreshToken: '',
      tokenType: 'Bearer',
      expiresAt: '',
    }),
    deviceStart: async () => ({
      ok: false,
      error: 'OAuth requires the desktop app.',
      sessionId: '',
      userCode: '',
      verificationUri: '',
      verificationUriComplete: '',
      interval: 5,
      expiresIn: 0,
    } satisfies OAuthDeviceStartResult),
    devicePoll: async () => ({
      ok: false,
      error: 'OAuth requires the desktop app.',
      accessToken: '',
      refreshToken: '',
      tokenType: 'Bearer',
      expiresAt: '',
      pending: false,
      cancelled: false,
    } satisfies OAuthDevicePollResult),
    deviceCancel: async () => undefined,
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
    disconnect: async () => undefined,
    statuses: async () => ({}),
    sessionQuery: async () => emptyQueryEnvelope(),
    sessionCommit: async (tabId) => ({ tabId, open: false, uncommitted: false, rollbackAt: null }),
    sessionRollback: async (tabId) => ({ tabId, open: false, uncommitted: false, rollbackAt: null }),
    warmBoot: async () => undefined,
  },
  workspace: {
    exportPack: async () => ({ canceled: true }),
    pickImportSource: async () => null,
    importInspect: async (filePath) => ({
      format: 'unsupported' as const,
      path: filePath,
      warnings: ['Import is only available in the desktop app.'],
    }),
    importInspectBytes: async (fileName) => ({
      format: 'unsupported' as const,
      path: fileName,
      warnings: ['Import is only available in the desktop app.'],
    }),
    importApply: async () => memorySnapshot(),
    pathForFile: () => null,
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
      memoryHistory = { ...DEFAULT_HISTORY_FILE };
      memoryCookies = { ...DEFAULT_COOKIES_FILE };
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
    reorder: async (orderIds) => {
      const ordered = applyWorkspaceOrder(memoryWorkspaces.items, orderIds);
      if (ordered.length === 0) {
        return memoryWorkspaces;
      }
      memoryWorkspaces = {
        ...memoryWorkspaces,
        items: ordered,
        orderIds: ordered.map((item) => item.id),
      };
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
        memoryHistory = { ...DEFAULT_HISTORY_FILE };
        memoryCookies = { ...DEFAULT_COOKIES_FILE };
      }
      return memorySnapshot();
    },
  },
  config: {
    paths: async () => memoryPaths(),
    workspaceFootprint: async () => ({
      totalBytes: 0,
      historyEntries: 0,
      tabCount: 0,
      byCategory: {},
    }),
    reveal: async () => undefined,
    chooseFolder: async () => null,
    chooseLogsFolder: async () => null,
    chooseConfigsFolder: async () => null,
    chooseFile: async () => null,
  },
  logs: {
    recent: async () => [],
  },
  collab: {
    getStatus: async () => memoryCollab,
    onStatus: (listener) => {
      collabListeners.add(listener);
      return () => collabListeners.delete(listener);
    },
    connectRepo: async () => {
      throw new Error('Connect a repository from the desktop app.');
    },
    disconnectRepo: async () => ({ status: emitMemoryCollab(localCollabStatus()), snapshot: memorySnapshot() }),
    addWorkspaces: async () => ({ status: memoryCollab, snapshot: memorySnapshot() }),
    publishWorkspace: async () => {
      throw new Error('Publish a workspace from the desktop app.');
    },
    removeFromPc: async () => ({ status: memoryCollab, snapshot: memorySnapshot() }),
    removeFromRepo: async () => ({ status: memoryCollab, snapshot: memorySnapshot() }),
    pause: async () => emitMemoryCollab({ ...memoryCollab, state: 'paused' }),
    resume: async () => emitMemoryCollab({ ...memoryCollab, state: 'idle' }),
    syncNow: async () => emitMemoryCollab({ ...memoryCollab, lastSyncAt: new Date().toISOString() }),
    resolve: async () => ({ status: memoryCollab, snapshot: memorySnapshot() }),
    setIdentity: async (request) =>
      emitMemoryCollab({
        ...memoryCollab,
        identity: { name: request.name, email: request.email ?? memoryCollab.identity.email },
      }),
    forgetCredential: async () => emitMemoryCollab({ ...memoryCollab, hasCredential: false }),
    updateCredential: async () => emitMemoryCollab({ ...memoryCollab, hasCredential: true }),
    setPresenceMode: async (mode) => emitMemoryCollab({ ...memoryCollab, presenceMode: mode }),
    setShareRuns: async (enabled) => emitMemoryCollab({ ...memoryCollab, shareRuns: enabled }),
    setBranch: async (branch) => emitMemoryCollab({ ...memoryCollab, branch }),
    setWatching: async () => memoryCollab,
    acquireLock: async () => ({ ok: true, lock: null, message: null }),
    renewLock: async () => undefined,
    releaseLock: async () => memoryCollab,
    takeOverLock: async () => ({ ok: true, lock: null, message: null }),
    publishRun: async () => memoryCollab,
  },
  update: {
    getStatus: async () => memoryUpdateStatus(),
    onStatus: (listener) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    check: async () => memoryUpdateStatus(),
    download: async () => memoryUpdateStatus(),
    install: async () => false,
    setPrefs: async (patch) => {
      memorySettings = { ...memorySettings, updates: { ...memorySettings.updates, ...patch } };
      const status = memoryUpdateStatus();
      for (const listener of updateListeners)
        listener(status);
      return status;
    },
  },
};
