import type { ErrorCode } from './error-codes';

/** Serializable rejection payload crossing IPC boundary (no stacks in prod). */
export interface IpcErrorPayload {
  readonly code: ErrorCode;
  readonly userMessage: string;
}

export function isIpcErrorPayload(value: unknown): value is IpcErrorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return typeof o['code'] === 'string' && typeof o['userMessage'] === 'string';
}
