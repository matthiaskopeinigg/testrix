import { z } from 'zod';

/** Mock server endpoint workspace tab sections. */
export const MOCK_SERVER_TAB_SECTION_IDS = [
  'overview',
  'matchers',
  'response',
  'advanced',
] as const;

export type MockServerTabSectionId = (typeof MOCK_SERVER_TAB_SECTION_IDS)[number];

export const DEFAULT_MOCK_SERVER_TAB_SECTION: MockServerTabSectionId = 'overview';

/** Coerces persisted section id to a valid mock server tab section. */
export function coerceMockServerTabSectionId(value: unknown): MockServerTabSectionId {
  if (
    typeof value === 'string' &&
    (MOCK_SERVER_TAB_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as MockServerTabSectionId;
  }
  return DEFAULT_MOCK_SERVER_TAB_SECTION;
}

export const mockServerTabUiSchema = z.object({
  activeSection: z
    .enum(MOCK_SERVER_TAB_SECTION_IDS)
    .default(DEFAULT_MOCK_SERVER_TAB_SECTION),
});

export type MockServerTabUi = z.infer<typeof mockServerTabUiSchema>;

export const mockServerTabsByIdSchema = z.record(z.string(), mockServerTabUiSchema);

export type MockServerTabsById = z.infer<typeof mockServerTabsByIdSchema>;

/**
 * Returns saved UI for a mock server resource id, or defaults when missing.
 */
export function resolveMockServerTabUi(
  tabsById: MockServerTabsById | null | undefined,
  resourceId: string,
): MockServerTabUi {
  const raw = tabsById?.[resourceId];
  if (!raw) {
    return mockServerTabUiSchema.parse({});
  }
  return mockServerTabUiSchema.parse(raw);
}
