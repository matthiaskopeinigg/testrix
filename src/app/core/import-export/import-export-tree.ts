import type { CollectionNode } from '@shared/config/collections.schema';
import type { EnvironmentDefinition, EnvironmentScopeNode } from '@shared/config/environments.schema';
import type { SettingsFile } from '@shared/config/settings.schema';
import type { LoadTestTreeItem } from '@shared/testing/load-tests.schema';
import type { MockServerTreeItem } from '@shared/testing/mock-server.schema';
import type { RegressionTreeItem } from '@shared/testing/regressions.schema';
import type { TestSuiteRoot, TestSuiteTreeItem } from '@shared/testing/test-suites.schema';
import { isTestSuiteFlow, isTestSuiteFolder } from '@shared/testing/test-suites.schema';
import {
  SETTINGS_SECTION_KEYS,
  TESTRIX_BUNDLE_SECTION_KEYS,
  type SettingsSectionKey,
  type TestrixBundleSectionKey,
  type TestrixBundleV1,
} from '@shared/import-export';

export type CheckState = 'on' | 'off' | 'partial';

export type ImportExportNodePayload =
  | { kind: 'group'; section: TestrixBundleSectionKey }
  | { kind: 'collectionItem'; id: string }
  | { kind: 'environment'; id: string }
  | { kind: 'environmentItem'; id: string }
  | { kind: 'testSuite'; id: string }
  | { kind: 'testSuiteItem'; id: string }
  | { kind: 'loadTestItem'; id: string }
  | { kind: 'regressionItem'; id: string }
  | { kind: 'mockItem'; id: string }
  | { kind: 'settingsSection'; key: SettingsSectionKey }
  | { kind: 'cookies' };

export interface ImportExportTreeNode {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly checkable: boolean;
  readonly expanded: boolean;
  readonly children: ImportExportTreeNode[];
  readonly payload: ImportExportNodePayload;
}

const SECTION_LABELS: Record<TestrixBundleSectionKey, string> = {
  collections: 'Collections',
  environments: 'Environments',
  testSuites: 'Test suites',
  loadTests: 'Load tests',
  regressions: 'Regressions',
  mockServer: 'Mock server',
  capture: 'Capture',
  interceptor: 'Interceptor',
  settings: 'Settings',
  cookieJar: 'Cookies',
};

const SETTINGS_LABELS: Record<SettingsSectionKey, string> = {
  general: 'General',
  appearance: 'Appearance',
  privacy: 'Privacy',
  updates: 'Updates',
  ui: 'UI',
  logging: 'Logging',
  dataConfig: 'Data & config',
  collections: 'Collections preferences',
  environments: 'Environments preferences',
  testSuite: 'Test suite preferences',
  editor: 'Editor',
  http: 'HTTP',
  databases: 'Databases',
};

function collectionNodes(nodes: readonly CollectionNode[]): ImportExportTreeNode[] {
  return nodes.map((node) => {
    if (node.kind === 'folder') {
      return {
        id: `col-${node.id}`,
        label: node.label,
        checkable: true,
        expanded: true,
        payload: { kind: 'collectionItem', id: node.id },
        children: collectionNodes(node.children),
      };
    }
    return {
      id: `col-${node.id}`,
      label: node.label,
      hint: node.kind === 'request' ? node.method : 'WebSocket',
      checkable: true,
      expanded: false,
      payload: { kind: 'collectionItem', id: node.id },
      children: [],
    };
  });
}

function environmentScopeNodes(nodes: readonly EnvironmentScopeNode[]): ImportExportTreeNode[] {
  return nodes.map((node) => {
    if (node.kind === 'folder') {
      return {
        id: `env-item-${node.id}`,
        label: node.label,
        checkable: true,
        expanded: true,
        payload: { kind: 'environmentItem', id: node.id },
        children: environmentScopeNodes(node.children),
      };
    }
    return {
      id: `env-item-${node.id}`,
      label: node.key,
      hint: node.value,
      checkable: true,
      expanded: false,
      payload: { kind: 'environmentItem', id: node.id },
      children: [],
    };
  });
}

function environmentNodes(environments: readonly EnvironmentDefinition[]): ImportExportTreeNode[] {
  return environments.map((env) => ({
    id: `env-${env.id}`,
    label: env.name,
    checkable: true,
    expanded: true,
    payload: { kind: 'environment', id: env.id },
    children: environmentScopeNodes(env.nodes),
  }));
}

function testSuiteFlowNodes(items: readonly TestSuiteTreeItem[]): ImportExportTreeNode[] {
  return items.map((item) => {
    if (isTestSuiteFlow(item)) {
      return {
        id: `ts-item-${item.id}`,
        label: item.name,
        hint: 'Flow',
        checkable: true,
        expanded: false,
        payload: { kind: 'testSuiteItem', id: item.id },
        children: [],
      };
    }
    if (isTestSuiteFolder(item)) {
      return {
        id: `ts-item-${item.id}`,
        label: item.name,
        hint: 'Folder',
        checkable: true,
        expanded: true,
        payload: { kind: 'testSuiteItem', id: item.id },
        children: testSuiteFlowNodes(item.children),
      };
    }
    return {
      id: `ts-item-unknown`,
      label: 'Unknown',
      checkable: false,
      expanded: false,
      payload: { kind: 'testSuiteItem', id: '' },
      children: [],
    };
  });
}

