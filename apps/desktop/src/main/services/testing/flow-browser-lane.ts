import { BrowserWindow, session } from 'electron';
import { flowHttpHitMatches } from '@testrix/contracts';
import { applyWindowIcon, attachOpenWebCspPassthrough, windowIconOption } from '@testrix/electron-core';

import { detach } from '../../lifecycle';
import { BODY_PREVIEW_LIMIT, lowerHeaderRecord, sleep } from './flow-host-helpers';

/** What a lane needs from the host that runs it. */
export interface BrowserLaneOwner {
  readonly e2eWindowVisible: boolean;
  trackWindow(win: BrowserWindow): void;
  markIntentionalClose(win: BrowserWindow): void;
  activeWindowCount(): number;
}

export const E2E_PARTITION = 'persist:testrix-e2e';

let e2eCspPassthroughAttached = false;

function ensureE2eOpenWebSession(): void {
  if (e2eCspPassthroughAttached)
    return;
  e2eCspPassthroughAttached = true;
  attachOpenWebCspPassthrough(session.fromPartition(E2E_PARTITION));
}

export interface BrowserNetworkHit {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: string;
  readonly at: number;
}

interface PendingNetworkRequest {
  readonly method: string;
  readonly url: string;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: string;
}

/**
 * One browser lane. Parallel branches fork a new window on the same partition,
 * so cookies and storage are shared while the pages stay independent.
 */
export class BrowserLane {
  private window: BrowserWindow | null = null;
  private actionLabel = 'Ready';
  /** When true, keyboard reach the page so automation typing is visible. */
  private allowInput = false;
  private networkHits: BrowserNetworkHit[] = [];
  private networkPending = new Map<string, PendingNetworkRequest>();
  private networkAttached = false;

  setInputAllowed(allowed: boolean): void {
    this.allowInput = allowed;
  }

  constructor(
    private readonly owner: BrowserLaneOwner,
    private readonly seedUrl: string | null,
  ) {}

  async ensure(
    width = 1100,
    height = 800,
    options: { readonly visible?: boolean } = {},
  ): Promise<BrowserWindow> {
    const visible = options.visible ?? this.owner.e2eWindowVisible;
    if (this.window && !this.window.isDestroyed()) {
      if (visible)
        this.window.show();
      else
        this.window.hide();
      return this.window;
    }
    // Create hidden — reveal only after a real page loads so users never sit on a white blank.
    ensureE2eOpenWebSession();
    const win = new BrowserWindow({
      width,
      height,
      show: false,
      title: 'Testrix E2E',
      autoHideMenuBar: true,
      ...windowIconOption(),
      webPreferences: {
        partition: E2E_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Parallel lanes park windows in the background; throttling freezes page JS
        // so wait/assert executeJavaScript never returns and timeouts never fire.
        backgroundThrottling: false,
      },
    });
    this.window = win;
    applyWindowIcon(win);
    this.owner.trackWindow(win);
    win.webContents.setBackgroundThrottling(false);
    this.lockInput(win);
    win.webContents.on('did-finish-load', () => {
      detach('flows:inject-guard', this.injectGuard(win));
    });
    win.webContents.on('dom-ready', () => {
      detach('flows:inject-guard', this.injectGuard(win));
    });
    if (this.seedUrl) {
      try {
        await win.loadURL(this.seedUrl);
      } catch {
        // Seed is best-effort; the next Open / action may navigate again.
      }
      await this.setAction(this.actionLabel);
      if (visible && !win.isDestroyed())
        win.show();
    }
    return win;
  }

