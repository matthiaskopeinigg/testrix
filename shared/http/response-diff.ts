import { diffLines, type Change } from 'diff';

import { formatPrettyBody } from './response-body-display';
import type { HttpResponseSnapshot } from './outgoing-request.schema';

export interface CompareResponseOptions {
  readonly normalizeJson?: boolean;
}

export type DiffSeverity = 'info' | 'warning' | 'error';

export interface ResponseDiffSummary {
  readonly statusChanged: boolean;
  readonly headersAdded: number;
  readonly headersRemoved: number;
  readonly headersChanged: number;
  readonly bodyChanges: number;
  readonly summaryLabel: string;
  readonly pass: boolean;
}

export interface HeaderDiffRow {
  readonly kind: 'added' | 'removed' | 'changed' | 'unchanged';
  readonly key: string;
  readonly oldValue?: string;
  readonly newValue?: string;
  readonly severity: DiffSeverity;
}

export interface JsonPathDiffRow {
  readonly path: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly oldValue?: string;
  readonly newValue?: string;
  readonly severity: DiffSeverity;
}

export interface LineDiffHunk {
  readonly kind: 'add' | 'remove' | 'unchanged';
  readonly line: string;
}

export interface ResponseDiffResult {
  readonly summary: ResponseDiffSummary;
  readonly status: {
    readonly a: HttpResponseSnapshot['status'];
    readonly b: HttpResponseSnapshot['status'];
    readonly changed: boolean;
  };
  readonly timingDeltaMs: number;
  readonly headers: readonly HeaderDiffRow[];
  readonly bodyMode: 'json' | 'text' | 'binary';
  readonly jsonPaths: readonly JsonPathDiffRow[];
  readonly lineHunks: readonly LineDiffHunk[];
}

function headersToMap(snapshot: HttpResponseSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of snapshot.headers) {
    map.set(h.key.toLowerCase(), h.value);
  }
  return map;
}

function getBodyText(snapshot: HttpResponseSnapshot): string {
  if (snapshot.body.encoding === 'text' && snapshot.body.text !== undefined) {
    return snapshot.body.text;
  }
  if (snapshot.body.encoding === 'base64' && snapshot.body.base64) {
    return `[base64 ${snapshot.body.base64.length} chars]`;
  }
  return '';
}

/** Break minified HTML/JS into lines so line diffs stay readable. */
export function prepareBodyForDiff(text: string, contentType?: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }
  if (trimmed.includes('\n') && trimmed.split('\n').length > 4) {
    return text;
  }

  const ct = (contentType ?? '').toLowerCase();
  const looksHtml =
    ct.includes('html') ||
    trimmed.startsWith('<!') ||
    /^<\s*html[\s>]/i.test(trimmed) ||
    /^<\s*!doctype/i.test(trimmed);

  if (looksHtml || (trimmed.startsWith('<') && trimmed.includes('</'))) {
    return trimmed
      .replace(/>\s*</g, '>\n<')
      .replace(/\s*;\s*/g, ';\n')
      .replace(/\s*\{\s*/g, ' {\n')
      .replace(/\s*\}\s*/g, '}\n');
  }

  if (trimmed.length > 120 && !trimmed.includes('\n')) {
    return trimmed.replace(/([,;{}])\s*/g, '$1\n');
  }

  return text;
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function diffJsonPaths(a: unknown, b: unknown, path = '$'): JsonPathDiffRow[] {
  const rows: JsonPathDiffRow[] = [];

  if (typeof a !== typeof b) {
    rows.push({
      path,
      kind: 'changed',
      oldValue: JSON.stringify(a),
      newValue: JSON.stringify(b),
      severity: 'error',
    });
    return rows;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if (i >= a.length) {
        rows.push({
          path: `${path}[${i}]`,
          kind: 'added',
          newValue: JSON.stringify(b[i]),
          severity: 'warning',
        });
      } else if (i >= b.length) {
        rows.push({
          path: `${path}[${i}]`,
          kind: 'removed',
          oldValue: JSON.stringify(a[i]),
          severity: 'warning',
        });
      } else {
        rows.push(...diffJsonPaths(a[i], b[i], `${path}[${i}]`));
      }
    }
    return rows;
  }

  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of keys) {
      const next = `${path}.${key}`;
      if (!(key in aObj)) {
        rows.push({
          path: next,
          kind: 'added',
          newValue: JSON.stringify(bObj[key]),
          severity: 'warning',
        });
      } else if (!(key in bObj)) {
        rows.push({
          path: next,
          kind: 'removed',
          oldValue: JSON.stringify(aObj[key]),
          severity: 'warning',
        });
      } else {
        rows.push(...diffJsonPaths(aObj[key], bObj[key], next));
      }
    }
    return rows;
  }

  if (a !== b) {
    rows.push({
      path,
      kind: 'changed',
      oldValue: String(a),
      newValue: String(b),
      severity: 'error',
    });
  }

  return rows;
}

