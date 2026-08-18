import { z } from 'zod';

/** Lookup playbook workspace tab sections. */
export const LOOKUP_TAB_SECTION_IDS = ['run', 'edit'] as const;

export type LookupTabSectionId = (typeof LOOKUP_TAB_SECTION_IDS)[number];

export const DEFAULT_LOOKUP_TAB_SECTION: LookupTabSectionId = 'run';

/** Coerces persisted section id to a valid lookup tab section. */
export function coerceLookupTabSectionId(value: unknown): LookupTabSectionId {
  if (
    typeof value === 'string' &&
    (LOOKUP_TAB_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as LookupTabSectionId;
  }
  return DEFAULT_LOOKUP_TAB_SECTION;
}

const lookupTabResultRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
});

const lookupTabStepLogSchema = z.object({
  stepId: z.string(),
  name: z.string(),
  status: z.enum(['ran', 'skipped', 'failed']),
  message: z.string(),
  connectionId: z.string().optional(),
  connectionName: z.string().optional(),
});

/** Last lookup run kept in the workspace session so results survive tab remounts. */
export const lookupTabLastRunSchema = z.object({
  ok: z.boolean(),
  environmentId: z.string().nullable(),
  variables: z.record(z.string(), z.string()).default({}),
  results: z.array(lookupTabResultRowSchema).default([]),
  stepLog: z.array(lookupTabStepLogSchema).default([]),
});

export type LookupTabLastRun = z.infer<typeof lookupTabLastRunSchema>;

/** Per-tab Run/Edit state, including the last results card. */
export const lookupTabUiSchema = z.object({
  activeSection: z.enum(LOOKUP_TAB_SECTION_IDS).default(DEFAULT_LOOKUP_TAB_SECTION),
  runEnvironmentId: z.string().nullable().default(null),
  runInputs: z.record(z.string(), z.string()).default({}),
  lastRun: lookupTabLastRunSchema.nullable().default(null),
  runError: z.string().nullable().default(null),
});

export type LookupTabUi = z.infer<typeof lookupTabUiSchema>;

export const lookupTabsByIdSchema = z.record(z.string(), lookupTabUiSchema);

export type LookupTabsById = z.infer<typeof lookupTabsByIdSchema>;

/**
 * Returns saved UI for a lookup resource id, or defaults when missing.
 */
export function resolveLookupTabUi(
  tabsById: LookupTabsById | null | undefined,
  resourceId: string,
): LookupTabUi {
  const raw = tabsById?.[resourceId];
  if (!raw) {
    return lookupTabUiSchema.parse({});
  }
  return lookupTabUiSchema.parse(raw);
}
