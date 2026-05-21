import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { ClientRequest, RequestOptions } from 'node:http';
import type { Readable } from 'node:stream';
import { URL } from 'node:url';
import zlib from 'node:zlib';

import { computeTimingFromMarkers } from '../../../shared/http/http-timing';
import type { HttpResponseRedirectHop } from '../../../shared/http/outgoing-request.schema';
import type { HttpResponseTimingPhases } from '../../../shared/http/http-timing';

export interface ParsedProxyEndpoint {
  readonly host: string;
  readonly port: number;
  readonly user?: string;
  readonly password?: string;
}

export interface NodeHttpTlsOptions {
  readonly rejectUnauthorized: boolean;
  readonly certPath?: string | null;
  readonly keyPath?: string | null;
  readonly caPath?: string | null;
  readonly passphrase?: string;
}

export interface NodeHttpExecuteParams {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body?: Buffer | string;
  readonly timeoutMs: number;
  readonly followRedirects: boolean;
  readonly maxRedirects: number;
  readonly tls: NodeHttpTlsOptions;
  readonly proxy?: {
    readonly enabled: boolean;
    readonly httpProxy: string;
    readonly httpsProxy: string;
  };
  readonly getCookieHeader?: (url: string) => Promise<string | undefined>;
  readonly onSetCookie?: (url: string, setCookieHeaders: string[]) => Promise<void>;
  readonly inboundRedirects?: readonly HttpResponseRedirectHop[];
  readonly redirectDepth?: number;
}

export interface NodeHttpExecuteResult {
  readonly statusCode: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: Buffer;
  readonly timing: HttpResponseTimingPhases;
  readonly redirects: readonly HttpResponseRedirectHop[];
}

function decodeResponseStream(res: IncomingMessage): Readable {
  const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
  if (!encoding || encoding === 'identity') {
    return res;
  }
  try {
    if (encoding === 'gzip' || encoding === 'x-gzip') {
      return res.pipe(zlib.createGunzip({ flush: zlib.constants.Z_SYNC_FLUSH }));
    }
    if (encoding === 'deflate') {
      return res.pipe(zlib.createInflate({ flush: zlib.constants.Z_SYNC_FLUSH }));
    }
    if (encoding === 'br') {
      return res.pipe(zlib.createBrotliDecompress());
    }
  } catch {
    /* fall through */
  }
  return res;
}

/**
 * Parses an HTTP(S) proxy URL (`http://host:port`, optional userinfo).
 */
export function parseProxyUrl(proxyUrl: string): ParsedProxyEndpoint | null {
  const trimmed = proxyUrl.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const u = new URL(trimmed);
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    return {
      host: u.hostname,
      port,
      user: u.username || undefined,
      password: u.password || undefined,
    };
  } catch {
    return null;
  }
}

async function createConnectTunnel(
  proxy: ParsedProxyEndpoint,
  targetHost: string,
  targetPort: number,
): Promise<import('node:net').Socket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Host: `${targetHost}:${targetPort}`,
    };
    if (proxy.user) {
      const auth = Buffer.from(`${proxy.user}:${proxy.password ?? ''}`).toString('base64');
      headers['Proxy-Authorization'] = `Basic ${auth}`;
    }

    const req = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers,
    });

    req.on('connect', (res, socket) => {
      if (res.statusCode === 200) {
        resolve(socket);
      } else {
        reject(new Error(`Proxy CONNECT failed: ${res.statusCode ?? 'unknown'}`));
      }
    });
    req.on('error', reject);
    req.end();
  });
}

async function buildTlsAgentOptions(tls: NodeHttpTlsOptions): Promise<https.AgentOptions> {
  const agentOptions: https.AgentOptions = {
    keepAlive: false,
    rejectUnauthorized: tls.rejectUnauthorized,
  };

  if (tls.certPath && tls.keyPath) {
    agentOptions.cert = await fs.readFile(tls.certPath);
    agentOptions.key = await fs.readFile(tls.keyPath);
    if (tls.passphrase) {
      agentOptions.passphrase = tls.passphrase;
    }
  }

  if (tls.caPath) {
    agentOptions.ca = await fs.readFile(tls.caPath);
  }

  return agentOptions;
}

type MutableTimingMarkers = {
  startedAt: number;
  dnsAt?: number;
  connectAt?: number;
  secureAt?: number;
  ttfbAt?: number;
  endedAt?: number;
};

function attachSocketTiming(req: ClientRequest, markers: MutableTimingMarkers): void {
  req.on('socket', (sock) => {
    if (!sock) {
      return;
    }
    sock.once('lookup', () => {
      markers.dnsAt = Date.now();
    });
    sock.once('connect', () => {
      markers.connectAt = Date.now();
    });
    sock.once('secureConnect', () => {
      markers.secureAt = Date.now();
    });
  });
}

function methodAfterRedirect(statusCode: number, method: string): string {
  if (statusCode === 307 || statusCode === 308) {
    return method;
  }
  if (method === 'GET' || method === 'HEAD') {
    return method;
  }
  return 'GET';
}

