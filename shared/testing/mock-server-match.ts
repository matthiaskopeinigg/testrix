import type { HttpMethodId } from '../config/http-settings.schema';
import type {
  MockRuleMatcher,
  MockServerEndpoint,
  MockServerOptions,
  MockServerTreeItem,
  MockResponse,
} from './mock-server.schema';
import { isMockServerEndpoint } from './mock-server.schema';

/** Normalized incoming HTTP request for mock matching. */
export interface ParsedMockRequest {
  readonly method: string;
  readonly url: string;
  readonly pathname: string;
  readonly query: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText: string;
  readonly contentType?: string;
}

/**
 * Parses URL path and query from a request URL string.
 */
export function parseMockRequestUrl(url: string): { pathname: string; query: string } {
  try {
    const base = url.startsWith('http') ? url : `http://localhost${url.startsWith('/') ? '' : '/'}${url}`;
    const parsed = new URL(base);
    return { pathname: parsed.pathname || '/', query: parsed.search ? parsed.search.slice(1) : '' };
  } catch {
    const q = url.indexOf('?');
    if (q >= 0) {
      return { pathname: url.slice(0, q) || '/', query: url.slice(q + 1) };
    }
    return { pathname: url || '/', query: '' };
  }
}

/**
 * Builds a normalized mock request from raw HTTP parts.
 */
export function parseIncomingMockRequest(parts: {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText?: string;
}): ParsedMockRequest {
  const { pathname, query } = parseMockRequestUrl(parts.url);
  const headersLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(parts.headers)) {
    headersLower[k.toLowerCase()] = v;
  }
  const contentType = headersLower['content-type'];
  return {
    method: parts.method.toUpperCase(),
    url: parts.url,
    pathname,
    query,
    headers: headersLower,
    bodyText: parts.bodyText ?? '',
    contentType,
  };
}

function matchGlob(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  try {
    return new RegExp(`^${escaped}$`, 'i').test(value);
  } catch {
    return false;
  }
}

