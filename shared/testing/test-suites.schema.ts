import { z } from 'zod';

const boundedText = (max: number) => z.string().max(max);

export const testSuiteFlowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['http', 'delay', 'assert']).default('http'),
  label: boundedText(256).default(''),
  requestId: z.string().optional(),
  delayMs: z.number().int().min(0).optional(),
  assertExpression: boundedText(8_000).optional(),
});

export const testSuiteFlowSchema = z.object({
  id: z.string().min(1),
  name: boundedText(256),
  description: boundedText(4_000).default(''),
  tags: z.array(boundedText(64)).default([]),
  nodes: z.array(testSuiteFlowNodeSchema).default([]),
  updatedAt: z.string(),
});

export const testSuiteFolderSchema: z.ZodType<TestSuiteFolder> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    name: boundedText(256),
    description: boundedText(4_000).default(''),
    tags: z.array(boundedText(64)).default([]),
    children: z.array(testSuiteTreeItemSchema).default([]),
    updatedAt: z.string(),
  }),
);

export type TestSuiteFolder = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly children: readonly TestSuiteTreeItem[];
  readonly updatedAt: string;
};

export const testSuiteTreeItemSchema = z.union([testSuiteFolderSchema, testSuiteFlowSchema]);

export type TestSuiteTreeItem = TestSuiteFolder | z.infer<typeof testSuiteFlowSchema>;

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
export type TestSuiteFlow = z.infer<typeof testSuiteFlowSchema>;
export type TestSuiteRoot = z.infer<typeof testSuiteRootSchema>;

export const TEST_SUITE_ROOT_ID = 'root-suite' as const;

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
