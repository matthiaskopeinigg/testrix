import { z } from 'zod';

import { collectionRequestTabsByIdSchema } from './collection-request-tab-ui.schema';
import { workspaceRequestRunsSchema } from './request-runs-session.schema';

/** Folder workspace tab sections. */
export const COLLECTION_FOLDER_TAB_SECTION_IDS = [
  'overview',
  'variables',
  'headers',
  'auth',
  'script',
  'settings',
  'docs',
] as const;

export type CollectionFolderTabSectionId = (typeof COLLECTION_FOLDER_TAB_SECTION_IDS)[number];

/** Pre-request vs post-response script panes. */
export const COLLECTION_FOLDER_SCRIPT_PANE_IDS = ['pre', 'post'] as const;

export type CollectionFolderScriptPaneId = (typeof COLLECTION_FOLDER_SCRIPT_PANE_IDS)[number];

export const DEFAULT_COLLECTION_FOLDER_TAB_SECTION: CollectionFolderTabSectionId = 'overview';

/** Coerces persisted section id to a valid folder tab section. */
export function coerceCollectionFolderTabSectionId(value: unknown): CollectionFolderTabSectionId {
  if (
    typeof value === 'string' &&
    (COLLECTION_FOLDER_TAB_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as CollectionFolderTabSectionId;
  }
  return DEFAULT_COLLECTION_FOLDER_TAB_SECTION;
}

export const DEFAULT_COLLECTION_FOLDER_SCRIPT_PANE: CollectionFolderScriptPaneId = 'pre';

export const collectionFolderTabUiSchema = z.object({
  activeSection: z.enum(COLLECTION_FOLDER_TAB_SECTION_IDS).default(DEFAULT_COLLECTION_FOLDER_TAB_SECTION),
  activeScriptPane: z
    .enum(COLLECTION_FOLDER_SCRIPT_PANE_IDS)
    .default(DEFAULT_COLLECTION_FOLDER_SCRIPT_PANE),
});

export type CollectionFolderTabUi = z.infer<typeof collectionFolderTabUiSchema>;

export const collectionFolderTabsByIdSchema = z.record(z.string(), collectionFolderTabUiSchema);

export type CollectionFolderTabsById = z.infer<typeof collectionFolderTabsByIdSchema>;

/** Session slice: collections sidebar + workspace tab UI state. */
export const workspaceCollectionFolderTabsSchema = z.object({
  expandedFolderIds: z.array(z.string()),
  folderTabsById: collectionFolderTabsByIdSchema.default({}),
  requestTabsById: collectionRequestTabsByIdSchema.default({}),
  requestRunsById: workspaceRequestRunsSchema.default({}),
  folderRunsById: z
    .record(
      z.string(),
      z.object({
        runId: z.string(),
        status: z.enum(['idle', 'running', 'paused', 'done', 'cancelled']),
        currentRequestId: z.string().optional(),
        completed: z.number().int(),
        total: z.number().int(),
        results: z.array(
          z.object({
            requestId: z.string(),
            snapshotId: z.string(),
            ok: z.boolean(),
          }),
        ),
      }),
    )
    .default({}),
});

export type WorkspaceCollectionFolderTabs = z.infer<typeof workspaceCollectionFolderTabsSchema>;

/**
 * Returns saved UI for a folder resource id, or defaults when missing / invalid.
 */
export function resolveCollectionFolderTabUi(
  byId: CollectionFolderTabsById | undefined,
  resourceId: string,
): CollectionFolderTabUi {
  const raw = byId?.[resourceId];
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    activeSection: coerceCollectionFolderTabSectionId(record['activeSection']),
    activeScriptPane:
      record['activeScriptPane'] === 'post'
        ? 'post'
        : DEFAULT_COLLECTION_FOLDER_SCRIPT_PANE,
  };
}