function matchPath(
  pathMatch: MockRuleMatcher['path'],
  request: ParsedMockRequest,
): boolean {
  const target = pathMatch.ignoreQuery ? request.pathname : request.url;
  const value = pathMatch.value;
  switch (pathMatch.mode) {
    case 'exact':
      return pathMatch.ignoreQuery
        ? request.pathname === value
        : request.url === value || request.pathname === value;
    case 'prefix':
      return target.startsWith(value);
    case 'glob':
      return matchGlob(value, target);
    case 'regex':
      try {
        return new RegExp(value).test(target);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function matchHeaderRow(
  row: MockRuleMatcher['headers'][number],
  request: ParsedMockRequest,
): boolean {
  if (!row.enabled || !row.key.trim()) {
    return true;
  }
  const actual = request.headers[row.key.toLowerCase()] ?? '';
  const expected = row.value;
  switch (row.match) {
    case 'equals':
      return actual === expected;
    case 'contains':
      return actual.includes(expected);
    case 'regex':
      try {
        return new RegExp(expected).test(actual);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function matchBody(
  body: NonNullable<MockRuleMatcher['body']>,
  request: ParsedMockRequest,
): boolean {
  if (body.bodyType === 'none') {
    return !request.bodyText.trim();
  }
  const text = request.bodyText;
  switch (body.match) {
    case 'equals':
      return text === body.value;
    case 'contains':
      return text.includes(body.value);
    case 'regex':
      try {
        return new RegExp(body.value).test(text);
      } catch {
        return false;
      }
    case 'jsonPath':
    case 'jsonSchema':
      try {
        const parsed = JSON.parse(text) as unknown;
        if (body.match === 'jsonPath') {
          return jsonPathSimpleMatch(body.value, parsed);
        }
        return true;
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function jsonPathSimpleMatch(path: string, data: unknown): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '$') {
    return data !== undefined;
  }
  const segments = trimmed.replace(/^\$\.?/, '').split('.').filter(Boolean);
  let current: unknown = data;
  for (const seg of segments) {
    if (current === null || typeof current !== 'object') {
      return false;
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current !== undefined;
}

/**
 * Returns true when the matcher method and path rules pass (toolbar route).
 */
export function matchMockRoute(matcher: MockRuleMatcher, request: ParsedMockRequest): boolean {
  if (!matcher.enabled) {
    return false;
  }
  if (matcher.methods.length > 0 && !matcher.methods.includes(request.method as HttpMethodId)) {
    return false;
  }
  return matchPath(matcher.path, request);
}

/**
 * Returns true when header and optional body rules on the matcher pass.
 */
export function matchMockHeadersAndBody(
  matcher: MockRuleMatcher,
  request: ParsedMockRequest,
): boolean {
  if (!matcher.enabled) {
    return false;
  }
  for (const row of matcher.headers) {
    if (!matchHeaderRow(row, request)) {
      return false;
    }
  }
  if (matcher.body) {
    if (!matchBody(matcher.body, request)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true when all enabled clauses on the matcher pass (route + headers + body).
 */
export function matchMockRule(matcher: MockRuleMatcher, request: ParsedMockRequest): boolean {
  return matchMockRoute(matcher, request) && matchMockHeadersAndBody(matcher, request);
}

function matcherHasHeaderOrBodyRules(matcher: MockRuleMatcher): boolean {
  const hasHeaders = matcher.headers.some((row) => row.enabled && row.key.trim().length > 0);
  return hasHeaders || matcher.body !== undefined;
}

/**
 * Returns true when the request matches an endpoint: route on the first matcher, then any
 * enabled matcher that defines header/body rules (evaluated in priority order). When no
 * matcher defines header/body rules, matching the route is sufficient.
 */
export function matchMockEndpoint(
  endpoint: MockServerEndpoint,
  request: ParsedMockRequest,
): boolean {
  const routeMatcher = endpoint.matchers[0];
  if (!routeMatcher || !matchMockRoute(routeMatcher, request)) {
    return false;
  }
  const withRules = [...endpoint.matchers]
    .filter((m) => m.enabled && matcherHasHeaderOrBodyRules(m))
    .sort((a, b) => a.priority - b.priority);
  if (withRules.length === 0) {
    return true;
  }
  return withRules.some((matcher) => matchMockHeadersAndBody(matcher, request));
}

interface RankedEndpoint {
  readonly endpoint: MockServerEndpoint;
  readonly sortKey: number;
}

function collectEndpoints(items: readonly MockServerTreeItem[]): MockServerEndpoint[] {
  const out: MockServerEndpoint[] = [];
  const walk = (nodes: readonly MockServerTreeItem[]): void => {
    for (const node of nodes) {
      if (isMockServerEndpoint(node)) {
        if (node.enabled) {
          out.push(node);
        }
      } else {
        walk(node.children);
      }
    }
  };
  walk(items);
  return out;
}

/**
 * Finds the first matching endpoint for an incoming request.
 */
export function findMockEndpoint(
  items: readonly MockServerTreeItem[],
  request: ParsedMockRequest,
): MockServerEndpoint | null {
  const endpoints = collectEndpoints(items).map((endpoint) => ({
    endpoint,
    sortKey: endpoint.priority,
  }));
  endpoints.sort((a, b) => a.sortKey - b.sortKey);

  for (const { endpoint } of endpoints) {
    if (matchMockEndpoint(endpoint, request)) {
      return endpoint;
    }
  }
  return null;
}

/**
 * Serializes mock response body to a string for HTTP output.
 */
export function serializeMockResponseBody(
  body: MockResponse['body'],
): { readonly text: string; readonly contentType?: string } {
  switch (body.mode) {
    case 'none':
      return { text: '' };
    case 'json':
    case 'text':
    case 'html':
    case 'xml':
      return {
        text: body.raw,
        contentType:
          body.mode === 'json'
            ? 'application/json'
            : body.mode === 'xml'
              ? 'application/xml'
              : body.mode === 'html'
                ? 'text/html'
                : 'text/plain',
      };
    case 'graphql':
      return { text: JSON.stringify({ query: body.query, variables: body.variables }), contentType: 'application/json' };
    case 'form-data':
    case 'x-www-form-urlencoded':
      return { text: '' };
    case 'binary':
      if (body.source === 'inline' && body.contentBase64) {
        return { text: body.contentBase64, contentType: body.contentType ?? 'application/octet-stream' };
      }
      return { text: '', contentType: 'application/octet-stream' };
    default:
      return { text: '' };
  }
}

/**
 * Computes total response delay from server options and endpoint response.
 */
export function resolveMockResponseDelayMs(
  options: MockServerOptions,
  response: MockResponse,
): number {
  return options.delayMs + (response.delayMs ?? response.latencyMs ?? 0);
}

/**
 * Builds enabled response header map from mock response definition.
 */
export function buildMockResponseHeaders(
  response: MockResponse,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const row of response.headers) {
    if (row.enabled && row.key.trim()) {
      headers[row.key] = row.value;
    }
  }
  const { contentType } = serializeMockResponseBody(response.body);
  if (contentType && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}
