import { BrowserWindow, session } from 'electron';

import {
  browserOpenUrlCandidates,
  flowHttpHitMatches,
  interpolateFlow,
  isAbortedNavigationError,
  isDnsOrHostLoadError,
  isUsableBrowserPageUrl,
  type ListenerArtifactFields,
  type ListenerHitEvent,
  type ServiceRuntimeStatus,
} from '@testrix/contracts';
import { applyWindowIcon, attachOpenWebCspPassthrough, windowIconOption } from '@testrix/electron-core';

import { detach } from '../../lifecycle';
import type { AdbClient } from './adb-client';
import type { DeviceProxyHost } from './device-proxy-host.service';

const E2E_PARTITION = 'persist:testrix-e2e';
const BODY_PREVIEW_LIMIT = 4000;

interface PendingNetworkRequest {
  readonly method: string;
  readonly url: string;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: string;
  readonly resourceType: string;
}

export interface ListenerStartDeps {
  readonly deviceProxy: DeviceProxyHost;
  readonly adb: AdbClient | null;
  readonly serial: string | null;
}

type ListenerArtifact = ListenerArtifactFields & { readonly id: string; readonly name: string };

let e2eCspPassthroughAttached = false;

function ensureE2eOpenWebSession(): void {
  if (e2eCspPassthroughAttached)
    return;
  e2eCspPassthroughAttached = true;
  attachOpenWebCspPassthrough(session.fromPartition(E2E_PARTITION));
}

function lowerHeaderRecord(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers))
    out[key.toLowerCase()] = value;
  return out;
}

function statusMatches(filter: string, status: number): boolean {
  const expected = filter.trim();
  if (!expected || expected === '*')
    return true;
  return String(status) === expected;
}

/**
 * Workbench HTTP listener: browser CDP Network or device MITM observe-only.
 */
export class ListenerHost {
  private window: BrowserWindow | null = null;
  private ownsWindow = false;
  private status: ServiceRuntimeStatus = { running: false, label: 'Idle', error: null };
  private onHit: ((event: ListenerHitEvent) => void) | null = null;
  private onStopped: (() => void) | null = null;
  private listenerId: string | null = null;
  private filterMethod = '*';
  private filterUrl = '';
  private filterStatus = '';
  private networkAttached = false;
  private networkPending = new Map<string, PendingNetworkRequest>();
  private deviceProxy: DeviceProxyHost | null = null;
  private proxyHitHandler: ((
    hit: {
      readonly ruleId: string;
      readonly method: string;
      readonly url: string;
      readonly status: number;
      readonly body: string;
      readonly headers: Readonly<Record<string, string>>;
      readonly requestHeaders: Readonly<Record<string, string>>;
      readonly requestBody: string;
      readonly at: number;
    },
    _rule: unknown,
  ) => void) | null = null;

  bind(listener: ((event: ListenerHitEvent) => void) | null): void {
    this.onHit = listener;
  }

  /** Fired when the browser window is closed by the user (not via stop()). */
  bindStopped(listener: (() => void) | null): void {
    this.onStopped = listener;
  }

  snapshot(): ServiceRuntimeStatus {
    return this.status;
  }

  activeId(): string | null {
    return this.listenerId;
  }

  async start(
    artifact: ListenerArtifact,
    envVars: Record<string, string>,
    deps: ListenerStartDeps,
  ): Promise<ServiceRuntimeStatus> {
    await this.stop();
    this.listenerId = artifact.id;
    this.filterMethod = interpolateFlow(artifact.filterMethod || '*', envVars) || '*';
    this.filterUrl = interpolateFlow(artifact.filterUrl, envVars);
    this.filterStatus = interpolateFlow(artifact.filterStatus, envVars);

    if (artifact.mode === 'device')
      return this.startDevice(artifact, deps);
    return this.startBrowser(artifact, envVars);
  }

  async stop(): Promise<ServiceRuntimeStatus> {
    this.detachNetwork();
    if (this.deviceProxy && this.listenerId) {
      await this.deviceProxy.disarmRule(this.listenerId).catch(() => undefined);
      if (this.proxyHitHandler)
        this.deviceProxy.removeHitListener(this.proxyHitHandler);
    }
    this.deviceProxy = null;
    this.proxyHitHandler = null;

    const win = this.window;
    this.window = null;
    if (win && !win.isDestroyed() && this.ownsWindow) {
      try {
        if (win.webContents.debugger.isAttached())
          win.webContents.debugger.detach();
      } catch {
        /* already detached */
      }
      win.close();
    }
    this.ownsWindow = false;
    this.listenerId = null;
    this.status = { running: false, label: 'Idle', error: null };
    return this.status;
  }

