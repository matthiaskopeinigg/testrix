import { z } from 'zod';

import {
  DEFAULT_HTTP_ACTIVE_SECTION_ON_OPEN,
  HTTP_REQUEST_SECTION_IDS,
  type HttpRequestSectionId,
} from './http-settings.schema';

/** Pre-request vs post-response script panes (aligned with folder tab). */
export const COLLECTION_REQUEST_SCRIPT_PANE_IDS = ['pre', 'post'] as const;

export type CollectionRequestScriptPaneId = (typeof COLLECTION_REQUEST_SCRIPT_PANE_IDS)[number];

export const collectionRequestTabUiSchema = z.object({
  activeSection: z.enum(HTTP_REQUEST_SECTION_IDS).default('body'),
  activeScriptPane: z.enum(COLLECTION_REQUEST_SCRIPT_PANE_IDS).default('pre'),
});

export type CollectionRequestTabUi = z.infer<typeof collectionRequestTabUiSchema>;

export const collectionRequestTabsByIdSchema = z.record(z.string(), collectionRequestTabUiSchema);

export type CollectionRequestTabsById = z.infer<typeof collectionRequestTabsByIdSchema>;

export const DEFAULT_COLLECTION_REQUEST_TAB_SECTION =
  collectionRequestTabUiSchema.shape.activeSection.default;

/**
 * Returns saved UI for a request resource id, or defaults when missing / invalid.
 */
export function resolveCollectionRequestTabUi(
  byId: CollectionRequestTabsById | undefined,
  resourceId: string,
  defaultActiveSection: HttpRequestSectionId = DEFAULT_HTTP_ACTIVE_SECTION_ON_OPEN,
): CollectionRequestTabUi {
  const raw = byId?.[resourceId];
  if (raw === undefined) {
    return {
      activeSection: defaultActiveSection,
      activeScriptPane: 'pre',
    };
  }
  const parsed = collectionRequestTabUiSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      activeSection: defaultActiveSection,
      activeScriptPane: 'pre',
    };
  }
  return parsed.data;
}
