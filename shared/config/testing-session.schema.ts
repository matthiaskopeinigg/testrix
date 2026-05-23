import { z } from 'zod';

import { loadTestTabsByIdSchema } from './load-test-tab-ui.schema';
import {
  DEFAULT_REGRESSION_SIDEBAR_FILTER,
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
  REGRESSION_SIDEBAR_FILTER_IDS,
  REGRESSION_SIDEBAR_SORT_BY_IDS,
} from './regression-sidebar';
import { regressionTabsByIdSchema } from './regression-tab-ui.schema';
import { DEFAULT_LOAD_TEST_SIDEBAR_FILTER, LOAD_TEST_SIDEBAR_FILTER_IDS } from './load-test-sidebar';
import { DEFAULT_TEST_SUITE_SIDEBAR_FILTER, TEST_SUITE_SIDEBAR_FILTER_IDS } from './test-suite-sidebar';
import { testSuiteTabsByIdSchema } from './test-suite-tab-ui.schema';
import {
  DEFAULT_CAPTURE_SIDEBAR_FILTER,
  CAPTURE_SIDEBAR_FILTER_IDS,
} from './capture-sidebar';
import {
  DEFAULT_INTERCEPTOR_SIDEBAR_FILTER,
  INTERCEPTOR_SIDEBAR_FILTER_IDS,
} from './interceptor-sidebar';
import {
  DEFAULT_MOCK_SERVER_SIDEBAR_FILTER,
  MOCK_SERVER_SIDEBAR_FILTER_IDS,
} from './mock-server-sidebar';
import { mockServerTabsByIdSchema } from './mock-server-tab-ui.schema';

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
  sortBy: z.enum(REGRESSION_SIDEBAR_SORT_BY_IDS).default(DEFAULT_REGRESSION_SIDEBAR_SORT_BY),
});

const regressionSidebarPrefsSchema = testingTreeSidebarPrefsSchema.extend({
  archiveExpanded: z.boolean().default(false),
  /** @deprecated Use archiveExpanded */
  showArchived: z.boolean().optional(),
  kindFilter: z.enum(REGRESSION_SIDEBAR_FILTER_IDS).default(DEFAULT_REGRESSION_SIDEBAR_FILTER),
  tagFilter: z.array(z.string()).default([]),
  showDescriptions: z.boolean().default(false),
});

const testSuiteSidebarPrefsSchema = testingTreeSidebarPrefsSchema.extend({
  kindFilter: z.enum(TEST_SUITE_SIDEBAR_FILTER_IDS).default(DEFAULT_TEST_SUITE_SIDEBAR_FILTER),
  tagFilter: z.array(z.string()).default([]),
});

const loadTestSidebarPrefsSchema = testingTreeSidebarPrefsSchema.extend({
  kindFilter: z.enum(LOAD_TEST_SIDEBAR_FILTER_IDS).default(DEFAULT_LOAD_TEST_SIDEBAR_FILTER),
  tagFilter: z.array(z.string()).default([]),
});

const captureSidebarPrefsSchema = testingTreeSidebarPrefsSchema.extend({
  kindFilter: z.enum(CAPTURE_SIDEBAR_FILTER_IDS).default(DEFAULT_CAPTURE_SIDEBAR_FILTER),
});

const interceptorSidebarPrefsSchema = testingTreeSidebarPrefsSchema.extend({
  kindFilter: z.enum(INTERCEPTOR_SIDEBAR_FILTER_IDS).default(DEFAULT_INTERCEPTOR_SIDEBAR_FILTER),
  settingsExpanded: z.boolean().default(false),
});

const mockServerSidebarPrefsSchema = testingTreeSidebarPrefsSchema.extend({
  kindFilter: z.enum(MOCK_SERVER_SIDEBAR_FILTER_IDS).default(DEFAULT_MOCK_SERVER_SIDEBAR_FILTER),
  tagFilter: z.array(z.string()).default([]),
  settingsExpanded: z.boolean().default(false),
  mismatchesPanelExpanded: z.boolean().default(false),
});

export const workspaceTestingSchema = z.object({
  activeView: z.enum(TESTING_ACTIVE_VIEW_IDS).default('menu'),
  subpanel: z.enum(TESTING_SUBPANEL_IDS).default('menu'),
  testSuite: testSuiteSidebarPrefsSchema,
  loadTest: loadTestSidebarPrefsSchema,
  loadTestTabsById: loadTestTabsByIdSchema.default({}),
  testSuiteTabsById: testSuiteTabsByIdSchema.default({}),
  regressionTabsById: regressionTabsByIdSchema.default({}),
  regression: regressionSidebarPrefsSchema,
  mockServer: mockServerSidebarPrefsSchema,
  mockServerTabsById: mockServerTabsByIdSchema.default({}),
  capture: captureSidebarPrefsSchema,
  interceptor: interceptorSidebarPrefsSchema,
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
    mockServerTabsById: { ...base.mockServerTabsById, ...patch.mockServerTabsById },
    capture: { ...base.capture, ...patch.capture },
    interceptor: { ...base.interceptor, ...patch.interceptor },
  });
}