function diffHeaders(a: HttpResponseSnapshot, b: HttpResponseSnapshot): HeaderDiffRow[] {
  const mapA = headersToMap(a);
  const mapB = headersToMap(b);
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows: HeaderDiffRow[] = [];

  for (const keyLower of keys) {
    const inA = mapA.has(keyLower);
    const inB = mapB.has(keyLower);
    const displayKey = [...(inA ? [keyLower] : []), ...(inB ? [keyLower] : [])][0] ?? keyLower;
    const actualKey =
      a.headers.find((h) => h.key.toLowerCase() === keyLower)?.key ??
      b.headers.find((h) => h.key.toLowerCase() === keyLower)?.key ??
      displayKey;

    if (!inA && inB) {
      rows.push({
        kind: 'added',
        key: actualKey,
        newValue: mapB.get(keyLower),
        severity: 'info',
      });
    } else if (inA && !inB) {
      rows.push({
        kind: 'removed',
        key: actualKey,
        oldValue: mapA.get(keyLower),
        severity: 'warning',
      });
    } else if (mapA.get(keyLower) !== mapB.get(keyLower)) {
      rows.push({
        kind: 'changed',
        key: actualKey,
        oldValue: mapA.get(keyLower),
        newValue: mapB.get(keyLower),
        severity: 'warning',
      });
    }
  }

  return rows;
}

/**
 * Compares two response snapshots for the diff studio UI.
 */
function bodyTextForDiff(snapshot: HttpResponseSnapshot, normalizeJson: boolean): string {
  const raw = getBodyText(snapshot);
  let text = raw;
  if (normalizeJson) {
    const pretty = formatPrettyBody(raw);
    if (pretty !== raw) {
      text = pretty;
    }
  }
  return prepareBodyForDiff(text, snapshot.body.contentType);
}

export function compareResponseSnapshots(
  a: HttpResponseSnapshot,
  b: HttpResponseSnapshot,
  options: CompareResponseOptions = {},
): ResponseDiffResult {
  const normalizeJson = options.normalizeJson ?? false;
  const statusChanged = a.status.code !== b.status.code;
  const headerRows = diffHeaders(a, b);
  const headersAdded = headerRows.filter((r) => r.kind === 'added').length;
  const headersRemoved = headerRows.filter((r) => r.kind === 'removed').length;
  const headersChanged = headerRows.filter((r) => r.kind === 'changed').length;

  const textA = getBodyText(a);
  const textB = getBodyText(b);
  const jsonA = tryParseJson(textA);
  const jsonB = tryParseJson(textB);
  const useJsonPaths = jsonA !== null && jsonB !== null && !normalizeJson;

  let bodyMode: ResponseDiffResult['bodyMode'] = 'text';
  let jsonPaths: JsonPathDiffRow[] = [];
  let lineHunks: LineDiffHunk[] = [];

  if (useJsonPaths) {
    bodyMode = 'json';
    jsonPaths = diffJsonPaths(jsonA, jsonB);
  } else if (textA || textB) {
    const preparedA = bodyTextForDiff(a, normalizeJson);
    const preparedB = bodyTextForDiff(b, normalizeJson);
    const parts = diffLines(preparedA, preparedB);
    lineHunks = parts.flatMap((part: Change) => {
      const lines = part.value.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      const kind: LineDiffHunk['kind'] = part.added ? 'add' : part.removed ? 'remove' : 'unchanged';
      return lines.map((line: string) => ({ kind, line }));
    });
  } else {
    bodyMode = 'binary';
  }

  const bodyChanges =
    bodyMode === 'json' ? jsonPaths.length : lineHunks.filter((h) => h.kind !== 'unchanged').length;

  const pass = !statusChanged && headersChanged === 0 && headersRemoved === 0 && bodyChanges === 0;

  const summaryLabel = pass
    ? 'No differences'
    : `+${headersAdded + (bodyMode === 'json' ? jsonPaths.filter((p) => p.kind === 'added').length : lineHunks.filter((h) => h.kind === 'add').length)} −${headersRemoved + (bodyMode === 'json' ? jsonPaths.filter((p) => p.kind === 'removed').length : lineHunks.filter((h) => h.kind === 'remove').length)} ~${headersChanged + (bodyMode === 'json' ? jsonPaths.filter((p) => p.kind === 'changed').length : 0)}`;

  return {
    summary: {
      statusChanged,
      headersAdded,
      headersRemoved,
      headersChanged,
      bodyChanges,
      summaryLabel,
      pass,
    },
    status: {
      a: a.status,
      b: b.status,
      changed: statusChanged,
    },
    timingDeltaMs: b.timing.totalMs - a.timing.totalMs,
    headers: headerRows,
    bodyMode,
    jsonPaths,
    lineHunks,
  };
}
