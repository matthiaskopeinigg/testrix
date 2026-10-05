import { STATUS_CODES } from 'node:http';
import { request, type Dispatcher } from 'undici';
import {
  cookiesMatchingUrl,
  DEFAULT_API_KEY_HEADER,
  defaultHttpTiming,
  ensureRequestUrlScheme,
  formatCookieHeader,
  httpExecuteRequestSchema,
  withWwwHost,
  type HttpExecuteRequest,
  type HttpExecuteResponse,
  type HttpHeaderPair,
  type HttpRedirectHop,
  type HttpTiming,
} from '@testrix/contracts';

import { formatByteSize, parseSetCookieHeaders } from './cookies';
import { buildDigestAuthorization, findWwwAuthenticate, parseDigestChallenge } from './digest';
import { isUnresolvedHostnameError } from './host-error';
import { isRedirectStatus, redirectHop, redirectMethod, resolveRedirectUrl } from './redirects';
import { runCollectionScripts } from './scripts';
import { dispatcherFor, emptyConnectTimings, type ConnectTimings } from './timed-connect';
import { decodeHttpBody } from './decode-body';

const MAX_REDIRECTS = 20;

interface DispatchResult {
  readonly status: number;
  readonly statusText: string;
  readonly headers: HttpHeaderPair[];
  readonly body: string;
  readonly httpVersion: string;
  readonly headerMs: number;
  readonly downloadMs: number;
}

function headerRecord(headers: readonly HttpHeaderPair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers) {
    if (header.key.trim())
      out[header.key] = header.value;
  }
  return out;
}

function headerPairsFromUndici(headers: Record<string, string | string[] | undefined>): HttpHeaderPair[] {
  const out: HttpHeaderPair[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined)
      continue;
    if (Array.isArray(value)) {
      for (const item of value)
        out.push({ key, value: String(item) });
      continue;
    }
    out.push({ key, value: String(value) });
  }
  return out;
}

function applyAuth(payload: HttpExecuteRequest, url: URL, headers: Record<string, string>): string {
  const auth = payload.auth;
  if (auth.type === 'bearer' && auth.token.trim())
    headers['Authorization'] = `Bearer ${auth.token.trim()}`;
  if (auth.type === 'oauth2' && auth.accessToken.trim()) {
    const type = auth.tokenType.trim() || 'Bearer';
    headers['Authorization'] = `${type} ${auth.accessToken.trim()}`;
  }
  if (auth.type === 'basic' && (auth.username || auth.password)) {
    const raw = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    headers['Authorization'] = `Basic ${raw}`;
  }
  if (auth.type === 'apikey' && auth.apiKey.trim()) {
    const name = auth.apiKeyHeader.trim() || DEFAULT_API_KEY_HEADER;
    if (auth.apiKeyIn === 'query')
      url.searchParams.set(name, auth.apiKey);
    else
      headers[name] = auth.apiKey;
  }
  return url.toString();
}

function emptyResponse(error: string, durationMs: number, url = ''): HttpExecuteResponse {
  return {
    status: 0,
    statusText: '',
    headers: [],
    body: '',
    durationMs,
    sizeLabel: '0 B',
    setCookies: [],
    error,
    variables: {},
    url,
    httpVersion: 'HTTP/1.1',
    timing: defaultHttpTiming(durationMs),
    redirects: [],
  };
}

function requestSignal(timeoutMs: number, extra?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!extra)
    return timeout;
  if (typeof AbortSignal.any === 'function')
    return AbortSignal.any([timeout, extra]);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  timeout.addEventListener('abort', onAbort);
  extra.addEventListener('abort', onAbort);
  if (timeout.aborted || extra.aborted)
    controller.abort();
  return controller.signal;
}

function finalizeTiming(
  connect: ConnectTimings,
  headerMs: number,
  downloadMs: number,
  redirectsMs: number,
  totalMs: number,
): HttpTiming {
  const ttfbMs = Math.max(0, headerMs - connect.dnsMs - connect.tcpMs - connect.tlsMs);
  const known = connect.dnsMs + connect.tcpMs + connect.tlsMs + ttfbMs + downloadMs + redirectsMs;
  return {
    dnsMs: connect.dnsMs,
    tcpMs: connect.tcpMs,
    tlsMs: connect.tlsMs,
    ttfbMs,
    downloadMs,
    redirectsMs,
    otherMs: Math.max(0, totalMs - known),
    totalMs,
  };
}

async function dispatch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  dispatcher: Dispatcher,
  signal: AbortSignal,
): Promise<DispatchResult> {
  const canBody = method !== 'GET' && method !== 'HEAD';
  const headerStart = Date.now();
  const response = await request(url, {
    method,
    headers,
    body: canBody && body ? body : undefined,
    dispatcher,
    signal,
  });
  const headerMs = Date.now() - headerStart;
  const downloadStart = Date.now();
  const raw = Buffer.from(await response.body.arrayBuffer());
  const downloadMs = Date.now() - downloadStart;
  const status = response.statusCode;
  const responseHeaders = headerPairsFromUndici(response.headers as Record<string, string | string[] | undefined>);
  return {
    status,
    statusText: STATUS_CODES[status] ?? '',
    headers: responseHeaders,
    body: decodeHttpBody(raw, responseHeaders),
    httpVersion: httpVersionOf(response),
    headerMs,
    downloadMs,
  };
}

function httpVersionOf(response: Dispatcher.ResponseData): string {
  const version = (response as { httpVersion?: string }).httpVersion;
  if (version === '2.0' || version === '2')
    return 'HTTP/2';
  if (version === '0.9')
    return 'HTTP/0.9';
  if (version === '1.0')
    return 'HTTP/1.0';
  return 'HTTP/1.1';
}

