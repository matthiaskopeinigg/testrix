import type { CacheStepEntry } from './test-suite-steps.schema';

export type FlowValueExtractInput = Pick<CacheStepEntry, 'source' | 'extractKind' | 'extract'>;
export type FlowValueExtractKind = NonNullable<CacheStepEntry['extractKind']>;
export type FlowCaptureSource = CacheStepEntry['source'];

const JSON_BODY_SOURCES = new Set<FlowCaptureSource>(['response_body', 'cached_value']);

/**
 * Returns true when the source supports structured extraction from text/JSON.
 */
export function flowCaptureSourceSupportsExtraction(source: FlowCaptureSource): boolean {
  return JSON_BODY_SOURCES.has(source) || source === 'response_header' || source === 'response_status';
}

/**
 * Infers an extract kind when `extract` is set but `extractKind` is omitted.
 */
export function inferFlowValueExtractKind(input: FlowValueExtractInput): FlowValueExtractKind {
  const path = String(input.extract ?? '').trim();
  if (input.extractKind && input.extractKind !== 'full') {
    return input.extractKind;
  }
  if (!path) {
    return input.extractKind ?? 'full';
  }
  if (path.startsWith('/')) {
    return 'json_pointer';
  }
  if (path.startsWith('$') || path.includes('[')) {
    return 'jsonpath';
  }
  if (input.source === 'response_body' || input.source === 'cached_value') {
    return 'jsonpath';
  }
  return 'text_regex';
}

/**
 * Extracts a string value from a captured field for flow variable caching.
 * Returns `null` when extraction fails.
 */
export function extractFlowCachedValue(rawActual: string, input: FlowValueExtractInput): string | null {
  const kind = inferFlowValueExtractKind(input);
  const extract = String(input.extract ?? '').trim();

  if (!extract || kind === 'full') {
    return rawActual;
  }

  switch (kind) {
    case 'json_pointer':
    case 'jsonpath':
      return extractFromJsonText(rawActual, kind, extract);
    case 'text_regex':
      return extractViaRegex(rawActual, extract);
    default:
      return null;
  }
}

function extractFromJsonText(
  rawActual: string,
  kind: 'json_pointer' | 'jsonpath',
  path: string,
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawActual.trim()) as unknown;
  } catch {
    return null;
  }

  const trimmedPath = path.trim();
  let value =
    kind === 'json_pointer' ? readJsonPointer(parsed, trimmedPath) : readJsonPath(parsed, trimmedPath);

  if ((value === undefined || value === null) && kind === 'json_pointer' && !trimmedPath.startsWith('/')) {
    value = readJsonPath(parsed, trimmedPath);
  }
  if ((value === undefined || value === null) && kind === 'jsonpath' && trimmedPath.startsWith('/')) {
    value = readJsonPointer(parsed, trimmedPath);
  }

  if (value === undefined || value === null) {
    return null;
  }
  return stringifyExtractedValue(value);
}

function extractViaRegex(rawActual: string, pattern: string): string | null {
  try {
    const match = new RegExp(pattern).exec(rawActual);
    if (!match) {
      return null;
    }
    if (match[1] !== undefined) {
      return match[1];
    }
    return match[0] ?? null;
  } catch {
    return null;
  }
}

function stringifyExtractedValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function readJsonPointer(data: unknown, pointer: string): unknown {
  const trimmed = pointer.trim();
  if (!trimmed.startsWith('/')) {
    return undefined;
  }
  if (trimmed === '/') {
    return data;
  }

  const tokens = trimmed
    .slice(1)
    .split('/')
    .map(decodeJsonPointerToken);

  let current: unknown = data;
  for (const token of tokens) {
    current = readJsonSegment(current, token);
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

function decodeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function readJsonPath(data: unknown, path: string): unknown {
  let rest = path.trim();
  if (!rest || rest === '$') {
    return data;
  }
  rest = rest.replace(/^\$\.?/, '');

  let current: unknown = data;
  while (rest.length > 0) {
    if (rest.startsWith('[')) {
      const match = /^\[(\d+)\]/.exec(rest);
      if (!match) {
        return undefined;
      }
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[Number(match[1])];
      rest = rest.slice(match[0].length);
      if (rest.startsWith('.')) {
        rest = rest.slice(1);
      }
      continue;
    }

    const dot = rest.indexOf('.');
    const bracket = rest.indexOf('[');
    let end = rest.length;
    if (dot >= 0 && (bracket < 0 || dot < bracket)) {
      end = dot;
    } else if (bracket >= 0) {
      end = bracket;
    }

    const key = rest.slice(0, end);
    if (!key) {
      return undefined;
    }
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      if (!Array.isArray(current)) {
        return undefined;
      }
    }
    current = (current as Record<string, unknown>)[key];
    rest = rest.slice(end);
    if (rest.startsWith('.')) {
      rest = rest.slice(1);
    }
  }

  return current;
}

function readJsonSegment(current: unknown, token: string): unknown {
  if (Array.isArray(current)) {
    const index = Number(token);
    if (!Number.isInteger(index) || index < 0) {
      return undefined;
    }
    return current[index];
  }
  if (current !== null && typeof current === 'object') {
    return (current as Record<string, unknown>)[token];
  }
  return undefined;
}
