import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { app } from 'electron';
import {
  generateCACertificate,
  getLocal,
  type CompletedRequest,
  type Mockttp,
} from 'mockttp';
import {
  flowProxyHitMatches,
  parseFlowHttpStage,
  parseHeaderMap,
  parseHeaderNameList,
  type FlowHttpStage,
  type FlowInterceptAction,
  type FlowProxyHit,
} from '@testrix/contracts';

import type { AdbClient } from './adb-client';

const execFileAsync = promisify(execFile);

const ANDROID_PROXY_DIR = 'android-proxy';
const EMULATOR_HOST = '10.0.2.2';
const MAX_HITS = 128;

interface ProxyPassThroughResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: unknown;
}

export interface DeviceProxyRule {
  readonly id: string;
  readonly kind: 'listen' | 'intercept';
  readonly stage: FlowHttpStage;
  readonly method: string;
  readonly match: string;
  readonly url: string;
  readonly headerName: string;
  readonly headerValue: string;
  readonly bodyContains: string;
  readonly action: FlowInterceptAction;
  readonly setHeaders: string;
  readonly removeHeaders: string;
  readonly setBody: string;
  readonly mockStatus: number;
  readonly mockBody: string;
}

/**
 * Local HTTPS MITM proxy for emulator app traffic (Listen observe + Intercept act).
 */
export class DeviceProxyHost {
  private server: Mockttp | null = null;
  private port: number | null = null;
  private caCertPem = '';
  private caKeyPem = '';
  private rules = new Map<string, DeviceProxyRule>();
  private hits: FlowProxyHit[] = [];
  private startedForSerial: string | null = null;
  private proxyConfigured = false;
  private hitListeners = new Set<(hit: FlowProxyHit, rule: DeviceProxyRule | null) => void>();

  /** Streams MITM hits to workbench Listener / Interceptor UIs. */
  bind(listener: ((hit: FlowProxyHit, rule: DeviceProxyRule | null) => void) | null): void {
    this.hitListeners.clear();
    if (listener)
      this.hitListeners.add(listener);
  }

  /** Add a hit subscriber without clearing other listeners. */
  addHitListener(listener: (hit: FlowProxyHit, rule: DeviceProxyRule | null) => void): void {
    this.hitListeners.add(listener);
  }

  removeHitListener(listener: (hit: FlowProxyHit, rule: DeviceProxyRule | null) => void): void {
    this.hitListeners.delete(listener);
  }

  get listeningPort(): number | null {
    return this.port;
  }

  get caPem(): string {
    return this.caCertPem;
  }

  latestHit(filter: {
    readonly ruleId?: string;
    readonly method?: string;
    readonly match?: string;
    readonly url?: string;
    readonly stage?: FlowHttpStage;
    readonly headerName?: string;
    readonly headerValue?: string;
    readonly bodyContains?: string;
    readonly since?: number;
  }): FlowProxyHit | null {
    for (let i = this.hits.length - 1; i >= 0; i -= 1) {
      const hit = this.hits[i];
      if (!hit)
        continue;
      if (filter.ruleId && hit.ruleId !== filter.ruleId)
        continue;
      if (filter.since && hit.at < filter.since)
        continue;
      if (
        flowProxyHitMatches(hit, {
          stage: filter.stage,
          method: filter.method,
          match: filter.match,
          url: filter.url,
          headerName: filter.headerName,
          headerValue: filter.headerValue,
          bodyContains: filter.bodyContains,
        })
      )
        return hit;
    }
    return null;
  }

  async armRule(rule: DeviceProxyRule): Promise<void> {
    this.rules.set(rule.id, rule);
    if (this.server)
      await this.rebuildRules();
  }

  async disarmRule(ruleId: string): Promise<void> {
    if (!this.rules.delete(ruleId))
      return;
    if (this.server)
      await this.rebuildRules();
  }

  clearRules(): void {
    this.rules.clear();
  }

