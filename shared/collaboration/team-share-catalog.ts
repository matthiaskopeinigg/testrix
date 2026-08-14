import type { TeamShareScope } from './team-workspace.schema';

export type TeamShareScopeKey = keyof TeamShareScope;

export type TeamShareCatalogGroup = 'core' | 'testing' | 'advanced';

export interface TeamShareCatalogEntry {
  readonly key: TeamShareScopeKey;
  readonly group: TeamShareCatalogGroup;
  readonly label: string;
  readonly description: string;
  readonly fileName: string;
  readonly sensitive?: boolean;
}

export const TEAM_SHARE_CATALOG: readonly TeamShareCatalogEntry[] = [
  {
    key: 'collections',
    group: 'core',
    label: 'Collections',
    description: 'API collections, folders, and requests',
    fileName: 'collections.json',
  },
  {
    key: 'environments',
    group: 'core',
    label: 'Environments',
    description: 'Shared environment variables and configs',
    fileName: 'environments.json',
  },
  {
    key: 'profiles',
    group: 'core',
    label: 'Profiles manifest',
    description: 'Team profile list and linked workspace paths',
    fileName: 'profiles.json',
  },
  {
    key: 'settings',
    group: 'core',
    label: 'App settings',
    description: 'Workspace-level UI and editor preferences',
    fileName: 'settings.json',
  },
  {
    key: 'testSuites',
    group: 'testing',
    label: 'Test suites',
    description: 'Automated test flows and steps',
    fileName: 'test-suites.json',
  },
  {
    key: 'loadTests',
    group: 'testing',
    label: 'Load tests',
    description: 'Load test definitions and thresholds',
    fileName: 'load-tests.json',
  },
  {
    key: 'regressions',
    group: 'testing',
    label: 'Regressions',
    description: 'Regression suites and baselines',
    fileName: 'regressions.json',
  },
  {
    key: 'mockServer',
    group: 'testing',
    label: 'Mock server',
    description: 'Mock routes and response rules',
    fileName: 'mock.json',
  },
  {
    key: 'capture',
    group: 'advanced',
    label: 'Capture workbench',
    description: 'Recorded HTTP traffic for replay',
    fileName: 'capture.json',
    sensitive: true,
  },
  {
    key: 'interceptor',
    group: 'advanced',
    label: 'Interceptor rules',
    description: 'Request/response interception rules',
    fileName: 'interceptor.json',
    sensitive: true,
  },
] as const;

export const TEAM_SHARE_GROUP_LABELS: Record<TeamShareCatalogGroup, string> = {
  core: 'Core workspace',
  testing: 'Testing & automation',
  advanced: 'Advanced (may include local traffic)',
};

export function teamShareCatalogForGroup(group: TeamShareCatalogGroup): readonly TeamShareCatalogEntry[] {
  return TEAM_SHARE_CATALOG.filter((entry) => entry.group === group);
}
