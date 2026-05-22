import {
  createDefaultRegressionProfile,
  createDefaultRegressionThresholds,
} from './regression-run.schema';
import {
  createDefaultRegressionArtifactPayload,
  regressionsFileSchema,
  type RegressionsFile,
  type RegressionArtifact,
  type RegressionFolder,
} from './regressions.schema';
import {
  TEST_SUITE_ROOT_ID,
  testSuiteFlowSchema,
  testSuiteFolderSchema,
  testSuitesFileSchema,
  type TestSuiteFlow,
  type TestSuiteFolder,
  type TestSuitesFile,
} from './test-suites.schema';

/** Stable ids for demo seed data (safe to re-run). */
export const DEMO_API_FOLDER_ID = 'demo_api_folder';
export const DEMO_FLOW_GET_POST_ID = 'demo_flow_get_post';
export const DEMO_FLOW_HTTPBIN_ID = 'demo_flow_httpbin';
export const DEMO_FLOW_CREATE_POST_ID = 'demo_flow_create_post';
export const DEMO_REGRESSION_FOLDER_ID = 'demo_regression_folder';
export const DEMO_REGRESSION_SMOKE_ID = 'demo_regression_smoke';
export const DEMO_REGRESSION_BULK_ID = 'demo_regression_bulk';
export const DEMO_BULK_FOLDER_ID = 'demo_bulk_folder';
export const DEMO_TESTING_PROFILE_ID = 'profile-testing-demo';

/** Default bulk flow count for stress-testing regressions. */
export const DEMO_BULK_FLOW_COUNT_DEFAULT = 400;

export const DEMO_FLOW_IDS = [
  DEMO_FLOW_GET_POST_ID,
  DEMO_FLOW_HTTPBIN_ID,
  DEMO_FLOW_CREATE_POST_ID,
] as const;

export interface DemoSeedOptions {
  readonly bulkFlowCount?: number;
}

/** Stable flow id for bulk seed flows (1-based index). */
export function demoBulkFlowId(index: number): string {
  return `demo_flow_bulk_${String(index).padStart(3, '0')}`;
}

/** All bulk flow ids for a given count. */
export function demoBulkFlowIds(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => demoBulkFlowId(i + 1));
}

function demoBulkGroupFolderId(groupIndex: number): string {
  return `demo_bulk_group_${String(groupIndex).padStart(2, '0')}`;
}

function bulkFlowTarget(index: number): { readonly resource: string; readonly resourceId: number; readonly label: string } {
  const bucket = Math.floor((index - 1) / 100);
  const resourceId = ((index - 1) % 100) + 1;
  const resources = ['posts', 'comments', 'albums', 'photos'] as const;
  const resource = resources[bucket] ?? 'posts';
  const label = `GET ${resource.slice(0, -1)} #${resourceId}`;
  return { resource, resourceId, label };
}

const DEMO_TS = '2026-05-22T00:00:00.000Z';

function requestStep(
  id: string,
  name: string,
  method: 'GET' | 'POST',
  url: string,
  body = '',
  bodyType: 'none' | 'json' = 'none',
) {
  return {
    id,
    type: 'step' as const,
    name,
    parentId: null,
    stepType: 'REQUEST' as const,
    config: {
      method,
      url,
      headers: bodyType === 'json' ? [{ key: 'Content-Type', value: 'application/json', enabled: true }] : [],
      queryParams: [],
      body,
      bodyType,
      timeoutMs: 30_000,
      requestSource: 'manual' as const,
    },
    enabled: true,
  };
}

function validationStep(
  id: string,
  name: string,
  refStepId: string,
  rules: Array<{ source: string; operator: string; expected: string }>,
) {
  return {
    id,
    type: 'step' as const,
    name,
    parentId: null,
    stepType: 'VALIDATION' as const,
    config: {
      refStepId,
      rules,
    },
    enabled: true,
  };
}

