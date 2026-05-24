import {
  COLLECTIONS_FILE_NAME,
  ENVIRONMENTS_FILE_NAME,
  LOAD_TESTS_FILE_NAME,
  MOCK_SERVER_FILE_NAME,
  REGRESSIONS_FILE_NAME,
  TEST_SUITES_FILE_NAME,
} from '../../../shared/config/constants';

type TeamNotifyFn = (workspaceDir: string, fileName: string) => void;

let notifyFn: TeamNotifyFn | null = null;

export function registerTeamFileNotify(fn: TeamNotifyFn): void {
  notifyFn = fn;
}

export function notifyTeamConfigFileSaved(workspaceDir: string, fileName: string): void {
  notifyFn?.(workspaceDir, fileName);
}

export const TEAM_SYNC_FILE_NAMES = {
  collections: COLLECTIONS_FILE_NAME,
  environments: ENVIRONMENTS_FILE_NAME,
  testSuites: TEST_SUITES_FILE_NAME,
  loadTests: LOAD_TESTS_FILE_NAME,
  regressions: REGRESSIONS_FILE_NAME,
  mockServer: MOCK_SERVER_FILE_NAME,
} as const;
