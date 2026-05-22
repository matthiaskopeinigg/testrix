import { z } from 'zod';

export const TEST_SUITE_FLOW_SECTION_IDS = ['overview', 'steps'] as const;

export const testSuiteFlowSectionIdSchema = z.enum(TEST_SUITE_FLOW_SECTION_IDS);

export type TestSuiteFlowSectionId = z.infer<typeof testSuiteFlowSectionIdSchema>;

/** Maps legacy titlebar section ids to the current overview/steps model. */
export function normalizeTestSuiteFlowSectionId(value: unknown): TestSuiteFlowSectionId {
  if (value === 'overview') {
    return 'overview';
  }
  return 'steps';
}

export const testSuiteTabUiSchema = z.object({
  selectedStepId: z.string().nullable().default(null),
  expandedStepFolderIds: z.array(z.string()).default([]),
  addStepModalOpen: z.boolean().default(false),
  /** Parent folder id when adding a step (null = flow root). */
  addStepParentId: z.string().nullable().default(null),
  /** Width of the flow steps tree panel in pixels. */
  stepsPanelWidthPx: z.number().int().min(200).max(480).optional(),
  /** Height of the run log panel in pixels. */
  resultsPanelHeightPx: z.number().int().min(120).max(1200).optional(),
  isResultsPanelHidden: z.boolean().default(false),
  /** Active workspace section (`overview` | `steps`). */
  activeFlowSection: z.preprocess(
    normalizeTestSuiteFlowSectionId,
    testSuiteFlowSectionIdSchema,
  ).default('steps'),
});

export type TestSuiteTabUi = z.infer<typeof testSuiteTabUiSchema>;

export const testSuiteTabsByIdSchema = z.record(z.string(), testSuiteTabUiSchema);

export type TestSuiteTabsById = z.infer<typeof testSuiteTabsByIdSchema>;

/**
 * Returns saved UI for a test-suite tab resource id, or defaults when missing.
 */
export function resolveTestSuiteTabUi(
  tabsById: TestSuiteTabsById | null | undefined,
  resourceId: string,
): TestSuiteTabUi {
  const raw = tabsById?.[resourceId];
  if (!raw) {
    return testSuiteTabUiSchema.parse({});
  }
  return testSuiteTabUiSchema.parse(raw);
}