/** Builds the three public-API demo flows. */
export function buildDemoPublicApiFlows(ts = DEMO_TS): readonly TestSuiteFlow[] {
  const getPost = testSuiteFlowSchema.parse({
    id: DEMO_FLOW_GET_POST_ID,
    name: 'GET JSONPlaceholder Post',
    description: 'Fetches post #1 from JSONPlaceholder and validates status and body.',
    tags: ['demo', 'public-api', 'jsonplaceholder'],
    nodes: [
      requestStep(
        'demo_step_get_post_req',
        'GET /posts/1',
        'GET',
        'https://jsonplaceholder.typicode.com/posts/1',
      ),
      validationStep('demo_step_get_post_val', 'Assert 200 and title', 'demo_step_get_post_req', [
        { source: 'response_status', operator: 'equals', expected: '200' },
        { source: 'response_body', operator: 'contains', expected: 'sunt aut facere' },
      ]),
    ],
    lastRunStatus: 'never',
    lastRunAt: null,
    updatedAt: ts,
  });

  const httpbin = testSuiteFlowSchema.parse({
    id: DEMO_FLOW_HTTPBIN_ID,
    name: 'GET httpbin Echo',
    description: 'Calls httpbin.org/get and validates a 200 response.',
    tags: ['demo', 'public-api', 'httpbin'],
    nodes: [
      requestStep('demo_step_httpbin_req', 'GET /get', 'GET', 'https://httpbin.org/get'),
      validationStep('demo_step_httpbin_val', 'Assert 200 OK', 'demo_step_httpbin_req', [
        { source: 'response_status', operator: 'equals', expected: '200' },
        { source: 'response_body', operator: 'contains', expected: '"url"' },
      ]),
    ],
    lastRunStatus: 'never',
    lastRunAt: null,
    updatedAt: ts,
  });

  const createPost = testSuiteFlowSchema.parse({
    id: DEMO_FLOW_CREATE_POST_ID,
    name: 'POST JSONPlaceholder Post',
    description: 'Creates a post via JSONPlaceholder and expects HTTP 201.',
    tags: ['demo', 'public-api', 'jsonplaceholder'],
    nodes: [
      requestStep(
        'demo_step_create_post_req',
        'POST /posts',
        'POST',
        'https://jsonplaceholder.typicode.com/posts',
        JSON.stringify({ title: 'Testrix demo', body: 'Regression seed flow', userId: 1 }),
        'json',
      ),
      validationStep('demo_step_create_post_val', 'Assert 201 Created', 'demo_step_create_post_req', [
        { source: 'response_status', operator: 'equals', expected: '201' },
        { source: 'response_body', operator: 'contains', expected: 'Testrix demo' },
      ]),
    ],
    lastRunStatus: 'never',
    lastRunAt: null,
    updatedAt: ts,
  });

  return [getPost, httpbin, createPost];
}

/** Builds one bulk GET flow against JSONPlaceholder (posts, comments, albums, photos). */
export function buildDemoBulkFlow(index: number, ts = DEMO_TS): TestSuiteFlow {
  const flowId = demoBulkFlowId(index);
  const target = bulkFlowTarget(index);
  const reqStepId = `demo_bulk_${String(index).padStart(3, '0')}_req`;
  const url = `https://jsonplaceholder.typicode.com/${target.resource}/${target.resourceId}`;

  return testSuiteFlowSchema.parse({
    id: flowId,
    name: target.label,
    description: `Bulk stress flow #${index} — ${url}`,
    tags: ['demo', 'bulk', 'public-api'],
    nodes: [
      requestStep(reqStepId, target.label, 'GET', url),
      validationStep(`demo_bulk_${String(index).padStart(3, '0')}_val`, 'Assert 200 OK', reqStepId, [
        { source: 'response_status', operator: 'equals', expected: '200' },
      ]),
    ],
    lastRunStatus: 'never',
    lastRunAt: null,
    updatedAt: ts,
  });
}

