import { z } from 'zod';

export const TESTING_ACTIVE_VIEW_IDS = ['menu', 'test-suite', 'load-test'] as const;
export type TestingActiveViewId = (typeof TESTING_ACTIVE_VIEW_IDS)[number];

export const TESTING_SUBPANEL_IDS = [
  'menu',
  'regression',
  'mock-server',
  'capture',
  'interceptor',
] as const;
export type TestingSubpanelId = (typeof TESTING_SUBPANEL_IDS)[number];

const testingTreeSidebarPrefsSchema = z.object({
  searchQuery: z.string().default(''),
  expandedIds: z.array(z.string()).default([]),
  sortBy: z.enum(['saved', 'name-asc', 'name-desc', 'date-new', 'date-old']).default('saved'),
});

const testingInterceptorPrefsSchema = z.object({
  allFoldersExpanded: z.boolean().default(true),
});

export const workspaceTestingSchema = z.object({
  activeView: z.enum(TESTING_ACTIVE_VIEW_IDS).default('menu'),
  subpanel: z.enum(TESTING_SUBPANEL_IDS).default('menu'),
  testSuite: testingTreeSidebarPrefsSchema,
  loadTest: testingTreeSidebarPrefsSchema,
  regression: testingTreeSidebarPrefsSchema,
  mockServer: testingTreeSidebarPrefsSchema,
  capture: testingTreeSidebarPrefsSchema,
  interceptor: testingInterceptorPrefsSchema,
});

export type WorkspaceTestingState = z.infer<typeof workspaceTestingSchema>;

/**
 * Returns default workspace testing session slice.
 */
export function createDefaultWorkspaceTesting(): WorkspaceTestingState {
  return workspaceTestingSchema.parse({
    testSuite: {},
    loadTest: {},
    regression: {},
    mockServer: {},
    capture: {},
    interceptor: {},
  });
}

/**
 * Merges partial testing session patch with current or defaults.
 */
export function mergeWorkspaceTesting(
  current: WorkspaceTestingState | null | undefined,
  patch: Partial<WorkspaceTestingState>,
  defaults: WorkspaceTestingState = createDefaultWorkspaceTesting(),
): WorkspaceTestingState {
  const base = current ?? defaults;
  return workspaceTestingSchema.parse({
    ...base,
    ...patch,
    testSuite: { ...base.testSuite, ...patch.testSuite },
    loadTest: { ...base.loadTest, ...patch.loadTest },
    regression: { ...base.regression, ...patch.regression },
    mockServer: { ...base.mockServer, ...patch.mockServer },
    capture: { ...base.capture, ...patch.capture },
    interceptor: { ...base.interceptor, ...patch.interceptor },
  });
}
