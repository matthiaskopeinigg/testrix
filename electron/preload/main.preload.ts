import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { ElectronAPI } from '../electron-api-bridge';

import { AppChannels } from '../ipc/channels/app.channels';
import { ConfigChannels } from '../ipc/channels/config.channels';
import { LoggingChannels } from '../ipc/channels/logging.channels';
import { UpdaterChannels } from '../ipc/channels/updater.channels';
import { ShellChannels } from '../ipc/channels/shell.channels';
import { HttpChannels } from '../ipc/channels/http.channels';
import { CookieChannels } from '../ipc/channels/cookie.channels';
import { TestingChannels } from '../ipc/channels/testing.channels';
import { E2eChannels } from '../ipc/channels/e2e.channels';
import { WindowChannels } from '../ipc/channels/window.channels';
import { DbChannels } from '../ipc/channels/db.channels';

import type { UpdaterStatus } from '../../shared/updater/updater-status.schema';
import type { FlowRunProgressEvent } from '../../shared/testing';
import {
  DEFAULT_APPEARANCE_THEME_ID,
  normalizeAppearanceThemeId,
  resolveThemeContentBackground,
} from '../../shared/theme/theme-catalog';

/**
 * Electron runs this preload **before** the renderer loads Angular. **`contextBridge`** must publish
 * `window.testrix` synchronously; async `expose` raced the first Angular navigation and prevented
 * `notifyReady()`, so splash never handed off to the renderer.
 *
 * App semver still comes from main via IPC (`AppChannels.versions`) and merges in afterward.
 */

type VersionBundle = { app: string; electron: string; chrome: string };

function readAdditionalArg(prefix: string): string | undefined {
  const entry = process.argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : undefined;
}

const bootTheme = readAdditionalArg('--boot-theme=');
const bootThemeMode = readAdditionalArg('--boot-theme-mode=') as 'light' | 'dark' | undefined;
const bootThemeBg = bootTheme
  ? resolveThemeContentBackground(bootTheme)
  : resolveThemeContentBackground(DEFAULT_APPEARANCE_THEME_ID);

const mergedVersions: VersionBundle = {
  electron: process.versions.electron ?? '',
  chrome: process.versions.chrome ?? '',
  app: '',
};

