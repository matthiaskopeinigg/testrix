import { normalizeFlowVariableKey } from './flow-variable-key';

/** Maximum dataset rows stored on a flow. */
export const FLOW_DATASET_MAX_ROWS = 50;

export type FlowDatasetRow = Readonly<Record<string, string>>;

/** Column keys from enabled dataset rows, normalized for `{{key}}`. */
export function collectDatasetVariableKeys(
  dataset: { readonly enabled?: boolean; readonly rows?: readonly FlowDatasetRow[] } | undefined,
): readonly string[] {
  if (!dataset?.enabled) {
    return [];
  }
  const keys = new Set<string>();
  for (const row of dataset.rows ?? []) {
    for (const raw of Object.keys(row)) {
      const key = normalizeFlowVariableKey(raw);
      if (key) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

/** Parses a CSV table with a header row into string records. */
export function parseDatasetCsv(text: string): FlowDatasetRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return [];
  }
  const headers = splitCsvLine(lines[0]!).map((header) => normalizeFlowVariableKey(header) || header.trim());
  const rows: FlowDatasetRow[] = [];
  for (const line of lines.slice(1)) {
    if (rows.length >= FLOW_DATASET_MAX_ROWS) {
      break;
    }
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      row[header] = cells[index] ?? '';
    });
    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }
  return rows;
}

/** Parses a JSON array of objects into string records. */
export function parseDatasetJson(text: string): FlowDatasetRow[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('Dataset JSON must be an array of objects.');
  }
  const rows: FlowDatasetRow[] = [];
  for (const item of parsed) {
    if (rows.length >= FLOW_DATASET_MAX_ROWS) {
      break;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const row: Record<string, string> = {};
    for (const [rawKey, value] of Object.entries(item as Record<string, unknown>)) {
      const key = normalizeFlowVariableKey(rawKey);
      if (!key) {
        continue;
      }
      row[key] = value == null ? '' : String(value);
    }
    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }
  return rows;
}

/** Suffix for regression / run-log display (` · row 3 · admin@…`). */
export function datasetRowDisplaySuffix(rowIndex: number, row: FlowDatasetRow): string {
  const preview = Object.values(row).find((value) => value.trim().length > 0)?.trim() ?? '';
  const clipped = preview.length > 24 ? `${preview.slice(0, 21)}…` : preview;
  return clipped ? ` · row ${rowIndex + 1} · ${clipped}` : ` · row ${rowIndex + 1}`;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}
