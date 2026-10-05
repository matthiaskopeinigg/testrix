import { parse as parseYaml } from 'yaml';

import { workspacePackManifestSchema, WORKSPACE_PACK_SCHEMA_VERSION } from './workspace-pack';

export type ImportFormat =
  | 'native'
  | 'postman-collection'
  | 'postman-environment'
  | 'bruno'
  | 'openapi'
  | 'unsupported';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeNativePack(raw: unknown): boolean {
  if (!isRecord(raw))
    return false;
  if (workspacePackManifestSchema.safeParse(raw).success)
    return true;
  const manifest = raw['manifest'];
  if (isRecord(manifest) && workspacePackManifestSchema.safeParse(manifest).success)
    return true;
  if (
    raw['schemaVersion'] === WORKSPACE_PACK_SCHEMA_VERSION &&
    isRecord(raw['selection']) &&
    typeof raw['checksum'] === 'string' &&
    typeof raw['exportedAt'] === 'string'
  )
    return true;
  return false;
}

function looksLikePostmanCollection(raw: unknown): boolean {
  if (!isRecord(raw))
    return false;
  const info = raw['info'];
  if (!isRecord(info))
    return false;
  const schema = info['schema'];
  if (typeof schema === 'string' && schema.includes('collection'))
    return true;
  return Array.isArray(raw['item']);
}

function looksLikePostmanEnvironment(raw: unknown): boolean {
  if (!isRecord(raw))
    return false;
  if (!Array.isArray(raw['values']))
    return false;
  if (typeof raw['name'] !== 'string')
    return false;
  return !Array.isArray(raw['item']);
}

function looksLikeOpenApi(raw: unknown): boolean {
  if (!isRecord(raw))
    return false;
  const openapi = raw['openapi'];
  return typeof openapi === 'string' && openapi.startsWith('3.');
}

function looksLikeBrunoJson(raw: unknown): boolean {
  if (!isRecord(raw))
    return false;
  if (typeof raw['version'] === 'string' && raw['version'].toLowerCase().includes('bruno'))
    return true;
  if (Array.isArray(raw['items']) && typeof raw['name'] === 'string')
    return true;
  return false;
}

function looksLikeBrunoBru(text: string): boolean {
  return /^\s*meta\s*\{/m.test(text) && /^\s*(get|post|put|patch|delete|head|options)\s*\{/im.test(text);
}

/**
 * Detects the import format of a parsed document or raw text snippet.
 */
export function detectImportFormat(raw: unknown, fileName?: string): ImportFormat {
  const lowerName = fileName?.toLowerCase() ?? '';
  if (typeof raw === 'string') {
    if (lowerName.endsWith('.bru') || looksLikeBrunoBru(raw))
      return 'bruno';
    try {
      const parsed = lowerName.endsWith('.yml') || lowerName.endsWith('.yaml') ? parseYaml(raw) : JSON.parse(raw);
      return detectImportFormat(parsed, fileName);
    } catch {
      return 'unsupported';
    }
  }

  if (looksLikeNativePack(raw))
    return 'native';
  if (looksLikePostmanCollection(raw))
    return 'postman-collection';
  if (looksLikePostmanEnvironment(raw))
    return 'postman-environment';
  if (looksLikeOpenApi(raw))
    return 'openapi';
  if (looksLikeBrunoJson(raw))
    return 'bruno';

  if (lowerName.endsWith('.testrix'))
    return 'native';
  if (lowerName.endsWith('.postman_collection.json'))
    return 'postman-collection';
  if (lowerName.endsWith('.postman_environment.json'))
    return 'postman-environment';
  if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml') || lowerName.endsWith('.openapi.json'))
    return 'openapi';
  if (lowerName.endsWith('.bru'))
    return 'bruno';

  return 'unsupported';
}

/**
 * Parses import file text as JSON or YAML based on the file name.
 */
export function parseImportDocument(text: string, fileName?: string): unknown {
  const lowerName = fileName?.toLowerCase() ?? '';
  if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml'))
    return parseYaml(text);
  try {
    return JSON.parse(text);
  } catch {
    if (/^\s*\w[\w-]*\s*\{/m.test(text))
      return text;
    return parseYaml(text);
  }
}

const IMPORTABLE_EXTENSIONS = [
  '.testrix',
  '.zip',
  '.json',
  '.yaml',
  '.yml',
  '.bru',
] as const;

/**
 * Best-effort hover/drop gate from a file or folder name.
 * Contents are not readable until drop; folders (no extension) are allowed for Bruno.
 */
export function isImportableDropName(fileName: string): boolean {
  const trimmed = fileName.trim();
  if (!trimmed)
    return false;
  const base = trimmed.replace(/\\/g, '/').split('/').pop() ?? trimmed;
  const lower = base.toLowerCase();
  if (!lower.includes('.'))
    return true;
  return IMPORTABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * MIME hint during drag (often available before the file name).
 * `null` means inconclusive — fall back to the file name.
 */
export function isImportableDropMime(mime: string): boolean | null {
  const type = mime.trim().toLowerCase();
  if (!type)
    return null;
  if (
    type.startsWith('video/') ||
    type.startsWith('image/') ||
    type.startsWith('audio/') ||
    type.startsWith('font/')
  )
    return false;
  if (
    type === 'application/pdf' ||
    type === 'application/msword' ||
    type.startsWith('application/vnd.') ||
    type === 'text/html' ||
    type === 'text/css' ||
    type.startsWith('application/x-ms')
  )
    return false;
  if (
    type === 'application/json' ||
    type === 'text/json' ||
    type === 'application/yaml' ||
    type === 'application/x-yaml' ||
    type === 'text/yaml' ||
    type === 'text/x-yaml' ||
    type === 'text/plain' ||
    type === 'application/zip' ||
    type === 'application/x-zip-compressed' ||
    type === 'application/octet-stream'
  )
    return null;
  return null;
}

/**
 * True when every dragged name looks importable.
 * Empty list is inconclusive (returns true only for caller convenience — prefer {@link assessDropImportability}).
 */
export function areImportableDropNames(names: readonly string[]): boolean {
  if (names.length === 0)
    return true;
  return names.every((name) => isImportableDropName(name));
}

export interface DropImportAssessment {
  /** true = ok, false = reject, null = still unknown */
  readonly valid: boolean | null;
  readonly label: string | null;
}

/**
 * Combines file names and MIME types from a drag event into a hover verdict.
 */
export function assessDropImportability(input: {
  readonly names?: readonly string[];
  readonly mimes?: readonly string[];
}): DropImportAssessment {
  const names = (input.names ?? []).map((name) => name.trim()).filter(Boolean);
  const mimes = (input.mimes ?? []).map((mime) => mime.trim()).filter(Boolean);
  const label = names[0] ?? null;

  for (const mime of mimes) {
    if (isImportableDropMime(mime) === false)
      return { valid: false, label };
  }

  if (names.length > 0) {
    const allOk = names.every((name) => isImportableDropName(name));
    return { valid: allOk, label };
  }

  return { valid: null, label: null };
}
