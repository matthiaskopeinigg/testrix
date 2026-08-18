import { z } from 'zod';

/** Profile-local lookups workspace file. */
export const LOOKUPS_FILE_NAME = 'lookups.json';

const boundedText = (max: number) => z.string().max(max);

/** JavaScript regex source: value looks like an email. */
export const LOOKUP_WHEN_EMAIL_REGEX = String.raw`^[^\s@]+@[^\s@]+\.[^\s@]+$`;

/** JavaScript regex source: value looks like a UUID. */
export const LOOKUP_WHEN_UUID_REGEX =
  String.raw`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`;

/** JavaScript regex source: value is non-empty after trim. */
export const LOOKUP_WHEN_IS_SET_REGEX = String.raw`\S+`;

/** Condition kinds that skip a lookup step when false. */
export const LOOKUP_WHEN_KIND_IDS = ['matches', 'isSet', 'isEmail', 'isUuid', 'equals'] as const;
export type LookupWhenKind = (typeof LOOKUP_WHEN_KIND_IDS)[number];

/** Query source for a lookup step (inline SQL or Database sidebar saved query). */
export const LOOKUP_QUERY_SOURCE_IDS = ['manual', 'saved'] as const;
export type LookupQuerySource = (typeof LOOKUP_QUERY_SOURCE_IDS)[number];

/** Extract kinds for mapping a query result into a cached variable. */
export const LOOKUP_EXTRACT_KIND_IDS = ['jsonpath', 'json_pointer', 'full'] as const;
export type LookupExtractKind = (typeof LOOKUP_EXTRACT_KIND_IDS)[number];

const lookupWhenRawSchema = z.object({
  kind: z.enum(LOOKUP_WHEN_KIND_IDS),
  /** `input.<key>` or `var.<name>` (or a bare key checked against inputs then variables). */
  source: boundedText(256).default(''),
  /** Regex source when `kind` is `matches`; compared value when `kind` is `equals`. */
  value: boundedText(4_000).optional(),
});

/**
 * Escapes a literal so it can be used as a full-string regex.
 *
 * @param value Raw comparison string.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites legacy skip-unless kinds (`isEmail`, `isUuid`, `isSet`, `equals`) to `matches`.
 *
 * @param when Stored skip-unless condition.
 */
export function migrateLookupWhen(when: z.infer<typeof lookupWhenRawSchema>): z.infer<typeof lookupWhenRawSchema> {
  switch (when.kind) {
    case 'matches':
      return when;
    case 'isEmail':
      return { kind: 'matches', source: when.source, value: LOOKUP_WHEN_EMAIL_REGEX };
    case 'isUuid':
      return { kind: 'matches', source: when.source, value: LOOKUP_WHEN_UUID_REGEX };
    case 'isSet':
      return { kind: 'matches', source: when.source, value: LOOKUP_WHEN_IS_SET_REGEX };
    case 'equals':
      return {
        kind: 'matches',
        source: when.source,
        value: `^${escapeRegExp(String(when.value ?? '').trim())}$`,
      };
    default:
      return when;
  }
}

/** Skip-unless condition; legacy kinds are rewritten to `matches` on parse. */
export const lookupWhenSchema = lookupWhenRawSchema.transform((when) => migrateLookupWhen(when));

export type LookupWhen = z.infer<typeof lookupWhenSchema>;

export const lookupInputSchema = z.object({
  key: boundedText(64).min(1),
  label: boundedText(128).default(''),
  placeholder: boundedText(256).default(''),
});

export type LookupInput = z.infer<typeof lookupInputSchema>;

export const lookupExtractSchema = z.object({
  variableName: boundedText(64).min(1),
  extract: boundedText(1_024).default(''),
  extractKind: z.enum(LOOKUP_EXTRACT_KIND_IDS).optional(),
});

export type LookupExtract = z.infer<typeof lookupExtractSchema>;

export const lookupStepSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256).default('Query'),
  enabled: z.boolean().default(true),
  /** When true, an empty result fails the step instead of skipping extracts. */
  required: z.boolean().default(false),
  when: lookupWhenSchema.optional(),
  connectionId: boundedText(128).default(''),
  querySource: z.enum(LOOKUP_QUERY_SOURCE_IDS).default('manual'),
  savedQueryId: boundedText(128).optional(),
  query: boundedText(100_000).default(''),
  extracts: z.array(lookupExtractSchema).max(32).default([]),
});

export type LookupStep = z.infer<typeof lookupStepSchema>;

export const lookupResultFieldSchema = z.object({
  id: z.string().min(1),
  label: boundedText(128).default(''),
  template: boundedText(4_000).default(''),
});

export type LookupResultField = z.infer<typeof lookupResultFieldSchema>;

export const lookupDefinitionSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256).default('New lookup'),
  description: boundedText(4_000).default(''),
  environmentId: z.string().nullable().optional(),
  inputs: z.array(lookupInputSchema).max(32).default([]),
  steps: z.array(lookupStepSchema).max(64).default([]),
  results: z.array(lookupResultFieldSchema).max(64).default([]),
  updatedAt: z.string(),
});

export type LookupDefinition = z.infer<typeof lookupDefinitionSchema>;

export const lookupsFileSchema = z.object({
  schemaVersion: z.literal(1),
  lookups: z.array(lookupDefinitionSchema).default([]),
});

export type LookupsFile = z.infer<typeof lookupsFileSchema>;

/** IPC payload for running a saved lookup playbook. */
export const lookupRunRequestSchema = z.object({
  lookupId: z.string().min(1),
  environmentId: z.string().nullable().optional(),
  inputs: z.record(z.string(), z.string()).default({}),
});

export type LookupRunRequest = z.infer<typeof lookupRunRequestSchema>;

/** Empty lookups workspace file. */
export function createDefaultLookupsFile(): LookupsFile {
  return { schemaVersion: 1, lookups: [] };
}

/** Parses a lookups file, filling defaults. */
export function parseLookupsFile(raw: unknown): LookupsFile {
  const parsed = lookupsFileSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return createDefaultLookupsFile();
}

/** Finds a lookup playbook by id. */
export function findLookup(
  lookups: readonly LookupDefinition[],
  id: string,
): LookupDefinition | null {
  return lookups.find((item) => item.id === id) ?? null;
}

/** Creates a new input row. */
export function createLookupInput(key = 'identifier'): LookupInput {
  return lookupInputSchema.parse({
    key,
    label: key === 'identifier' ? 'Identifier' : key,
    placeholder: '',
  });
}

/** Creates a new extract row. */
export function createLookupExtract(variableName = 'value'): LookupExtract {
  return lookupExtractSchema.parse({
    variableName,
    extract: '$[0]',
    extractKind: 'jsonpath',
  });
}

/** Creates a new query step. */
export function createLookupStep(id: string, name = 'Query'): LookupStep {
  return lookupStepSchema.parse({
    id,
    name,
    enabled: true,
    required: false,
    connectionId: '',
    querySource: 'manual',
    query: '',
    extracts: [],
  });
}

/** Creates a new results-card field. */
export function createLookupResultField(id: string, label = 'Value'): LookupResultField {
  return lookupResultFieldSchema.parse({
    id,
    label,
    template: '',
  });
}

/** Creates a new lookup playbook. */
export function createLookupDefinition(id: string, name = 'New lookup'): LookupDefinition {
  return lookupDefinitionSchema.parse({
    id,
    name,
    description: '',
    environmentId: null,
    inputs: [createLookupInput('identifier')],
    steps: [],
    results: [],
    updatedAt: new Date().toISOString(),
  });
}
