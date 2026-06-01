import { z } from 'zod';

/** Capture session workspace tab sections. */
export const CAPTURE_TAB_SECTION_IDS = ['overview', 'traffic'] as const;

export type CaptureTabSectionId = (typeof CAPTURE_TAB_SECTION_IDS)[number];

export const DEFAULT_CAPTURE_TAB_SECTION: CaptureTabSectionId = 'overview';

/** Coerces persisted section id to a valid capture tab section. */
export function coerceCaptureTabSectionId(value: unknown): CaptureTabSectionId {
  if (
    typeof value === 'string' &&
    (CAPTURE_TAB_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as CaptureTabSectionId;
  }
  return DEFAULT_CAPTURE_TAB_SECTION;
}

export const captureTabUiSchema = z.object({
  activeSection: z.enum(CAPTURE_TAB_SECTION_IDS).default(DEFAULT_CAPTURE_TAB_SECTION),
});

export type CaptureTabUi = z.infer<typeof captureTabUiSchema>;

export const captureTabsByIdSchema = z.record(z.string(), captureTabUiSchema);

export type CaptureTabsById = z.infer<typeof captureTabsByIdSchema>;

/**
 * Returns saved UI for a capture resource id, or defaults when missing.
 */
export function resolveCaptureTabUi(
  tabsById: CaptureTabsById | null | undefined,
  resourceId: string,
): CaptureTabUi {
  const raw = tabsById?.[resourceId];
  if (!raw) {
    return captureTabUiSchema.parse({});
  }
  return captureTabUiSchema.parse(raw);
}
