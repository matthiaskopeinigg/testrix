import { z } from 'zod';

import {
  defaultConfigForStepType,
  testSuiteStepStatusSchema,
  testSuiteStepTypeSchema,
  type TestSuiteStepType,
} from './test-suite-steps.schema';
import { flowConditionSchema, type FlowCondition } from './flow-condition';
import { flowStepRunCaptureSchema } from './flow-step-capture';
import { flowRunChildLogSchema } from './flow-run-child-log.schema';

const boundedText = (max: number) => z.string().max(max);

/** Maximum nesting depth for suite sidebar folders (0 = root items only). */
export const TEST_SUITE_MAX_FOLDER_DEPTH = 15;

/** Maximum nesting depth for folders inside a flow step tree. */
export const TEST_SUITE_FLOW_MAX_FOLDER_DEPTH = 8;

/** Legacy flat step shape (pre–api-workbench migration). */
export const legacyTestSuiteFlowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['http', 'delay', 'assert']).default('http'),
  label: boundedText(256).default(''),
  requestId: z.string().optional(),
  delayMs: z.number().int().min(0).optional(),
  assertExpression: boundedText(8_000).optional(),
});

export type LegacyTestSuiteFlowNode = z.infer<typeof legacyTestSuiteFlowNodeSchema>;

export const testSuiteFlowStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal('step'),
  name: boundedText(256),
  parentId: z.string().nullable().default(null),
  stepType: testSuiteStepTypeSchema,
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().default(true),
  lastRunStatus: testSuiteStepStatusSchema.optional(),
  lastRunDurationMs: z.number().int().min(0).optional(),
  lastRunCapture: flowStepRunCaptureSchema.nullable().optional(),
  lastRunChildren: z.array(flowRunChildLogSchema).optional(),
  error: boundedText(4_000).optional(),
  skipUnless: flowConditionSchema.optional(),
});

export type TestSuiteFlowStep = z.infer<typeof testSuiteFlowStepSchema> & {
  readonly children?: readonly TestSuiteFlowNode[];
};

export const FLOW_LANE_KINDS = ['then', 'elseIf', 'else', 'body'] as const;
export type FlowLaneKind = (typeof FLOW_LANE_KINDS)[number];

export type TestSuiteFlowLane = {
  readonly id: string;
  readonly type: 'lane';
  readonly laneKind: FlowLaneKind;
  readonly name: string;
  readonly parentId: string | null;
  readonly children: readonly TestSuiteFlowNode[];
  readonly condition?: FlowCondition;
};

export type TestSuiteFlowFolder = {
  readonly id: string;
  readonly type: 'folder';
  readonly name: string;
  readonly parentId: string | null;
  readonly children: readonly TestSuiteFlowNode[];
  readonly expanded: boolean;
};

export type TestSuiteFlowNode = TestSuiteFlowFolder | TestSuiteFlowStep | TestSuiteFlowLane;

export const testSuiteFlowLaneSchema: z.ZodType<TestSuiteFlowLane> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.literal('lane'),
    laneKind: z.enum(FLOW_LANE_KINDS),
    name: boundedText(256),
    parentId: z.string().nullable(),
    children: z.array(testSuiteFlowNodeSchema).default([]),
    condition: flowConditionSchema.optional(),
  }),
);

export const testSuiteFlowStepNodeSchema: z.ZodType<TestSuiteFlowStep> = z.lazy(() =>
  testSuiteFlowStepSchema.extend({
    children: z.array(testSuiteFlowNodeSchema).optional(),
  }),
);

export const testSuiteFlowFolderSchema: z.ZodType<TestSuiteFlowFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.literal('folder'),
    name: boundedText(256),
    parentId: z.string().nullable(),
    children: z.array(testSuiteFlowNodeSchema).default([]),
    expanded: z.boolean().default(true),
  }),
);

export const testSuiteFlowNodeSchema: z.ZodType<TestSuiteFlowNode> = z.lazy(() =>
  z.union([testSuiteFlowFolderSchema, testSuiteFlowLaneSchema, testSuiteFlowStepNodeSchema]),
);

