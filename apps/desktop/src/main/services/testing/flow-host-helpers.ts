import type { BrowserWindow } from 'electron';
import {
  ensureRequestUrlScheme,
  extractFlowJsonPath,
  parseFlowCaptureRules,
  type FlowEvalContext,
  type FlowRunEventDetail,
  type FlowScenario,
} from '@testrix/contracts';

export const BODY_PREVIEW_LIMIT = 4000;

export class FlowStepError extends Error {
  constructor(
    message: string,
    readonly detail?: FlowRunEventDetail,
  ) {
    super(message);
    this.name = 'FlowStepError';
  }
}

export function previewBody(body: string): string {
  return body.length > BODY_PREVIEW_LIMIT ? `${body.slice(0, BODY_PREVIEW_LIMIT)}…` : body;
}

export function scenarioNeedsDeviceProxy(scenario: FlowScenario): boolean {
  return scenario.nodes.some(
    (node) => node.kind === 'http-listener' || node.kind === 'http-interceptor',
  );
}

/** Selector-based device steps that cannot run until the user has authored a selector. */
export function devicePickPrefixNeedsSelector(kind: string): boolean {
  return (
    kind === 'device-tap' ||
    kind === 'device-wait-for' ||
    kind === 'device-assert-text' ||
    kind === 'device-assert-visible'
  );
}

/** Device kinds re-run before Pick (Start Device is handled separately). */
export function devicePickPrefixKind(kind: string): boolean {
  return (
    kind.startsWith('device-') &&
    kind !== 'device-start' &&
    kind !== 'device-install'
  );
}

export function httpSummary(detail: FlowRunEventDetail): string {
  if (detail.kind === 'capture' && detail.captures) {
    const names = Object.keys(detail.captures);
    return names.length > 0 ? `captured ${names.join(', ')}` : 'captured';
  }
  if (detail.kind === 'assert')
    return detail.expected && detail.actual ? `${detail.expected} → ${detail.actual}` : 'assert';
  if (detail.method === 'ARM')
    return detail.url ? `armed · ${detail.url.length > 64 ? `${detail.url.slice(0, 64)}…` : detail.url}` : 'armed';
  const parts: string[] = [];
  if (detail.status !== undefined)
    parts.push(String(detail.status));
  if (detail.method)
    parts.push(detail.method);
  if (detail.url)
    parts.push(detail.url.length > 64 ? `${detail.url.slice(0, 64)}…` : detail.url);
  else if (detail.hit === false)
    parts.push('no hit');
  return parts.join(' · ') || 'ok';
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('cancelled'));
      return;
    }
    const timer = setTimeout(resolve, Math.max(0, ms));
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('cancelled'));
      },
      { once: true },
    );
  });
}

export function lowerHeaderRecord(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers))
    out[key.toLowerCase()] = value;
  return out;
}

export function headerMapFromPairs(
  headers: readonly { readonly key: string; readonly value: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of headers) {
    const key = row.key.trim().toLowerCase();
    if (key)
      out[key] = row.value;
  }
  return out;
}

export interface ArmedHttpListen {
  readonly source: 'browser' | 'mock' | 'intercept' | 'proxy';
  readonly method: string;
  readonly match: string;
  readonly urlNeedle: string;
  readonly waitMs: number;
  readonly since: number;
  readonly stage?: 'request' | 'response';
  readonly headerName?: string;
  readonly headerValue?: string;
  readonly bodyContains?: string;
}

export function flowUrlMatches(actual: string, expected: string, mode: string): boolean {
  if (mode === 'equals')
    return actual === expected;
  if (mode === 'regex') {
    try {
      return new RegExp(expected).test(actual);
    } catch {
      return false;
    }
  }
  return actual.includes(expected);
}

export function assertFlowMatch(actual: string, expected: string, mode: string, subject: string): void {
  if (mode === 'equals') {
    if (actual !== expected)
      throw new Error(`${subject} is "${actual}", expected "${expected}"`);
    return;
  }
  if (mode === 'regex') {
    let pattern: RegExp;
    try {
      pattern = new RegExp(expected);
    } catch {
      throw new Error(`Invalid pattern "${expected}"`);
    }
    if (!pattern.test(actual))
      throw new Error(`${subject} is "${actual}", expected to match /${expected}/`);
    return;
  }
  if (!actual.includes(expected))
    throw new Error(`${subject} is "${actual}", expected it to contain "${expected}"`);
}

/**
 * Clears webContents listeners safely after the window may already be destroyed
 * (closing the E2E window mid-run used to throw "Object has been destroyed").
 */
export function settleWebContents(
  win: BrowserWindow,
  resolve: () => void,
  timeoutMs: number,
): () => void {
  let done = false;
  const finish = () => {
    if (done)
      return;
    done = true;
    clearTimeout(timer);
    try {
      if (!win.isDestroyed()) {
        win.webContents.removeListener('dom-ready', finish);
        win.webContents.removeListener('did-finish-load', finish);
        win.webContents.removeListener('did-fail-load', finish);
      }
    } catch {
      // Window/webContents already gone.
    }
    resolve();
  };
  const timer = setTimeout(finish, timeoutMs);
  return finish;
}

export function applyFlowResponse(
  vars: FlowEvalContext,
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
  meta: { readonly method?: string; readonly url?: string; readonly requestBody?: string } = {},
): void {
  const ctx = vars as FlowEvalContext & {
    status: number;
    body: string;
    headers: Record<string, string>;
    method: string;
    url: string;
    requestBody: string;
  };
  ctx.status = status;
  ctx.body = body;
  ctx.headers = { ...headers };
  ctx.method = meta.method ?? ctx.method ?? '';
  ctx.url = meta.url ?? ctx.url ?? '';
  ctx.requestBody = meta.requestBody ?? ctx.requestBody ?? '';
  ctx.vars['status'] = String(status);
  ctx.vars['body'] = body.slice(0, BODY_PREVIEW_LIMIT);
  if (ctx.method)
    ctx.vars['method'] = ctx.method;
  if (ctx.url)
    ctx.vars['url'] = ctx.url;
}

export function applyFlowCaptureRules(vars: FlowEvalContext, rulesRaw: string): Record<string, string> {
  const rules = parseFlowCaptureRules(rulesRaw);
  const captures: Record<string, string> = {};
  for (const rule of rules) {
    const name = rule.name.trim();
    if (!name)
      continue;
    if (rule.kind === 'body') {
      vars.vars[name] = vars.body;
      captures[name] = previewBody(vars.body);
      continue;
    }
    if (rule.kind === 'status') {
      vars.vars[name] = String(vars.status);
      captures[name] = String(vars.status);
      continue;
    }
    if (rule.kind === 'header') {
      const key = rule.path.trim().toLowerCase();
      if (!key)
        throw new Error('Capture header rule needs a header name');
      const value = vars.headers[key];
      if (value === undefined)
        throw new Error(`Response header not found: ${rule.path.trim()}`);
      vars.vars[name] = value;
      captures[name] = value;
      continue;
    }
    const value = extractFlowJsonPath(vars.body, rule.path);
    vars.vars[name] = value;
    captures[name] = previewBody(value);
  }
  return captures;
}

export function normalizeUrlForCompare(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed)
    return '';
  try {
    const parsed = new URL(ensureRequestUrlScheme(trimmed));
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return trimmed.toLowerCase();
  }
}
