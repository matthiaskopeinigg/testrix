import { z } from 'zod';

/** Interceptor rule workspace tab sections. */
export const INTERCEPTOR_TAB_SECTION_IDS = ['overview', 'match', 'action'] as const;

export type InterceptorTabSectionId = (typeof INTERCEPTOR_TAB_SECTION_IDS)[number];

export const DEFAULT_INTERCEPTOR_TAB_SECTION: InterceptorTabSectionId = 'overview';

/** Coerces persisted section id to a valid interceptor tab section. */
export function coerceInterceptorTabSectionId(value: unknown): InterceptorTabSectionId {
  if (
    typeof value === 'string' &&
    (INTERCEPTOR_TAB_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as InterceptorTabSectionId;
  }
  return DEFAULT_INTERCEPTOR_TAB_SECTION;
}

export const interceptorTabUiSchema = z.object({
  activeSection: z.enum(INTERCEPTOR_TAB_SECTION_IDS).default(DEFAULT_INTERCEPTOR_TAB_SECTION),
});

export type InterceptorTabUi = z.infer<typeof interceptorTabUiSchema>;

export const interceptorTabsByIdSchema = z.record(z.string(), interceptorTabUiSchema);

export type InterceptorTabsById = z.infer<typeof interceptorTabsByIdSchema>;

/**
 * Returns saved UI for an interceptor resource id, or defaults when missing.
 */
export function resolveInterceptorTabUi(
  tabsById: InterceptorTabsById | null | undefined,
  resourceId: string,
): InterceptorTabUi {
  const raw = tabsById?.[resourceId];
  if (!raw) {
    return interceptorTabUiSchema.parse({});
  }
  return interceptorTabUiSchema.parse(raw);
}
