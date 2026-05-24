import type { CollectionNode } from '../config/collections.schema';
import type { EnvironmentDefinition, EnvironmentScopeNode } from '../config/environments.schema';
import type { SettingsFile } from '../config/settings.schema';
import type { LoadTestTreeItem } from '../testing/load-tests.schema';
import type { MockServerTreeItem } from '../testing/mock-server.schema';
import type { RegressionTreeItem } from '../testing/regressions.schema';
import type { TestSuiteRoot, TestSuiteTreeItem } from '../testing/test-suites.schema';
import { isTestSuiteFlow, isTestSuiteFolder } from '../testing/test-suites.schema';
import {
  SETTINGS_SECTION_KEYS,
  TESTRIX_BUNDLE_SCHEMA_V1,
  type SettingsSectionKey,
  type TestrixBundleSectionKey,
  type TestrixBundleV1,
} from './testrix-bundle.schema';

/**
 * Selection passed by the import/export dialog. Each set holds the **selected** ids inside that section.
 */
export interface BundleSelection {
  /** Sections to include at all (gates each typed set below). */
  sections: Set<TestrixBundleSectionKey>;
  /** Selected collection tree node ids (folders, requests, websockets). */
  collectionItems?: Set<string>;
  /** Selected environment definition ids. */
  environments?: Set<string>;
  /** Selected environment scope node ids (folders/variables) within chosen environments. */
  environmentItems?: Set<string>;
  /** Selected test suite root ids. */
  testSuites?: Set<string>;
  /** Selected flow/folder ids under chosen suites. */
  testSuiteItems?: Set<string>;
  /** Selected load test tree item ids (folders + artifacts). */
  loadTests?: Set<string>;
  /** Selected regression tree item ids. */
  regressions?: Set<string>;
  /** Selected mock endpoint ids. */
  mockEndpoints?: Set<string>;
  /** Selected `SettingsFile` sub-keys. */
  settingsSections?: Set<SettingsSectionKey>;
  /** Cookies are all-or-nothing. */
  cookies?: boolean;
}

export interface BundleApplyOptions {
  /**
   * `merge` keeps existing items in each section and appends/overwrites the imported ones (matched by id).
   * `replace` wipes the whole section before writing.
   */
  mode: 'merge' | 'replace';
}

function hasSelection(set: Set<string> | undefined): boolean {
  return set != null && set.size > 0;
}

function pruneCollectionNodes(nodes: readonly CollectionNode[], keepIds: Set<string>): CollectionNode[] {
  const out: CollectionNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const children = pruneCollectionNodes(node.children, keepIds);
      if (keepIds.has(node.id) || children.length > 0) {
        out.push({ ...node, children });
      }
    } else if (keepIds.has(node.id)) {
      out.push(node);
    }
  }
  return out;
}

function pruneEnvironmentScopeNodes(
  nodes: readonly EnvironmentScopeNode[],
  keepIds: Set<string>,
): EnvironmentScopeNode[] {
  const out: EnvironmentScopeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const children = pruneEnvironmentScopeNodes(node.children, keepIds);
      if (keepIds.has(node.id) || children.length > 0) {
        out.push({ ...node, children });
      }
    } else if (keepIds.has(node.id)) {
      out.push(node);
    }
  }
  return out;
}

function pruneEnvironmentDefinitions(
  environments: readonly EnvironmentDefinition[],
  envSel: Set<string> | undefined,
  itemSel: Set<string> | undefined,
): EnvironmentDefinition[] {
  const restrictEnv = hasSelection(envSel);
  const pruneItems = hasSelection(itemSel);
  return environments
    .filter((e) => !restrictEnv || envSel!.has(e.id))
    .map((e) =>
      pruneItems ? { ...e, nodes: pruneEnvironmentScopeNodes(e.nodes, itemSel!) } : e,
    );
}

function isLoadTestArtifact(item: LoadTestTreeItem): item is Extract<LoadTestTreeItem, { profile: unknown }> {
  return 'profile' in item;
}

function pruneLoadTestItems(items: readonly LoadTestTreeItem[], keepIds: Set<string>): LoadTestTreeItem[] {
  const out: LoadTestTreeItem[] = [];
  for (const item of items) {
    if (isLoadTestArtifact(item)) {
      if (keepIds.has(item.id)) {
        out.push(item);
      }
    } else {
      const children = pruneLoadTestItems(item.children, keepIds);
      if (keepIds.has(item.id) || children.length > 0) {
        out.push({ ...item, children });
      }
    }
  }
  return out;
}

function isRegressionArtifact(item: RegressionTreeItem): item is Extract<RegressionTreeItem, { profile: unknown }> {
  return 'profile' in item;
}

function pruneRegressionItems(items: readonly RegressionTreeItem[], keepIds: Set<string>): RegressionTreeItem[] {
  const out: RegressionTreeItem[] = [];
  for (const item of items) {
    if (isRegressionArtifact(item)) {
      if (keepIds.has(item.id)) {
        out.push(item);
      }
    } else {
      const children = pruneRegressionItems(item.children, keepIds);
      if (keepIds.has(item.id) || children.length > 0) {
        out.push({ ...item, children });
      }
    }
  }
  return out;
}

