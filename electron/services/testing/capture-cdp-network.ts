import { randomUUID } from 'node:crypto';

import type { WebContents } from 'electron';

import type { CaptureLogEntry } from '../../../shared/testing';

import { normalizeCapturedBodyFromCdp, normalizeCapturedBodyText } from './capture-body-text';
import { headersRecordToPairs, redactCaptureHeaders } from './capture-headers';

const CDP_RESOURCE_TYPE_MAP: Readonly<Record<string, string>> = {
  Document: 'main_frame',
  Stylesheet: 'stylesheet',
  Script: 'script',
  Image: 'image',
  Font: 'font',
  Media: 'media',
  Manifest: 'manifest',
  XHR: 'xhr',
  Fetch: 'xhr',
  Prefetch: 'other',
  EventSource: 'other',
  WebSocket: 'websocket',
  Other: 'other',
};

interface CdpRequestMeta {
  readonly startedAt: number;
  readonly url: string;
  readonly method: string;
  readonly resourceType?: string;
  readonly requestHeaders: readonly { readonly key: string; readonly value: string }[];
  requestBody: string;
  requestBodyTruncated: boolean;
  requestBodyIsBinary: boolean;
  statusCode: number | null;
  responseHeaders: readonly { readonly key: string; readonly value: string }[];
}

/**
 * Records HTTP traffic from the capture {@link BrowserWindow} via Chrome DevTools Protocol
 * (`Network.getResponseBody` for response payloads).
 */
export class CaptureCdpNetwork {
  private webContents: WebContents | null = null;
  private debuggerAttached = false;
  private readonly requestMetaById = new Map<string, CdpRequestMeta>();

  constructor(
    private readonly getCaptureItemId: () => string | null,
    private readonly onEntry: (entry: CaptureLogEntry) => void,
  ) {}

  async attach(webContents: WebContents): Promise<void> {
    this.detach();
    this.webContents = webContents;
    const dbg = webContents.debugger;
    if (dbg.isAttached()) {
      try {
        dbg.detach();
      } catch {
        // ignore
      }
    }
    dbg.removeAllListeners('message');
    dbg.removeAllListeners('detach');
    dbg.attach('1.3');
    await dbg.sendCommand('Network.enable');
    this.debuggerAttached = true;

    dbg.on('message', (_event, method, params) => {
      void this.handleMessage(method, params as Record<string, unknown>);
    });
    dbg.on('detach', () => {
      this.debuggerAttached = false;
      this.requestMetaById.clear();
    });
  }

  detach(): void {
    this.requestMetaById.clear();
    const wc = this.webContents;
    this.webContents = null;
    if (!wc || wc.isDestroyed()) {
      this.debuggerAttached = false;
      return;
    }
    try {
      if (wc.debugger.isAttached()) {
        wc.debugger.detach();
      }
    } catch {
      // ignore
    }
    this.debuggerAttached = false;
  }