  private async startBrowser(
    artifact: ListenerArtifact,
    envVars: Record<string, string>,
  ): Promise<ServiceRuntimeStatus> {
    ensureE2eOpenWebSession();
    const rawStart = interpolateFlow(artifact.startUrl, envVars).trim() || 'http://127.0.0.1/';
    const candidates = browserOpenUrlCandidates(rawStart);
    if (candidates.length === 0) {
      this.status = { running: false, label: 'Idle', error: 'Start URL is empty' };
      this.listenerId = null;
      return this.status;
    }

    const existing = this.findReusableE2eWindow();
    if (existing) {
      this.window = existing;
      this.ownsWindow = false;
      this.watchBrowserWindow(existing);
      try {
        await this.loadStartUrl(existing, candidates);
      } catch (error) {
        this.status = {
          running: false,
          label: 'Idle',
          error: error instanceof Error ? error.message : 'Failed to open start URL',
        };
        this.listenerId = null;
        this.window = null;
        return this.status;
      }
    } else {
      const win = new BrowserWindow({
        width: 1100,
        height: 800,
        show: true,
        title: `Testrix Listener · ${artifact.name}`,
        autoHideMenuBar: true,
        ...windowIconOption(),
        webPreferences: {
          partition: E2E_PARTITION,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
      this.window = win;
      applyWindowIcon(win);
      this.ownsWindow = true;
      this.watchBrowserWindow(win);
      try {
        await this.loadStartUrl(win, candidates);
      } catch (error) {
        this.status = {
          running: false,
          label: 'Idle',
          error: error instanceof Error ? error.message : 'Failed to open start URL',
        };
        await this.stop();
        return this.status;
      }
    }

    try {
      await this.attachNetwork();
    } catch (error) {
      this.status = {
        running: false,
        label: 'Idle',
        error: error instanceof Error ? error.message : 'CDP Network attach failed',
      };
      await this.stop();
      return this.status;
    }

    this.status = { running: true, label: artifact.name, error: null };
    return this.status;
  }

  /**
   * Tries https://host then https://www.host on DNS / aborted-redirect failures.
   * Apex hosts like magenta.at often 301 to www; Electron rejects loadURL with ERR_ABORTED
   * even when the redirect succeeds — treat a landed URL as success.
   */
  private async loadStartUrl(win: BrowserWindow, candidates: readonly string[]): Promise<void> {
    let lastError: Error | null = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      try {
        await this.loadOnce(win, candidate);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (win.isDestroyed())
          throw lastError;
        if (isUsableBrowserPageUrl(win.webContents.getURL()))
          return;
        const isLast = index === candidates.length - 1;
        const canRetry =
          isDnsOrHostLoadError(lastError) || isAbortedNavigationError(lastError);
        if (isLast || !canRetry)
          throw lastError;
      }
    }
    throw lastError ?? new Error('Failed to open start URL');
  }

  private async loadOnce(win: BrowserWindow, url: string): Promise<void> {
    const loadBudgetMs = 30_000;
    try {
      await Promise.race([
        win.loadURL(url),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Timed out loading ${url} after ${loadBudgetMs}ms`)),
            loadBudgetMs,
          );
        }),
      ]);
    } catch (error) {
      if (win.isDestroyed())
        throw error instanceof Error ? error : new Error(String(error));
      // Redirect supersession: Chromium aborts the first navigation after landing on www.
      if (isUsableBrowserPageUrl(win.webContents.getURL()))
        return;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${url}: ${message}`);
    }
    if (win.isDestroyed())
      throw new Error('Listener window closed while loading');
    if (!isUsableBrowserPageUrl(win.webContents.getURL()))
      throw new Error(`Open stayed on blank after loading ${url}`);
  }

  private async startDevice(
    artifact: ListenerArtifact,
    deps: ListenerStartDeps,
  ): Promise<ServiceRuntimeStatus> {
    if (!deps.adb || !deps.serial) {
      this.status = {
        running: false,
        label: 'Idle',
        error: 'No emulator serial. Start a device from Emulator first.',
      };
      this.listenerId = null;
      return this.status;
    }

    this.deviceProxy = deps.deviceProxy;
    await deps.deviceProxy.ensureForDevice(deps.adb, deps.serial);
    await deps.deviceProxy.armRule({
      id: artifact.id,
      kind: 'listen',
      stage: 'response',
      method: this.filterMethod,
      match: 'contains',
      url: this.filterUrl,
      headerName: '',
      headerValue: '',
      bodyContains: '',
      action: 'passthrough',
      setHeaders: '[]',
      removeHeaders: '[]',
      setBody: '',
      mockStatus: 200,
      mockBody: '{}',
    });

    this.proxyHitHandler = (hit) => {
      if (hit.ruleId !== artifact.id)
        return;
      if (!statusMatches(this.filterStatus, hit.status))
        return;
      this.emitHit({
        listenerId: artifact.id,
        method: hit.method,
        url: hit.url,
        status: hit.status,
        body: hit.body,
        headers: hit.headers,
        requestHeaders: hit.requestHeaders,
        requestBody: hit.requestBody,
        at: hit.at,
      });
    };
    deps.deviceProxy.addHitListener(this.proxyHitHandler);

    this.status = { running: true, label: artifact.name, error: null };
    return this.status;
  }

  private findReusableE2eWindow(): BrowserWindow | null {
    const e2eSession = session.fromPartition(E2E_PARTITION);
    return (
      BrowserWindow.getAllWindows().find(
        (win) => !win.isDestroyed() && win.webContents.session === e2eSession,
      ) ?? null
    );
  }

  /** Stops the listener when the capture browser window is closed by the user. */
  private watchBrowserWindow(win: BrowserWindow): void {
    win.on('closed', () => {
      if (this.window !== win)
        return;
      this.window = null;
      this.ownsWindow = false;
      this.networkAttached = false;
      this.networkPending.clear();
      const wasRunning = this.listenerId !== null;
      this.listenerId = null;
      this.status = { running: false, label: 'Idle', error: null };
      if (wasRunning)
        this.onStopped?.();
    });
  }

  private async attachNetwork(): Promise<void> {
    const win = this.window;
    if (!win || win.isDestroyed())
      throw new Error('Listener browser window missing');
    if (this.networkAttached)
      return;
    try {
      if (!win.webContents.debugger.isAttached())
        win.webContents.debugger.attach('1.3');
    } catch {
      // Already attached (e.g. Flow E2E) — reuse the session.
    }
    await win.webContents.debugger.sendCommand('Network.enable').catch(() => undefined);
    win.webContents.debugger.on('message', this.onNetworkMessage);
    this.networkAttached = true;
  }

  private detachNetwork(): void {
    const win = this.window;
    if (win && !win.isDestroyed() && this.networkAttached) {
      win.webContents.debugger.removeListener('message', this.onNetworkMessage);
    }
    this.networkAttached = false;
    this.networkPending.clear();
  }

  private readonly onNetworkMessage = (_event: unknown, method: string, params: unknown): void => {
      detach('listeners:network', this.handleNetworkMessage(method, params as Record<string, unknown>));
  };

  private async handleNetworkMessage(method: string, params: Record<string, unknown>): Promise<void> {
    const win = this.window;
    if (!win || win.isDestroyed() || !this.listenerId)
      return;
    if (method === 'Network.requestWillBeSent') {
      const request = params['request'] as
        | {
            method?: string;
            url?: string;
            headers?: Record<string, string>;
            postData?: string;
          }
        | undefined;
      const requestId = String(params['requestId'] ?? '');
      if (!requestId)
        return;
      const type = typeof params['type'] === 'string' ? params['type'] : '';
      this.networkPending.set(requestId, {
        method: request?.method ?? 'GET',
        url: request?.url ?? '',
        requestHeaders: lowerHeaderRecord(request?.headers ?? {}),
        requestBody: typeof request?.postData === 'string' ? request.postData.slice(0, BODY_PREVIEW_LIMIT) : '',
        resourceType: type,
      });
      return;
    }
    if (method !== 'Network.responseReceived')
      return;
    const requestId = String(params['requestId'] ?? '');
    const pending = this.networkPending.get(requestId);
    if (!pending)
      return;
    this.networkPending.delete(requestId);
    const response = params['response'] as
      | { status?: number; headers?: Record<string, string> }
      | undefined;
    const status = response?.status ?? 0;
    if (!this.matchesFilters(pending.method, pending.url, status))
      return;
    const type =
      (typeof params['type'] === 'string' && params['type']) || pending.resourceType || undefined;

    let body = '';
    try {
      const payload = (await win.webContents.debugger.sendCommand('Network.getResponseBody', {
        requestId,
      })) as { body?: string; base64Encoded?: boolean };
      body =
        payload.base64Encoded && payload.body
          ? Buffer.from(payload.body, 'base64').toString('utf8')
          : (payload.body ?? '');
    } catch {
      body = '';
    }
    let requestBody = pending.requestBody;
    if (!requestBody) {
      try {
        const payload = (await win.webContents.debugger.sendCommand('Network.getRequestPostData', {
          requestId,
        })) as { postData?: string };
        requestBody = (payload.postData ?? '').slice(0, BODY_PREVIEW_LIMIT);
      } catch {
        requestBody = '';
      }
    }

    this.emitHit({
      listenerId: this.listenerId,
      method: pending.method,
      url: pending.url,
      status,
      body: body.slice(0, BODY_PREVIEW_LIMIT),
      headers: lowerHeaderRecord(response?.headers ?? {}),
      requestHeaders: pending.requestHeaders,
      requestBody,
      at: Date.now(),
      resourceType: type,
    });
  }

  private matchesFilters(method: string, url: string, status: number): boolean {
    if (!statusMatches(this.filterStatus, status))
      return false;
    return flowHttpHitMatches(
      { method, url },
      { method: this.filterMethod, match: 'contains', url: this.filterUrl },
    );
  }

  private emitHit(event: ListenerHitEvent): void {
    this.onHit?.(event);
  }
}
