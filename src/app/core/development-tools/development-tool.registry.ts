import type { DevelopmentToolId } from '@shared/config';

import type { DevelopmentToolDefinition } from './development-tool.types';

/** Canonical development tools shown in the Development rail sidebar. */
export const DEVELOPMENT_TOOLS: readonly DevelopmentToolDefinition[] = [
  {
    id: 'uuid-generator',
    label: 'UUID Generator',
    description: 'Bulk UUID v4, presets, per-line copy',
    icon: 'hash',
  },
  {
    id: 'code-editor',
    label: 'Code Editor',
    description: 'Syntax editor with samples, format, and stats',
    icon: 'code',
  },
  {
    id: 'base64',
    label: 'Base64 Encode / Decode',
    description: 'Live encode/decode, URL-safe, swap panes',
    icon: 'fileText',
  },
  {
    id: 'jwt',
    label: 'JWT Toolkit',
    description: 'Generate, decode, and validate JWTs with signing profiles',
    icon: 'lock',
  },
  {
    id: 'cron',
    label: 'Cron Expression Builder',
    description: 'Presets, human text, next run times',
    icon: 'clock',
  },
  {
    id: 'regex',
    label: 'Regex Builder / Tester',
    description: 'Flag chips, groups, replace preview, cheatsheet',
    icon: 'search',
  },
  {
    id: 'url',
    label: 'URL Encode / Decode',
    description: 'Encode, decode, or parse URL components',
    icon: 'link',
  },
  {
    id: 'bcrypt',
    label: 'Bcrypt Generator / Validator',
    description: 'Hash and verify (secrets stay in memory)',
    icon: 'shield',
  },
  {
    id: 'openapi',
    label: 'OpenAPI Editor / Viewer',
    description: 'JSON/YAML editor, outline, validation',
    icon: 'api',
  },
  {
    id: 'hash',
    label: 'Hash / HMAC',
    description: 'MD5, SHA family, and HMAC-SHA256',
    icon: 'hash',
  },
  {
    id: 'jsonpath',
    label: 'JSONPath Tester',
    description: 'Evaluate JSONPath against a JSON sample',
    icon: 'search',
  },
  {
    id: 'cert-inspector',
    label: 'Certificate Inspector',
    description: 'Inspect PEM certificates, CSRs, and keys',
    icon: 'shield',
  },
  {
    id: 'request-diff',
    label: 'Request / Response Diff',
    description: 'Side-by-side text diff for payloads',
    icon: 'layers',
  },
] as const;

/**
 * Returns the tool definition for a stable resource id, if known.
 */
export function findDevelopmentTool(id: string): DevelopmentToolDefinition | null {
  return DEVELOPMENT_TOOLS.find((tool) => tool.id === id) ?? null;
}

/**
 * Type guard for development tool resource ids.
 */
export function isDevelopmentToolId(id: string): id is DevelopmentToolId {
  return findDevelopmentTool(id) !== null;
}
