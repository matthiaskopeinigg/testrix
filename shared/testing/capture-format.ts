import {
  formatHttpBodyForPreview,
  inferHttpBodySyntaxModeFromHeaders,
  type HttpBodySyntaxMode,
} from '../http/http-body-editor-language';

import type { CaptureHeaderPair, CaptureLogEntry } from './capture-log-entry.schema';

/** Language id for readonly capture body editors (tx-code-editor `language` input). */
export type CaptureBodyCodeEditorLanguage = Exclude<HttpBodySyntaxMode, 'plain'> | 'plaintext';

/**
 * Maps inferred HTTP body syntax to a tx-code-editor language id.
 */
export function captureBodyToCodeEditorLanguage(mode: HttpBodySyntaxMode): CaptureBodyCodeEditorLanguage {
  return mode === 'plain' ? 'plaintext' : mode;
}

/**
 * Infers tx-code-editor language for a captured request or response body.
 */
export function captureBodyEditorLanguage(
  headers: readonly CaptureHeaderPair[],
  body: string | undefined,
  isBinary: boolean,
): CaptureBodyCodeEditorLanguage {
  return captureBodyToCodeEditorLanguage(
    inferHttpBodySyntaxModeFromHeaders(headers, body, isBinary),
  );
}

/**
 * Pretty-prints a captured body for readonly code-editor preview (JSON indent, etc.).
 */
export function captureBodyPreviewContent(
  headers: readonly CaptureHeaderPair[],
  body: string | undefined,
  isBinary: boolean,
): string {
  const mode = inferHttpBodySyntaxModeFromHeaders(headers, body, isBinary);
  const formatted = formatHttpBodyForPreview(body, mode, isBinary);
  return formatted || body?.trim() || '';
}

export function captureRequestBodyEditorLanguage(entry: CaptureLogEntry): CaptureBodyCodeEditorLanguage {
  return captureBodyEditorLanguage(entry.requestHeaders, entry.requestBody, entry.requestBodyIsBinary);
}

export function captureRequestBodyPreview(entry: CaptureLogEntry): string {
  return captureBodyPreviewContent(
    entry.requestHeaders,
    entry.requestBody,
    entry.requestBodyIsBinary,
  );
}

export function captureResponseBodyEditorLanguage(entry: CaptureLogEntry): CaptureBodyCodeEditorLanguage {
  return captureBodyEditorLanguage(entry.responseHeaders, entry.responseBody, entry.responseBodyIsBinary);
}

export function captureResponseBodyPreview(entry: CaptureLogEntry): string {
  return captureBodyPreviewContent(
    entry.responseHeaders,
    entry.responseBody,
    entry.responseBodyIsBinary,
  );
}

/**
 * Formats header pairs as `Name: value` lines for read-only detail panels.
 */
export function formatCaptureHeaderPairs(headers: readonly CaptureHeaderPair[]): string {
  if (!headers.length) {
    return '(none)';
  }
  return headers.map((h) => `${h.key}: ${h.value}`).join('\n');
}

/** True when the entry has a non-empty captured request body. */
export function captureEntryHasRequestBody(entry: {
  readonly requestBody?: string;
}): boolean {
  return !!entry.requestBody?.trim();
}

/** True when the entry has response body text or an error note. */
export function captureEntryHasResponseBody(entry: {
  readonly responseBody?: string;
}): boolean {
  return !!entry.responseBody?.trim();
}