  private async handleMessage(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.webContents || this.webContents.isDestroyed()) {
      return;
    }
    switch (method) {
      case 'Network.requestWillBeSent':
        this.onRequestWillBeSent(params);
        return;
      case 'Network.responseReceived':
        this.onResponseReceived(params);
        return;
      case 'Network.loadingFinished':
        await this.onLoadingFinished(params);
        return;
      case 'Network.loadingFailed':
        await this.onLoadingFailed(params);
        return;
      default:
        return;
    }
  }

  private onRequestWillBeSent(params: Record<string, unknown>): void {
    const requestId = typeof params.requestId === 'string' ? params.requestId : '';
    const request = params.request as
      | {
          readonly url?: string;
          readonly method?: string;
          readonly headers?: unknown;
          readonly postData?: string;
        }
      | undefined;
    if (!requestId || !request?.url) {
      return;
    }
    if (!this.shouldCaptureUrl(request.url)) {
      return;
    }
    const resourceType = mapCdpResourceType(
      typeof params.type === 'string' ? params.type : undefined,
    );
    if (resourceType === 'websocket') {
      return;
    }
    const flat = flattenCdpHeaders(request.headers);
    const postData =
      typeof request.postData === 'string' && request.postData
        ? normalizeCapturedBodyText(request.postData)
        : { text: '', truncated: false, isBinary: false };

    this.requestMetaById.set(requestId, {
      startedAt: Date.now(),
      url: request.url,
      method: request.method || 'GET',
      resourceType,
      requestHeaders: [...redactCaptureHeaders(flat)],
      requestBody: postData.text,
      requestBodyTruncated: postData.truncated,
      requestBodyIsBinary: postData.isBinary,
      statusCode: null,
      responseHeaders: [],
    });
  }

  private onResponseReceived(params: Record<string, unknown>): void {
    const requestId = typeof params.requestId === 'string' ? params.requestId : '';
    const response = params.response as
      | { readonly status?: number; readonly headers?: unknown }
      | undefined;
    const meta = this.requestMetaById.get(requestId);
    if (!meta || !response) {
      return;
    }
    const flat = flattenCdpHeaders(response.headers);
    this.requestMetaById.set(requestId, {
      ...meta,
      statusCode: typeof response.status === 'number' ? response.status : null,
      responseHeaders: [...headersRecordToPairs(flat)],
    });
  }

  private async onLoadingFinished(params: Record<string, unknown>): Promise<void> {
    const requestId = typeof params.requestId === 'string' ? params.requestId : '';
    const meta = this.requestMetaById.get(requestId);
    this.requestMetaById.delete(requestId);
    if (!meta) {
      return;
    }
    await this.finalizeEntry(meta, requestId, '');
  }

  private async onLoadingFailed(params: Record<string, unknown>): Promise<void> {
    const requestId = typeof params.requestId === 'string' ? params.requestId : '';
    const meta = this.requestMetaById.get(requestId);
    this.requestMetaById.delete(requestId);
    if (!meta) {
      return;
    }
    const err =
      typeof params.errorText === 'string' && params.errorText
        ? params.errorText
        : 'Request failed';
    await this.finalizeEntry(meta, requestId, `[net error] ${err}`);
  }

  private async finalizeEntry(
    meta: CdpRequestMeta,
    requestId: string,
    forcedResponseBody: string,
  ): Promise<void> {
    const captureItemId = this.getCaptureItemId();
    if (!captureItemId) {
      return;
    }

    let responseBody = forcedResponseBody;
    let responseBodyTruncated = false;
    let responseBodyIsBinary = false;

    if (!forcedResponseBody && this.webContents && !this.webContents.isDestroyed()) {
      try {
        const rb = (await this.webContents.debugger.sendCommand('Network.getResponseBody', {
          requestId,
        })) as { body?: string; base64Encoded?: boolean };
        const normalized = normalizeCapturedBodyFromCdp(
          rb.body ?? '',
          !!rb.base64Encoded,
        );
        responseBody = normalized.text;
        responseBodyTruncated = normalized.truncated;
        responseBodyIsBinary = normalized.isBinary;
      } catch {
        responseBody = '';
      }
    }

    let requestBody = meta.requestBody;
    let requestBodyTruncated = meta.requestBodyTruncated;
    let requestBodyIsBinary = meta.requestBodyIsBinary;

    if (!requestBody && this.webContents && !this.webContents.isDestroyed()) {
      try {
        const pd = (await this.webContents.debugger.sendCommand('Network.getRequestPostData', {
          requestId,
        })) as { postData?: string };
        if (typeof pd.postData === 'string' && pd.postData) {
          const normalized = normalizeCapturedBodyText(pd.postData);
          requestBody = normalized.text;
          requestBodyTruncated = normalized.truncated;
          requestBodyIsBinary = normalized.isBinary;
        }
      } catch {
        // ignore
      }
    }

    const timeMs = Math.max(0, Date.now() - meta.startedAt);

    this.onEntry({
      id: randomUUID(),
      captureItemId,
      method: meta.method,
      url: meta.url,
      resourceType: meta.resourceType,
      statusCode: meta.statusCode,
      timeMs,
      at: new Date().toISOString(),
      requestHeaders: [...meta.requestHeaders],
      responseHeaders: [...meta.responseHeaders],
      requestBody,
      responseBody,
      requestBodyTruncated,
      requestBodyIsBinary,
      responseBodyTruncated,
      responseBodyIsBinary,
    });
  }

  private shouldCaptureUrl(url: string): boolean {
    const u = url.toLowerCase();
    if (
      u.startsWith('devtools:') ||
      u.startsWith('chrome-extension:') ||
      u.startsWith('chrome:') ||
      u.startsWith('about:') ||
      u.startsWith('blob:') ||
      u.startsWith('data:')
    ) {
      return false;
    }
    return u.startsWith('http://') || u.startsWith('https://');
  }
}

function mapCdpResourceType(type: string | undefined): string | undefined {
  if (!type) {
    return undefined;
  }
  return CDP_RESOURCE_TYPE_MAP[type] ?? type.toLowerCase();
}

function flattenCdpHeaders(headers: unknown): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!headers || typeof headers !== 'object') {
    return out;
  }
  if (!Array.isArray(headers)) {
    return headers as Record<string, string | string[]>;
  }
  for (const h of headers) {
    if (h && typeof h === 'object' && 'name' in h) {
      const row = h as { name: string; value?: string };
      out[String(row.name)] = String(row.value ?? '');
    }
  }
  return out;
}
