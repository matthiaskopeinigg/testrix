import { FLOW_SCENARIO_MAX_ROWS, type FlowScenarioData } from '@testrix/contracts';

/** Splits one CSV line, honouring double quotes. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        quoted = false;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** Reads CSV or a JSON array of objects into scenario data. */
export function parseScenarioTable(text: string): Pick<FlowScenarioData, 'columns' | 'rows'> | null {
  const trimmed = text.trim();
  if (!trimmed)
    return null;

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed))
        return null;
      const rows = parsed
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
        .slice(0, FLOW_SCENARIO_MAX_ROWS)
        .map((row) => {
          const out: Record<string, string> = {};
          for (const [key, value] of Object.entries(row))
            out[key] = typeof value === 'string' ? value : JSON.stringify(value ?? '');
          return out;
        });
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      return rows.length > 0 ? { columns, rows } : null;
    } catch {
      return null;
    }
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines.shift();
  if (!header)
    return null;
  const columns = parseCsvLine(header).filter(Boolean);
  if (columns.length === 0)
    return null;
  const rows = lines.slice(0, FLOW_SCENARIO_MAX_ROWS).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    columns.forEach((column, index) => {
      row[column] = cells[index] ?? '';
    });
    return row;
  });
  return { columns, rows };
}