function normalizeHeaderMap(raw: IncomingMessage['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) {
      continue;
    }
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

function collectSetCookieHeaders(raw: IncomingMessage['headers']): string[] {
  const value = raw['set-cookie'];
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * Executes one HTTP/1.1 request via Node `http`/`https` with per-phase timing markers.
 */
export async function executeNodeHttpRequest(params: NodeHttpExecuteParams): Promise<NodeHttpExecuteResult> {
  const urlObj = new URL(params.url);
  const isHttps = urlObj.protocol === 'https:';
  const startTime = Date.now();
  const markers: MutableTimingMarkers = { startedAt: startTime };
  const inboundRedirects = [...(params.inboundRedirects ?? [])];
  const redirectDepth = params.redirectDepth ?? 0;

  const headers: Record<string, string> = { ...params.headers };

  if (params.getCookieHeader) {
    const cookie = await params.getCookieHeader(params.url);
    if (cookie) {
      headers['Cookie'] = headers['Cookie'] ? `${headers['Cookie']}; ${cookie}` : cookie;
    }
  }

  const requestOptions: RequestOptions = {
    method: params.method,
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    headers,
  };

  const tlsAgentOptions = isHttps ? await buildTlsAgentOptions(params.tls) : undefined;

  let proxyEndpoint: ParsedProxyEndpoint | null = null;
  if (params.proxy?.enabled) {
    const proxyUrl = isHttps
      ? params.proxy.httpsProxy || params.proxy.httpProxy
      : params.proxy.httpProxy;
    proxyEndpoint = parseProxyUrl(proxyUrl);
  }

  if (proxyEndpoint) {
    if (isHttps) {
      const socket = await createConnectTunnel(
        proxyEndpoint,
        requestOptions.hostname!,
        Number(requestOptions.port),
      );
      requestOptions.createConnection = () => socket;
    } else {
      requestOptions.hostname = proxyEndpoint.host;
      requestOptions.port = proxyEndpoint.port;
      requestOptions.path = urlObj.toString();
      if (proxyEndpoint.user) {
        const auth = Buffer.from(`${proxyEndpoint.user}:${proxyEndpoint.password ?? ''}`).toString(
          'base64',
        );
        headers['Proxy-Authorization'] = `Basic ${auth}`;
      }
    }
  }

  const protocol = isHttps ? https : http;
  const agent = isHttps
    ? new https.Agent(tlsAgentOptions ?? { keepAlive: false })
    : new http.Agent({ keepAlive: false });
  requestOptions.agent = agent;

  if (isHttps) {
    (requestOptions as https.RequestOptions).servername = urlObj.hostname;
  }

  let bodyData: Buffer | string | undefined = params.body;
  if (bodyData !== undefined) {
    const length = Buffer.isBuffer(bodyData) ? bodyData.length : Buffer.byteLength(bodyData);
    headers['Content-Length'] = String(length);
  }

  return new Promise((resolve, reject) => {
    const req = protocol.request(requestOptions, (res) => {
      markers.ttfbAt = Date.now();

      const setCookies = collectSetCookieHeaders(res.headers);
      if (setCookies.length > 0 && params.onSetCookie) {
        void params.onSetCookie(params.url, setCookies);
      }

      const statusCode = res.statusCode ?? 0;
      const locationHeader = res.headers.location;
      if (
        params.followRedirects &&
        statusCode >= 300 &&
        statusCode < 400 &&
        locationHeader &&
        redirectDepth < params.maxRedirects
      ) {
        res.resume();
        const nextUrl = new URL(String(locationHeader), params.url).href;
        const hopMs = Date.now() - startTime;
        const nextRedirects: HttpResponseRedirectHop[] = [
          ...inboundRedirects,
          {
            from: params.url,
            to: nextUrl,
            statusCode,
            timeMs: hopMs,
          },
        ];
        const nextMethod = methodAfterRedirect(statusCode, params.method);
        void executeNodeHttpRequest({
          ...params,
          method: nextMethod,
          body: nextMethod === 'GET' || nextMethod === 'HEAD' ? undefined : params.body,
          url: nextUrl,
          inboundRedirects: nextRedirects,
          redirectDepth: redirectDepth + 1,
        })
          .then(resolve)
          .catch(reject);
        return;
      }

      const decoded = decodeResponseStream(res);
      const chunks: Buffer[] = [];
      decoded.on('data', (chunk: Buffer) => chunks.push(chunk));
      decoded.on('error', (err) => reject(err));
      decoded.on('end', () => {
        markers.endedAt = Date.now();
        const buffer = Buffer.concat(chunks);
        const cleanHeaders = normalizeHeaderMap(res.headers);
        if (cleanHeaders['content-encoding']) {
          delete cleanHeaders['content-encoding'];
        }
        cleanHeaders['content-length'] = String(buffer.length);

        resolve({
          statusCode,
          statusText: res.statusMessage ?? '',
          headers: cleanHeaders,
          body: buffer,
          timing: computeTimingFromMarkers(markers),
          redirects: inboundRedirects,
        });
      });
    });

    attachSocketTiming(req, markers);

    req.on('error', (err) => reject(err));

    if (params.timeoutMs > 0) {
      req.setTimeout(params.timeoutMs, () => {
        req.destroy();
        reject(new Error(`Request timeout after ${params.timeoutMs}ms`));
      });
    }

    if (bodyData !== undefined) {
      req.write(bodyData);
    }
    req.end();
  });
}
