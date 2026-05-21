import type { ErrorCode } from './error-codes';

export class TestrixError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;

  constructor(code: ErrorCode, userMessage: string, options?: { cause?: unknown }) {
    super(`${code}: ${userMessage}`, { cause: options?.cause });
    this.code = code;
    this.userMessage = userMessage;
    this.name = 'TestrixError';
  }
}
