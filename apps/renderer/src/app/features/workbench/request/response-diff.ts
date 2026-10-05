export type DiffLineKind = 'same' | 'add' | 'del';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

export type DiffSideKind = 'same' | 'add' | 'del' | 'empty';

export interface DiffSideCell {
  readonly kind: DiffSideKind;
  readonly text: string;
  readonly lineNo: number | null;
}

export interface DiffSideRow {
  readonly left: DiffSideCell;
  readonly right: DiffSideCell;
}

export interface DiffHeaderRow {
  readonly key: string;
  readonly value: string;
}

/** Stable `Key: Value` lines for header diffs (sorted by key, case-insensitive). */
export function formatHeadersForDiff(headers: readonly DiffHeaderRow[]): string {
  return [...headers]
    .map((row) => ({ key: row.key.trim(), value: row.value }))
    .filter((row) => row.key.length > 0)
    .sort((left, right) => left.key.toLowerCase().localeCompare(right.key.toLowerCase()))
    .map((row) => `${row.key}: ${row.value}`)
    .join('\n');
}

export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split('\n');
  const right = after.split('\n');
  if (before.length === 0 && after.length === 0)
    return [];
  if (before.length === 0 && after.length > 0)
    return right.map((text) => ({ kind: 'add' as const, text }));
  if (after.length === 0 && before.length > 0)
    return left.map((text) => ({ kind: 'del' as const, text }));
  const table = lcsTable(left, right);
  const out: DiffLine[] = [];
  walk(left, right, table, left.length, right.length, out);
  return out;
}

/** Pairs unified LCS hunks into aligned left/right rows for a side-by-side view. */
export function diffSideBySide(before: string, after: string): DiffSideRow[] {
  const lines = diffLines(before, after);
  const rows: DiffSideRow[] = [];
  let leftNo = 1;
  let rightNo = 1;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.kind === 'same') {
      rows.push({
        left: { kind: 'same', text: line.text, lineNo: leftNo++ },
        right: { kind: 'same', text: line.text, lineNo: rightNo++ },
      });
      i += 1;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i]!.kind === 'del') {
      dels.push(lines[i]!);
      i += 1;
    }
    while (i < lines.length && lines[i]!.kind === 'add') {
      adds.push(lines[i]!);
      i += 1;
    }
    const count = Math.max(dels.length, adds.length);
    for (let k = 0; k < count; k += 1) {
      const del = dels[k];
      const add = adds[k];
      rows.push({
        left: del
          ? { kind: 'del', text: del.text, lineNo: leftNo++ }
          : { kind: 'empty', text: '', lineNo: null },
        right: add
          ? { kind: 'add', text: add.text, lineNo: rightNo++ }
          : { kind: 'empty', text: '', lineNo: null },
      });
    }
  }
  return rows;
}

function lcsTable(left: readonly string[], right: readonly string[]): number[][] {
  const rows = left.length;
  const cols = right.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => 0));
  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      table[i]![j] = left[i - 1] === right[j - 1] ? (table[i - 1]![j - 1] ?? 0) + 1 : Math.max(table[i - 1]![j] ?? 0, table[i]![j - 1] ?? 0);
    }
  }
  return table;
}

function walk(
  left: readonly string[],
  right: readonly string[],
  table: number[][],
  i: number,
  j: number,
  out: DiffLine[],
): void {
  if (i > 0 && j > 0 && left[i - 1] === right[j - 1]) {
    walk(left, right, table, i - 1, j - 1, out);
    out.push({ kind: 'same', text: left[i - 1] ?? '' });
    return;
  }
  if (j > 0 && (i === 0 || (table[i]![j - 1] ?? 0) >= (table[i - 1]![j] ?? 0))) {
    walk(left, right, table, i, j - 1, out);
    out.push({ kind: 'add', text: right[j - 1] ?? '' });
    return;
  }
  if (i > 0) {
    walk(left, right, table, i - 1, j, out);
    out.push({ kind: 'del', text: left[i - 1] ?? '' });
  }
}