/** Builds bulk flows grouped into folders of 50 for sidebar navigation. */
export function buildDemoBulkFlowGroups(
  count: number,
  ts = DEMO_TS,
  groupSize = 50,
): readonly TestSuiteFolder[] {
  const groupCount = Math.ceil(count / groupSize);
  const groups: TestSuiteFolder[] = [];

  for (let group = 0; group < groupCount; group += 1) {
    const start = group * groupSize + 1;
    const end = Math.min(count, start + groupSize - 1);
    const children: TestSuiteFlow[] = [];
    for (let index = start; index <= end; index += 1) {
      children.push(buildDemoBulkFlow(index, ts));
    }
    groups.push(
      testSuiteFolderSchema.parse({
        id: demoBulkGroupFolderId(group + 1),
        name: `Bulk flows ${start}–${end}`,
        description: `${children.length} JSONPlaceholder GET flows for regression stress testing.`,
        tags: ['demo', 'bulk'],
        children,
        updatedAt: ts,
      }),
    );
  }

  return groups;
}

/** Builds the bulk stress folder (400 flows by default). */
export function buildDemoBulkFolder(count: number, ts = DEMO_TS): TestSuiteFolder {
  return testSuiteFolderSchema.parse({
    id: DEMO_BULK_FOLDER_ID,
    name: `Bulk API Stress (${count})`,
    description: `${count} real HTTP GET flows against JSONPlaceholder for parallel regression testing.`,
    tags: ['demo', 'bulk', 'stress'],
    children: buildDemoBulkFlowGroups(count, ts),
    updatedAt: ts,
  });
}

/** Builds the demo folder wrapping all public-API flows. */
export function buildDemoPublicApiFolder(ts = DEMO_TS): TestSuiteFolder {
  return testSuiteFolderSchema.parse({
    id: DEMO_API_FOLDER_ID,
    name: 'Public API Demo',
    description: 'Sample flows that call real public HTTP APIs (JSONPlaceholder, httpbin).',
    tags: ['demo'],
    children: buildDemoPublicApiFlows(ts),
    updatedAt: ts,
  });
}

/** Merges demo flows into a test suites file (idempotent). */
export function mergeDemoPublicApiTestSuites(
  file: TestSuitesFile,
  ts = DEMO_TS,
  options: DemoSeedOptions = {},
): TestSuitesFile {
  const bulkCount = options.bulkFlowCount ?? 0;
  let next = mergeDemoFolderIntoTestSuites(file, DEMO_API_FOLDER_ID, buildDemoPublicApiFolder(ts), ts);
  if (bulkCount > 0) {
    next = mergeDemoFolderIntoTestSuites(next, DEMO_BULK_FOLDER_ID, buildDemoBulkFolder(bulkCount, ts), ts);
  }
  return next;
}

function mergeDemoFolderIntoTestSuites(
  file: TestSuitesFile,
  folderId: string,
  folder: TestSuiteFolder,
  ts: string,
): TestSuitesFile {
  const root = file.suites.find((suite) => suite.id === TEST_SUITE_ROOT_ID) ?? file.suites[0];
  if (!root) {
    return testSuitesFileSchema.parse({
      schemaVersion: 1,
      suites: [
        {
          id: TEST_SUITE_ROOT_ID,
          name: 'Test Suite',
          flows: [folder],
          updatedAt: ts,
        },
      ],
    });
  }

  const hasFolder = root.flows.some((item) => 'children' in item && item.id === folderId);
  const nextFlows = hasFolder
    ? root.flows.map((item) => ('children' in item && item.id === folderId ? folder : item))
    : [...root.flows, folder];

  return testSuitesFileSchema.parse({
    ...file,
    suites: file.suites.map((suite) =>
      suite.id === root.id ? { ...suite, flows: nextFlows, updatedAt: ts } : suite,
    ),
  });
}

/** Builds the smoke regression artifact linking all demo flows. */
export function buildDemoRegressionArtifact(ts = DEMO_TS): RegressionArtifact {
  return createDefaultRegressionArtifactPayload(DEMO_REGRESSION_SMOKE_ID, 'Public API Smoke', ts);
}

