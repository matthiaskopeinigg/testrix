import type { HttpResponseHeader } from './outgoing-request.schema';

/**
 * Syntax mode for HTTP response/request bodies in {@link TxCodeEditorComponent}.
 * Aligns with api-workbench `inferHttpBodySyntaxMode`.
 */
export type HttpBodySyntaxMode = 'json' | 'xml' | 'html' | 'graphql' | 'css' | 'scss' | 'plain';

function contentTypeMainLower(ct: string): string {
  const s = ct.trim().toLowerCase();
  const semi = s.indexOf(';');
  return semi >= 0 ? s.slice(0, semi).trim() : s;
}

/**
 * Chooses editor language for an HTTP message body from Content-Type and payload shape.
 */
export function inferHttpBodySyntaxMode(
  contentTypeHeaderValue: string,
  body: string | undefined,
  isBinary: boolean,
): HttpBodySyntaxMode {
  if (isBinary) {
    return 'plain';
  }
  const ct = contentTypeMainLower(contentTypeHeaderValue);
  if (ct.includes('html')) {
    return 'html';
  }
  if (ct.includes('scss') || ct.includes('text/x-scss')) {
    return 'scss';
  }
  if (ct.includes('css') || ct === 'text/css') {
    return 'css';
  }
  if (ct.includes('xml') || (ct.includes('+xml') && !ct.includes('html'))) {
    return 'xml';
  }
  if (ct.includes('graphql')) {
    return 'graphql';
  }
  if (ct.includes('json') || ct.endsWith('+json')) {
    return 'json';
  }

  const trimmed = (body ?? '').trim();
  if (!trimmed) {
    return 'plain';
  }

  if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return 'html';
  }
  if (trimmed.startsWith('<')) {
    return 'xml';
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }

  return 'plain';
}

/** Maps inferred body syntax to a default `Content-Type` request header value. */
export function contentTypeFromBodySyntax(mode: HttpBodySyntaxMode): string {
  switch (mode) {
    case 'json':
    case 'graphql':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'html':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'scss':
      return 'text/x-scss';
    default:
      return 'text/plain';
  }
}

/** Reads Content-Type from header rows and infers syntax mode. */
export function inferHttpBodySyntaxModeFromHeaders(
  headers: readonly HttpResponseHeader[] | undefined,
  body: string | undefined,
  isBinary: boolean,
): HttpBodySyntaxMode {
  const rawCt =
    headers?.find((h) => h.key.trim().toLowerCase() === 'content-type')?.value ?? '';
  return inferHttpBodySyntaxMode(rawCt, body, isBinary);
}

/**
 * Pretty-print for readonly previews. JSON is indented; other modes return raw text.
 */
export function formatHttpBodyForPreview(
  body: string | undefined,
  mode: HttpBodySyntaxMode,
  isBinary: boolean,
): string {
  const raw = body ?? '';
  if (isBinary) {
    return raw || '—';
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  if (mode !== 'json') {
    return raw;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2);
  } catch {
    return raw;
  }
}
