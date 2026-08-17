/** Rendered block for a lookup result value. */
export type LookupResultBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | {
      readonly kind: 'table';
      readonly columns: readonly string[];
      readonly rows: readonly (readonly (string | null)[])[];
    };

/** One labeled block inside a result field (nested JSON keys use `caption`). */
export interface LookupResultView {
  readonly caption: string | null;
  readonly block: LookupResultBlock;
}

/**
 * Parses a result-card string and returns tables/lists when the value is JSON.
 *
 * Arrays of objects become a grid; `{ products: [...] }` unwraps to a captioned table.
 *
 * @param value Template output stored on the result row.
 */
export function lookupResultViews(value: string): readonly LookupResultView[] {
  const parsed = parseJsonValue(value);
  if (parsed === undefined) {
    const text = value.trim() ? value : '—';
    return [{ caption: null, block: { kind: 'text', text } }];
  }
  return viewsFromUnknown(parsed, null);
}

/**
 * Host height for a compact read-only result grid.
 *
 * @param rowCount Number of data rows (not including the header).
 */
export function lookupResultTableHeightRem(rowCount: number): number {
  const headerRem = 2.15;
  const rowRem = 1.65;
  const chromeRem = 0.4;
  return Math.min(16, Math.max(4.2, headerRem + chromeRem + Math.max(rowCount, 1) * rowRem));
}

function parseJsonValue(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const first = trimmed[0];
  if (first !== '{' && first !== '[') {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function viewsFromUnknown(parsed: unknown, caption: string | null): LookupResultView[] {
  if (isObjectRowArray(parsed)) {
    return [{ caption, block: tableFromObjectRows(parsed) }];
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return [{ caption, block: { kind: 'text', text: '—' } }];
    }
    return [
      {
        caption,
        block: { kind: 'list', items: parsed.map((item) => cellFromUnknown(item) ?? '—') },
      },
    ];
  }
  if (isPlainObject(parsed)) {
    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      return [{ caption, block: { kind: 'text', text: '—' } }];
    }
    if (keys.every((key) => isScalar(parsed[key]))) {
      return [{ caption, block: tableFromObjectRows([parsed]) }];
    }
    const views: LookupResultView[] = [];
    for (const key of keys) {
      views.push(...viewsFromUnknown(parsed[key], key));
    }
    return views;
  }
  return [{ caption, block: { kind: 'text', text: cellFromUnknown(parsed) ?? '—' } }];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isObjectRowArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

function tableFromObjectRows(rows: readonly Record<string, unknown>[]): Extract<LookupResultBlock, { kind: 'table' }> {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return {
    kind: 'table',
    columns,
    rows: rows.map((row) => columns.map((col) => cellFromUnknown(row[col]))),
  };
}

function cellFromUnknown(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