function testSuiteNodes(suites: readonly TestSuiteRoot[]): ImportExportTreeNode[] {
  return suites.map((suite) => ({
    id: `ts-${suite.id}`,
    label: suite.name,
    checkable: true,
    expanded: true,
    payload: { kind: 'testSuite', id: suite.id },
    children: testSuiteFlowNodes(suite.flows),
  }));
}

function isLoadTestArtifact(item: LoadTestTreeItem): item is Extract<LoadTestTreeItem, { profile: unknown }> {
  return 'profile' in item;
}

function loadTestNodes(items: readonly LoadTestTreeItem[]): ImportExportTreeNode[] {
  return items.map((item) => {
    if (isLoadTestArtifact(item)) {
      return {
        id: `lt-${item.id}`,
        label: item.name,
        checkable: true,
        expanded: false,
        payload: { kind: 'loadTestItem', id: item.id },
        children: [],
      };
    }
    return {
      id: `lt-${item.id}`,
      label: item.name,
      checkable: true,
      expanded: true,
      payload: { kind: 'loadTestItem', id: item.id },
      children: loadTestNodes(item.children),
    };
  });
}

function isRegressionArtifact(item: RegressionTreeItem): item is Extract<RegressionTreeItem, { profile: unknown }> {
  return 'profile' in item;
}

function regressionNodes(items: readonly RegressionTreeItem[]): ImportExportTreeNode[] {
  return items.map((item) => {
    if (isRegressionArtifact(item)) {
      return {
        id: `rg-${item.id}`,
        label: item.name,
        checkable: true,
        expanded: false,
        payload: { kind: 'regressionItem', id: item.id },
        children: [],
      };
    }
    return {
      id: `rg-${item.id}`,
      label: item.name,
      checkable: true,
      expanded: true,
      payload: { kind: 'regressionItem', id: item.id },
      children: regressionNodes(item.children),
    };
  });
}

function isMockEndpoint(item: MockServerTreeItem): item is Extract<MockServerTreeItem, { matchers: unknown }> {
  return 'matchers' in item;
}

function mockNodes(items: readonly MockServerTreeItem[]): ImportExportTreeNode[] {
  return items.map((item) => {
    if (isMockEndpoint(item)) {
      return {
        id: `mock-${item.id}`,
        label: item.name,
        checkable: true,
        expanded: false,
        payload: { kind: 'mockItem', id: item.id },
        children: [],
      };
    }
    return {
      id: `mock-${item.id}`,
      label: item.name,
      checkable: true,
      expanded: true,
      payload: { kind: 'mockItem', id: item.id },
      children: mockNodes(item.children),
    };
  });
}

function settingsNodes(settings: Partial<SettingsFile>): ImportExportTreeNode[] {
  return SETTINGS_SECTION_KEYS.filter((key) => settings[key] !== undefined).map((key) => ({
    id: `settings-${key}`,
    label: SETTINGS_LABELS[key],
    checkable: true,
    expanded: false,
    payload: { kind: 'settingsSection', key },
    children: [],
  }));
}

/** Builds the import/export preview tree from a bundle snapshot. */
export function buildImportExportTree(bundle: TestrixBundleV1): ImportExportTreeNode[] {
  const roots: ImportExportTreeNode[] = [];

  for (const section of TESTRIX_BUNDLE_SECTION_KEYS) {
    let children: ImportExportTreeNode[] = [];
    let hasContent = false;

    switch (section) {
      case 'collections':
        if (bundle.collections?.nodes?.length) {
          children = collectionNodes(bundle.collections.nodes);
          hasContent = true;
        }
        break;
      case 'environments':
        if (bundle.environments?.environments?.length) {
          children = environmentNodes(bundle.environments.environments);
          hasContent = true;
        }
        break;
      case 'testSuites':
        if (bundle.testSuites?.suites?.length) {
          children = testSuiteNodes(bundle.testSuites.suites);
          hasContent = true;
        }
        break;
      case 'loadTests':
        if (bundle.loadTests?.items?.length) {
          children = loadTestNodes(bundle.loadTests.items);
          hasContent = true;
        }
        break;
      case 'regressions':
        if (bundle.regressions?.items?.length) {
          children = regressionNodes(bundle.regressions.items);
          hasContent = true;
        }
        break;
      case 'mockServer':
        if (bundle.mockServer?.items?.length) {
          children = mockNodes(bundle.mockServer.items);
          hasContent = true;
        }
        break;
      case 'capture':
        hasContent = bundle.capture != null;
        break;
      case 'interceptor':
        hasContent = bundle.interceptor != null;
        break;
      case 'settings':
        if (bundle.settings) {
          children = settingsNodes(bundle.settings);
          hasContent = children.length > 0;
        }
        break;
      case 'cookieJar':
        hasContent = bundle.cookieJar != null;
        if (hasContent) {
          children = [
            {
              id: 'cookies-all',
              label: 'Cookie jar',
              checkable: true,
              expanded: false,
              payload: { kind: 'cookies' },
              children: [],
            },
          ];
        }
        break;
    }

    if (!hasContent) {
      continue;
    }

    roots.push({
      id: `section-${section}`,
      label: SECTION_LABELS[section],
      checkable: true,
      expanded: true,
      payload: { kind: 'group', section },
      children,
    });
  }

  return roots;
}
