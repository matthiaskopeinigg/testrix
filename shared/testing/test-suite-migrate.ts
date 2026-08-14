import {
  createDefaultValidationStepConfig,
  createDefaultRequestStepConfig,
  createDefaultWaitStepConfig,
  type RequestStepConfig,
} from './test-suite-steps.schema';
import { z } from 'zod';

import {
  legacyTestSuiteFlowNodeSchema,
  testSuiteFlowSchema,
  testSuiteFlowStepSchema,
  testSuiteFolderSchema,
  testSuitesFileSchema,
  type LegacyTestSuiteFlowNode,
  type TestSuiteFlow,
  type TestSuiteFlowNode,
  type TestSuiteFlowStep,
  isTestSuiteFlow,
  parseTestSuiteTreeItem,
  type TestSuiteTreeItem,
  type TestSuitesFile,
} from './test-suites.schema';
import { normalizeFlowStepNodes } from './test-suite-flow-order';

const testSuiteFlowLooseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  environmentId: z.string().nullable().optional(),
  isCritical: z.boolean().optional(),
  e2eShowWindow: z.boolean().optional(),
  e2eKeepWindowOpen: z.boolean().optional(),
  lastRunStatus: z.string().optional(),
  lastRunAt: z.string().nullable().optional(),
  lastRunDurationMs: z.number().optional(),
  nodes: z.array(z.unknown()).default([]),
  updatedAt: z.string(),
});

function isLegacyNode(value: unknown): value is LegacyTestSuiteFlowNode {
  return legacyTestSuiteFlowNodeSchema.safeParse(value).success;
}

function migrateLegacyNode(node: LegacyTestSuiteFlowNode): TestSuiteFlowStep {
  if (node.type === 'delay') {
    return testSuiteFlowStepSchema.parse({
      id: node.id,
      type: 'step',
      name: node.label || 'Wait',
      parentId: null,
      stepType: 'WAIT',
      config: { ...createDefaultWaitStepConfig(), durationMs: node.delayMs ?? 1000 },
      enabled: true,
    });
  }

  if (node.type === 'assert') {
    const validation = createDefaultValidationStepConfig();
    return testSuiteFlowStepSchema.parse({
      id: node.id,
      type: 'step',
      name: node.label || 'Validation',
      parentId: null,
      stepType: 'VALIDATION',
      config: {
        ...validation,
        rules: [
          {
            source: 'response_body',
            expression: '',
            operator: 'contains',
            expected: node.assertExpression ?? '',
          },
        ],
      },
      enabled: true,
    });
  }

  const requestConfig: RequestStepConfig = {
    ...createDefaultRequestStepConfig(),
    ...(node.requestId ? { collectionRequestId: node.requestId } : {}),
  };

  return testSuiteFlowStepSchema.parse({
    id: node.id,
    type: 'step',
    name: node.label || 'HTTP Request',
    parentId: null,
    stepType: 'REQUEST',
    config: requestConfig,
    enabled: true,
  });
}

function migrateFlowNodes(nodes: readonly unknown[]): TestSuiteFlowNode[] {
  if (nodes.length === 0) {
    return [];
  }
  if (nodes.every((n) => isLegacyNode(n))) {
    return nodes.map((n) => migrateLegacyNode(n as LegacyTestSuiteFlowNode));
  }
  return normalizeFlowStepNodes(nodes as TestSuiteFlowNode[]);
}

function migrateFlow(flow: unknown): TestSuiteFlow {
  const parsed = testSuiteFlowLooseSchema.parse(flow);
  const nodes = migrateFlowNodes(parsed.nodes);
  return testSuiteFlowSchema.parse({ ...parsed, nodes });
}

function migrateSuiteItem(item: unknown): TestSuiteTreeItem {
  const parsed = parseTestSuiteTreeItem(item);
  if (isTestSuiteFlow(parsed)) {
    return migrateFlow(parsed);
  }
  return testSuiteFolderSchema.parse({
    ...parsed,
    children: migrateSuiteItems([...parsed.children]),
  });
}

function migrateSuiteItems(items: readonly unknown[]): TestSuiteTreeItem[] {
  return items.map((item) => migrateSuiteItem(item));
}

function fileHasLegacyFlowNodes(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const suites = (raw as { suites?: unknown }).suites;
  if (!Array.isArray(suites)) {
    return false;
  }
  const walkItems = (items: unknown[]): boolean => {
    for (const item of items) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      if ('nodes' in item && Array.isArray((item as { nodes: unknown[] }).nodes)) {
        for (const node of (item as { nodes: unknown[] }).nodes) {
          if (isLegacyNode(node)) {
            return true;
          }
        }
      }
      if ('children' in item && Array.isArray((item as { children: unknown[] }).children)) {
        if (walkItems((item as { children: unknown[] }).children)) {
          return true;
        }
      }
    }
    return false;
  };
  for (const suite of suites) {
    if (typeof suite !== 'object' || suite === null) {
      continue;
    }
    const flows = (suite as { flows?: unknown[] }).flows;
    if (Array.isArray(flows) && walkItems(flows)) {
      return true;
    }
  }
  return false;
}

/**
 * Migrates persisted test suite files from legacy flat step nodes to api-workbench-style flow steps.
 */
export function migrateTestSuitesFile(raw: unknown): TestSuitesFile {
  if (fileHasLegacyFlowNodes(raw)) {
    const record =
      typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const suites = Array.isArray(record['suites']) ? record['suites'] : [];
    return testSuitesFileSchema.parse({
      schemaVersion: 1,
      ...record,
      suites: suites.map((suite) => {
        const s = suite as Record<string, unknown>;
        return {
          ...s,
          flows: migrateSuiteItems((s['flows'] as readonly unknown[]) ?? []),
        };
      }),
    });
  }

  const file = testSuitesFileSchema.safeParse(raw);
  if (!file.success) {
    return testSuitesFileSchema.parse(raw);
  }

  const suites = file.data.suites.map((suite) => ({
    ...suite,
    flows: migrateSuiteItems(suite.flows),
  }));

  return testSuitesFileSchema.parse({ ...file.data, suites });
}
