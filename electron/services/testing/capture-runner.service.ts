import { BrowserWindow, session, type Session } from 'electron';
import { randomUUID } from 'node:crypto';

import type { CaptureLogEntry, CaptureRuntimeStatus, CaptureStartOptions } from '../../../shared/testing';
import { captureLogEntrySchema, captureStartOptionsSchema } from '../../../shared/testing';
import { appIconBrowserWindowOptions } from '../../config/app-icon';

import { CaptureCdpNetwork } from './capture-cdp-network';

const MAX_LIVE_ENTRIES = 400;

type MainWindowProvider = () => BrowserWindow | null;

/**
 * HTTP capture via a dedicated BrowserWindow and CDP Network domain (includes response bodies).
 */
export class CaptureRunner {
  private captureWindow: BrowserWindow | null = null;
  private captureSession: Session | null = null;
  private getMainWindow: MainWindowProvider | null = null;

  private activeCaptureItemId: string | null = null;
  private activeRunId: string | null = null;

  private readonly entries: CaptureLogEntry[] = [];
  private readonly cdpNetwork: CaptureCdpNetwork;

  constructor() {
    this.cdpNetwork = new CaptureCdpNetwork(
      () => this.activeCaptureItemId,
      (entry) => this.pushEntry(entry),
    );
  }

  setMainWindowProvider(provider: MainWindowProvider): void {
    this.getMainWindow = provider;
  }

  status(): CaptureRuntimeStatus {
    return {
      running: !!this.captureWindow && !this.captureWindow.isDestroyed(),
      captureItemId: this.activeCaptureItemId,
      runId: this.activeRunId,
    };
  }

  listEntries(captureItemId?: string): readonly CaptureLogEntry[] {
    if (!captureItemId) {
      return [...this.entries];
    }
    return this.entries.filter((e) => e.captureItemId === captureItemId);
  }

  clearEntries(captureItemId?: string): void {
    if (!captureItemId) {
      this.entries.length = 0;
      return;
    }
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]?.captureItemId === captureItemId) {
        this.entries.splice(i, 1);
      }
    }
  }

  async start(raw: unknown): Promise<CaptureRuntimeStatus> {
    const opts = captureStartOptionsSchema.parse(raw);
    if (this.captureWindow && !this.captureWindow.isDestroyed()) {
      return {
        running: true,
        captureItemId: this.activeCaptureItemId,
        runId: this.activeRunId,
        error: 'Capture already running. Stop the current session first.',
      };
    }

    const runId = randomUUID();
    this.activeRunId = runId;
    this.activeCaptureItemId = opts.captureItemId;

    const initialUrl =
      typeof opts.startUrl === 'string' && opts.startUrl.trim()
        ? opts.startUrl.trim()
        : 'about:blank';

    const partitionId = `persist:testrix-capture-${runId}`;
    const capSession = session.fromPartition(partitionId);
    this.captureSession = capSession;

    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      show: true,
      title: 'Testrix — Capture',
      autoHideMenuBar: true,
      ...appIconBrowserWindowOptions(),
      webPreferences: {
        session: capSession,
        // CDP attach is unreliable with sandbox on some Electron builds (E2E uses false).
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.captureWindow = win;
    win.setMenuBarVisibility(false);

    win.on('closed', () => {
      this.cdpNetwork.detach();
      this.captureWindow = null;
      this.captureSession = null;
      this.activeRunId = null;
      this.activeCaptureItemId = null;
      this.broadcastStatus();
    });

    try {
      // Load first — attaching CDP before navigation can leave a blank capture window (Electron).
      await win.loadURL(initialUrl);
    } catch (error: unknown) {
      this.stopWindow();
      const message = error instanceof Error ? error.message : String(error);
      return { running: false, error: message };
    }

    try {
      await this.cdpNetwork.attach(win.webContents);
    } catch {
      // Page still works; response bodies may be missing until capture is restarted.
    }

    this.broadcastStatus();
    return this.status();
  }

  stop(): CaptureRuntimeStatus {
    this.stopWindow();
    this.broadcastStatus();
    return this.status();
  }

  private stopWindow(): void {
    this.cdpNetwork.detach();
    if (!this.captureWindow || this.captureWindow.isDestroyed()) {
      this.captureWindow = null;
      this.captureSession = null;
      this.activeRunId = null;
      this.activeCaptureItemId = null;
      return;
    }
    try {
      this.captureWindow.close();
    } catch {
      // ignore
    }
    this.captureWindow = null;
    this.captureSession = null;
    this.activeRunId = null;
    this.activeCaptureItemId = null;
  }

  private broadcastStatus(): void {
    this.broadcast('testing:captureStatus', this.status());
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
        if (this.captureWindow && win === this.captureWindow) {
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

  private pushEntry(entry: CaptureLogEntry): void {
    const parsed = captureLogEntrySchema.parse(entry);
    this.entries.push(parsed);
    if (this.entries.length > MAX_LIVE_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_LIVE_ENTRIES);
    }
    this.broadcast('testing:captureEntry', parsed);
  }
}
