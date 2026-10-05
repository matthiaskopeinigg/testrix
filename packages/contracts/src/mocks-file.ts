import { CONFIG_SCHEMA_VERSION } from './settings';
import {
  newServiceNodeId,
  parseUnknownTree,
  type ServiceTreeNode,
} from './service-tree';

export const MOCK_SECTIONS = ['overview', 'matchers', 'response', 'advanced', 'activity'] as const;
export type MockSection = (typeof MOCK_SECTIONS)[number];

/**
 * Maps a persisted or legacy section id onto a valid Mock section.
 */
export function normalizeMockSection(raw: string | null | undefined): MockSection {
  if (
    raw === 'overview' ||
    raw === 'matchers' ||
    raw === 'response' ||
    raw === 'advanced' ||
    raw === 'activity'
  )
    return raw;
  return 'matchers';
}

export interface MockHeader {
  readonly key: string;
  readonly value: string;
}

export interface MockArtifactFields {
  readonly description: string;
  readonly tags: readonly string[];
  readonly enabled: boolean;
  readonly method: string;
  /** contains | equals | path | regex */
  readonly match: string;
  readonly path: string;
  readonly headerName: string;
  readonly headerValue: string;
  readonly bodyContains: string;
  readonly statusCode: number;
  readonly headers: readonly MockHeader[];
  readonly body: string;
  readonly bodyMode: string;
  readonly delayMs: number;
  readonly priority: number;
}

export type MockNode = ServiceTreeNode<MockArtifactFields>;

export interface MockServerOptions {
  readonly host: string;
  readonly port: number;
  readonly delayMs: number;
  readonly cors: boolean;
  readonly autoStartOnLaunch: boolean;
}

export interface MocksFile {
  readonly schemaVersion: number;
  readonly options: MockServerOptions;
  readonly items: readonly MockNode[];
}

export const DEFAULT_MOCK_OPTIONS: MockServerOptions = {
  host: '127.0.0.1',
  port: 4010,
  delayMs: 0,
  cors: true,
  autoStartOnLaunch: false,
};

export const DEFAULT_MOCKS_FILE: MocksFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  options: { ...DEFAULT_MOCK_OPTIONS },
  items: [],
};

export function emptyMockArtifact(name = 'New endpoint'): MockNode {
  const now = new Date().toISOString();
  return {
    kind: 'artifact',
    id: newServiceNodeId(),
    name,
    updatedAt: now,
    description: '',
    tags: [],
    enabled: true,
    method: 'GET',
    match: 'path',
    path: '/health',
    headerName: '',
    headerValue: '',
    bodyContains: '',
    statusCode: 200,
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    body: '{\n  "ok": true\n}\n',
    bodyMode: 'json',
    delayMs: 0,
    priority: 0,
  };
}

export function parseMocksFile(raw: unknown): MocksFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const optionsRaw =
    source['options'] && typeof source['options'] === 'object' && !Array.isArray(source['options'])
      ? (source['options'] as Record<string, unknown>)
      : {};
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    options: {
      host: typeof optionsRaw['host'] === 'string' && optionsRaw['host'] ? optionsRaw['host'] : DEFAULT_MOCK_OPTIONS.host,
      port: typeof optionsRaw['port'] === 'number' ? optionsRaw['port'] : DEFAULT_MOCK_OPTIONS.port,
      delayMs: typeof optionsRaw['delayMs'] === 'number' ? optionsRaw['delayMs'] : 0,
      cors: optionsRaw['cors'] !== false,
      autoStartOnLaunch: optionsRaw['autoStartOnLaunch'] === true,
    },
    items: parseUnknownTree(source['items'], (value) => {
      const response =
        value['response'] && typeof value['response'] === 'object'
          ? (value['response'] as Record<string, unknown>)
          : value;
      return {
        description: typeof value['description'] === 'string' ? value['description'] : '',
        tags: Array.isArray(value['tags']) ? value['tags'].filter((item): item is string => typeof item === 'string') : [],
        enabled: value['enabled'] !== false,
        method: typeof value['method'] === 'string' ? value['method'] : 'GET',
        match: typeof value['match'] === 'string' ? value['match'] : 'path',
        path: typeof value['path'] === 'string' ? value['path'] : '/',
        headerName: typeof value['headerName'] === 'string' ? value['headerName'] : '',
        headerValue: typeof value['headerValue'] === 'string' ? value['headerValue'] : '',
        bodyContains: typeof value['bodyContains'] === 'string' ? value['bodyContains'] : '',
        statusCode: typeof response['statusCode'] === 'number' ? response['statusCode'] : 200,
        headers: Array.isArray(response['headers'])
          ? (response['headers'] as MockHeader[])
          : [{ key: 'Content-Type', value: 'application/json' }],
        body: typeof response['body'] === 'string' ? response['body'] : '{}',
        bodyMode: typeof value['bodyMode'] === 'string' ? value['bodyMode'] : 'json',
        delayMs: typeof response['delayMs'] === 'number' ? response['delayMs'] : 0,
        priority: typeof value['priority'] === 'number' ? value['priority'] : 0,
      };
    }),
  };
}

/**
 * Returns true when a mock endpoint should handle this request.
 */
export function mockEndpointMatches(
  endpoint: MockArtifactFields & { readonly enabled?: boolean },
  method: string,
  urlPath: string,
  requestHeaders: Readonly<Record<string, string>> = {},
  requestBody = '',
): boolean {
  if (endpoint.enabled === false)
    return false;
  if (endpoint.method.toUpperCase() !== method.toUpperCase() && endpoint.method !== '*')
    return false;
  if (!urlMatches(endpoint.match || 'path', endpoint.path, urlPath))
    return false;
  const headerName = endpoint.headerName?.trim() ?? '';
  if (headerName) {
    const actual = findHeader(requestHeaders, headerName);
    if (actual === null)
      return false;
    const expected = endpoint.headerValue?.trim() ?? '';
    if (expected && !actual.toLowerCase().includes(expected.toLowerCase()))
      return false;
  }
  const bodyNeedle = endpoint.bodyContains?.trim() ?? '';
  if (bodyNeedle && !requestBody.toLowerCase().includes(bodyNeedle.toLowerCase()))
    return false;
  return true;
}

function urlMatches(mode: string, pattern: string, urlPath: string): boolean {
  const expected = normalizeMockPath(pattern);
  const actual = normalizeMockPath(urlPath);
  if (mode === 'equals')
    return expected === actual;
  if (mode === 'regex') {
    try {
      return new RegExp(pattern).test(urlPath);
    } catch {
      return false;
    }
  }
  if (mode === 'path' || expected.endsWith('*')) {
    if (expected.endsWith('*'))
      return actual.startsWith(expected.slice(0, -1));
    return actual.includes(expected) || expected === actual;
  }
  // contains (full URL or path)
  return actual.includes(expected.replace(/^\//, '')) || urlPath.includes(pattern);
}

function findHeader(headers: Readonly<Record<string, string>>, name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower)
      return value;
  }
  return null;
}

function normalizeMockPath(value: string): string {
  const path = value.split('?')[0] || '/';
  if (!path.startsWith('/'))
    return `/${path}`;
  return path === '' ? '/' : path;
}