export const testSuiteFlowSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  description: boundedText(4_000).default(''),
  tags: z.array(boundedText(64)).default([]),
  environmentId: z.string().nullable().optional(),
  isCritical: z.boolean().optional(),
  /** When true, open a browser window while running E2E steps (default: show). */
  e2eShowWindow: z.boolean().optional(),
  /** When true, leave the E2E browser window open after the flow run completes. */
  e2eKeepWindowOpen: z.boolean().optional(),
  lastRunStatus: testSuiteStepStatusSchema.default('never'),
  lastRunAt: z.string().nullable().default(null),
  lastRunDurationMs: z.number().int().min(0).nullable().optional(),
  nodes: z.array(testSuiteFlowNodeSchema).default([]),
  /** Isolated full-flow re-runs; column names become `{{key}}`. Cap 50 rows. */
  dataset: z
    .object({
      enabled: z.boolean().default(false),
      rows: z.array(z.record(z.string(), z.string())).max(50).default([]),
    })
    .optional(),
  updatedAt: z.string(),
});

export type TestSuiteFlow = z.infer<typeof testSuiteFlowSchema>;

export type TestSuiteFolder = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  /** Environment profile id; unset folders do not override inherited values. */
  readonly environmentId?: string | null;
  readonly children: readonly TestSuiteTreeItem[];
  readonly updatedAt: string;
};

function folderDepthExceeded(children: readonly TestSuiteTreeItem[], depth: number): boolean {
  if (depth > TEST_SUITE_MAX_FOLDER_DEPTH) {
    return true;
  }
  for (const item of children) {
    if ('children' in item && !('nodes' in item)) {
      if (folderDepthExceeded(item.children, depth + 1)) {
        return true;
      }
    }
  }
  return false;
}

