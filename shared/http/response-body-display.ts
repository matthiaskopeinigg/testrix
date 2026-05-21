import type { HttpResponseSnapshot } from './outgoing-request.schema';
import {
  formatHttpBodyForPreview,
  inferHttpBodySyntaxModeFromHeaders,
  type HttpBodySyntaxMode,
} from './http-body-editor-language';

export type ResponseEditorLanguage =
  | 'json'
  | 'xml'
  | 'html'
  | 'graphql'
  | 'css'
  | 'scss'
  | 'plaintext';

export function getResponseBodyText(snapshot: HttpResponseSnapshot | null): string {
  if (!snapshot) {
    return '';
  }
  if (snapshot.body.encoding === 'text' && snapshot.body.text !== undefined) {
    return snapshot.body.text;
  }
  return '';
}

export function isResponseBodyBinary(snapshot: HttpResponseSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }
  return snapshot.body.encoding === 'base64';
}

export function getResponseContentType(snapshot: HttpResponseSnapshot | null): string {
  if (!snapshot) {
    return '';
  }
  const fromBody = snapshot.body.contentType?.trim();
  if (fromBody) {
    return fromBody;
  }
  return (
    snapshot.headers.find((h) => h.key.trim().toLowerCase() === 'content-type')?.value?.trim() ?? ''
  );
}

export function detectResponseBodySyntaxMode(snapshot: HttpResponseSnapshot | null): HttpBodySyntaxMode {
  if (!snapshot) {
    return 'plain';
  }
  return inferHttpBodySyntaxModeFromHeaders(
    snapshot.headers,
    getResponseBodyText(snapshot),
    isResponseBodyBinary(snapshot),
  );
}

export function detectResponseEditorLanguage(snapshot: HttpResponseSnapshot | null): ResponseEditorLanguage {
  const mode = detectResponseBodySyntaxMode(snapshot);
  return mode === 'plain' ? 'plaintext' : mode;
}

/** @deprecated Use {@link formatHttpBodyForPreview} via snapshot helpers. */
export function formatPrettyBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2);
  } catch {
    return text;
  }
}

export function formatPrettyResponseBody(snapshot: HttpResponseSnapshot | null): string {
  if (!snapshot) {
    return '';
  }
  const mode = detectResponseBodySyntaxMode(snapshot);
  return formatHttpBodyForPreview(
    getResponseBodyText(snapshot),
    mode,
    isResponseBodyBinary(snapshot),
  );
}

export function isHtmlPreview(snapshot: HttpResponseSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }
  const mode = detectResponseBodySyntaxMode(snapshot);
  return mode === 'html';
}

export function isImagePreview(snapshot: HttpResponseSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }
  return getResponseContentType(snapshot).toLowerCase().startsWith('image/');
}

export function previewKind(snapshot: HttpResponseSnapshot | null): 'html' | 'image' | 'none' {
  if (isImagePreview(snapshot) && snapshot?.body.base64) {
    return 'image';
  }
  if (isHtmlPreview(snapshot) && getResponseBodyText(snapshot)) {
    return 'html';
  }
  return 'none';
}
