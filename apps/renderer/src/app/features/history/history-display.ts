import {
  HISTORY_BODY_MAX_CHARS,
  historyStatusClass,
  type HistoryEntry,
  type HistoryHeader,
  type HistoryStatusClass,
} from '@testrix/contracts';

export type HistoryStatusTone = 'ok' | 'info' | 'warn' | 'err';

export interface HistoryQueryParam {
  readonly key: string;
  readonly value: string;
}

const TONE_BY_CLASS: Record<HistoryStatusClass, HistoryStatusTone> = {
  ok: 'ok',
  redirect: 'info',
  client: 'warn',
  server: 'err',
  error: 'err',
};

/**
 * Maps a history status to a chip tone for the inspector.
 */
export function historyStatusTone(status: number, error: string | null): HistoryStatusTone {
  return TONE_BY_CLASS[historyStatusClass(status, error)];
}

/**
 * Parses query parameters from a request URL (search string only).
 */
export function parseHistoryQueryParams(url: string): HistoryQueryParam[] {
  const trimmed = url.trim();
  if (!trimmed)
    return [];
  try {
    const parsed = new URL(trimmed, trimmed.includes('://') ? undefined : 'https://local.invalid');
    return [...parsed.searchParams.entries()].map(([key, value]) => ({ key, value }));
  } catch {
    const q = trimmed.indexOf('?');
    if (q < 0)
      return [];
    const search = trimmed.slice(q + 1);
    if (!search)
      return [];
    return search.split('&').flatMap((part) => {
      if (!part)
        return [];
      const eq = part.indexOf('=');
      if (eq < 0)
        return [{ key: decodeSafe(part), value: '' }];
      return [{ key: decodeSafe(part.slice(0, eq)), value: decodeSafe(part.slice(eq + 1)) }];
    });
  }
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * Pretty-prints JSON (and lightly indents XML) when possible; otherwise returns the raw text.
 */
export function formatHistoryBody(body: string, contentType = ''): string {
  const trimmed = body.trim();
  if (!trimmed)
    return '';
  const kind = detectBodyKind(trimmed, contentType);
  if (kind === 'json') {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return body;
    }
  }
  if (kind === 'xml')
    return prettyXml(trimmed) || body;
  return body;
}

export type HistoryBodyKind = 'json' | 'xml' | 'text';

/**
 * Detects body type from Content-Type and/or body sniffing.
 */
export function detectBodyKind(body: string, contentType = ''): HistoryBodyKind {
  const ct = contentType.toLowerCase();
  if (ct.includes('json') || ct.includes('+json'))
    return 'json';
  if (ct.includes('xml') || ct.includes('+xml') || ct.includes('html'))
    return 'xml';
  const trimmed = body.trim();
  if (!trimmed)
    return 'text';
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      /* fall through */
    }
  }
  if (trimmed.startsWith('<') && trimmed.includes('>'))
    return 'xml';
  return 'text';
}

function prettyXml(raw: string): string {
  const collapsed = raw.replace(/>\s+</g, '><').trim();
  if (!collapsed.startsWith('<'))
    return '';
  let indent = 0;
  const lines: string[] = [];
  const tokens = collapsed.replace(/(>)(<)/g, '$1\n$2').split('\n');
  for (const token of tokens) {
    const line = token.trim();
    if (!line)
      continue;
    if (line.startsWith('</'))
      indent = Math.max(0, indent - 1);
    lines.push(`${'  '.repeat(indent)}${line}`);
    if (
      line.startsWith('<') &&
      !line.startsWith('</') &&
      !line.startsWith('<?') &&
      !line.startsWith('<!') &&
      !line.endsWith('/>') &&
      !/^<[^>]+\/>$/.test(line)
    ) {
      const name = /^<([\w:.-]+)/.exec(line)?.[1];
      if (name && !line.includes(`</${name}>`))
        indent += 1;
    }
  }
  return lines.join('\n');
}

/**
 * True when a stored body was capped at the history max length.
 */
export function isHistoryBodyTruncated(body: string): boolean {
  return body.includes('\n… [truncated]') || body.length >= HISTORY_BODY_MAX_CHARS;
}

/**
 * Formats an ISO timestamp for the stats strip.
 */
export function formatHistoryDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()))
    return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

/**
 * Derives a finished timestamp from start + duration.
 */
export function historyFinishedAt(iso: string, durationMs: number): string {
  const start = Date.parse(iso);
  if (Number.isNaN(start))
    return '';
  return new Date(start + Math.max(0, durationMs)).toISOString();
}

/**
 * Short id fragment for the header subline.
 */
export function shortHistoryId(id: string): string {
  if (id.length <= 10)
    return id;
  return id.slice(0, 8);
}

/**
 * Status label for the chip (code + optional text, or ERR).
 */
export function historyStatusLabel(entry: HistoryEntry): string {
  if (entry.error?.trim() || entry.status < 0)
    return entry.error?.trim() ? 'ERR' : 'ERR';
  if (!entry.statusText.trim())
    return String(entry.status);
  return `${entry.status} ${entry.statusText}`.trim();
}

/**
 * Content-Type from response headers when present.
 */
export function historyContentType(headers: readonly HistoryHeader[]): string | null {
  const row = headers.find((header) => header.key.trim().toLowerCase() === 'content-type');
  const value = row?.value.trim();
  return value ? value : null;
}

/**
 * Plain `Key: Value` lines for clipboard copy (preserves stored order).
 */
export function formatHistoryHeaders(headers: readonly HistoryHeader[]): string {
  return headers
    .map((header) => ({ key: header.key.trim(), value: header.value }))
    .filter((header) => header.key.length > 0)
    .map((header) => `${header.key}: ${header.value}`)
    .join('\n');
}