function pruneTestSuiteFlows(
  flows: readonly TestSuiteTreeItem[],
  keepIds: Set<string>,
): TestSuiteTreeItem[] {
  const out: TestSuiteTreeItem[] = [];
  for (const item of flows) {
    if (isTestSuiteFlow(item)) {
      if (keepIds.has(item.id)) {
        out.push(item);
      }
    } else if (isTestSuiteFolder(item)) {
      const children = pruneTestSuiteFlows(item.children, keepIds);
      if (keepIds.has(item.id) || children.length > 0) {
        out.push({ ...item, children });
      }
    }
  }
  return out;
}

function isMockEndpoint(item: MockServerTreeItem): item is Extract<MockServerTreeItem, { matchers: unknown }> {
  return 'matchers' in item;
}

function pruneMockServerItems(items: readonly MockServerTreeItem[], keepIds: Set<string>): MockServerTreeItem[] {
  const out: MockServerTreeItem[] = [];
  for (const item of items) {
    if (isMockEndpoint(item)) {
      if (keepIds.has(item.id)) {
        out.push(item);
      }
    } else {
      const children = pruneMockServerItems(item.children, keepIds);
      if (keepIds.has(item.id) || children.length > 0) {
        out.push({ ...item, children });
      }
    }
  }
  return out;
}

function pruneTestSuites(
  suites: readonly TestSuiteRoot[],
  suiteSel: Set<string> | undefined,
  itemSel: Set<string> | undefined,
): TestSuiteRoot[] {
  const restrictSuites = hasSelection(suiteSel);
  const pruneItems = hasSelection(itemSel);
  return suites
    .filter((s) => !restrictSuites || suiteSel!.has(s.id))
    .map((s) => {
      if (!pruneItems) {
        return s;
      }
      const flows = pruneTestSuiteFlows(s.flows, itemSel!);
      return flows.length > 0 ? { ...s, flows } : null;
    })
    .filter((s): s is TestSuiteRoot => s != null);
}

/**
 * Filter a snapshot bundle down to the user-selected items. Returns a fresh bundle
 * (the input is never mutated).
 */
export function filterBundle(source: TestrixBundleV1, selection: BundleSelection): TestrixBundleV1 {
  const out: TestrixBundleV1 = {
    schema: TESTRIX_BUNDLE_SCHEMA_V1,
    exportedAt: source.exportedAt,
    appVersion: source.appVersion,
  };

  if (selection.sections.has('collections') && source.collections) {
    const itemSel = selection.collectionItems;
    if (hasSelection(itemSel)) {
      out.collections = {
        ...source.collections,
        nodes: pruneCollectionNodes(source.collections.nodes, itemSel!),
      };
    } else {
      out.collections = source.collections;
    }
  }

  if (selection.sections.has('environments') && source.environments) {
    out.environments = {
      ...source.environments,
      environments: pruneEnvironmentDefinitions(
        source.environments.environments,
        selection.environments,
        selection.environmentItems,
      ),
    };
  }

  if (selection.sections.has('testSuites') && source.testSuites) {
    out.testSuites = {
      ...source.testSuites,
      suites: pruneTestSuites(source.testSuites.suites, selection.testSuites, selection.testSuiteItems),
    };
  }

  if (selection.sections.has('loadTests') && source.loadTests) {
    const sel = selection.loadTests;
    out.loadTests = {
      ...source.loadTests,
      items: hasSelection(sel) ? pruneLoadTestItems(source.loadTests.items, sel!) : source.loadTests.items,
    };
  }

  if (selection.sections.has('regressions') && source.regressions) {
    const sel = selection.regressions;
    out.regressions = {
      ...source.regressions,
      items: hasSelection(sel) ? pruneRegressionItems(source.regressions.items, sel!) : source.regressions.items,
    };
  }

  if (selection.sections.has('mockServer') && source.mockServer) {
    const sel = selection.mockEndpoints;
    if (hasSelection(sel)) {
      out.mockServer = {
        ...source.mockServer,
        items: pruneMockServerItems(source.mockServer.items, sel!),
      };
    } else {
      out.mockServer = source.mockServer;
    }
  }

  if (selection.sections.has('capture') && source.capture) {
    out.capture = source.capture;
  }

  if (selection.sections.has('interceptor') && source.interceptor) {
    out.interceptor = source.interceptor;
  }

  if (selection.sections.has('settings') && source.settings) {
    const partial: Partial<SettingsFile> = {};
    const keys: SettingsSectionKey[] = Array.from(selection.settingsSections ?? SETTINGS_SECTION_KEYS);
    for (const k of keys) {
      if (source.settings[k] !== undefined) {
        (partial as Record<string, unknown>)[k] = source.settings[k];
      }
    }
    if (Object.keys(partial).length > 0) {
      out.settings = partial;
    }
  }

  if (selection.sections.has('cookieJar') && selection.cookies && source.cookieJar) {
    out.cookieJar = source.cookieJar;
  }

  return out;
}

/** Merges arrays of items by id; incoming overwrites existing with same id. */
export function mergeById<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const map = new Map<string, T>();
  for (const item of current) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return [...map.values()];
}
