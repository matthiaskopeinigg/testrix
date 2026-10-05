import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  browserOpenUrlCandidates,
  flattenServiceTree,
  flowHttpHitMatches,
  interpolateFlow,
  isAbortedNavigationError,
  isDnsOrHostLoadError,
  isUsableBrowserPageUrl,
  newInterceptActivityId,
  type InterceptFile,
  type InterceptHitEvent,
  type InterceptNode,
  type ServiceRuntimeStatus,
} from '@testrix/contracts';
import { applyWindowIcon, windowIconOption } from '@testrix/electron-core';

import { detach } from '../../lifecycle';
interface PausedRequest {
  readonly requestId: string;
  readonly url: string;
}

interface InterceptHitRecord {
  readonly method: string;
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: string;
  readonly url: string;
  readonly at: number;
}

const MAX_INTERCEPT_HITS = 64;

type InterceptArtifact = Extract<InterceptNode, { kind: 'artifact' }>;

/**
 * Embedded BrowserWindow + CDP Fetch interception for workbench Browser mode
 * and Flow browser fallback.
 */
export class InterceptHost {
  private window: BrowserWindow | null = null;
  private status: ServiceRuntimeStatus = { running: false, label: 'Idle', error: null };
  private onHit: ((event: InterceptHitEvent) => void) | null = null;
  private onStopped: (() => void) | null = null;
  private file: InterceptFile | null = null;
  private envVars: Record<string, string> = {};
  private hits: InterceptHitRecord[] = [];

  bind(listener: ((event: InterceptHitEvent) => void) | null): void {
    this.onHit = listener;
  }

  /** Fired when the browser window is closed by the user (not via stop()). */
  bindStopped(listener: (() => void) | null): void {
    this.onStopped = listener;
  }

  snapshot(): ServiceRuntimeStatus {
    return this.status;
  }

  /**
   * Newest intercept hit matching method + URL filter.
   * Passing a string is treated as contains-URL (legacy).
   */
  latestHit(
    filter:
      | string
      | { readonly method?: string; readonly match?: string; readonly url?: string } = '',
  ): InterceptHitRecord | null {
    const resolved =
      typeof filter === 'string'
        ? { method: '*', match: 'contains', url: filter.replace(/^\*\*/, '').replace(/\*\*$/, '') }
        : filter;
    for (let i = this.hits.length - 1; i >= 0; i -= 1) {
      const hit = this.hits[i];
      if (!hit)
        continue;
      if (flowHttpHitMatches(hit, resolved))
        return hit;
    }
    return null;
  }

