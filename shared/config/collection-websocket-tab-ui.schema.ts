import { z } from 'zod';

/** Pre-request vs post-response script panes (aligned with folder/request tabs). */
export const WEBSOCKET_TAB_SCRIPT_PANE_IDS = ['pre', 'post'] as const;

export type WebsocketTabScriptPaneId = (typeof WEBSOCKET_TAB_SCRIPT_PANE_IDS)[number];

/** WebSocket workspace tab sections. */
export const WEBSOCKET_TAB_SECTION_IDS = [
  'overview',
  'params',
  'auth',
  'headers',
  'message',
  'scripts',
  'settings',
  'docs',
] as const;

export type WebsocketTabSectionId = (typeof WEBSOCKET_TAB_SECTION_IDS)[number];

export const DEFAULT_WEBSOCKET_TAB_SECTION: WebsocketTabSectionId = 'overview';

/** Coerces persisted section id to a valid websocket tab section. */
export function coerceWebsocketTabSectionId(value: unknown): WebsocketTabSectionId {
  if (
    typeof value === 'string' &&
    (WEBSOCKET_TAB_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as WebsocketTabSectionId;
  }
  return DEFAULT_WEBSOCKET_TAB_SECTION;
}

export const collectionWebsocketTabUiSchema = z.object({
  activeSection: z.enum(WEBSOCKET_TAB_SECTION_IDS).default(DEFAULT_WEBSOCKET_TAB_SECTION),
  activeScriptPane: z.enum(WEBSOCKET_TAB_SCRIPT_PANE_IDS).default('pre'),
  messagesPanelHeightPx: z.number().int().min(120).max(1200).optional(),
  isMessagesPanelHidden: z.boolean().default(false),
});

export type CollectionWebsocketTabUi = z.infer<typeof collectionWebsocketTabUiSchema>;

export const collectionWebsocketTabsByIdSchema = z.record(z.string(), collectionWebsocketTabUiSchema);

export type CollectionWebsocketTabsById = z.infer<typeof collectionWebsocketTabsByIdSchema>;

/**
 * Returns saved UI for a websocket resource id, or defaults when missing / invalid.
 */
export function resolveCollectionWebsocketTabUi(
  byId: CollectionWebsocketTabsById | undefined,
  resourceId: string,
): CollectionWebsocketTabUi {
  const raw = byId?.[resourceId];
  const parsed = collectionWebsocketTabUiSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : collectionWebsocketTabUiSchema.parse({});
}
