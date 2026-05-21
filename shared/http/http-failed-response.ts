import { isIpcErrorPayload } from '../errors/ipc-error-payload';

import type { OutgoingHttpRequest } from './outgoing-request.schema';
import type { HttpResponseSnapshot } from './outgoing-request.schema';

function newSnapshotId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `err-${Date.now()}`;
}

/**
 * Resolves a user-facing message from an IPC or network failure.
 */
export function resolveHttpErrorMessage(error: unknown): string {
  if (isIpcErrorPayload(error)) {
    return error.userMessage;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Request failed';
}

/**
 * Builds a response snapshot for transport/DNS/timeout failures (no HTTP response received).
 */
export function createFailedHttpResponseSnapshot(
  request: Pick<
    OutgoingHttpRequest,
    'requestId' | 'method' | 'url' | 'environmentId'
  >,
  message: string,
): HttpResponseSnapshot {
  const text = message.trim() || 'Request failed';
  return {
    id: newSnapshotId(),
    capturedAt: new Date().toISOString(),
    requestSummary: {
      method: request.method,
      url: request.url,
      environmentId: request.environmentId,
      requestId: request.requestId,
    },
    status: {
      code: 0,
      text: 'Error',
      ok: false,
    },
    timing: { totalMs: 0 },
    size: {
      headersBytes: 0,
      bodyBytes: text.length,
    },
    headers: [],
    redirects: [],
    body: {
      encoding: 'text',
      text,
      contentType: 'text/plain',
    },
    meta: { errorMessage: text },
  };
}