  /**
   * Opens a BrowserWindow and arms Fetch.requestPaused for enabled rules.
   */
  async start(
    file: InterceptFile,
    startUrl: string,
    envVars: Record<string, string> = {},
    label = 'Intercepting',
  ): Promise<ServiceRuntimeStatus> {
    await this.stop();
    this.hits = [];
    const candidates = browserOpenUrlCandidates(startUrl.trim() || 'http://127.0.0.1/');
    if (candidates.length === 0) {
      this.status = { running: false, label: 'Idle', error: 'Start URL is empty' };
      return this.status;
    }
    this.file = file;
    this.envVars = envVars;
    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      show: true,
      title: `Testrix Interceptor · ${label}`,
      autoHideMenuBar: true,
      ...windowIconOption(),
      webPreferences: {
        partition: 'persist:testrix-intercept',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    this.window = win;
    applyWindowIcon(win);
    try {
      win.webContents.debugger.attach('1.3');
    } catch (error) {
      this.status = {
        running: false,
        label: 'Idle',
        error: error instanceof Error ? error.message : 'CDP attach failed',
      };
      win.close();
      this.window = null;
      return this.status;
    }
    await win.webContents.debugger.sendCommand('Fetch.enable', {
      patterns: [
        { urlPattern: '*', requestStage: 'Request' },
        { urlPattern: '*', requestStage: 'Response' },
      ],
    });
    win.webContents.debugger.on('message', (_event, method, params) => {
      if (method !== 'Fetch.requestPaused')
        return;
      detach(
        'intercept:paused',
        this.onPaused(
          params as PausedRequest & {
            request?: { url?: string; method?: string; headers?: Record<string, string>; postData?: string };
            responseStatusCode?: number;
            responseHeaders?: readonly { name?: string; value?: string }[];
          },
        ),
      );
    });
    win.on('closed', () => {
      if (this.window !== win)
        return;
      this.window = null;
      this.file = null;
      this.envVars = {};
      const wasRunning = this.status.running;
      this.status = { running: false, label: 'Idle', error: null };
      if (wasRunning)
        this.onStopped?.();
    });
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
    this.status = { running: true, label, error: null };
    return this.status;
  }

  async stop(): Promise<ServiceRuntimeStatus> {
    const win = this.window;
    this.window = null;
    this.file = null;
    this.envVars = {};
    if (win && !win.isDestroyed()) {
      try {
        if (win.webContents.debugger.isAttached())
          win.webContents.debugger.detach();
      } catch {
        /* already detached */
      }
      win.close();
    }
    this.status = { running: false, label: 'Idle', error: null };
    return this.status;
  }

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
      if (isUsableBrowserPageUrl(win.webContents.getURL()))
        return;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load ${url}: ${message}`);
    }
    if (win.isDestroyed())
      throw new Error('Interceptor window closed while loading');
    if (!isUsableBrowserPageUrl(win.webContents.getURL()))
      throw new Error(`Open stayed on blank after loading ${url}`);
  }

  private async onPaused(
    params: PausedRequest & {
      request?: { url?: string; method?: string; headers?: Record<string, string>; postData?: string };
      responseStatusCode?: number;
      responseHeaders?: readonly { name?: string; value?: string }[];
    },
  ): Promise<void> {
    const win = this.window;
    if (!win || win.isDestroyed() || !this.file)
      return;
    const url = params.request?.url ?? params.url ?? '';
    const method = params.request?.method ?? 'GET';
    const requestId = params.requestId;
    const requestHeaders = params.request?.headers ?? {};
    const requestBody = params.request?.postData ?? '';
    const rules = flattenServiceTree(this.file.items).filter(
      (item): item is InterceptArtifact => item.kind === 'artifact',
    );
    const rule = rules.find((item) => this.ruleMatches(item, method, url));
    if (!rule) {
      await win.webContents.debugger.sendCommand('Fetch.continueRequest', { requestId });
      return;
    }
    const at = Date.now();
    if (rule.action === 'block') {
      this.emitHit(rule.id, {
        method,
        url,
        status: 0,
        body: '',
        headers: {},
        requestHeaders,
        requestBody,
        action: rule.action,
        at,
      });
      await win.webContents.debugger.sendCommand('Fetch.failRequest', {
        requestId,
        errorReason: 'BlockedByClient',
      });
      return;
    }
    if (rule.action === 'mock') {
      const mockBody = interpolateFlow(rule.mockBody || '{}', this.envVars);
      const headers = { 'content-type': 'application/json' };
      this.emitHit(rule.id, {
        method,
        url,
        status: rule.mockStatus,
        body: mockBody,
        headers,
        requestHeaders,
        requestBody,
        action: rule.action,
        at,
      });
      await win.webContents.debugger.sendCommand('Fetch.fulfillRequest', {
        requestId,
        responseCode: rule.mockStatus,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(mockBody).toString('base64'),
      });
      return;
    }
    const status = typeof params.responseStatusCode === 'number' ? params.responseStatusCode : 0;
    const headers = headerListToRecord(params.responseHeaders);
    this.emitHit(rule.id, {
      method,
      url,
      status,
      body: '',
      headers,
      requestHeaders,
      requestBody,
      action: rule.action,
      at,
    });
    await win.webContents.debugger.sendCommand('Fetch.continueRequest', { requestId });
  }

  private emitHit(
    ruleId: string,
    hit: {
      readonly method: string;
      readonly url: string;
      readonly status: number;
      readonly body: string;
      readonly headers: Readonly<Record<string, string>>;
      readonly requestHeaders: Readonly<Record<string, string>>;
      readonly requestBody: string;
      readonly action: string;
      readonly at: number;
    },
  ): void {
    this.recordHit(hit);
    this.onHit?.({
      id: newInterceptActivityId(hit.at),
      ruleId,
      url: hit.url,
      method: hit.method,
      status: hit.status,
      action: hit.action,
      body: hit.body,
      requestBody: hit.requestBody,
      headers: hit.headers,
      requestHeaders: hit.requestHeaders,
      at: hit.at,
    });
  }

  private ruleMatches(item: InterceptArtifact, method: string, url: string): boolean {
    const pattern = interpolateFlow(item.url || item.matchUrl || '', this.envVars);
    return flowHttpHitMatches(
      { method, url },
      {
        method: interpolateFlow(item.method || '*', this.envVars) || '*',
        match: item.match || 'contains',
        url: pattern,
      },
    );
  }

  private recordHit(hit: Omit<InterceptHitRecord, 'at'> & { readonly at?: number }): void {
    this.hits.push({ ...hit, at: hit.at ?? Date.now() });
    if (this.hits.length > MAX_INTERCEPT_HITS)
      this.hits.splice(0, this.hits.length - MAX_INTERCEPT_HITS);
  }

  nextId(): string {
    return randomUUID();
  }
}

function headerListToRecord(
  list: readonly { name?: string; value?: string }[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!list)
    return out;
  for (const item of list) {
    const name = item.name?.trim();
    if (!name)
      continue;
    out[name.toLowerCase()] = item.value ?? '';
  }
  return out;
}
