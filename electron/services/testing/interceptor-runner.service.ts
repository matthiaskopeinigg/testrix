import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import { BrowserWindow, session, type Debugger } from 'electron';

import type {
  InterceptorFile,
  InterceptorHit,
  InterceptorRule,
  InterceptorRuntimeStatus,
} from '../../../shared/testing';
import {
  interceptorHitSchema,
  interceptorRuntimeStatusSchema,
  interceptorStartOptionsSchema,
} from '../../../shared/testing';
import { urlPatternMatches } from '../../../shared/testing/url-pattern-match';
import { appIconBrowserWindowOptions } from '../../config/app-icon';

import type { ConfigFileService } from '../config/config-file.service';

const MAX_HITS = 200;

type MainWindowProvider = () => BrowserWindow | null;

/**
 * Collects enabled rules in tree order (depth-first).
 */
export function collectEnabledInterceptorRules(
  items: InterceptorFile['items'],
): readonly InterceptorRule[] {
  const out: InterceptorRule[] = [];
  const walk = (list: InterceptorFile['items']): void => {
    for (const item of list) {
      if ('matchUrl' in item) {
        if (item.enabled) {
          out.push(item);
        }
      } else {
        walk(item.children);
      }
    }
  };
  walk(items);
  return out;
}

/**
 * HTTP interceptor via a dedicated BrowserWindow and CDP Fetch (mock / block / proxy rules).
 */
export class InterceptorRunner {
  private interceptorWindow: BrowserWindow | null = null;
  private getMainWindow: MainWindowProvider | null = null;
  private rules: readonly InterceptorRule[] = [];
  private cdpAttached = false;
  private readonly hits: InterceptorHit[] = [];

  constructor(private readonly files: ConfigFileService) {}

  setMainWindowProvider(provider: MainWindowProvider): void {
    this.getMainWindow = provider;
  }

  setFile(file: InterceptorFile): void {
    this.rules = collectEnabledInterceptorRules(file.items);
  }

  status(): InterceptorRuntimeStatus {
    return interceptorRuntimeStatusSchema.parse({
      running: !!this.interceptorWindow && !this.interceptorWindow.isDestroyed(),
    });
  }

  listHits(): readonly InterceptorHit[] {
    return [...this.hits];
  }

  clearHits(): void {
    this.hits.length = 0;
  }

  async start(raw: unknown): Promise<InterceptorRuntimeStatus> {
    const opts = interceptorStartOptionsSchema.parse(raw ?? {});
    if (this.interceptorWindow && !this.interceptorWindow.isDestroyed()) {
      return interceptorRuntimeStatusSchema.parse({
        running: true,
        error: 'Interceptor already running. Stop it first.',
      });
    }

    const file = await this.files.readInterceptor();
    this.rules = collectEnabledInterceptorRules(file.items);

    const startUrl =
      typeof opts.startUrl === 'string' && opts.startUrl.trim()
        ? opts.startUrl.trim()
        : file.startUrl?.trim() || 'about:blank';

    const runId = randomUUID();
    const partitionId = `persist:testrix-interceptor-${runId}`;
    const intSession = session.fromPartition(partitionId);

    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      show: true,
      title: 'Testrix — Interceptor',
      autoHideMenuBar: true,
      ...appIconBrowserWindowOptions(),
      webPreferences: {
        session: intSession,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.interceptorWindow = win;
    win.setMenuBarVisibility(false);

    win.on('closed', () => {
      void this.detachCdp();
      this.interceptorWindow = null;
      this.broadcastStatus();
    });

    try {
      await win.loadURL(startUrl);
    } catch (error: unknown) {
      this.stopWindow();
      const message = error instanceof Error ? error.message : String(error);
      return interceptorRuntimeStatusSchema.parse({ running: false, error: message });
    }

    try {
      await this.attachCdp(win);
    } catch (error: unknown) {
      this.stopWindow();
      const message = error instanceof Error ? error.message : String(error);
      return interceptorRuntimeStatusSchema.parse({ running: false, error: message });
    }

    this.broadcastStatus();
    return this.status();
  }

  stop(): InterceptorRuntimeStatus {
    this.stopWindow();
    this.broadcastStatus();
    return this.status();
  }

  private stopWindow(): void {
    void this.detachCdp();
    if (!this.interceptorWindow || this.interceptorWindow.isDestroyed()) {
      this.interceptorWindow = null;
      return;
    }
    try {
      this.interceptorWindow.close();
    } catch {
      // ignore
    }
    this.interceptorWindow = null;
  }

  private debuggerForWindow(win: BrowserWindow): Debugger {
    return win.webContents.debugger;
  }

  private async attachCdp(win: BrowserWindow): Promise<void> {
    const dbg = this.debuggerForWindow(win);
    if (!dbg.isAttached()) {
      dbg.attach('1.3');
    }
    dbg.removeAllListeners('message');
    dbg.on('message', async (_event, method, params) => {
      if (method !== 'Fetch.requestPaused') {
        return;
      }
      await this.handleFetchPaused(dbg, params as FetchRequestPausedParams);
    });
    await dbg.sendCommand('Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }],
    });
    this.cdpAttached = true;
  }

