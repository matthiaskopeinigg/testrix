/**
 * Normalizes a CACHE / MANUAL / DATABASE alias so `{{email}}` and `"email"`
 * resolve the same as `email` in `{{placeholder}}` templates.
 */
export function normalizeFlowVariableKey(raw: string | undefined): string {
  let key = String(raw ?? '').trim();
  if (key.length >= 2) {
    const quote = key[0];
    if ((quote === '"' || quote === "'") && key.endsWith(quote)) {
      key = key.slice(1, -1).trim();
    }
  }
  const braced = /^\{\{\s*([\w.-]+)\s*\}\}$/.exec(key);
  if (braced?.[1]) {
    return braced[1];
  }
  return key;
}

/**
 * Copies a variable map with {@link normalizeFlowVariableKey} applied to each key.
 * Later entries win when two raw keys collapse to the same name.
 */
export function normalizeFlowVariableRecord(
  variables: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [raw, value] of Object.entries(variables)) {
    const key = normalizeFlowVariableKey(raw);
    if (key) {
      out[key] = value;
    }
  }
  return out;
}
