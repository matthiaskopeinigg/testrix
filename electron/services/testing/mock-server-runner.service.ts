import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  appendMockHitToHistory,
  buildMockResponseSnapshot,
} from '../../../shared/history/append-mock-hit-to-history';
import {
  buildMockResponseHeaders,
  findMockEndpoint,
  parseIncomingMockRequest,
  parseMockRequestUrl,
  resolveMockResponseDelayMs,
  serializeMockResponseBody,
} from '../../../shared/testing/mock-server-match';
import {
  MOCK_SERVER_MISMATCH_BUFFER_MAX,
  mockServerMismatchRecordSchema,
  type MockServerFile,
  type MockServerMismatchRecord,
  type MockServerOptions,
} from '../../../shared/testing/mock-server.schema';

import { ConfigChannels } from '../../ipc/channels/config.channels';
import { TestingChannels } from '../../ipc/channels/testing.channels';
import type { ConfigFileService } from '../config/config-file.service';
import type { BrowserWindow } from 'electron';

const BODY_PREVIEW_MAX = 4_096;

export interface MockServerStatus {
  readonly running: boolean;
  readonly host: string;
  readonly port: number;
  readonly resolvedPort?: number;
  readonly startedAt?: string;
  readonly unmatchedCount: number;
}

type NotifyFn = (channel: string, payload: unknown) => void;

/**
 * In-process HTTP mock server with request matching and activity tracking.
 */
export class MockServerRunner {
  private server: http.Server | null = null;
  private file: MockServerFile | null = null;
  private resolvedPort: number | null = null;
  private startedAt: string | null = null;
  private unmatchedCount = 0;
  private readonly mismatches: MockServerMismatchRecord[] = [];
  private getMainWindow: (() => BrowserWindow | null) | null = null;

  constructor(private readonly files: ConfigFileService) {}

  /**
   * Registers a callback used to push events to the renderer main window.
   */
  setMainWindowProvider(provider: () => BrowserWindow | null): void {
    this.getMainWindow = provider;
  }

  /**
   * Reloads mock definitions from disk (e.g. after renderer save).
   */
  async reloadFromDisk(): Promise<void> {
    this.file = await this.files.readMockServer();
  }

  /**
   * Updates in-memory mock file while running.
   */
  setFile(file: MockServerFile): void {
    this.file = file;
  }

  status(): MockServerStatus {
    const options = this.file?.options;
    const host = options?.host ?? '127.0.0.1';
    const port =
      options?.port === 'auto'
        ? (this.resolvedPort ?? 0)
        : typeof options?.port === 'number'
          ? options.port
          : 9_876;
    return {
      running: this.server !== null,
      host,
      port,
      resolvedPort: this.resolvedPort ?? undefined,
      startedAt: this.startedAt ?? undefined,
      unmatchedCount: this.unmatchedCount,
    };
  }

  listMismatches(): readonly MockServerMismatchRecord[] {
    return this.mismatches;
  }

  clearMismatches(): void {
    this.mismatches.length = 0;
    this.unmatchedCount = 0;
  }