function buildDemoRegressionArtifactFull(ts = DEMO_TS): RegressionArtifact {
  const base = buildDemoRegressionArtifact(ts);
  return {
    ...base,
    description:
      'Runs all Public API Demo flows in parallel. Uses real HTTP calls to JSONPlaceholder and httpbin.',
    tags: ['demo', 'smoke', 'public-api'],
    docs: [
      '# Public API Smoke',
      '',
      'Seeded regression for manual testing of the Regression runner.',
      '',
      '## Flows',
      '- GET JSONPlaceholder Post',
      '- GET httpbin Echo',
      '- POST JSONPlaceholder Post',
      '',
      'Requires network access. JSONPlaceholder may return 201 for POST (fake API).',
    ].join('\n'),
    flowIds: [...DEMO_FLOW_IDS],
    profile: {
      ...createDefaultRegressionProfile(),
      executionMode: 'parallel',
      maxParallelism: 2,
      stopOnFirstFailure: false,
      includeStepCaptures: true,
    },
    thresholds: {
      ...createDefaultRegressionThresholds(),
      acceptancePercent: 100,
    },
  };
}

function buildDemoRegressionBulkArtifact(count: number, ts = DEMO_TS): RegressionArtifact {
  const base = createDefaultRegressionArtifactPayload(DEMO_REGRESSION_BULK_ID, `Bulk API Stress (${count})`, ts);
  return {
    ...base,
    description: `Runs ${count} JSONPlaceholder GET flows in parallel. For stress-testing regression runner, Gantt, and results UI.`,
    tags: ['demo', 'bulk', 'stress'],
    docs: [
      `# Bulk API Stress (${count})`,
      '',
      'Large regression batch for performance and UI testing.',
      '',
      `- ${count} flows (GET posts, comments, albums, photos on JSONPlaceholder)`,
      '- Parallel execution with higher max parallelism',
      '- Requires network access',
    ].join('\n'),
    flowIds: [...demoBulkFlowIds(count)],
    profile: {
      ...createDefaultRegressionProfile(),
      executionMode: 'parallel',
      maxParallelism: 10,
      stopOnFirstFailure: false,
      includeStepCaptures: false,
      includeStepErrors: true,
    },
    thresholds: {
      ...createDefaultRegressionThresholds(),
      acceptancePercent: 95,
    },
  };
}

function buildDemoRegressionArtifacts(count: number, ts = DEMO_TS): readonly RegressionArtifact[] {
  const artifacts: RegressionArtifact[] = [buildDemoRegressionArtifactFull(ts)];
  if (count > 0) {
    artifacts.push(buildDemoRegressionBulkArtifact(count, ts));
  }
  return artifacts;
}

/** Builds the demo regression folder. */
export function buildDemoRegressionFolder(count = 0, ts = DEMO_TS): RegressionFolder {
  return {
    id: DEMO_REGRESSION_FOLDER_ID,
    name: 'Demo Regressions',
    description: 'Sample regressions for trying batch execution and results dashboards.',
    tags: ['demo'],
    createdAt: ts,
    updatedAt: ts,
    children: buildDemoRegressionArtifacts(count, ts),
  };
}

/** Merges demo regression tree into a regressions file (idempotent). */
export function mergeDemoPublicApiRegressions(
  file: RegressionsFile,
  ts = DEMO_TS,
  options: DemoSeedOptions = {},
): RegressionsFile {
  const bulkCount = options.bulkFlowCount ?? 0;
  const folder = buildDemoRegressionFolder(bulkCount, ts);
  const hasFolder = file.items.some((item) => !('profile' in item) && item.id === DEMO_REGRESSION_FOLDER_ID);
  const nextItems = hasFolder
    ? file.items.map((item) =>
        !('profile' in item) && item.id === DEMO_REGRESSION_FOLDER_ID ? folder : item,
      )
    : [...file.items, folder];

  return regressionsFileSchema.parse({
    schemaVersion: 2,
    items: nextItems,
  });
}

/** Returns both workspace files with demo data merged. */
export function buildDemoTestingWorkspace(
  testSuites: TestSuitesFile,
  regressions: RegressionsFile,
  ts = DEMO_TS,
  options: DemoSeedOptions = {},
): { readonly testSuites: TestSuitesFile; readonly regressions: RegressionsFile } {
  return {
    testSuites: mergeDemoPublicApiTestSuites(testSuites, ts, options),
    regressions: mergeDemoPublicApiRegressions(regressions, ts, options),
  };
}