  /**
   * Starts the MITM proxy (if needed), installs CA best-effort, and points the
   * emulator at 10.0.2.2:port via global http_proxy.
   */
  async ensureForDevice(adb: AdbClient, serial: string): Promise<{ port: number }> {
    await this.ensureServer();
    const port = this.port!;
    if (this.startedForSerial !== serial || !this.proxyConfigured) {
      await this.installCaBestEffort(adb, serial);
      await adb.shell(serial, `settings put global http_proxy ${EMULATOR_HOST}:${port}`);
      this.startedForSerial = serial;
      this.proxyConfigured = true;
    }
    await this.rebuildRules();
    return { port };
  }

  async releaseDevice(adb: AdbClient | null, serial: string | null): Promise<void> {
    if (adb && serial && this.proxyConfigured) {
      await adb.shell(serial, 'settings delete global http_proxy').catch(() => undefined);
      await adb.shell(serial, 'settings put global http_proxy :0').catch(() => undefined);
    }
    this.proxyConfigured = false;
    this.startedForSerial = null;
    this.clearRules();
    this.hits = [];
    await this.stopServer();
  }

  async stop(): Promise<void> {
    this.clearRules();
    this.hits = [];
    this.proxyConfigured = false;
    this.startedForSerial = null;
    await this.stopServer();
  }

  private async ensureServer(): Promise<void> {
    if (this.server && this.port)
      return;
    await this.loadOrCreateCa();
    const server = getLocal({
      https: {
        key: this.caKeyPem,
        cert: this.caCertPem,
      },
      cors: false,
    });
    await server.start({ startPort: 8877, endPort: 8977 });
    this.server = server;
    this.port = server.port;
    await this.rebuildRules();
  }

  private async stopServer(): Promise<void> {
    if (!this.server)
      return;
    await this.server.stop().catch(() => undefined);
    this.server = null;
    this.port = null;
  }

  private async rebuildRules(): Promise<void> {
    const server = this.server;
    if (!server)
      return;
    await server.reset();

    const ordered = [...this.rules.values()];
    const mocksAndBlocks = ordered.filter(
      (rule) => rule.kind === 'intercept' && (rule.action === 'mock' || rule.action === 'block'),
    );
    const passthroughs = ordered.filter(
      (rule) => rule.kind === 'intercept' && rule.action === 'passthrough',
    );

    for (const rule of mocksAndBlocks) {
      await server.forAnyRequest().matching((req) => this.requestMatchesRule(req, rule)).thenCallback(async (req) => {
        if (rule.action === 'block') {
          const response = {
            status: 0,
            body: '',
            headers: {} as Record<string, string>,
          };
          this.recordHit(rule.id, req, response);
          this.recordListenHits(ordered, req, { statusCode: 403, headers: { 'content-type': 'text/plain' }, body: 'Blocked by Testrix Intercept' });
          return { statusCode: 403, body: 'Blocked by Testrix Intercept', headers: { 'content-type': 'text/plain' } };
        }
        const headers = {
          'content-type': 'application/json',
          ...parseHeaderMap(rule.setHeaders),
        };
        const body = rule.mockBody || '{}';
        this.recordHit(rule.id, req, {
          status: rule.mockStatus || 200,
          body,
          headers,
        });
        this.recordListenHits(ordered, req, { statusCode: rule.mockStatus || 200, headers, body });
        return { statusCode: rule.mockStatus || 200, body, headers };
      });
    }

    for (const rule of passthroughs) {
      await server
        .forAnyRequest()
        .matching((req) => this.requestMatchesRule(req, rule))
        .thenPassThrough({
          beforeRequest: async (req) => this.applyRequestTransforms(req, rule),
          beforeResponse: async (res, req) => {
            const next = this.applyResponseTransforms(res, rule);
            const status = typeof next?.statusCode === 'number' ? next.statusCode : res.statusCode;
            const body = bodyToString(next?.body ?? res.body);
            const headers = normalizeHeaders((next?.headers as Record<string, string> | undefined) ?? res.headers);
            this.recordHit(rule.id, req, { status, body, headers });
            this.recordListenHits(ordered, req, { statusCode: status, headers, body });
            return next;
          },
        });
    }

    // Fallback: observe Listen rules + pass everything else through.
    await server.forAnyRequest().thenPassThrough({
      beforeResponse: async (res, req) => {
        this.recordListenHits(ordered, req, res);
        for (const rule of ordered) {
          if (rule.kind !== 'intercept' || rule.action !== 'passthrough')
            continue;
          if (rule.stage !== 'response')
            continue;
          if (!this.exchangeMatchesRule(req, res, rule))
            continue;
          if (!this.hits.some((hit) => hit.ruleId === rule.id && hit.url === req.url && hit.at > Date.now() - 2_000)) {
            this.recordHit(rule.id, req, {
              status: res.statusCode,
              body: bodyToString(res.body),
              headers: normalizeHeaders(res.headers),
            });
          }
        }
      },
    });
  }