  async start(): Promise<MockServerStatus> {
    if (this.server) {
      return this.status();
    }
    this.file = await this.files.readMockServer();
    const options = this.file.options;
    const listenPort = options.port === 'auto' ? 0 : options.port;

    await new Promise<void>((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res, options);
      });
      this.server.on('error', reject);
      this.server.listen(listenPort, options.host, () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.resolvedPort = addr.port;
        }
        this.startedAt = new Date().toISOString();
        resolve();
      });
    });

    return this.status();
  }

  async stop(): Promise<MockServerStatus> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((err) => (err ? reject(err) : resolve()));
      });
      this.server = null;
    }
    this.resolvedPort = null;
    this.startedAt = null;
    this.clearMismatches();
    return this.status();
  }

  private notify(channel: string, payload: unknown): void {
    const win = this.getMainWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length <= BODY_PREVIEW_MAX) {
          resolve(buf.toString('utf8'));
          return;
        }
        resolve(buf.subarray(0, BODY_PREVIEW_MAX).toString('utf8'));
      });
      req.on('error', reject);
    });
  }

  private applyCors(
    res: ServerResponse,
    req: IncomingMessage,
    cors: MockServerOptions['cors'],
  ): void {
    if (!cors.enabled) {
      return;
    }
    const origin = req.headers.origin ?? cors.allowOrigin;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', cors.allowMethods);
    res.setHeader('Access-Control-Allow-Headers', cors.allowHeaders);
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    options: MockServerOptions,
  ): Promise<void> {
    const wallStart = Date.now();
    try {
      if (options.cors.enabled && req.method === 'OPTIONS') {
        this.applyCors(res, req, options.cors);
        res.writeHead(204);
        res.end();
        return;
      }

      const bodyText = await this.readRequestBody(req);
      const url = req.url ?? '/';
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') {
          headers[k] = v;
        } else if (Array.isArray(v)) {
          headers[k] = v.join(', ');
        }
      }

      const parsed = parseIncomingMockRequest({
        method: req.method ?? 'GET',
        url,
        headers,
        bodyText,
      });

      const items = this.file?.items ?? [];
      const endpoint = findMockEndpoint(items, parsed);

      if (!endpoint) {
        await this.handleMismatch(parsed, options, res, req, wallStart);
        return;
      }

      const response = endpoint.response;
      const delayMs = resolveMockResponseDelayMs(options, response);
      const { text } = serializeMockResponseBody(response.body);
      const responseHeaders = buildMockResponseHeaders(response);

      const send = (): void => {
        if (options.cors.enabled) {
          this.applyCors(res, req, options.cors);
        }
        for (const [key, value] of Object.entries(responseHeaders)) {
          res.setHeader(key, value);
        }
        res.writeHead(response.statusCode);
        res.end(text);
        void this.maybeCaptureHistory({
          request: parsed,
          statusCode: response.statusCode,
          responseText: text,
          responseHeaders,
          durationMs: Date.now() - wallStart,
          matched: true,
          endpointName: endpoint.name,
          options,
        });
        this.notify(TestingChannels.mockActivity, {
          type: 'match',
          endpointId: endpoint.id,
          method: parsed.method,
          url: parsed.url,
        });
      };

      if (delayMs > 0) {
        setTimeout(send, delayMs);
      } else {
        send();
      }
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'mock_server_error' }));
    }
  }

  private async handleMismatch(
    parsed: ReturnType<typeof parseIncomingMockRequest>,
    options: MockServerOptions,
    res: ServerResponse,
    req: IncomingMessage,
    wallStart: number,
  ): Promise<void> {
    const bodyTruncated = parsed.bodyText.length >= BODY_PREVIEW_MAX;
    const record = mockServerMismatchRecordSchema.parse({
      id: globalThis.crypto?.randomUUID?.() ?? `mm-${Date.now()}`,
      at: new Date().toISOString(),
      method: parsed.method,
      url: parsed.url,
      pathname: parsed.pathname,
      query: parsed.query,
      headers: Object.entries(parsed.headers).map(([key, value]) => ({ key, value })),
      bodyPreview: parsed.bodyText,
      bodyTruncated,
      contentType: parsed.contentType,
    });

    this.mismatches.unshift(record);
    if (this.mismatches.length > MOCK_SERVER_MISMATCH_BUFFER_MAX) {
      this.mismatches.length = MOCK_SERVER_MISMATCH_BUFFER_MAX;
    }
    this.unmatchedCount += 1;

    const { pathname } = parseMockRequestUrl(parsed.url);
    const payload = JSON.stringify({
      error: 'no_matching_mock',
      method: parsed.method,
      path: pathname,
    });
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const send = (): void => {
      if (options.cors.enabled) {
        this.applyCors(res, req, options.cors);
      }
      res.writeHead(404, responseHeaders);
      res.end(payload);
      this.notify(TestingChannels.mockActivity, {
        type: 'mismatch',
        record,
        unmatchedCount: this.unmatchedCount,
      });
      void this.maybeCaptureHistory({
        request: parsed,
        statusCode: 404,
        responseText: payload,
        responseHeaders,
        durationMs: Date.now() - wallStart,
        matched: false,
        options,
      }).then((historyItemId) => {
        if (!historyItemId || this.mismatches[0]?.id !== record.id) {
          return;
        }
        const withHistory = { ...record, historyItemId };
        this.mismatches[0] = withHistory;
        this.notify(TestingChannels.mockActivity, {
          type: 'mismatch',
          record: withHistory,
          unmatchedCount: this.unmatchedCount,
        });
      });
    };

    const delayMs = options.delayMs;
    if (delayMs > 0) {
      setTimeout(send, delayMs);
    } else {
      send();
    }
  }

  private async maybeCaptureHistory(params: {
    readonly request: ReturnType<typeof parseIncomingMockRequest>;
    readonly statusCode: number;
    readonly responseText: string;
    readonly responseHeaders: Record<string, string>;
    readonly durationMs: number;
    readonly matched: boolean;
    readonly endpointName?: string;
    readonly options: MockServerOptions;
    readonly historyItemId?: string;
  }): Promise<string | undefined> {
    const shouldCapture =
      (params.matched && params.options.captureToHistory) ||
      (!params.matched && params.options.captureMismatchesToHistory);
    if (!shouldCapture) {
      return undefined;
    }

    const snapshot = buildMockResponseSnapshot({
      request: params.request,
      statusCode: params.statusCode,
      responseText: params.responseText,
      responseHeaders: params.responseHeaders,
      durationMs: params.durationMs,
      matched: params.matched,
      endpointName: params.endpointName,
    });

    try {
      const current = await this.files.readHistory();
      const { file, itemId } = appendMockHitToHistory(current, {
        request: params.request,
        snapshot,
        matched: params.matched,
        endpointName: params.endpointName,
      });
      await this.files.saveHistory(file);
      this.notify(ConfigChannels.historyUpdated, { itemId });
      return itemId;
    } catch {
      return undefined;
    }
  }

  /**
   * Starts mock server on launch when configured.
   */
  async tryAutoStartOnLaunch(): Promise<void> {
    const file = await this.files.readMockServer();
    if (file.options.autoStartOnLaunch) {
      await this.start();
    }
  }
}
