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

/**
 * Directory URL used to resolve relative stylesheet, script, and image paths in HTML preview.
 */
export function resolvePreviewBaseHref(requestUrl: string): string {
  const trimmed = requestUrl.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    const path = url.pathname;
    if (path.endsWith('/')) {
      return url.href;
    }
    const lastSlash = path.lastIndexOf('/');
    url.pathname = lastSlash >= 0 ? `${path.slice(0, lastSlash + 1)}` : '/';
    return url.href;
  } catch {
    return '';
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Injects a `<base href>` so iframe `srcdoc` previews resolve relative CSS and assets.
 */
export function prepareHtmlPreviewDocument(html: string, requestUrl: string): string {
  const baseHref = resolvePreviewBaseHref(requestUrl);
  if (!baseHref || /<base\b/i.test(html)) {
    return html;
  }

  const baseTag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${baseTag}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${baseTag}</head>`);
  }
  return `<head>${baseTag}</head>${html}`;
}
