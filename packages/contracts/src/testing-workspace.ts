import type { CollectionsFile } from './config-files';
import type { CookiesFile } from './cookies-file';
import {
  DEFAULT_DATABASES_FILE,
  DEFAULT_QUERIES_FILE,
  type DatabasesFile,
  type QueriesFile,
} from './database';
import {
  createDefaultEnvironmentsFile,
  type EnvironmentFolder,
  type EnvironmentNode,
  type EnvironmentVariable,
  type EnvironmentsFile,
} from './environment';
import { DEFAULT_HISTORY_FILE, type HistoryFile } from './history';
import { type FlowsFile } from './flows-file';
import { DEFAULT_LOAD_FILE, type LoadFile } from './load-file';
import { DEFAULT_MOCKS_FILE, type MocksFile } from './mocks-file';
import { DEFAULT_LISTENERS_FILE, type ListenersFile } from './listeners-file';
import { DEFAULT_INTERCEPT_FILE, type InterceptFile } from './intercept-file';
import { DEFAULT_REGRESSIONS_FILE, type RegressionsFile } from './regressions-file';
import { DEFAULT_FLOW_TEMPLATES_FILE, type FlowTemplatesFile } from './flow-templates-file';
import { DEFAULT_EMULATOR_FILE, type EmulatorFile } from './emulator-file';
import { CONFIG_SCHEMA_VERSION } from './settings';
import { createTestingFlowsFile } from './testing-flows-seed';
import type { CollectionNode, CollectionTree } from './collection-tree';

/** Bump to force-rewrite the on-disk Testing workspace seed. */
export const TESTING_SEED_VERSION = 14;

function envVar(
  id: string,
  key: string,
  value: string,
  secret = false,
  description = '',
  enabled = true,
): EnvironmentVariable {
  return { kind: 'variable', id, key, value, description, enabled, secret };
}

function envFolder(id: string, name: string, children: EnvironmentNode[], description = ''): EnvironmentFolder {
  return { kind: 'folder', id, name, description, collapsed: false, children };
}

/**
 * Environment variables for public e2e / API targets used by the Flows seed.
 * No fake Acme hosts — only real sites and credentials those demos publish.
 */
function testingEnvVariables(envId: string): EnvironmentNode[] {
  if (envId !== 'env-local' && envId !== 'env-staging')
    return [];
  return [
    envFolder(`${envId}-sites`, 'sites', [
      envVar(`${envId}-INTERNET_URL`, 'INTERNET_URL', 'https://the-internet.herokuapp.com/'),
      envVar(`${envId}-SAUCE_URL`, 'SAUCE_URL', 'https://www.saucedemo.com/'),
      envVar(`${envId}-PRACTICE_URL`, 'PRACTICE_URL', 'https://practicetestautomation.com/practice-test-login/'),
      envVar(`${envId}-DEMOQA_URL`, 'DEMOQA_URL', 'https://demoqa.com/'),
      envVar(`${envId}-HTTPBIN_URL`, 'HTTPBIN_URL', 'https://httpbin.org'),
      envVar(`${envId}-JSON_URL`, 'JSON_URL', 'https://jsonplaceholder.typicode.com'),
    ], 'Public e2e / API origins'),
    envFolder(`${envId}-sauce`, 'sauce', [
      envVar(`${envId}-username`, 'username', 'standard_user', false, 'Sauce Demo user'),
      envVar(`${envId}-password`, 'password', 'secret_sauce', true, 'Sauce Demo password'),
    ], 'Sauce Demo credentials'),
    envVar(`${envId}-BASE_URL`, 'BASE_URL', 'https://httpbin.org', false, 'Default API origin'),
    envVar(`${envId}-API_PREFIX`, 'API_PREFIX', ''),
    envVar(`${envId}-API_TOKEN`, 'API_TOKEN', '', true, 'Unused for public labs'),
    envVar(`${envId}-TENANT_ID`, 'TENANT_ID', 'public'),
    envVar(`${envId}-HOST`, 'HOST', 'httpbin.org'),
    envVar(`${envId}-TIMEOUT_MS`, 'TIMEOUT_MS', '12000'),
  ];
}

/** Empty collections — Flows own the Testing workspace seed now. */
export function createTestingCollectionsFile(): CollectionsFile {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    collections: [],
  };
}

export function createTestingEnvironmentsFile(): EnvironmentsFile {
  const base = createDefaultEnvironmentsFile();
  const items = base.items.map((item) => ({
    ...item,
    variables: testingEnvVariables(item.id),
  }));
  return {
    ...base,
    items,
    activeId: 'env-local',
  };
}

export function createTestingCookiesFile(): CookiesFile {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    cookies: [],
  };
}

export function createTestingWorkspaceFiles(): {
  readonly collections: CollectionsFile;
  readonly environments: EnvironmentsFile;
  readonly cookies: CookiesFile;
  readonly databases: DatabasesFile;
  readonly queries: QueriesFile;
  readonly history: HistoryFile;
  readonly flows: FlowsFile;
  readonly load: LoadFile;
  readonly mocks: MocksFile;
  readonly listeners: ListenersFile;
  readonly intercept: InterceptFile;
  readonly regressions: RegressionsFile;
  readonly flowTemplates: FlowTemplatesFile;
  readonly emulator: EmulatorFile;
} {
  return {
    collections: createTestingCollectionsFile(),
    environments: createTestingEnvironmentsFile(),
    cookies: createTestingCookiesFile(),
    databases: { ...DEFAULT_DATABASES_FILE, nodes: [] },
    queries: { ...DEFAULT_QUERIES_FILE, nodes: [] },
    history: { ...DEFAULT_HISTORY_FILE },
    flows: createTestingFlowsFile(),
    load: { ...DEFAULT_LOAD_FILE, items: [] },
    mocks: { ...DEFAULT_MOCKS_FILE, items: [] },
    listeners: { ...DEFAULT_LISTENERS_FILE, items: [] },
    intercept: { ...DEFAULT_INTERCEPT_FILE, items: [] },
    regressions: { ...DEFAULT_REGRESSIONS_FILE, items: [] },
    flowTemplates: { ...DEFAULT_FLOW_TEMPLATES_FILE, templates: [] },
    emulator: { ...DEFAULT_EMULATOR_FILE },
  };
}

export function countTestingTree(nodes: CollectionTree): {
  readonly folders: number;
  readonly http: number;
  readonly websocket: number;
} {
  let folders = 0;
  let httpCount = 0;
  let websocket = 0;
  const walk = (list: readonly CollectionNode[]): void => {
    for (const node of list) {
      if (node.kind === 'folder') {
        folders += 1;
        walk(node.children);
        continue;
      }
      if (node.kind === 'http') {
        httpCount += 1;
        continue;
      }
      websocket += 1;
    }
  };
  walk(nodes);
  return { folders, http: httpCount, websocket };
}

export { createTestingFlowsFile, countFlowNodes } from './testing-flows-seed';