  private recordListenHits(
    ordered: readonly DeviceProxyRule[],
    req: CompletedRequest,
    res: ProxyPassThroughResponse,
  ): void {
    for (const rule of ordered) {
      if (rule.kind !== 'listen')
        continue;
      if (!this.exchangeMatchesRule(req, res, rule))
        continue;
      this.recordHit(rule.id, req, {
        status: res.statusCode,
        body: bodyToString(res.body),
        headers: normalizeHeaders(res.headers),
      });
    }
  }

  private requestMatchesRule(req: CompletedRequest, rule: DeviceProxyRule): boolean {
    if (rule.stage === 'response' && rule.kind === 'intercept' && rule.action === 'passthrough') {
      // Response-stage passthrough still needs to intercept the request to attach beforeResponse.
      return flowProxyHitMatches(
        {
          method: req.method,
          url: req.url,
          requestHeaders: normalizeHeaders(req.headers),
          requestBody: bodyToString(req.body),
          headers: {},
          body: '',
        },
        {
          stage: 'request',
          method: rule.method,
          match: rule.match,
          url: rule.url,
          // Header/body filters for response stage are applied in beforeResponse.
        },
      );
    }
    if (rule.stage === 'response')
      return flowProxyHitMatches(
        {
          method: req.method,
          url: req.url,
          requestHeaders: normalizeHeaders(req.headers),
          requestBody: bodyToString(req.body),
          headers: {},
          body: '',
        },
        { stage: 'request', method: rule.method, match: rule.match, url: rule.url },
      );
    return flowProxyHitMatches(
      {
        method: req.method,
        url: req.url,
        requestHeaders: normalizeHeaders(req.headers),
        requestBody: bodyToString(req.body),
        headers: {},
        body: '',
      },
      {
        stage: 'request',
        method: rule.method,
        match: rule.match,
        url: rule.url,
        headerName: rule.headerName,
        headerValue: rule.headerValue,
        bodyContains: rule.bodyContains,
      },
    );
  }

  private exchangeMatchesRule(
    req: CompletedRequest,
    res: ProxyPassThroughResponse,
    rule: DeviceProxyRule,
  ): boolean {
    return flowProxyHitMatches(
      {
        method: req.method,
        url: req.url,
        requestHeaders: normalizeHeaders(req.headers),
        requestBody: bodyToString(req.body),
        headers: normalizeHeaders(res.headers),
        body: bodyToString(res.body),
      },
      {
        stage: parseFlowHttpStage(rule.stage),
        method: rule.method,
        match: rule.match,
        url: rule.url,
        headerName: rule.headerName,
        headerValue: rule.headerValue,
        bodyContains: rule.bodyContains,
      },
    );
  }

  private applyRequestTransforms(req: CompletedRequest, rule: DeviceProxyRule): { headers?: Record<string, string>; body?: string } | void {
    if (rule.stage === 'response')
      return;
    const headers = { ...normalizeHeaders(req.headers) };
    for (const name of parseHeaderNameList(rule.removeHeaders))
      deleteHeader(headers, name);
    Object.assign(headers, parseHeaderMap(rule.setHeaders));
    const body = rule.setBody.trim() ? rule.setBody : undefined;
    return { headers, ...(body !== undefined ? { body } : {}) };
  }

  private applyResponseTransforms(
    res: ProxyPassThroughResponse,
    rule: DeviceProxyRule,
  ): { statusCode?: number; headers?: Record<string, string>; body?: string } | void {
    if (rule.stage === 'request')
      return;
    const headers = { ...normalizeHeaders(res.headers) };
    for (const name of parseHeaderNameList(rule.removeHeaders))
      deleteHeader(headers, name);
    Object.assign(headers, parseHeaderMap(rule.setHeaders));
    const body = rule.setBody.trim() ? rule.setBody : undefined;
    return { headers, ...(body !== undefined ? { body } : {}) };
  }

