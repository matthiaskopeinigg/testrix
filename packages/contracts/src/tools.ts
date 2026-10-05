import { z } from 'zod';

export const toolIdSchema = z.enum([
  'uuid-generator',
  'base64',
  'jwt-toolkit',
  'cron-builder',
  'url-codec',
  'regex-builder',
  'password-generator',
  'plantuml',
]);

export type ToolId = z.infer<typeof toolIdSchema>;

export const TOOL_IDS = toolIdSchema.options;

/** One development utility shown in the Tools sidebar. */
export interface ToolItem {
  readonly id: ToolId;
  readonly label: string;
  readonly description: string;
}

export const DEFAULT_TOOLS: readonly ToolItem[] = [
  {
    id: 'uuid-generator',
    label: 'UUID Generator',
    description: 'Create RFC 4122 version 4 identifiers',
  },
  {
    id: 'base64',
    label: 'Base64',
    description: 'Encode and decode UTF-8 text',
  },
  {
    id: 'jwt-toolkit',
    label: 'JWT Toolkit',
    description: 'Decode tokens and sign HS256 locally',
  },
  {
    id: 'cron-builder',
    label: 'Cron Builder',
    description: 'Build five-field expressions and next runs',
  },
  {
    id: 'url-codec',
    label: 'URL Encode / Decode',
    description: 'Percent-encode components, URIs, and queries',
  },
  {
    id: 'regex-builder',
    label: 'Regex Tester',
    description: 'Match a pattern against a haystack',
  },
  {
    id: 'password-generator',
    label: 'Password Generator',
    description: 'Create a local secret from Web Crypto',
  },
  {
    id: 'plantuml',
    label: 'PlantUML',
    description: 'Build UML diagrams visually, offline',
  },
];

const TOOLS_BY_ID = new Map(DEFAULT_TOOLS.map((item) => [item.id, item]));

export function isToolId(value: string): value is ToolId {
  return TOOLS_BY_ID.has(value as ToolId);
}

export function toolById(id: string): ToolItem | null {
  return TOOLS_BY_ID.get(id as ToolId) ?? null;
}

/**
 * Orders the catalog by `orderIds`, then appends any new tools the user has not sorted yet.
 */
export function orderTools(orderIds: readonly string[]): ToolItem[] {
  const remaining = new Map(TOOLS_BY_ID);
  const next: ToolItem[] = [];
  for (const id of orderIds) {
    const item = remaining.get(id as ToolId);
    if (!item)
      continue;
    next.push(item);
    remaining.delete(item.id);
  }
  for (const item of DEFAULT_TOOLS) {
    if (remaining.has(item.id))
      next.push(item);
  }
  return next;
}

export function parseToolOrderIds(raw: unknown): string[] {
  if (!Array.isArray(raw))
    return [];
  return raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
