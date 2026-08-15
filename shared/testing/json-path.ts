/**
 * Evaluates a simple JSONPath (`$.a.b[0]`, `$['a']`) against a JSON value.
 * Supports dot keys, quoted keys, and numeric indexes. Returns undefined when the path misses.
 */
export function extractJsonPath(data: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '$') {
    return data;
  }
  const expr = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
  const tokens = tokenizeJsonPath(expr);
  let current: unknown = data;
  for (const token of tokens) {
    if (current == null) {
      return undefined;
    }
    if (typeof token === 'number') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[token];
      continue;
    }
    if (typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function tokenizeJsonPath(expr: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const re = /\[(\d+)\]|\['([^']+)'\]|\["([^"]+)"\]|\.?([A-Za-z_][\w]*)/g;
  let match = re.exec(expr);
  while (match) {
    if (match[1] !== undefined) {
      tokens.push(Number.parseInt(match[1], 10));
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else if (match[3] !== undefined) {
      tokens.push(match[3]);
    } else if (match[4] !== undefined) {
      tokens.push(match[4]);
    }
    match = re.exec(expr);
  }
  return tokens;
}

/**
 * Formats an extracted JSONPath result for display or environment storage.
 */
export function formatJsonPathResult(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}