async function dispatchWithCookies(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  payload: HttpExecuteRequest,
  dispatcher: Dispatcher,
  signal: AbortSignal,
): Promise<DispatchResult> {
  const requestHeaders = { ...headers };
  const cookies = payload.sendCookies ? cookiesMatchingUrl(payload.cookies, url) : [];
  if (cookies.length > 0 && !requestHeaders['Cookie'] && !requestHeaders['cookie'])
    requestHeaders['Cookie'] = formatCookieHeader(cookies);
  return dispatch(url, method, requestHeaders, body, dispatcher, signal);
}

/** Executes one HTTP request with folder auth, cookies, TLS, and scripts. */
export async function executeHttp(
  raw: HttpExecuteRequest,
  abort?: AbortSignal,
): Promise<HttpExecuteResponse> {
  const parsed = httpExecuteRequestSchema.safeParse(raw);
  const payload = parsed.success ? parsed.data : raw;
  const started = Date.now();
  const signal = requestSignal(payload.timeoutMs, abort);
  let url = payload.url;
  const connect = emptyConnectTimings();
  const dispatcher = dispatcherFor(payload, connect);
  try {
    let method = payload.method.toUpperCase();
    let headers = headerRecord(payload.headers);
    let body = payload.body;
    let variables = { ...payload.variables };

    url = ensureRequestUrlScheme(url);
    const matched = payload.sendCookies ? cookiesMatchingUrl(payload.cookies, url) : [];
    const scriptState = runCollectionScripts(payload.preRequest, {
      method,
      url,
      headers: Object.entries(headers).map(([key, value]) => ({ key, value })),
      body,
      cookies: matched.map((cookie) => ({ name: cookie.name, value: cookie.value })),
      variables,
      status: 0,
      statusText: '',
    });
    method = scriptState.method;
    url = scriptState.url;
    body = scriptState.body;
    variables = scriptState.variables;
    headers = headerRecord(scriptState.headers);

    url = ensureRequestUrlScheme(url);
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return emptyResponse('Enter a valid URL before sending.', Date.now() - started, url);
    }

    url = applyAuth(payload, target, headers);
    target = new URL(url);

    const sendOnce = (requestUrl: string, requestMethod: string, requestBody: string): Promise<DispatchResult> =>
      dispatchWithCookies(requestUrl, requestMethod, headers, requestBody, payload, dispatcher, signal);

    let result: DispatchResult;
    try {
      result = await sendOnce(url, method, body);
    } catch (error) {
      const wwwUrl = withWwwHost(url);
      if (!wwwUrl || !isUnresolvedHostnameError(error))
        throw error;
      url = wwwUrl;
      target = new URL(url);
      result = await sendOnce(url, method, body);
    }

    const hops: HttpRedirectHop[] = [];
    let redirectsMs = 0;
    let lastHeaderMs = result.headerMs;
    let lastDownloadMs = result.downloadMs;
    const setCookieHeaders: HttpHeaderPair[] = [...result.headers];

    for (let hop = 0; hop < MAX_REDIRECTS && payload.followRedirects && isRedirectStatus(result.status); hop += 1) {
      const location = result.headers.find((row) => row.key.toLowerCase() === 'location')?.value;
      const nextUrl = resolveRedirectUrl(url, location);
      if (!nextUrl)
        break;
      hops.push(redirectHop(result.status, url, nextUrl, result.headerMs + result.downloadMs));
      redirectsMs += result.headerMs + result.downloadMs;
      method = redirectMethod(result.status, method);
      if (method === 'GET' || method === 'HEAD')
        body = '';
      url = nextUrl;
      target = new URL(url);
      result = await sendOnce(url, method, body);
      lastHeaderMs = result.headerMs;
      lastDownloadMs = result.downloadMs;
      setCookieHeaders.push(...result.headers);
    }

    if (result.status === 401 && payload.auth.type === 'digest') {
      const challengeHeader = findWwwAuthenticate(result.headers.map((row) => [row.key, row.value]));
      const challenge = challengeHeader ? parseDigestChallenge(challengeHeader) : null;
      if (challenge) {
        headers['Authorization'] = buildDigestAuthorization(
          challenge,
          payload.auth.username,
          payload.auth.password,
          method,
          `${target.pathname}${target.search}`,
        );
        result = await sendOnce(url, method, body);
        lastHeaderMs = result.headerMs;
        lastDownloadMs = result.downloadMs;
      }
    }

    const setCookies = parseSetCookieHeaders(setCookieHeaders, target.hostname);
    const after = runCollectionScripts(payload.postResponse, {
      method,
      url,
      headers: result.headers.map((row) => ({ ...row })),
      body: result.body,
      cookies: setCookies.map((cookie) => ({ name: cookie.name, value: cookie.value })),
      variables,
      status: result.status,
      statusText: result.statusText,
    });

    const durationMs = Date.now() - started;
    const size = Buffer.byteLength(after.body);
    return {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      body: after.body,
      durationMs,
      sizeLabel: formatByteSize(size),
      setCookies,
      error: null,
      variables: after.variables,
      url,
      httpVersion: result.httpVersion,
      timing: finalizeTiming(connect, lastHeaderMs, lastDownloadMs, redirectsMs, durationMs),
      redirects: hops,
    };
  } catch (error) {
    if (abort?.aborted)
      return emptyResponse('Request cancelled.', Date.now() - started, url);
    const message = error instanceof Error ? error.message : 'Request failed.';
    return emptyResponse(message, Date.now() - started, url);
  } finally {
    await dispatcher.close();
  }
}