  private recordHit(
    ruleId: string,
    req: CompletedRequest,
    response: { status: number; body: string; headers: Record<string, string> },
  ): void {
    const hit: FlowProxyHit = {
      ruleId,
      method: req.method,
      url: req.url,
      status: response.status,
      body: response.body,
      headers: response.headers,
      requestHeaders: normalizeHeaders(req.headers),
      requestBody: bodyToString(req.body),
      at: Date.now(),
    };
    this.hits.push(hit);
    if (this.hits.length > MAX_HITS)
      this.hits.splice(0, this.hits.length - MAX_HITS);
    const rule = this.rules.get(ruleId) ?? null;
    for (const listener of this.hitListeners)
      listener(hit, rule);
  }

  private async loadOrCreateCa(): Promise<void> {
    const dir = path.join(app.getPath('userData'), ANDROID_PROXY_DIR);
    await mkdir(dir, { recursive: true });
    const certPath = path.join(dir, 'ca.pem');
    const keyPath = path.join(dir, 'ca.key');
    if (existsSync(certPath) && existsSync(keyPath)) {
      this.caCertPem = await readFile(certPath, 'utf8');
      this.caKeyPem = await readFile(keyPath, 'utf8');
      return;
    }
    const generated = await generateCACertificate({
      subject: {
        commonName: 'Testrix Device Proxy',
        organizationName: 'Testrix',
      },
    });
    this.caCertPem = generated.cert;
    this.caKeyPem = generated.key;
    await writeFile(certPath, this.caCertPem, 'utf8');
    await writeFile(keyPath, this.caKeyPem, 'utf8');
  }

  private async installCaBestEffort(adb: AdbClient, serial: string): Promise<void> {
    const dir = path.join(app.getPath('userData'), ANDROID_PROXY_DIR);
    const certPath = path.join(dir, 'ca.pem');
    const hash = await subjectHashOld(certPath);
    if (!hash)
      return;
    const hashedLocal = path.join(dir, `${hash}.0`);
    await writeFile(hashedLocal, this.caCertPem, 'utf8');
    const remoteTmp = `/data/local/tmp/testrix-ca-${hash}.0`;
    await adb.push(serial, hashedLocal, remoteTmp);

    const script = [
      'su 0 mount -o rw,remount /system || mount -o rw,remount /system',
      `su 0 cp ${remoteTmp} /system/etc/security/cacerts/${hash}.0 || cp ${remoteTmp} /system/etc/security/cacerts/${hash}.0`,
      `su 0 chmod 644 /system/etc/security/cacerts/${hash}.0 || chmod 644 /system/etc/security/cacerts/${hash}.0`,
    ].join(' ; ');
    await adb.shell(serial, script).catch(() => undefined);
  }
}

function normalizeHeaders(headers: CompletedRequest['headers'] | ProxyPassThroughResponse['headers'] | Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers)
    return out;
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value == null)
      continue;
    out[key] = Array.isArray(value) ? value.map(String).join(', ') : String(value);
  }
  return out;
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower)
      delete headers[key];
  }
}

function bodyToString(body: unknown): string {
  if (body == null)
    return '';
  if (typeof body === 'string')
    return body;
  if (Buffer.isBuffer(body))
    return body.toString('utf8');
  if (typeof body === 'object' && body && 'getText' in body && typeof (body as { getText: () => unknown }).getText === 'function') {
    try {
      const text = (body as { getText: () => string }).getText();
      return typeof text === 'string' ? text : '';
    } catch {
      return '';
    }
  }
  return String(body);
}

async function subjectHashOld(certPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('openssl', ['x509', '-inform', 'PEM', '-subject_hash_old', '-in', certPath], {
      timeout: 8_000,
    });
    const hash = stdout.trim().split(/\r?\n/)[0]?.trim();
    return hash || null;
  } catch {
    try {
      const pem = await readFile(certPath);
      return createHash('md5').update(pem).digest('hex').slice(0, 8);
    } catch {
      return null;
    }
  }
}
