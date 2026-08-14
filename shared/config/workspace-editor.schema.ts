import { z } from 'zod';

/** Default tab group id for a single-pane workspace. */
export const WORKSPACE_EDITOR_MAIN_GROUP_ID = 'main' as const;

/** Minimum first-pane share when resizing a split (20%). */
export const WORKSPACE_SPLIT_MIN_RATIO = 0.2;

/** Maximum first-pane share when resizing a split (80%). */
export const WORKSPACE_SPLIT_MAX_RATIO = 0.8;

/** Minimum pixel size for each pane (also constrains ratio while dragging). */
export const WORKSPACE_SPLIT_MIN_PANE_SIZE_PX = 120;

export const workspaceTabKindSchema = z.enum([
  'request',
  'history',
  'websocket',
  'environment',
  'folder',
  'design-system',
  'dev-tool',
  'test-suite',
  'load-test',
  'regression',
  'mock-server',
  'capture',
  'interceptor-rule',
]);

export type WorkspaceTabKind = z.infer<typeof workspaceTabKindSchema>;

export const workspaceTabSchema = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  kind: workspaceTabKindSchema,
  pinned: z.boolean(),
  label: z.string().optional(),
});

export type WorkspaceTab = z.infer<typeof workspaceTabSchema>;

export const tabGroupStateSchema = z.object({
  tabs: z.array(workspaceTabSchema),
  activeTabId: z.string().nullable(),
});

export type TabGroupState = z.infer<typeof tabGroupStateSchema>;

export const splitDirectionSchema = z.enum(['horizontal', 'vertical']);

export type SplitDirection = z.infer<typeof splitDirectionSchema>;

export const splitLayoutLeafSchema = z.object({
  type: z.literal('leaf'),
  groupId: z.string().min(1),
});

export type SplitLayoutLeaf = z.infer<typeof splitLayoutLeafSchema>;

export type SplitLayoutSplit = {
  readonly type: 'split';
  readonly direction: SplitDirection;
  readonly ratio: number;
  readonly first: SplitLayoutNode;
  readonly second: SplitLayoutNode;
};

export type SplitLayoutNode = SplitLayoutLeaf | SplitLayoutSplit;

const splitLayoutNodeSchema: z.ZodType<SplitLayoutNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    splitLayoutLeafSchema,
    z.object({
      type: z.literal('split'),
      direction: splitDirectionSchema,
      ratio: z.number().min(WORKSPACE_SPLIT_MIN_RATIO).max(WORKSPACE_SPLIT_MAX_RATIO),
      first: splitLayoutNodeSchema,
      second: splitLayoutNodeSchema,
    }),
  ]),
);

export { splitLayoutNodeSchema };

export const workspaceEditorStateSchema = z.object({
  focusedGroupId: z.string().min(1),
  layout: splitLayoutNodeSchema,
  groups: z.record(z.string(), tabGroupStateSchema),
  recentResourceIds: z.array(z.string()),
});

export type WorkspaceEditorState = z.infer<typeof workspaceEditorStateSchema>;

/**
 * Returns an empty editor workspace with a single main pane.
 */
export function createDefaultWorkspaceEditor(): WorkspaceEditorState {
  return {
    focusedGroupId: WORKSPACE_EDITOR_MAIN_GROUP_ID,
    layout: { type: 'leaf', groupId: WORKSPACE_EDITOR_MAIN_GROUP_ID },
    groups: {
      [WORKSPACE_EDITOR_MAIN_GROUP_ID]: { tabs: [], activeTabId: null },
    },
    recentResourceIds: [],
  };
}
