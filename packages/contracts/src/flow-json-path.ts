/** One Capture rule stored in node `config.rules` (JSON string). */
export type FlowCaptureRuleKind = 'body' | 'status' | 'header' | 'json';

export interface FlowCaptureRule {
  readonly kind: FlowCaptureRuleKind;
  /** Header name or JSON path; unused for body/status. */
  readonly path: string;
  /** Variable name to write. */
  readonly name: string;
}

const RULE_KINDS = new Set<FlowCaptureRuleKind>(['body', 'status', 'header', 'json']);

/**
 * Walks a JSON value with dotted / bracket paths.
 * Supports `replicas[0].entries[0].otp` and `replicas.0.entries.0.otp`.
 */
export function getJsonPathValue(root: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed)
    return root;
  const parts = tokenizeJsonPath(trimmed);
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined)
      return undefined;
    if (typeof part === 'number') {
      if (!Array.isArray(current))
        return undefined;
      current = current[part];
      continue;
    }
    if (typeof current !== 'object' || Array.isArray(current))
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Parses JSON text and returns the path value as a flow variable string.
 * Throws when JSON is invalid or the path is missing.
 */
export function extractFlowJsonPath(source: string, path: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('Response body is not valid JSON');
  }
  const trimmed = path.trim();
  if (!trimmed)
    throw new Error('JSON path is empty');
  const value = getJsonPathValue(parsed, trimmed);
  if (value === undefined)
    throw new Error(`JSON path not found: ${trimmed}`);
  return stringifyCaptureValue(value);
}

export function stringifyCaptureValue(value: unknown): string {
  if (value === null || value === undefined)
    return '';
  if (typeof value === 'string')
    return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
}

/** Default Capture rules (Redis OTP-shaped example). */
export const DEFAULT_FLOW_CAPTURE_RULES: readonly FlowCaptureRule[] = [
  { kind: 'json', path: 'replicas[0].entries[0].otp', name: 'otp' },
];

export function defaultFlowCaptureRulesJson(): string {
  return JSON.stringify(DEFAULT_FLOW_CAPTURE_RULES);
}

export function parseFlowCaptureRules(raw: string): FlowCaptureRule[] {
  const text = raw.trim();
  if (!text)
    return [...DEFAULT_FLOW_CAPTURE_RULES];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [...DEFAULT_FLOW_CAPTURE_RULES];
  }
  if (!Array.isArray(parsed))
    return [...DEFAULT_FLOW_CAPTURE_RULES];
  const out: FlowCaptureRule[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue;
    const row = item as Record<string, unknown>;
    const kindRaw = typeof row['kind'] === 'string' ? row['kind'] : '';
    if (!RULE_KINDS.has(kindRaw as FlowCaptureRuleKind))
      continue;
    const name = typeof row['name'] === 'string' ? row['name'].trim() : '';
    if (!name)
      continue;
    const path = typeof row['path'] === 'string' ? row['path'] : '';
    out.push({ kind: kindRaw as FlowCaptureRuleKind, path, name });
  }
  return out.length > 0 ? out : [...DEFAULT_FLOW_CAPTURE_RULES];
}

export function serializeFlowCaptureRules(rules: readonly FlowCaptureRule[]): string {
  return JSON.stringify(
    rules.map((rule) => ({
      kind: rule.kind,
      path: rule.path,
      name: rule.name,
    })),
  );
}

function tokenizeJsonPath(path: string): Array<string | number> {
  const parts: Array<string | number> = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(path)) !== null) {
    if (match[1] !== undefined && match[1] !== '') {
      const key = match[1];
      parts.push(/^\d+$/.test(key) ? Number(key) : key);
    } else if (match[2] !== undefined) {
      parts.push(Number(match[2]));
    }
  }
  return parts;
}
