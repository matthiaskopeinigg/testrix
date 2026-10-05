/**
 * Shared Listen / Intercept match + manipulate config for flow nodes.
 */

import { flowHttpHitMatches, type FlowHttpUrlMatch } from './flow-http-match';

export const FLOW_HTTP_STAGES = ['request', 'response'] as const;
export type FlowHttpStage = (typeof FLOW_HTTP_STAGES)[number];

export const FLOW_INTERCEPT_ACTIONS = ['passthrough', 'mock', 'block'] as const;
export type FlowInterceptAction = (typeof FLOW_INTERCEPT_ACTIONS)[number];

export interface FlowHttpMatchConfig {
  readonly stage: FlowHttpStage;
  readonly method: string;
  readonly match: FlowHttpUrlMatch | string;
  readonly url: string;
  readonly headerName: string;
  readonly headerValue: string;
  readonly bodyContains: string;
  readonly waitMs: number;
}

export interface FlowInterceptManipulateConfig {
  readonly action: FlowInterceptAction;
  /** KV rows JSON (request-tab headers shape) or legacy `{ "Header": "value" }` object */
  readonly setHeaders: string;
  /** KV rows JSON (keys only) or legacy comma-separated header names */
  readonly removeHeaders: string;
  readonly setBody: string;
  /** Body language mode for setBody / mockBody editors */
  readonly bodyMode?: string;
  readonly mockStatus: number;
  readonly mockBody: string;
}

export type FlowInterceptRuleConfig = FlowHttpMatchConfig & FlowInterceptManipulateConfig;

export interface FlowProxyHit {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: string;
  readonly at: number;
  readonly ruleId: string;
}

export function parseFlowHttpStage(value: unknown): FlowHttpStage {
  return value === 'response' ? 'response' : 'request';
}

export function parseFlowInterceptAction(value: unknown): FlowInterceptAction {
  if (value === 'mock' || value === 'block' || value === 'passthrough')
    return value;
  return 'passthrough';
}

export function defaultFlowHttpMatchConfig(): FlowHttpMatchConfig {
  return {
    stage: 'response',
    method: '*',
    match: 'contains',
    url: '',
    headerName: '',
    headerValue: '',
    bodyContains: '',
    waitMs: 10_000,
  };
}

export function defaultFlowInterceptConfig(): FlowInterceptRuleConfig {
  return {
    ...defaultFlowHttpMatchConfig(),
    action: 'passthrough',
    setHeaders: '[]',
    removeHeaders: '[]',
    setBody: '',
    bodyMode: 'json',
    mockStatus: 200,
    mockBody: '{\n}\n',
  };
}

export function parseHeaderMap(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed)
    return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const item of parsed) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          continue;
        const row = item as { key?: unknown; value?: unknown; enabled?: unknown };
        if (row.enabled === false)
          continue;
        const key = typeof row.key === 'string' ? row.key.trim() : '';
        if (!key)
          continue;
        out[key] = row.value == null ? '' : String(row.value);
      }
      return out;
    }
    if (!parsed || typeof parsed !== 'object')
      return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key.trim())
        continue;
      out[key.trim()] = value == null ? '' : String(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function parseHeaderNameList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed)
    return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const names: string[] = [];
        for (const item of parsed) {
          if (typeof item === 'string') {
            const name = item.trim();
            if (name)
              names.push(name);
            continue;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
          const row = item as { key?: unknown; enabled?: unknown };
          if (row.enabled === false)
            continue;
          const key = typeof row.key === 'string' ? row.key.trim() : '';
          if (key)
            names.push(key);
        }
        return names;
      }
    } catch {
      /* fall through to comma list */
    }
  }
  return trimmed
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * True when a proxy hit satisfies Listen / Intercept match filters
 * (method, URL, optional header, optional body substring).
 */
export function flowProxyHitMatches(
  hit: {
    readonly method: string;
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly requestHeaders?: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly requestBody?: string;
  },
  filter: {
    readonly stage?: FlowHttpStage;
    readonly method?: string;
    readonly match?: string;
    readonly url?: string;
    readonly headerName?: string;
    readonly headerValue?: string;
    readonly bodyContains?: string;
  },
): boolean {
  if (!flowHttpHitMatches(hit, filter))
    return false;

  const headerName = filter.headerName?.trim() ?? '';
  if (headerName) {
    const stage = filter.stage === 'request' ? 'request' : 'response';
    const headers = stage === 'request' ? hit.requestHeaders ?? {} : hit.headers ?? {};
    const actual = findHeader(headers, headerName);
    if (actual === null)
      return false;
    const expected = filter.headerValue?.trim() ?? '';
    if (expected && !actual.toLowerCase().includes(expected.toLowerCase()))
      return false;
  }

  const bodyNeedle = filter.bodyContains?.trim() ?? '';
  if (bodyNeedle) {
    const stage = filter.stage === 'request' ? 'request' : 'response';
    const body = stage === 'request' ? hit.requestBody ?? '' : hit.body ?? '';
    if (!body.toLowerCase().includes(bodyNeedle.toLowerCase()))
      return false;
  }

  return true;
}

function findHeader(headers: Readonly<Record<string, string>>, name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower)
      return value;
  }
  return null;
}
