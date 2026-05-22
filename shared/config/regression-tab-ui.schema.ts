import { z } from 'zod';

/** Regression workspace tab sections. */
export const REGRESSION_TAB_SECTION_IDS = [
  'overview',
  'flows',
  'settings',
  'docs',
  'results',
] as const;

export type RegressionTabSectionId = (typeof REGRESSION_TAB_SECTION_IDS)[number];

export const DEFAULT_REGRESSION_TAB_SECTION: RegressionTabSectionId = 'overview';

/** Coerces persisted section id to a valid regression tab section. */
export function coerceRegressionTabSectionId(value: unknown): RegressionTabSectionId {
  if (
    typeof value === 'string' &&
    (REGRESSION_TAB_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as RegressionTabSectionId;
  }
  return DEFAULT_REGRESSION_TAB_SECTION;
}

export const regressionTabUiSchema = z.object({
  activeSection: z.enum(REGRESSION_TAB_SECTION_IDS).default(DEFAULT_REGRESSION_TAB_SECTION),
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
  diffFilter: z
    .enum(['all', 'changed', 'regressions', 'improvements', 'new_failures'])
    .default('all'),
  selectedFlowDiffId: z.string().nullable().default(null),
  selectedStepDiffId: z.string().nullable().default(null),
  captureDiffNormalizeJson: z.boolean().default(true),
  flowsExpandedIds: z.array(z.string()).default([]),
  selectedFlowIds: z.array(z.string()).default([]),
});

export type RegressionTabUi = z.infer<typeof regressionTabUiSchema>;

export const regressionTabsByIdSchema = z.record(z.string(), regressionTabUiSchema);

export type RegressionTabsById = z.infer<typeof regressionTabsByIdSchema>;

/**
 * Returns saved UI for a regression resource id, or defaults when missing / invalid.
 */
export function resolveRegressionTabUi(
  tabsById: RegressionTabsById | null | undefined,
  resourceId: string,
): RegressionTabUi {
  const raw = tabsById?.[resourceId];
  if (!raw) {
    return regressionTabUiSchema.parse({});
  }
  return regressionTabUiSchema.parse(raw);
}
