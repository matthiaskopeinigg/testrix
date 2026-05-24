import {
  CAPTURE_FILE_NAME,
  COLLECTIONS_FILE_NAME,
  COOKIE_JAR_FILE_NAME,
  ENVIRONMENTS_FILE_NAME,
  HISTORY_FILE_NAME,
  INTERCEPTOR_FILE_NAME,
  LOAD_TESTS_FILE_NAME,
  MOCK_SERVER_FILE_NAME,
  PROFILES_FILE_NAME,
  REGRESSIONS_FILE_NAME,
  SESSION_FILE_NAME,
  SETTINGS_FILE_NAME,
  TEST_SUITES_FILE_NAME,
} from '../config/constants';

import type { TeamShareScope } from './team-workspace.schema';

/** Files always excluded from team sync (personal / local-only). */
export const TEAM_ALWAYS_EXCLUDED_FILES = [
  SESSION_FILE_NAME,
  HISTORY_FILE_NAME,
  COOKIE_JAR_FILE_NAME,
] as const;

/** Map share-scope toggles to profile workspace file names. */
export function resolveShareScopeFileNames(scope: TeamShareScope): readonly string[] {
  const files: string[] = [];
  if (scope.collections) {
    files.push(COLLECTIONS_FILE_NAME);
  }
  if (scope.environments) {
    files.push(ENVIRONMENTS_FILE_NAME);
  }
  if (scope.testSuites) {
    files.push(TEST_SUITES_FILE_NAME);
  }
  if (scope.loadTests) {
    files.push(LOAD_TESTS_FILE_NAME);
  }
  if (scope.regressions) {
    files.push(REGRESSIONS_FILE_NAME);
  }
  if (scope.mockServer) {
    files.push(MOCK_SERVER_FILE_NAME);
  }
  if (scope.profiles) {
    files.push(PROFILES_FILE_NAME);
  }
  if (scope.settings) {
    files.push(SETTINGS_FILE_NAME);
  }
  if (scope.capture) {
    files.push(CAPTURE_FILE_NAME);
  }
  if (scope.interceptor) {
    files.push(INTERCEPTOR_FILE_NAME);
  }
  return files;
}

/** Gitignore lines for personal Testrix files. */
export const TEAM_GITIGNORE_LINES = [
  '# Testrix — personal / local-only (managed by Testrix Teams)',
  SESSION_FILE_NAME,
  HISTORY_FILE_NAME,
  COOKIE_JAR_FILE_NAME,
  'testrix.team.json',
  '.testrix/',
] as const;