  private async detachCdp(): Promise<void> {
    const win = this.interceptorWindow;
    if (!win || win.isDestroyed()) {
      this.cdpAttached = false;
      return;
    }
    const dbg = this.debuggerForWindow(win);
    if (dbg.isAttached()) {
      try {
        if (this.cdpAttached) {
          await dbg.sendCommand('Fetch.disable');
        }
      } catch {
        // ignore
      }
      try {
        dbg.removeAllListeners('message');
        dbg.detach();
      } catch {
        // ignore
      }
    }
    this.cdpAttached = false;
  }

  private findMatchingRule(url: string): InterceptorRule | null {
    for (const rule of this.rules) {
      if (urlPatternMatches(url, rule.matchUrl)) {
        return rule;
      }
    }
    return null;
  }

  private async handleFetchPaused(
    dbg: Debugger,
    params: FetchRequestPausedParams,
  ): Promise<void> {
    const requestId = params.requestId;
    const req = params.request;
    if (!requestId || !req) {
      await this.continueRequest(dbg, requestId);
      return;
    }

    const url = req.url ?? '';
    const method = req.method ?? 'GET';
    const rule = this.findMatchingRule(url);
    if (!rule) {
      await this.continueRequest(dbg, requestId);
      return;
    }

    this.pushHit({
      at: new Date().toISOString(),
      ruleId: rule.id,
      ruleName: rule.name,
      action: rule.action,
      method,
      url,
    });

    if (rule.action === 'block') {
      await dbg
        .sendCommand('Fetch.failRequest', {
          requestId,
          errorReason: 'BlockedByClient',
        })
        .catch(() => {});
      return;
    }

    if (rule.action === 'mock') {
      const status = rule.mockStatus ?? 200;
      try {
        const { bodyBase64, contentType } = await buildInterceptorMockFulfill(rule.mockBody);
        const bodyBytes = Buffer.from(bodyBase64, 'base64');
        await dbg.sendCommand('Fetch.fulfillRequest', {
          requestId,
          responseCode: status,
          responseHeaders: [
            { name: 'Content-Type', value: contentType },
            { name: 'Content-Length', value: String(bodyBytes.length) },
          ],
          body: bodyBase64,
        });
      } catch {
        await this.continueRequest(dbg, requestId);
      }
      return;
    }

    await this.continueRequest(dbg, requestId);
  }

  private async continueRequest(dbg: Debugger, requestId: string | undefined): Promise<void> {
    if (!requestId) {
      return;
    }
    await dbg.sendCommand('Fetch.continueRequest', { requestId }).catch(() => {});
  }

  private pushHit(hit: InterceptorHit): void {
    const parsed = interceptorHitSchema.parse(hit);
    this.hits.push(parsed);
    if (this.hits.length > MAX_HITS) {
      this.hits.splice(0, this.hits.length - MAX_HITS);
    }
    this.broadcast('testing:interceptorHit', parsed);
  }

  private broadcastStatus(): void {
    this.broadcast('testing:interceptorStatus', this.status());
  }

  private broadcast(channel: string, payload: unknown): void {
    const targets: BrowserWindow[] = [];
    const main = this.getMainWindow?.();
    if (main && !main.isDestroyed()) {
      targets.push(main);
    } else {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win || win.isDestroyed()) {
          continue;
        }
        if (this.interceptorWindow && win === this.interceptorWindow) {
          continue;
        }
        targets.push(win);
      }
    }
    for (const win of targets) {
      try {
        win.webContents.send(channel, payload);
      } catch {
        // ignore
      }
    }
  }
}

type FetchRequestPausedParams = {
  readonly requestId?: string;
  readonly request?: {
    readonly url?: string;
    readonly method?: string;
  };
};