const api: ElectronAPI = {
  platform: process.platform,
  devToolkit: process.env.TESTRIX_DEV === '1',
  opaqueDevWindow: process.env.TESTRIX_SERVE_RENDERER === '1' && process.platform !== 'win32',
  /** Persisted appearance theme applied in `index.html` before Angular boot (via `additionalArguments`). */
  bootTheme,
  bootThemeMode,
  bootThemeBg,
  nativeDevFrame: false,
  versions: mergedVersions as ElectronAPI['versions'],
  notifyReady: () => {
    ipcRenderer.send(AppChannels.ready);
    return Promise.resolve();
  },
  openExternal: (url) => ipcRenderer.invoke(AppChannels.openExternal, url),
  shell: {
    pickFile: (options) => ipcRenderer.invoke(ShellChannels.pickFile, options ?? {}),
  },
  config: {
    getConfigDir: () => ipcRenderer.invoke(ConfigChannels.getConfigDir),
    setConfigDir: (dir) => ipcRenderer.invoke(ConfigChannels.setConfigDir, dir),
    getSettings: () => ipcRenderer.invoke(ConfigChannels.getSettings),
    setSettings: (patch) => ipcRenderer.invoke(ConfigChannels.setSettings, patch),
    getSession: () => ipcRenderer.invoke(ConfigChannels.getSession),
    setSession: (patch) => ipcRenderer.invoke(ConfigChannels.setSession, patch),
    getFilePaths: () => ipcRenderer.invoke(ConfigChannels.getFilePaths),
    openConfigDir: () => ipcRenderer.invoke(ConfigChannels.openConfigDir),
    pickDirectory: () => ipcRenderer.invoke(ConfigChannels.pickDirectory),
    exportSettings: () => ipcRenderer.invoke(ConfigChannels.exportSettings),
    importSettings: (json) => ipcRenderer.invoke(ConfigChannels.importSettings, json),
    resetSettings: () => ipcRenderer.invoke(ConfigChannels.resetSettings),
    resetSession: () => ipcRenderer.invoke(ConfigChannels.resetSession),
    getCollections: () => ipcRenderer.invoke(ConfigChannels.getCollections),
    setCollections: (data) => ipcRenderer.invoke(ConfigChannels.setCollections, data),
    getEnvironments: () => ipcRenderer.invoke(ConfigChannels.getEnvironments),
    setEnvironments: (data) => ipcRenderer.invoke(ConfigChannels.setEnvironments, data),
    getHistory: () => ipcRenderer.invoke(ConfigChannels.getHistory),
    setHistory: (data) => ipcRenderer.invoke(ConfigChannels.setHistory, data),
    onHistoryUpdated: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload);
      };
      ipcRenderer.on(ConfigChannels.historyUpdated, handler);
      return () => {
        ipcRenderer.removeListener(ConfigChannels.historyUpdated, handler);
      };
    },
    getProfiles: () => ipcRenderer.invoke(ConfigChannels.getProfiles),
    setActiveProfile: (profileId) => ipcRenderer.invoke(ConfigChannels.setActiveProfile, profileId),
    createProfile: (name) => ipcRenderer.invoke(ConfigChannels.createProfile, name),
    renameProfile: (payload) => ipcRenderer.invoke(ConfigChannels.renameProfile, payload),
    deleteProfile: (profileId) => ipcRenderer.invoke(ConfigChannels.deleteProfile, profileId),
  },
  logging: {
    getPaths: () => ipcRenderer.invoke(LoggingChannels.getPaths),
    tail: (options) => ipcRenderer.invoke(LoggingChannels.tail, options ?? {}),
    clear: () => ipcRenderer.invoke(LoggingChannels.clear),
    openLogDir: () => ipcRenderer.invoke(LoggingChannels.openLogDir),
  },
  http: {
    send: (payload) => ipcRenderer.invoke(HttpChannels.send, payload),
    cancel: (requestId) => ipcRenderer.invoke(HttpChannels.cancel, requestId),
  },
  database: {
    query: (payload) => ipcRenderer.invoke(DbChannels.query, payload),
    testConnection: (connection) => ipcRenderer.invoke(DbChannels.testConnection, connection),
  },
  cookies: {
    getAll: () => ipcRenderer.invoke(CookieChannels.getAll),
    delete: (cookie) => ipcRenderer.invoke(CookieChannels.delete, cookie),
    clearAll: () => ipcRenderer.invoke(CookieChannels.clearAll),
  },
  testing: {
    getTestSuites: () => ipcRenderer.invoke(TestingChannels.getTestSuites),
    setTestSuites: (data) => ipcRenderer.invoke(TestingChannels.setTestSuites, data),
    getLoadTests: () => ipcRenderer.invoke(TestingChannels.getLoadTests),
    setLoadTests: (data) => ipcRenderer.invoke(TestingChannels.setLoadTests, data),
    getRegressions: () => ipcRenderer.invoke(TestingChannels.getRegressions),
    setRegressions: (data) => ipcRenderer.invoke(TestingChannels.setRegressions, data),
    getMockServer: () => ipcRenderer.invoke(TestingChannels.getMockServer),
    setMockServer: (data) => ipcRenderer.invoke(TestingChannels.setMockServer, data),
    getCapture: () => ipcRenderer.invoke(TestingChannels.getCapture),
    setCapture: (data) => ipcRenderer.invoke(TestingChannels.setCapture, data),
    getInterceptor: () => ipcRenderer.invoke(TestingChannels.getInterceptor),
    setInterceptor: (data) => ipcRenderer.invoke(TestingChannels.setInterceptor, data),
    mockStatus: () => ipcRenderer.invoke(TestingChannels.mockStatus),
    mockStart: () => ipcRenderer.invoke(TestingChannels.mockStart),
    mockStop: () => ipcRenderer.invoke(TestingChannels.mockStop),
    mockListMismatches: () => ipcRenderer.invoke(TestingChannels.mockListMismatches),
    mockClearMismatches: () => ipcRenderer.invoke(TestingChannels.mockClearMismatches),
    onMockActivity: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload);
      };
      ipcRenderer.on(TestingChannels.mockActivity, handler);
      return () => {
        ipcRenderer.removeListener(TestingChannels.mockActivity, handler);
      };
    },
    captureStatus: () => ipcRenderer.invoke(TestingChannels.captureStatus),
    captureStart: (options) => ipcRenderer.invoke(TestingChannels.captureStart, options),
    captureStop: () => ipcRenderer.invoke(TestingChannels.captureStop),
    captureListEntries: (captureItemId) =>
      ipcRenderer.invoke(TestingChannels.captureListEntries, captureItemId),
    captureClearEntries: (captureItemId) =>
      ipcRenderer.invoke(TestingChannels.captureClearEntries, captureItemId),
    onCaptureEntry: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload);
      };
      ipcRenderer.on(TestingChannels.captureEntry, handler);
      return () => {
        ipcRenderer.removeListener(TestingChannels.captureEntry, handler);
      };
    },
    onCaptureStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload);
      };
      ipcRenderer.on(TestingChannels.captureStatusEvent, handler);
      return () => {
        ipcRenderer.removeListener(TestingChannels.captureStatusEvent, handler);
      };
    },
    interceptorStatus: () => ipcRenderer.invoke(TestingChannels.interceptorStatus),
    interceptorStart: (options) => ipcRenderer.invoke(TestingChannels.interceptorStart, options),
    interceptorStop: () => ipcRenderer.invoke(TestingChannels.interceptorStop),
    interceptorListHits: () => ipcRenderer.invoke(TestingChannels.interceptorListHits),
    interceptorClearHits: () => ipcRenderer.invoke(TestingChannels.interceptorClearHits),
    onInterceptorHit: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload);
      };
      ipcRenderer.on(TestingChannels.interceptorHit, handler);
      return () => {
        ipcRenderer.removeListener(TestingChannels.interceptorHit, handler);
      };
    },
    onInterceptorStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload);
      };
      ipcRenderer.on(TestingChannels.interceptorStatusEvent, handler);
      return () => {
        ipcRenderer.removeListener(TestingChannels.interceptorStatusEvent, handler);
      };
    },
    loadTestStatus: () => ipcRenderer.invoke(TestingChannels.loadTestStatus),
    loadTestMetrics: () => ipcRenderer.invoke(TestingChannels.loadTestMetrics),
    loadTestStart: (options) => ipcRenderer.invoke(TestingChannels.loadTestStart, options ?? {}),
    loadTestCancel: () => ipcRenderer.invoke(TestingChannels.loadTestCancel),
    regressionStatus: () => ipcRenderer.invoke(TestingChannels.regressionStatus),
    regressionStart: (options) => ipcRenderer.invoke(TestingChannels.regressionStart, options ?? {}),
    regressionCancel: () => ipcRenderer.invoke(TestingChannels.regressionCancel),
    onRegressionMetrics: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload);
      };
      ipcRenderer.on(TestingChannels.regressionMetrics, handler);
      return () => {
        ipcRenderer.removeListener(TestingChannels.regressionMetrics, handler);
      };
    },
    onRegressionRunProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown): void => {
        listener(payload);
      };
      ipcRenderer.on(TestingChannels.regressionRunProgress, handler);
      return () => {
        ipcRenderer.removeListener(TestingChannels.regressionRunProgress, handler);
      };
    },
    e2eExecuteFlow: (flowId) => ipcRenderer.invoke(TestingChannels.e2eExecuteFlow, flowId),
    e2eCancel: () => ipcRenderer.invoke(TestingChannels.e2eCancel),
    onFlowRunProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: FlowRunProgressEvent): void => {
        listener(payload);
      };
      ipcRenderer.on(TestingChannels.flowRunProgress, handler);
      return () => {
        ipcRenderer.removeListener(TestingChannels.flowRunProgress, handler);
      };
    },
    e2eExecute: (payload) => ipcRenderer.invoke(E2eChannels.execute, payload),
    e2eSignalCancel: () => ipcRenderer.send(E2eChannels.signalCancel),
    clearE2eRunnerSession: () => ipcRenderer.invoke(E2eChannels.clearRunnerSession),
    e2ePickElement: (payload) =>
      ipcRenderer.invoke(E2eChannels.pickElementStart, payload && typeof payload === 'object' ? payload : {}),
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke(WindowChannels.minimize),
    maximizeToggle: () => ipcRenderer.invoke(WindowChannels.maximizeToggle),
    close: () => ipcRenderer.invoke(WindowChannels.close),
    focus: () => ipcRenderer.invoke(WindowChannels.focus),
    getChromeState: () =>
      ipcRenderer.invoke(WindowChannels.getChromeState) as Promise<{ readonly edgeToEdge: boolean }>,
    onChromeStateChange: (listener: (state: { readonly edgeToEdge: boolean }) => void) => {
      const handler = (_event: IpcRendererEvent, state: { readonly edgeToEdge: boolean }): void => {
        listener(state);
      };
      ipcRenderer.on(WindowChannels.chromeStateChanged, handler);
      return () => {
        ipcRenderer.removeListener(WindowChannels.chromeStateChanged, handler);
      };
    },
    dragStart: (offset: { readonly offsetX: number; readonly offsetY: number }) =>
      ipcRenderer.send(WindowChannels.dragStart, { x: offset.offsetX, y: offset.offsetY }),
    dragMove: (position: { readonly screenX: number; readonly screenY: number }) =>
      ipcRenderer.send(WindowChannels.dragMove, position),
    dragEnd: () => ipcRenderer.send(WindowChannels.dragEnd),
  },
  updater: {
    getStatus: () => ipcRenderer.invoke(UpdaterChannels.getStatus) as Promise<UpdaterStatus>,
    check: () => ipcRenderer.invoke(UpdaterChannels.check) as Promise<UpdaterStatus>,
    download: () => ipcRenderer.invoke(UpdaterChannels.download) as Promise<UpdaterStatus>,
    install: () => ipcRenderer.invoke(UpdaterChannels.install) as Promise<void>,
    setChannel: (channel) => ipcRenderer.invoke(UpdaterChannels.setChannel, channel) as Promise<void>,
    onStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, status: UpdaterStatus): void => {
        listener(status);
      };
      ipcRenderer.on(UpdaterChannels.status, handler);
      return () => {
        ipcRenderer.removeListener(UpdaterChannels.status, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld('testrix', api);

void ipcRenderer
  .invoke(AppChannels.versions)
  .then((v: unknown) => {
    const incoming = v as ElectronAPI['versions'];
    mergedVersions.app = incoming.app ?? '';
    mergedVersions.electron = incoming.electron || mergedVersions.electron;
    mergedVersions.chrome = incoming.chrome || mergedVersions.chrome;
  })
  .catch(() => undefined);
