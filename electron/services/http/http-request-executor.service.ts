import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { SendHttpRequestPayload } from '../../../shared/http/outgoing-request.schema';
import type { HttpResponseSnapshot } from '../../../shared/http/outgoing-request.schema';
import type { EncodedRequestBody } from '../../../shared/http/encode-request-body';
import {
  httpMethodAllowsRequestBody,
  matchesCertificateHostPattern,
} from '../../../shared/config/http-settings.schema';
import type { HttpMethodId } from '../../../shared/config/http-settings.schema';
import { TestrixError, ErrorCodes } from '../../../shared/errors';

import { cookieJarStore } from './cookie-jar.service';
import { runRequestScripts } from './request-script-runtime.service';
import { executeNodeHttpRequest, type NodeHttpTlsOptions } from './node-http-request.client';

const MAX_INLINE_BODY_BYTES = 256 * 1024;
const RESPONSE_BODY_READ_CAP = 2 * 1024 * 1024;

function newSnapshotId(): string {
  return globalThis.crypto?.randomUUID?.() ?? randomUUID();
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

type RequestBodyPayload = Buffer | string;

async function buildMultipartBody(
  parts: Extract<EncodedRequestBody, { kind: 'multipart' }>['parts'],
): Promise<{ body: Buffer; contentType: string }> {
  const boundary = `----testrix${randomUUID().replace(/-/g, '')}`;
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    const disposition = part.fileName
      ? `form-data; name="${part.name}"; filename="${part.fileName}"`
      : `form-data; name="${part.name}"`;
    chunks.push(Buffer.from(`Content-Disposition: ${disposition}\r\n`));
    if (part.filePath) {
      const bytes = await fs.readFile(part.filePath);
      chunks.push(Buffer.from('\r\n'));
      chunks.push(bytes);
    } else if (part.value !== undefined) {
      chunks.push(Buffer.from('\r\n'));
      chunks.push(Buffer.from(part.value, 'utf8'));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function buildRequestBody(
  body: EncodedRequestBody,
): Promise<{ body?: RequestBodyPayload; headers?: Record<string, string> }> {
  switch (body.kind) {
    case 'none':
      return {};
    case 'text':
      return { body: body.content, headers: { 'Content-Type': body.contentType } };
    case 'urlencoded':
      return {
        body: body.content,
        headers: { 'Content-Type': body.contentType },
      };
    case 'binary': {
      const bytes = await fs.readFile(body.filePath);
      return {
        body: bytes,
        headers: body.contentType ? { 'Content-Type': body.contentType } : {},
      };
    }
    case 'binary-inline': {
      const bytes = Buffer.from(body.base64, 'base64');
      return {
        body: bytes,
        headers: body.contentType ? { 'Content-Type': body.contentType } : {},
      };
    }
    case 'multipart': {
      const built = await buildMultipartBody(body.parts);
      return { body: built.body, headers: { 'Content-Type': built.contentType } };
    }
    default:
      return {};
  }
}

function buildTlsOptions(payload: SendHttpRequestPayload): NodeHttpTlsOptions {
  const { transport } = payload;
  const host = hostnameFromUrl(payload.url);
  const rejectUnauthorized =
    transport.strictSsl && !transport.ignoreInvalidSsl && !transport.certificates.ignoreInvalidSsl;

  const certEntry = transport.certificates.entries.find(
    (e) => e.enabled && matchesCertificateHostPattern(e.hostPattern, host),
  );

  return {
    rejectUnauthorized,
    certPath: certEntry?.clientCertPath ?? null,
    keyPath: certEntry?.clientKeyPath ?? null,
    caPath: transport.certificates.caCertPath,
    passphrase: certEntry?.passphrase,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) {
    return false;
  }
  return status >= 500;
}

async function executeOnce(
  payload: SendHttpRequestPayload,
  scriptVars: Record<string, string>,
): Promise<HttpResponseSnapshot> {
  const wallStart = performance.now();
  const pre = runRequestScripts(payload.scripts.pre, {
    variables: scriptVars,
    environment: payload.variableContext,
    collectionVariables: payload.variableContext,
  });
  Object.assign(scriptVars, pre.variables);

  const allowsBody = httpMethodAllowsRequestBody(payload.method as HttpMethodId);
  const bodyInit = allowsBody ? await buildRequestBody(payload.body) : {};
  const headers: Record<string, string> = { ...payload.headers, ...(bodyInit.headers ?? {}) };

  const useCookies =
    payload.transport.useCookies && !payload.transport.disableCookiesGlobally;

  const result = await executeNodeHttpRequest({
    method: payload.method,
    url: payload.url,
    headers,
    body: allowsBody && bodyInit.body !== undefined ? bodyInit.body : undefined,
    timeoutMs: payload.transport.timeoutMs || 30_000,
    followRedirects: payload.transport.followRedirects,
    maxRedirects: payload.transport.maxRedirects,
    tls: buildTlsOptions(payload),
    proxy: payload.transport.proxy,
    getCookieHeader: useCookies
      ? (url) => cookieJarStore.getCookieHeader(url)
      : undefined,
    onSetCookie: useCookies
      ? (url, setCookieHeaders) => cookieJarStore.absorbSetCookie(url, setCookieHeaders)
      : undefined,
  });

  const buf =
    result.body.length > RESPONSE_BODY_READ_CAP
      ? result.body.subarray(0, RESPONSE_BODY_READ_CAP)
      : result.body;
  const truncated = result.body.length > MAX_INLINE_BODY_BYTES;
  const bodySlice = truncated ? buf.subarray(0, MAX_INLINE_BODY_BYTES) : buf;
  const contentType = result.headers['content-type'] ?? undefined;
  const text = bodySlice.toString('utf8');

  const headerRows: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(result.headers)) {
    headerRows.push({ key, value });
  }

  const totalMs = Math.round(performance.now() - wallStart);

  const snapshot: HttpResponseSnapshot = {
    id: newSnapshotId(),
    capturedAt: new Date().toISOString(),
    requestSummary: {
      method: payload.method,
      url: payload.url,
      environmentId: payload.environmentId,
      requestId: payload.requestId,
    },
    status: {
      code: result.statusCode,
      text: result.statusText,
      ok: result.statusCode >= 200 && result.statusCode < 300,
    },
    timing: {
      ...result.timing,
      totalMs,
    },
    size: {
      headersBytes: headerRows.reduce((n, h) => n + h.key.length + h.value.length, 0),
      bodyBytes: result.body.length,
    },
    headers: headerRows,
    redirects: [...result.redirects],
    body: {
      encoding: 'text',
      text,
      contentType,
      truncated,
    },
    meta: payload.runScope ? { runScope: payload.runScope } : undefined,
  };

  runRequestScripts(payload.scripts.post, {
    variables: scriptVars,
    environment: payload.variableContext,
    collectionVariables: payload.variableContext,
    response: snapshot,
  });

  return snapshot;
}

/**
 * Executes an HTTP request with retries, cookies, scripts, and transport options.
 */
export async function executeHttpRequest(payload: SendHttpRequestPayload): Promise<HttpResponseSnapshot> {
  const scriptVars: Record<string, string> = { ...payload.variableContext };
  const retries = payload.transport.retries;
  const maxAttempts = retries.enabled ? Math.max(1, retries.maxAttempts) : 1;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const snapshot = await executeOnce(payload, scriptVars);
      if (!retries.enabled || !shouldRetry(snapshot.status.code, attempt, maxAttempts)) {
        return {
          ...snapshot,
          meta: { ...snapshot.meta, attempt, fromRetry: attempt > 1 },
        };
      }
      lastError = new Error(`HTTP ${snapshot.status.code}`);
    } catch (error: unknown) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
    }

    if (attempt < maxAttempts) {
      let delay = retries.delayMs;
      if (retries.exponentialBackoff) {
        delay = Math.min(
          retries.maxDelayMs,
          delay * Math.pow(retries.backoffMultiplier, attempt - 1),
        );
      }
      await sleep(delay);
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Request failed';
  throw new TestrixError(ErrorCodes.HTTP_REQUEST_FAILED, message);
}
