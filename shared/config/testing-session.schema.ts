import { z } from 'zod';

import { loadTestTabsByIdSchema } from './load-test-tab-ui.schema';
import { regressionTabsByIdSchema } from './regression-tab-ui.schema';
import { testSuiteTabsByIdSchema } from './test-suite-tab-ui.schema';

export const TESTING_ACTIVE_VIEW_IDS = ['menu', 'test-suite', 'load-test', 'regression'] as const;
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

const regressionSidebarPrefsSchema = testingTreeSidebarPrefsSchema.extend({
  archiveExpanded: z.boolean().default(false),
  /** @deprecated Use archiveExpanded */
  showArchived: z.boolean().optional(),
  tagFilter: z.array(z.string()).default([]),
  showDescriptions: z.boolean().default(false),
});

const testingInterceptorPrefsSchema = z.object({
  allFoldersExpanded: z.boolean().default(true),
});

export const workspaceTestingSchema = z.object({
  activeView: z.enum(TESTING_ACTIVE_VIEW_IDS).default('menu'),
  subpanel: z.enum(TESTING_SUBPANEL_IDS).default('menu'),
  testSuite: testingTreeSidebarPrefsSchema,
  loadTest: testingTreeSidebarPrefsSchema,
  loadTestTabsById: loadTestTabsByIdSchema.default({}),
  testSuiteTabsById: testSuiteTabsByIdSchema.default({}),
  regressionTabsById: regressionTabsByIdSchema.default({}),
  regression: regressionSidebarPrefsSchema,
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
    loadTestTabsById: { ...base.loadTestTabsById, ...patch.loadTestTabsById },
    testSuiteTabsById: { ...base.testSuiteTabsById, ...patch.testSuiteTabsById },
    regressionTabsById: { ...base.regressionTabsById, ...patch.regressionTabsById },
    regression: { ...base.regression, ...patch.regression },
    mockServer: { ...base.mockServer, ...patch.mockServer },
    capture: { ...base.capture, ...patch.capture },
    interceptor: { ...base.interceptor, ...patch.interceptor },
  });
}
