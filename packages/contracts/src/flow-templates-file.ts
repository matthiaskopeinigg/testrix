import { CONFIG_SCHEMA_VERSION } from './settings';
import {
  flowNodeKindSchema,
  flowPortSchema,
  type FlowNodeKind,
  type FlowPort,
} from './flow-graph';
import { newEntityId } from './entity-id';
export interface FlowGraphTemplateStep {
  readonly key: string;
  readonly kind: FlowNodeKind;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly parentKey?: string;
  readonly config?: Readonly<Record<string, string | number | boolean>>;
}

export interface FlowGraphTemplateLink {
  readonly from: string;
  readonly to: string;
  readonly fromPort?: FlowPort;
}

export interface FlowGraphTemplate {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  readonly tags: readonly string[];
  readonly steps: readonly FlowGraphTemplateStep[];
  readonly links: readonly FlowGraphTemplateLink[];
  /** True for shipped builtins — never persisted in flow-templates.json. */
  readonly builtin?: boolean;
}

export interface FlowTemplatesFile {
  readonly schemaVersion: number;
  readonly templates: readonly FlowGraphTemplate[];
  /** Built-in catalog ids the user removed for this workspace. */
  readonly hiddenBuiltinIds: readonly string[];
  /** Named groups (primary tags) kept even when empty. */
  readonly groups: readonly string[];
}

export const DEFAULT_FLOW_TEMPLATES_FILE: FlowTemplatesFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  templates: [],
  hiddenBuiltinIds: [],
  groups: [],
};

export const FLOW_TEMPLATE_UNTAGGED = 'Untagged';

/** Trim, drop empties, de-dupe case-insensitively while preserving first-seen casing. */
export function normalizeFlowTemplateTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag)
      continue;
    const key = tag.toLowerCase();
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function newFlowTemplateId(): string {
  return newEntityId();
}

export function emptyFlowGraphTemplate(name = 'New template'): FlowGraphTemplate {
  return {
    id: newFlowTemplateId(),
    name,
    hint: '',
    tags: [],
    steps: [],
    links: [],
  };
}

export function parseFlowGraphTemplate(raw: unknown): FlowGraphTemplate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source['id'] === 'string' && source['id'] ? source['id'] : newFlowTemplateId();
  const name = typeof source['name'] === 'string' && source['name'].trim() ? source['name'].trim() : 'Untitled';
  const hint = typeof source['hint'] === 'string' ? source['hint'] : '';
  const tags = normalizeFlowTemplateTags(
    Array.isArray(source['tags'])
      ? source['tags'].filter((item): item is string => typeof item === 'string')
      : typeof source['group'] === 'string' && source['group']
        ? [source['group']]
        : [],
  );
  const steps = Array.isArray(source['steps'])
    ? source['steps']
        .map(parseFlowGraphTemplateStep)
        .filter((step): step is FlowGraphTemplateStep => step !== null)
    : [];
  const links = Array.isArray(source['links'])
    ? source['links']
        .map(parseFlowGraphTemplateLink)
        .filter((link): link is FlowGraphTemplateLink => link !== null)
    : [];
  return { id, name, hint, tags, steps, links };
}

function parseFlowGraphTemplateStep(raw: unknown): FlowGraphTemplateStep | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const key = typeof source['key'] === 'string' && source['key'] ? source['key'] : '';
  const kind = flowNodeKindSchema.safeParse(source['kind']);
  if (!key || !kind.success)
    return null;
  const name = typeof source['name'] === 'string' && source['name'] ? source['name'] : kind.data;
  const x = typeof source['x'] === 'number' && Number.isFinite(source['x']) ? source['x'] : 0;
  const y = typeof source['y'] === 'number' && Number.isFinite(source['y']) ? source['y'] : 0;
  const parentKey =
    typeof source['parentKey'] === 'string' && source['parentKey'] ? source['parentKey'] : undefined;
  const config = parseTemplateConfig(source['config']);
  return {
    key,
    kind: kind.data,
    name,
    x,
    y,
    ...(parentKey ? { parentKey } : {}),
    ...(config ? { config } : {}),
  };
}

function parseFlowGraphTemplateLink(raw: unknown): FlowGraphTemplateLink | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const from = typeof source['from'] === 'string' && source['from'] ? source['from'] : '';
  const to = typeof source['to'] === 'string' && source['to'] ? source['to'] : '';
  if (!from || !to)
    return null;
  const port = flowPortSchema.safeParse(source['fromPort']);
  return {
    from,
    to,
    ...(port.success ? { fromPort: port.data } : {}),
  };
}

function parseTemplateConfig(
  raw: unknown,
): Readonly<Record<string, string | number | boolean>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseFlowTemplatesFile(raw: unknown): FlowTemplatesFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const templates = Array.isArray(source['templates'])
    ? source['templates']
        .map(parseFlowGraphTemplate)
        .filter((item): item is FlowGraphTemplate => item !== null)
        .map((item) => ({ ...item, builtin: undefined }))
    : [];
  const hiddenBuiltinIds = Array.isArray(source['hiddenBuiltinIds'])
    ? [
        ...new Set(
          source['hiddenBuiltinIds'].filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0,
          ),
        ),
      ]
    : [];
  const groups = normalizeFlowTemplateTags(
    Array.isArray(source['groups'])
      ? source['groups'].filter((item): item is string => typeof item === 'string')
      : [],
  );
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    templates,
    hiddenBuiltinIds,
    groups,
  };
}

/**
 * Groups templates for display: each template appears once under its first tag
 * (or Untagged). Remaining tags stay on the row as chips.
 * `extraGroups` keeps empty named groups visible and defines manual group order.
 */
export function groupFlowTemplatesByPrimaryTag(
  templates: readonly FlowGraphTemplate[],
  extraGroups: readonly string[] = [],
): readonly { readonly tag: string; readonly items: readonly FlowGraphTemplate[] }[] {
  const buckets = new Map<string, FlowGraphTemplate[]>();
  const casing = new Map<string, string>();
  const order: string[] = [];

  const canonical = (tag: string): string => {
    const key = tag.toLowerCase();
    const existing = casing.get(key);
    if (existing)
      return existing;
    casing.set(key, tag);
    order.push(tag);
    buckets.set(tag, []);
    return tag;
  };

  for (const tag of normalizeFlowTemplateTags(extraGroups)) {
    if (tag.toLowerCase() === FLOW_TEMPLATE_UNTAGGED.toLowerCase())
      continue;
    canonical(tag);
  }

  for (const template of templates) {
    const primary = template.tags[0] ?? FLOW_TEMPLATE_UNTAGGED;
    const tag = canonical(primary);
    buckets.get(tag)!.push(template);
  }

  const named = order.filter((tag) => tag !== FLOW_TEMPLATE_UNTAGGED);
  const untagged = order.includes(FLOW_TEMPLATE_UNTAGGED) ? [FLOW_TEMPLATE_UNTAGGED] : [];
  return [...named, ...untagged].map((tag) => ({ tag, items: buckets.get(tag) ?? [] }));
}

/** Stable sidebar id for a group tag. */
export function flowTemplateGroupNodeId(tag: string): string {
  return `grp:${tag}`;
}

export function parseFlowTemplateGroupNodeId(id: string): string | null {
  return id.startsWith('grp:') ? id.slice(4) : null;
}
