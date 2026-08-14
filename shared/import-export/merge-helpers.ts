import type { CollectionNode } from '../config/collections.schema';
import type { EnvironmentDefinition, EnvironmentScopeNode } from '../config/environments.schema';
import type { LoadTestTreeItem } from '../testing/load-tests.schema';
import type { MockServerTreeItem } from '../testing/mock-server.schema';
import type { RegressionTreeItem } from '../testing/regressions.schema';
import type { TestSuiteRoot, TestSuiteTreeItem } from '../testing/test-suites.schema';
import { isTestSuiteFlow, isTestSuiteFolder } from '../testing/test-suites.schema';

/** Merges collection trees by node id; folder children are merged recursively. */
export function mergeCollectionNodes(
  current: readonly CollectionNode[],
  incoming: readonly CollectionNode[],
): CollectionNode[] {
  const map = new Map<string, CollectionNode>();
  for (const node of current) {
    map.set(node.id, node);
  }
  for (const node of incoming) {
    const existing = map.get(node.id);
    if (existing?.kind === 'folder' && node.kind === 'folder') {
      map.set(node.id, {
        ...node,
        children: mergeCollectionNodes(existing.children, node.children),
      });
    } else {
      map.set(node.id, node);
    }
  }
  return [...map.values()];
}

function mergeEnvironmentScopeNodes(
  current: readonly EnvironmentScopeNode[],
  incoming: readonly EnvironmentScopeNode[],
): EnvironmentScopeNode[] {
  const map = new Map<string, EnvironmentScopeNode>();
  for (const node of current) {
    map.set(node.id, node);
  }
  for (const node of incoming) {
    const existing = map.get(node.id);
    if (existing?.kind === 'folder' && node.kind === 'folder') {
      map.set(node.id, {
        ...node,
        children: mergeEnvironmentScopeNodes(existing.children, node.children),
      });
    } else {
      map.set(node.id, node);
    }
  }
  return [...map.values()];
}

export function mergeEnvironmentDefinitions(
  current: readonly EnvironmentDefinition[],
  incoming: readonly EnvironmentDefinition[],
): EnvironmentDefinition[] {
  const map = new Map<string, EnvironmentDefinition>();
  for (const env of current) {
    map.set(env.id, env);
  }
  for (const env of incoming) {
    const existing = map.get(env.id);
    if (existing) {
      map.set(env.id, {
        ...env,
        nodes: mergeEnvironmentScopeNodes(existing.nodes, env.nodes),
      });
    } else {
      map.set(env.id, env);
    }
  }
  return [...map.values()];
}

function isLoadTestArtifact(item: LoadTestTreeItem): item is Extract<LoadTestTreeItem, { profile: unknown }> {
  return 'profile' in item;
}

function mergeLoadTestItems(
  current: readonly LoadTestTreeItem[],
  incoming: readonly LoadTestTreeItem[],
): LoadTestTreeItem[] {
  const map = new Map<string, LoadTestTreeItem>();
  for (const item of current) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!isLoadTestArtifact(item) && !isLoadTestArtifact(existing as LoadTestTreeItem)) {
      const ex = existing as Extract<LoadTestTreeItem, { children: unknown }> | undefined;
      map.set(item.id, {
        ...item,
        children: mergeLoadTestItems(ex?.children ?? [], item.children),
      });
    } else {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

function isRegressionArtifact(item: RegressionTreeItem): item is Extract<RegressionTreeItem, { profile: unknown }> {
  return 'profile' in item;
}

function mergeRegressionItems(
  current: readonly RegressionTreeItem[],
  incoming: readonly RegressionTreeItem[],
): RegressionTreeItem[] {
  const map = new Map<string, RegressionTreeItem>();
  for (const item of current) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!isRegressionArtifact(item) && !isRegressionArtifact(existing as RegressionTreeItem)) {
      const ex = existing as Extract<RegressionTreeItem, { children: unknown }> | undefined;
      map.set(item.id, {
        ...item,
        children: mergeRegressionItems(ex?.children ?? [], item.children),
      });
    } else {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

function mergeTestSuiteFlows(
  current: readonly TestSuiteTreeItem[],
  incoming: readonly TestSuiteTreeItem[],
): TestSuiteTreeItem[] {
  const map = new Map<string, TestSuiteTreeItem>();
  for (const item of current) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (isTestSuiteFolder(item) && existing && isTestSuiteFolder(existing)) {
      map.set(item.id, {
        ...item,
        children: mergeTestSuiteFlows(existing.children, item.children),
      });
    } else {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

export function mergeTestSuiteRoots(
  current: readonly TestSuiteRoot[],
  incoming: readonly TestSuiteRoot[],
): TestSuiteRoot[] {
  const map = new Map<string, TestSuiteRoot>();
  for (const suite of current) {
    map.set(suite.id, suite);
  }
  for (const suite of incoming) {
    const existing = map.get(suite.id);
    if (existing) {
      map.set(suite.id, {
        ...suite,
        flows: mergeTestSuiteFlows(existing.flows, suite.flows),
      });
    } else {
      map.set(suite.id, suite);
    }
  }
  return [...map.values()];
}

function isMockEndpoint(item: MockServerTreeItem): item is Extract<MockServerTreeItem, { matchers: unknown }> {
  return 'matchers' in item;
}

function mergeMockServerItems(
  current: readonly MockServerTreeItem[],
  incoming: readonly MockServerTreeItem[],
): MockServerTreeItem[] {
  const map = new Map<string, MockServerTreeItem>();
  for (const item of current) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!isMockEndpoint(item) && !isMockEndpoint(existing as MockServerTreeItem)) {
      const ex = existing as Extract<MockServerTreeItem, { children: unknown }> | undefined;
      map.set(item.id, {
        ...item,
        children: mergeMockServerItems(ex?.children ?? [], item.children),
      });
    } else {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

export { mergeLoadTestItems, mergeRegressionItems, mergeMockServerItems };
