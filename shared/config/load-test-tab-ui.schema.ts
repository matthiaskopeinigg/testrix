import { z } from 'zod';

/** Load test workspace tab sections. */
export const LOAD_TEST_TAB_SECTION_IDS = [
  'overview',
  'target',
  'profile',
  'thresholds',
  'scenarios',
  'docs',
] as const;

export type LoadTestTabSectionId = (typeof LOAD_TEST_TAB_SECTION_IDS)[number];

export const DEFAULT_LOAD_TEST_TAB_SECTION: LoadTestTabSectionId = 'overview';

/** Coerces persisted section id to a valid load test tab section. */
export function coerceLoadTestTabSectionId(value: unknown): LoadTestTabSectionId {
  if (
    typeof value === 'string' &&
    (LOAD_TEST_TAB_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as LoadTestTabSectionId;
  }
  return DEFAULT_LOAD_TEST_TAB_SECTION;
}

export const loadTestTabUiSchema = z.object({
  activeSection: z.enum(LOAD_TEST_TAB_SECTION_IDS).default(DEFAULT_LOAD_TEST_TAB_SECTION),
  resultsPanelHeightPx: z.number().int().min(120).max(1200).optional(),
  isResultsPanelHidden: z.boolean().default(false),
  selectedRunId: z.string().nullable().default(null),
  pinnedBaselineRunId: z.string().nullable().default(null),
  compareSelection: z
    .object({
      a: z.string(),
      b: z.string(),
    })
    .nullable()
    .default(null),
  resultsView: z.enum(['live', 'history', 'compare']).default('live'),
});

export type LoadTestTabUi = z.infer<typeof loadTestTabUiSchema>;

export const loadTestTabsByIdSchema = z.record(z.string(), loadTestTabUiSchema);

export type LoadTestTabsById = z.infer<typeof loadTestTabsByIdSchema>;

/**
 * Returns saved UI for a load test resource id, or defaults when missing / invalid.
 */
export function resolveLoadTestTabUi(
  tabsById: LoadTestTabsById | null | undefined,
  resourceId: string,
): LoadTestTabUi {
  const raw = tabsById?.[resourceId];
  if (!raw) {
    return loadTestTabUiSchema.parse({});
  }
  return loadTestTabUiSchema.parse(raw);
}
