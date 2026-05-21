import { z } from 'zod';

import {
  DEFAULT_ENVIRONMENT_LIST_SIDEBAR_FILTER,
  DEFAULT_ENVIRONMENT_LIST_SIDEBAR_SORT_BY,
  ENVIRONMENT_LIST_SIDEBAR_FILTER_IDS,
  ENVIRONMENT_LIST_SIDEBAR_SORT_BY_IDS,
} from './environment-list-sidebar';
import {
  DEFAULT_ENVIRONMENT_SIDEBAR_FILTER,
  DEFAULT_ENVIRONMENT_SIDEBAR_SORT_BY,
  ENVIRONMENT_SIDEBAR_FILTER_IDS,
  ENVIRONMENT_SIDEBAR_SORT_BY_IDS,
} from './environment-sidebar';
import { workspaceCollectionFolderTabsSchema } from './collection-folder-tab-ui.schema';
import { workspaceDesignSystemSchema } from './design-system-session.schema';
import {
  developmentToolsRecordSchema,
  workspaceDevelopmentSchema,
} from './development-session.schema';
import { workspaceEditorStateSchema } from './workspace-editor.schema';
import { workspaceTestingSchema } from './testing-session.schema';

const metaSessionSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  sessionId: z.string().uuid(),
  startedAt: z.string(),
});

const windowSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  maximized: z.boolean(),
});

const navigationSchema = z.object({
  lastRoute: z.string(),
});

const workspaceExpandedFoldersSchema = workspaceCollectionFolderTabsSchema.pick({
  expandedFolderIds: true,
});

const workspaceEnvironmentsSchema = workspaceExpandedFoldersSchema.extend({
  sidebarFilter: z.enum(ENVIRONMENT_SIDEBAR_FILTER_IDS).default(DEFAULT_ENVIRONMENT_SIDEBAR_FILTER),
  sidebarSortBy: z.enum(ENVIRONMENT_SIDEBAR_SORT_BY_IDS).default(DEFAULT_ENVIRONMENT_SIDEBAR_SORT_BY),
  listSidebarFilter: z
    .enum(ENVIRONMENT_LIST_SIDEBAR_FILTER_IDS)
    .default(DEFAULT_ENVIRONMENT_LIST_SIDEBAR_FILTER),
  listSidebarSortBy: z
    .enum(ENVIRONMENT_LIST_SIDEBAR_SORT_BY_IDS)
    .default(DEFAULT_ENVIRONMENT_LIST_SIDEBAR_SORT_BY),
});

const workspaceSchema = z.object({
  activeId: z.string().nullable(),
  recentIds: z.array(z.string()),
  collections: workspaceCollectionFolderTabsSchema,
  environments: workspaceEnvironmentsSchema,
  editor: workspaceEditorStateSchema,
  designSystem: workspaceDesignSystemSchema,
  development: workspaceDevelopmentSchema,
  testing: workspaceTestingSchema,
});

export const sessionFileSchema = z.object({
  schemaVersion: z.literal(1),
  meta: metaSessionSchema,
  window: windowSchema,
  navigation: navigationSchema,
  workspace: workspaceSchema,
});

export type SessionFile = z.infer<typeof sessionFileSchema>;

export const sessionPatchSchema = z
  .object({
    meta: metaSessionSchema.partial().optional(),
    window: windowSchema.partial().optional(),
    navigation: navigationSchema.partial().optional(),
    workspace: z
      .object({
        activeId: z.string().nullable().optional(),
        recentIds: z.array(z.string()).optional(),
        collections: workspaceCollectionFolderTabsSchema.partial().optional(),
        environments: workspaceEnvironmentsSchema.partial().optional(),
        editor: workspaceEditorStateSchema.partial().optional(),
        designSystem: workspaceDesignSystemSchema.partial().optional(),
        development: z
          .object({
            tools: developmentToolsRecordSchema.partial(),
          })
          .optional(),
        testing: workspaceTestingSchema.partial().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SessionPatch = z.infer<typeof sessionPatchSchema>;
