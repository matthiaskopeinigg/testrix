import {
  capBody,
  collectionFolderAuthSchema,
  redactHeaders,
  redactSnapshot,
  type HistoryEntry,
  type HttpExecuteRequest,
} from '@testrix/contracts';

import type { DesktopApiService } from '../../core/desktop-api.service';
import type { HistoryStore } from './history.store';

export function historyEntryToExecuteRequest(
  entry: HistoryEntry,
  cookies: HttpExecuteRequest['cookies'],
): HttpExecuteRequest {
  const url = entry.url.trim() || 'https://localhost';
  return {
    method: entry.method,
    url,
    headers: entry.requestHeaders.map((row) => ({ key: row.key, value: row.value })),
    body: entry.requestBody,
    followRedirects: true,
    verifyTls: true,
    timeoutMs: 30_000,
    sendCookies: true,
    cookies: [...cookies],
    auth: collectionFolderAuthSchema.parse({}),
    preRequest: [],
    postResponse: [],
    variables: {},
  };
}

export async function sendHistoryEntryAgain(input: {
  readonly entry: HistoryEntry;
  readonly desktop: DesktopApiService;
  readonly history: HistoryStore;
  readonly cookies: readonly HttpExecuteRequest['cookies'][number][];
  readonly mergeCookies?: (rows: HttpExecuteRequest['cookies']) => Promise<void>;
}): Promise<void> {
  const abortId = globalThis.crypto?.randomUUID?.() ?? `hist_resend_${Date.now()}`;
  const payload = historyEntryToExecuteRequest(input.entry, [...input.cookies]);
  const result = await input.desktop.api.http.execute({ ...payload, abortId });
  if (result.setCookies.length > 0 && input.mergeCookies)
    await input.mergeCookies(result.setCookies);
  const snapshot = redactSnapshot({
    id: globalThis.crypto?.randomUUID?.() ?? `run_${Date.now()}`,
    at: new Date().toISOString(),
    method: input.entry.method,
    url: result.url || payload.url,
    status: result.status,
    statusText: result.statusText || (result.error ? 'Error' : ''),
    durationMs: result.durationMs,
    sizeLabel: result.sizeLabel,
    error: result.error,
    requestHeaders: redactHeaders(payload.headers.map((row) => ({ key: row.key, value: row.value }))),
    requestBody: capBody(payload.body),
    responseHeaders: redactHeaders(result.headers.map((row) => ({ key: row.key, value: row.value }))),
    responseBody: capBody(result.error && !result.body ? result.error : result.body),
    httpVersion: result.httpVersion,
    timing: result.timing,
    redirects: result.redirects,
    setCookies: result.setCookies,
  });
  await input.history.append({
    ...snapshot,
    requestId: input.entry.requestId,
    requestName: input.entry.requestName,
    workspaceId: input.entry.workspaceId,
  });
}
