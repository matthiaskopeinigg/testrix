import * as yaml from 'yaml';

import { looksLikeGraylogMessage } from './converters/graylog';
import { TESTRIX_BUNDLE_SCHEMA_V1 } from './testrix-bundle.schema';

export type ImportFormatKind =
  | 'testrix'
  | 'postman'
  | 'postman_environment'
  | 'openapi'
  | 'har'
  | 'insomnia'
  | 'graylog'
  | 'raw_config'
  | 'unknown';

const GRAYLOG_EXTENSIONS = ['.ndjson', '.gelf', '.jsonl'] as const;

function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim().replace(/,\s*$/, '');
  if (!trimmed) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function looksLikeGraylogNdjson(rawText: string): boolean {
  const lines = rawText.replace(/^\uFEFF/, '').split('\n');
  const objects: Record<string, unknown>[] = [];
  for (const line of lines) {
    const obj = parseJsonLine(line);
    if (obj) {
      objects.push(obj);
    }
  }
  if (objects.length === 0) {
    return false;
  }
  return objects.some((obj) => looksLikeGraylogMessage(obj));
}

function looksLikePostmanEnvValues(values: unknown): boolean {
  if (!Array.isArray(values)) {
    return false;
  }
  if (values.length === 0) {
    return true;
  }
  return values.some((v) => {
    if (!v || typeof v !== 'object') {
      return false;
    }
    const o = v as Record<string, unknown>;
    return typeof o['key'] === 'string' || typeof o['value'] === 'string';
  });
}

/**
 * Heuristic format detection for import files.
 */
export function detectImportFormat(
  filePath: string,
  rawText: string,
  content?: unknown,
): ImportFormatKind {
  const parsed: unknown =
    content !== undefined && content !== null
      ? content
      : (() => {
          try {
            return JSON.parse(rawText);
          } catch {
            return null;
          }
        })();

  if (parsed && typeof parsed === 'object' && parsed !== null) {
    const o = parsed as Record<string, unknown>;

    if (o['schema'] === TESTRIX_BUNDLE_SCHEMA_V1) {
      return 'testrix';
    }

    if (typeof o['schemaVersion'] === 'number' && !o['schema']) {
      return 'raw_config';
    }

    if (o['log'] && typeof o['log'] === 'object' && o['log'] !== null) {
      const ent = (o['log'] as { entries?: unknown })?.entries;
      if (Array.isArray(ent)) {
        return 'har';
      }
    }

    if (o['__export_format'] === 4 && Array.isArray(o['resources'])) {
      return 'insomnia';
    }

    const scope = o['_postman_variable_scope'];
    const lowPath = filePath.toLowerCase();
    const postmanEnvFilename =
      /\.postman_environment\.json$/i.test(lowPath) || lowPath.includes('postman_environment');
    const looksLikePostmanCollection = o['info'] && Array.isArray(o['item']);
    const hasPostmanEnvValues = looksLikePostmanEnvValues(o['values']);

    if (
      hasPostmanEnvValues &&
      !looksLikePostmanCollection &&
      (scope === 'environment' ||
        scope === 'globals' ||
        postmanEnvFilename ||
        typeof o['name'] === 'string')
    ) {
      return 'postman_environment';
    }

    if (looksLikePostmanCollection) {
      return 'postman';
    }

    if (
      typeof o['openapi'] === 'string' ||
      typeof o['swagger'] === 'string' ||
      typeof o['swagger'] === 'number'
    ) {
      return 'openapi';
    }

    if (looksLikeGraylogMessage(o)) {
      return 'graylog';
    }
  }

  const low = filePath.toLowerCase();
  if (GRAYLOG_EXTENSIONS.some((ext) => low.endsWith(ext))) {
    if (looksLikeGraylogNdjson(rawText)) {
      return 'graylog';
    }
  }

  if (looksLikeGraylogNdjson(rawText)) {
    return 'graylog';
  }
  if (low.endsWith('.yml') || low.endsWith('.yaml')) {
    try {
      const y = yaml.parse(rawText) as Record<string, unknown> | null | undefined;
      if (y && typeof y === 'object' && (y['openapi'] || y['swagger'])) {
        return 'openapi';
      }
    } catch {
      return 'unknown';
    }
  }

  if (low.endsWith('.har')) {
    return 'har';
  }

  return 'unknown';
}

/** Human-readable label for a detected import format. */
export function formatImportKindLabel(kind: ImportFormatKind): string {
  switch (kind) {
    case 'testrix':
      return 'Testrix Bundle';
    case 'postman':
      return 'Postman Collection';
    case 'postman_environment':
      return 'Postman Environment';
    case 'openapi':
      return 'OpenAPI';
    case 'har':
      return 'HAR';
    case 'insomnia':
      return 'Insomnia Export';
    case 'graylog':
      return 'Graylog Messages';
    case 'raw_config':
      return 'Testrix Config File';
    default:
      return 'Unknown';
  }
}
