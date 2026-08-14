import {
  CAPTURE_FILE_NAME,
  COLLECTIONS_FILE_NAME,
  COOKIE_JAR_FILE_NAME,
  CURRENT_COLLECTIONS_SCHEMA_VERSION,
  CURRENT_ENVIRONMENTS_SCHEMA_VERSION,
  CURRENT_PATHS_ANCHOR_SCHEMA_VERSION,
  CURRENT_SESSION_SCHEMA_VERSION,
  CURRENT_SETTINGS_SCHEMA_VERSION,
  ENVIRONMENTS_FILE_NAME,
  HISTORY_FILE_NAME,
  INTERCEPTOR_FILE_NAME,
  LOAD_TESTS_FILE_NAME,
  MOCK_SERVER_FILE_NAME,
  PATHS_ANCHOR_FILE_NAME,
  PROFILES_FILE_NAME,
  REGRESSIONS_FILE_NAME,
  SESSION_FILE_NAME,
  SETTINGS_FILE_NAME,
  TEST_SUITES_FILE_NAME,
} from './constants';
import type { WorkspaceFileInventoryEntry, WorkspaceFileScope } from './workspace-file-inventory.schema';

export interface WorkspaceFileDescriptor {
  readonly fileName: string;
  readonly scope: WorkspaceFileScope;
  readonly currentVersion: number | null;
}

/** Known workspace files and their latest supported schema versions. */
export const WORKSPACE_FILE_DESCRIPTORS: readonly WorkspaceFileDescriptor[] = [
  { fileName: PATHS_ANCHOR_FILE_NAME, scope: 'global', currentVersion: CURRENT_PATHS_ANCHOR_SCHEMA_VERSION },
  { fileName: PROFILES_FILE_NAME, scope: 'global', currentVersion: 1 },
  { fileName: SETTINGS_FILE_NAME, scope: 'global', currentVersion: CURRENT_SETTINGS_SCHEMA_VERSION },
  { fileName: SESSION_FILE_NAME, scope: 'profile', currentVersion: CURRENT_SESSION_SCHEMA_VERSION },
  { fileName: COLLECTIONS_FILE_NAME, scope: 'profile', currentVersion: CURRENT_COLLECTIONS_SCHEMA_VERSION },
  { fileName: ENVIRONMENTS_FILE_NAME, scope: 'profile', currentVersion: CURRENT_ENVIRONMENTS_SCHEMA_VERSION },
  { fileName: HISTORY_FILE_NAME, scope: 'profile', currentVersion: 1 },
  { fileName: COOKIE_JAR_FILE_NAME, scope: 'profile', currentVersion: null },
  { fileName: TEST_SUITES_FILE_NAME, scope: 'profile', currentVersion: 1 },
  { fileName: LOAD_TESTS_FILE_NAME, scope: 'profile', currentVersion: 1 },
  { fileName: REGRESSIONS_FILE_NAME, scope: 'profile', currentVersion: 2 },
  { fileName: MOCK_SERVER_FILE_NAME, scope: 'profile', currentVersion: 2 },
  { fileName: CAPTURE_FILE_NAME, scope: 'profile', currentVersion: 3 },
  { fileName: INTERCEPTOR_FILE_NAME, scope: 'profile', currentVersion: 1 },
];

export interface ReadWorkspaceFileMetaInput {
  readonly absolutePath: string;
  readonly descriptor: WorkspaceFileDescriptor;
}

/** Reads schemaVersion and updatedAt from a JSON config file on disk. */
export async function readWorkspaceFileMeta(
  readFile: (path: string) => Promise<string>,
  input: ReadWorkspaceFileMetaInput,
): Promise<WorkspaceFileInventoryEntry> {
  const { absolutePath, descriptor } = input;
  let raw: string;
  try {
    raw = await readFile(absolutePath);
  } catch {
    return {
      fileName: descriptor.fileName,
      scope: descriptor.scope,
      absolutePath,
      exists: false,
      schemaVersion: null,
      currentVersion: descriptor.currentVersion,
      updatedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const schemaVersion =
      typeof parsed['schemaVersion'] === 'number' ? (parsed['schemaVersion'] as number) : null;
    const meta =
      parsed['meta'] && typeof parsed['meta'] === 'object'
        ? (parsed['meta'] as Record<string, unknown>)
        : null;
    const updatedAt =
      meta && typeof meta['updatedAt'] === 'string'
        ? meta['updatedAt']
        : typeof parsed['updatedAt'] === 'string'
          ? parsed['updatedAt']
          : null;
    return {
      fileName: descriptor.fileName,
      scope: descriptor.scope,
      absolutePath,
      exists: true,
      schemaVersion,
      currentVersion: descriptor.currentVersion,
      updatedAt,
    };
  } catch {
    return {
      fileName: descriptor.fileName,
      scope: descriptor.scope,
      absolutePath,
      exists: true,
      schemaVersion: null,
      currentVersion: descriptor.currentVersion,
      updatedAt: null,
    };
  }
}
