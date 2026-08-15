import type { ErrorCode } from './error-codes';
import { ErrorCodes } from './error-codes';

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

const TESTRIX_ERROR_MESSAGE_RE = /^([A-Z][A-Z0-9_]*): (.+)$/s;
const ELECTRON_INVOKE_ERROR_RE = /^Error invoking remote method '[^']+': (.+)$/s;

function readIpcFields(value: object): IpcErrorPayload | null {
  const o = value as Record<string, unknown>;
  if (typeof o['code'] === 'string' && typeof o['userMessage'] === 'string') {
    return { code: o['code'] as ErrorCode, userMessage: o['userMessage'] };
  }
  return null;
}

/**
 * Extracts a Testrix IPC error payload from an `ipcRenderer.invoke` rejection.
 * Electron wraps non-`Error` throws as `Error invoking remote method …: [object Object]`;
 * main must reject with an `Error` (see `createIpcRejection`).
 */
export function unwrapIpcInvokeError(error: unknown): IpcErrorPayload | null {
  if (isIpcErrorPayload(error)) {
    return { code: error.code, userMessage: error.userMessage };
  }
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const direct = readIpcFields(error);
  if (direct) {
    return direct;
  }

  if (error instanceof Error) {
    return parseErrorText(error.message);
  }

  return null;
}

/**
 * Parses Electron invoke wrappers and `CODE: message` / `TestrixError: CODE: message` text.
 */
function parseErrorText(message: string): IpcErrorPayload | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }

  const fromMessage = parseTestrixErrorMessage(stripTestrixErrorName(trimmed));
  if (fromMessage) {
    return fromMessage;
  }

  const invokeTail = ELECTRON_INVOKE_ERROR_RE.exec(trimmed)?.[1]?.trim();
  if (!invokeTail || invokeTail === '[object Object]') {
    return null;
  }

  const inner = stripTestrixErrorName(invokeTail);
  const fromTail = parseTestrixErrorMessage(inner);
  if (fromTail) {
    return fromTail;
  }
  return { code: ErrorCodes.IPC_HANDLER_FAILED, userMessage: inner };
}

/** Drops the `TestrixError:` prefix Electron may prepend via `error.toString()`. */
function stripTestrixErrorName(message: string): string {
  return message.replace(/^TestrixError:\s*/, '');
}

function parseTestrixErrorMessage(message: string): IpcErrorPayload | null {
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  const match = TESTRIX_ERROR_MESSAGE_RE.exec(trimmed);
  if (!match) {
    return null;
  }
  return { code: match[1] as ErrorCode, userMessage: match[2]!.trim() };
}
