import http from 'node:http';
import { randomUUID } from 'node:crypto';

import {
  collectServiceArtifactIds,
  flattenServiceTree,
  flowHttpHitMatches,
  interpolateFlow,
  mapServiceTree,
  mockEndpointMatches,
  type MockActivityEvent,
  type MockArtifactFields,
  type MockNode,
  type MocksFile,
  type ServiceRuntimeStatus,
} from '@testrix/contracts';
import { appLogger } from '@testrix/electron-core';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function incomingHeaders(req: http.IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string')
      headers[key] = value;
    else if (Array.isArray(value))
      headers[key] = value.join(', ');
  }
  return headers;
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function interpolateMockArtifact(
  fields: MockArtifactFields,
  envVars: Record<string, string>,
): MockArtifactFields {
  return {
    ...fields,
    path: interpolateFlow(fields.path, envVars),
    headerName: interpolateFlow(fields.headerName, envVars),
    headerValue: interpolateFlow(fields.headerValue, envVars),
    bodyContains: interpolateFlow(fields.bodyContains, envVars),
    body: interpolateFlow(fields.body, envVars),
    headers: fields.headers.map((header) => ({
      key: interpolateFlow(header.key, envVars),
      value: interpolateFlow(header.value, envVars),
    })),
  };
}

function resolveMocksFile(file: MocksFile, envVars: Record<string, string>): MocksFile {
  if (Object.keys(envVars).length === 0)
    return file;
  return {
    ...file,
    items: mapServiceTree(file.items, (node) => {
      if (node.kind !== 'artifact')
        return node;
      return { ...node, ...interpolateMockArtifact(node, envVars) };
    }),
  };
}

/** One served mock response available to flow HTTP listener / Capture. */
export interface MockHit {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly at: number;
}

const MAX_HITS = 64;
const BODY_PREVIEW_LIMIT = 64_000;

function previewBody(value: string): string {
  if (value.length <= BODY_PREVIEW_LIMIT)
    return value;
  return value.slice(0, BODY_PREVIEW_LIMIT);
}

/**
 * Loopback HTTP mock server. Renderer never owns the socket.
 */
export class MockHost {
  private server: http.Server | null = null;
  private status: ServiceRuntimeStatus = { running: false, label: 'Stopped', error: null };
  private onActivity: ((event: MockActivityEvent) => void) | null = null;
  private hits: MockHit[] = [];

  bind(listener: ((event: MockActivityEvent) => void) | null): void {
    this.onActivity = listener;
  }

  snapshot(): ServiceRuntimeStatus {
    return this.status;
  }

  /**
   * Newest hit matching method + URL filter.
   * Passing a string is treated as contains-URL (legacy).
   */
  latestHit(
    filter:
      | string
      | { readonly method?: string; readonly match?: string; readonly url?: string } = '',
  ): MockHit | null {
    const resolved =
      typeof filter === 'string' ? { method: '*', match: 'contains', url: filter } : filter;
    for (let i = this.hits.length - 1; i >= 0; i -= 1) {
      const hit = this.hits[i];
      if (!hit)
        continue;
      if (flowHttpHitMatches(hit, resolved))
        return hit;
    }
    return null;
  }

  clearHits(): void {
    this.hits = [];
  }

  async start(
    file: MocksFile,
    envVars: Record<string, string> = {},
  ): Promise<ServiceRuntimeStatus> {
    await this.stop();
    this.hits = [];
    const resolved = resolveMocksFile(file, envVars);
    const host = isLoopbackHost(resolved.options.host) ? resolved.options.host : '127.0.0.1';
    const port = resolved.options.port;
    const endpoints = flattenServiceTree(resolved.items).filter(
      (node): node is Extract<MockNode, { kind: 'artifact' }> => node.kind === 'artifact',
    );
    const sorted = [...endpoints].sort((a, b) => b.priority - a.priority);
    this.server = http.createServer((req, res) => {
        this.handle(req, res, resolved, sorted).catch((error: unknown) => {
          appLogger.error('mocks:handle', error);
          if (!res.headersSent)
            res.writeHead(500, { 'content-type': 'text/plain' });
          res.end('Mock handler failed.');
        });
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', (error) => {
        this.status = { running: false, label: 'Stopped', error: error.message };
        reject(error);
      });
      this.server?.listen(port, host, () => resolve());
    });
    this.status = { running: true, label: `Listening on ${host}:${port}`, error: null };
    return this.status;
  }

  async stop(): Promise<ServiceRuntimeStatus> {
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    this.status = { running: false, label: 'Stopped', error: null };
    return this.status;
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    file: MocksFile,
    endpoints: readonly Extract<MockNode, { kind: 'artifact' }>[],
  ): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const url = req.url ?? '/';
    const urlPath = url.split('?')[0] ?? '/';
    if (file.options.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', '*');
      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }
    const requestHeaders = incomingHeaders(req);
    const requestBody = await readRequestBody(req);
    const match = endpoints.find((item) =>
      mockEndpointMatches(item, method, urlPath, requestHeaders, requestBody),
    );
    if (!match) {
      const missBody = JSON.stringify({ error: 'No mock matched', id: randomUUID() });
      this.onActivity?.({
        kind: 'mismatch',
        method,
        url,
        status: 404,
        at: Date.now(),
        requestHeaders: { ...requestHeaders },
        requestBody: previewBody(requestBody),
        headers: { 'Content-Type': 'application/json' },
        body: missBody,
      });
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(missBody);
      return;
    }
    await sleep(file.options.delayMs + match.delayMs);
    const headers: Record<string, string> = {};
    for (const header of match.headers) {
      if (header.key)
        headers[header.key] = header.value;
    }
    const at = Date.now();
    this.recordHit({
      method,
      url,
      status: match.statusCode,
      body: match.body,
      headers: { ...headers },
      at,
    });
    this.onActivity?.({
      kind: 'match',
      method,
      url,
      status: match.statusCode,
      endpointId: match.id,
      at,
      requestHeaders: { ...requestHeaders },
      requestBody: previewBody(requestBody),
      headers: { ...headers },
      body: previewBody(match.body),
    });
    res.writeHead(match.statusCode, headers);
    res.end(match.body);
  }

  private recordHit(hit: MockHit): void {
    this.hits.push(hit);
    if (this.hits.length > MAX_HITS)
      this.hits.splice(0, this.hits.length - MAX_HITS);
  }

  endpointCount(file: MocksFile): number {
    return collectServiceArtifactIds(file.items).length;
  }
}