  current(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  url(): string | null {
    return this.current()?.webContents.getURL() ?? null;
  }

  /** A child lane starts at whatever page this lane is showing. */
  fork(owner: BrowserLaneOwner): BrowserLane {
    return new BrowserLane(owner, this.url());
  }

  /** Close this lane's window without cancelling the flow run. */
  close(): void {
    this.detachNetwork();
    const win = this.window;
    this.window = null;
    if (!win || win.isDestroyed())
      return;
    this.owner.markIntentionalClose(win);
    win.close();
  }

  /**
   * Start CDP Network capture so HTTP listener nodes can observe UI requests.
   */
  async ensureNetworkCapture(): Promise<void> {
    const win = await this.ensure();
    if (this.networkAttached)
      return;
    try {
      if (!win.webContents.debugger.isAttached())
        win.webContents.debugger.attach('1.3');
    } catch {
      // Already attached by another tool (picker) — reuse the session.
    }
    await win.webContents.debugger.sendCommand('Network.enable').catch(() => undefined);
    win.webContents.debugger.on('message', this.onNetworkMessage);
    this.networkAttached = true;
  }

  /** Newest browser hit matching method + URL filter after `since` (ms epoch). */
  latestNetworkHit(
    filter: { readonly method?: string; readonly match?: string; readonly url?: string },
    since = 0,
  ): BrowserNetworkHit | null {
    for (let i = this.networkHits.length - 1; i >= 0; i -= 1) {
      const hit = this.networkHits[i];
      if (!hit || hit.at < since)
        continue;
      if (flowHttpHitMatches(hit, filter))
        return hit;
    }
    return null;
  }

  async waitForNetworkHit(
    filter: { readonly method?: string; readonly match?: string; readonly url?: string },
    waitMs: number,
    signal: AbortSignal,
    since: number,
  ): Promise<BrowserNetworkHit | null> {
    const deadline = Date.now() + Math.max(0, waitMs);
    while (Date.now() <= deadline) {
      if (signal.aborted)
        throw new Error('cancelled');
      const hit = this.latestNetworkHit(filter, since);
      if (hit)
        return hit;
      await sleep(50, signal);
    }
    return this.latestNetworkHit(filter, since);
  }

  private readonly onNetworkMessage = (_event: unknown, method: string, params: unknown): void => {
      detach('flows:network', this.handleNetworkMessage(method, params as Record<string, unknown>));
  };

  private async handleNetworkMessage(method: string, params: Record<string, unknown>): Promise<void> {
    const win = this.current();
    if (!win)
      return;
    if (method === 'Network.requestWillBeSent') {
      const request = params['request'] as
        | {
            method?: string;
            url?: string;
            headers?: Record<string, string>;
            postData?: string;
            hasPostData?: boolean;
          }
        | undefined;
      const requestId = String(params['requestId'] ?? '');
      if (!requestId)
        return;
      this.networkPending.set(requestId, {
        method: request?.method ?? 'GET',
        url: request?.url ?? '',
        requestHeaders: lowerHeaderRecord(request?.headers ?? {}),
        requestBody: typeof request?.postData === 'string' ? request.postData.slice(0, BODY_PREVIEW_LIMIT) : '',
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
    this.networkHits.push({
      method: pending.method,
      url: pending.url,
      status: response?.status ?? 0,
      body: body.slice(0, BODY_PREVIEW_LIMIT),
      headers: lowerHeaderRecord(response?.headers ?? {}),
      requestHeaders: pending.requestHeaders,
      requestBody,
      at: Date.now(),
    });
    if (this.networkHits.length > 64)
      this.networkHits.splice(0, this.networkHits.length - 64);
  }

  private detachNetwork(): void {
    const win = this.window;
    if (win && !win.isDestroyed() && this.networkAttached) {
      win.webContents.debugger.removeListener('message', this.onNetworkMessage);
    }
    this.networkAttached = false;
    this.networkPending.clear();
    this.networkHits = [];
  }

  reveal(): void {
    if (!this.owner.e2eWindowVisible)
      return;
    const win = this.current();
    if (!win)
      return;
    const url = win.webContents.getURL();
    // Never flash an empty shell — Open must finish navigating first.
    if (!url || url === 'about:blank')
      return;
    if (win.isMinimized())
      win.restore();
    win.show();
    // Multiple parallel windows: don't steal focus — that serializes automation.
    if (this.owner.activeWindowCount() <= 1) {
      win.focus();
      win.moveTop();
    }
  }

  async setAction(label: string): Promise<void> {
    this.actionLabel = label;
    const win = this.current();
    if (!win)
      return;
    win.setTitle(`Testrix E2E · ${label}`);
    const url = win.webContents.getURL();
    if (!url || url === 'about:blank')
      return;
    await this.injectGuard(win);
  }

  async withGuardHidden<T>(run: () => Promise<T>): Promise<T> {
    const win = this.current();
    if (!win)
      return run();
    await win.webContents.executeJavaScript(
      `(() => {
        const banner = document.getElementById('tx-e2e-guard-banner');
        const ring = document.getElementById('tx-e2e-target');
        if (banner) banner.style.display = 'none';
        if (ring) ring.style.display = 'none';
      })()`,
    ).catch(() => undefined);
    try {
      return await run();
    } finally {
      await this.injectGuard(win).catch(() => undefined);
    }
  }

  async withAutomation<T>(run: () => Promise<T>): Promise<T> {
    const win = this.current();
    this.allowInput = true;
    if (win && !win.isDestroyed()) {
      await win.webContents.executeJavaScript('window.__txE2ePass = true').catch(() => undefined);
    }
    try {
      return await run();
    } finally {
      this.allowInput = false;
      if (win && !win.isDestroyed()) {
        await win.webContents.executeJavaScript('window.__txE2ePass = false').catch(() => undefined);
      }
    }
  }

  private lockInput(win: BrowserWindow): void {
    win.webContents.setIgnoreMenuShortcuts(true);
    win.webContents.on('before-input-event', (event, input) => {
      if (this.allowInput)
        return;
      if (input.type === 'keyDown' || input.type === 'keyUp' || input.type === 'char')
        event.preventDefault();
    });
  }

  /**
   * Status banner + page-side input lock. User events are blocked unless
   * `__txE2ePass` is set during automation so real mouse/keyboard still paint.
   */
  private async injectGuard(win: BrowserWindow): Promise<void> {
    if (win.isDestroyed())
      return;
    const url = win.webContents.getURL();
    if (!url || url === 'about:blank')
      return;
    const label = JSON.stringify(this.actionLabel);
    await win.webContents.executeJavaScript(`(() => {
      const LABEL = ${label};
      if (!window.__txE2eLockInstalled) {
        window.__txE2eLockInstalled = true;
        window.__txE2ePass = false;
        const block = (event) => {
          if (window.__txE2ePass || window.__txE2ePick)
            return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        };
        for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'contextmenu', 'wheel', 'touchstart', 'touchend', 'dragstart']) {
          window.addEventListener(type, block, true);
        }
      }

      let banner = document.getElementById('tx-e2e-guard-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'tx-e2e-guard-banner';
        banner.setAttribute('aria-live', 'polite');
        banner.style.cssText = [
          'position:fixed',
          'left:12px',
          'right:12px',
          'top:12px',
          'z-index:2147483646',
          'display:flex',
          'align-items:center',
          'gap:10px',
          'padding:10px 14px',
          'border-radius:10px',
          'background:rgba(12,14,18,0.92)',
          'color:#f4f6f8',
          'font:650 13px/1.35 system-ui,sans-serif',
          'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
          'pointer-events:none',
          'letter-spacing:0.01em',
        ].join(';');
        const pulse = document.createElement('span');
        pulse.style.cssText = [
          'width:8px',
          'height:8px',
          'border-radius:999px',
          'background:#e85d8a',
          'box-shadow:0 0 0 4px rgba(232,93,138,0.25)',
          'flex-shrink:0',
        ].join(';');
        const text = document.createElement('span');
        text.id = 'tx-e2e-guard-text';
        banner.appendChild(pulse);
        banner.appendChild(text);
        (document.body || document.documentElement).appendChild(banner);
      }
      banner.style.display = 'flex';
      const text = document.getElementById('tx-e2e-guard-text');
      if (text) text.textContent = 'Running: ' + LABEL;
    })()`).catch(() => undefined);
  }
}