export const testSuiteFolderSchema: z.ZodType<TestSuiteFolder> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      name: boundedText(256),
      description: boundedText(4_000).default(''),
      tags: z.array(boundedText(64)).default([]),
      environmentId: z.string().nullable().optional(),
      children: z.array(testSuiteTreeItemSchema).default([]),
      updatedAt: z.string(),
    })
    .superRefine((folder, ctx) => {
      if (folderDepthExceeded(folder.children, 1)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Test suite folders may nest at most ${TEST_SUITE_MAX_FOLDER_DEPTH} levels deep.`,
          path: ['children'],
        });
      }
    }),
);

export type TestSuiteTreeItem = TestSuiteFolder | TestSuiteFlow;

/**
 * Flows carry `nodes`; folders carry `children`. A plain Zod union with the folder schema
 * first would accept flows (stripping `nodes`) — always branch on `nodes` first.
 */
function coerceMisparsedSuiteFlowItem(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const record = value as Record<string, unknown>;
  if ('nodes' in record) {
    return value;
  }
  const hasFlowRunFields =
    'lastRunStatus' in record ||
    'lastRunAt' in record ||
    'isCritical' in record ||
    'lastRunDurationMs' in record;
  // Sidebar folders serialize `children` (often `[]`). Do not treat folder-only fields
  // such as `environmentId` as proof of a flow — that misclassified folders after move/sync.
  if ('children' in record && !hasFlowRunFields) {
    return value;
  }
  if (!hasFlowRunFields) {
    return value;
  }
  const { children: _children, ...rest } = record;
  return {
    ...rest,
    nodes: [],
    lastRunStatus: record['lastRunStatus'] ?? 'never',
    lastRunAt: record['lastRunAt'] ?? null,
  };
}

/** Parses a suite sidebar tree item (folder vs flow). */
export function parseTestSuiteTreeItem(value: unknown): TestSuiteTreeItem {
  const coerced = coerceMisparsedSuiteFlowItem(value);
  if (typeof coerced !== 'object' || coerced === null) {
    throw new Error('Invalid test suite tree item');
  }
  if ('nodes' in coerced) {
    return testSuiteFlowSchema.parse(coerced);
  }
  return testSuiteFolderSchema.parse(coerced);
}

export const testSuiteTreeItemSchema: z.ZodType<TestSuiteTreeItem> = z.lazy(() =>
  z.unknown().transform((value) => parseTestSuiteTreeItem(value)),
);

export const testSuiteRootSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256).default('Test Suite'),
  flows: z.array(testSuiteTreeItemSchema).default([]),
  updatedAt: z.string(),
});

export const testSuitesFileSchema = z.object({
  schemaVersion: z.literal(1),
  suites: z.array(testSuiteRootSchema).default([]),
});

export type TestSuitesFile = z.infer<typeof testSuitesFileSchema>;
export type TestSuiteRoot = z.infer<typeof testSuiteRootSchema>;

export const TEST_SUITE_ROOT_ID = 'root-suite' as const;

export function isTestSuiteFlow(item: TestSuiteTreeItem): item is TestSuiteFlow {
  return 'nodes' in item;
}

export function isTestSuiteFolder(
  item: TestSuiteTreeItem,
): item is TestSuiteFolder {
  return 'children' in item && !('nodes' in item);
}

/**
 * Collects every flow id in a test-suite tree (folders are walked).
 *
 * @param items Suite tree items.
 */
export function collectTestSuiteFlowIds(items: readonly TestSuiteTreeItem[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: readonly TestSuiteTreeItem[]): void => {
    for (const item of nodes) {
      if (isTestSuiteFlow(item)) {
        ids.push(item.id);
        continue;
      }
      walk(item.children);
    }
  };
  walk(items);
  return ids;
}

export function isFlowStepNode(node: TestSuiteFlowNode): node is TestSuiteFlowStep {
  return node.type === 'step';
}

export function isFlowFolderNode(node: TestSuiteFlowNode): node is TestSuiteFlowFolder {
  return node.type === 'folder';
}

export function isFlowLaneNode(node: TestSuiteFlowNode): node is TestSuiteFlowLane {
  return node.type === 'lane';
}

const LANE_LABELS: Record<FlowLaneKind, string> = {
  then: 'Then',
  elseIf: 'Else if',
  else: 'Else',
  body: 'Body',
};

/** Creates a first-class Then/Else/Body lane (not a user-renamable folder). */
export function createFlowLane(
  laneKind: FlowLaneKind,
  parentId: string | null = null,
  condition?: FlowCondition,
): TestSuiteFlowLane {
  return {
    id: `ts_lane_${Date.now()}_${laneKind}`,
    type: 'lane',
    laneKind,
    name: LANE_LABELS[laneKind],
    parentId,
    children: [],
    condition,
  };
}

function defaultChildrenForStep(stepType: TestSuiteStepType, parentId: string): TestSuiteFlowNode[] {
  if (stepType === 'IF') {
    return [createFlowLane('then', parentId), createFlowLane('else', parentId)];
  }
  if (stepType === 'FOR_EACH' || stepType === 'WHILE' || stepType === 'RETRY') {
    return [createFlowLane('body', parentId)];
  }
  return [];
}

/** Creates a new flow step with default config for the given type. */
export function createFlowStep(
  stepType: TestSuiteStepType,
  name: string,
  parentId: string | null = null,
  id = `ts_step_${Date.now()}`,
): TestSuiteFlowStep {
  const parsed = testSuiteFlowStepSchema.parse({
    id,
    type: 'step',
    name,
    parentId,
    stepType,
    config: defaultConfigForStepType(stepType) as Record<string, unknown>,
    enabled: true,
  });
  const children = defaultChildrenForStep(stepType, id);
  return children.length > 0 ? { ...parsed, children } : parsed;
}

/** Creates a new flow-internal folder. */
export function createFlowFolder(name: string, parentId: string | null = null): TestSuiteFlowFolder {
  return testSuiteFlowFolderSchema.parse({
    id: `ts_ff_${Date.now()}`,
    type: 'folder',
    name,
    parentId,
    children: [],
    expanded: true,
  });
}

/**
 * Returns an empty test suites file with a single root suite.
 */
export function createDefaultTestSuitesFile(): TestSuitesFile {
  const ts = new Date().toISOString();
  return testSuitesFileSchema.parse({
    schemaVersion: 1,
    suites: [
      {
        id: TEST_SUITE_ROOT_ID,
        name: 'Test Suite',
        flows: [],
        updatedAt: ts,
      },
    ],
  });
}
