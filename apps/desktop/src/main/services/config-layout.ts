import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

import {
  CONFIGS_DIR,
  DEFAULT_WORKSPACE_FOLDER,
  WORKSPACES_DIR,
  WORKSPACES_FILE_NAME,
  createDefaultWorkspacesFile,
  shouldMigrateLegacyLayout,
} from '@testrix/contracts';

import { writeJsonFile } from './json-file';

async function moveIfExists(from: string, to: string): Promise<void> {
  if (!existsSync(from) || existsSync(to)) {
    return;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await rename(from, to);
}

/**
 * Moves flat root JSON into configs/ and workspaces/workspace-1/.
 * Returns true when a migration ran.
 */
export async function migrateLegacyConfigLayout(root: string): Promise<boolean> {
  if (
    !shouldMigrateLegacyLayout({
      configsSettingsExists: existsSync(path.join(root, CONFIGS_DIR, 'settings.json')),
      rootSettingsExists: existsSync(path.join(root, 'settings.json')),
      rootSessionExists: existsSync(path.join(root, 'session.json')),
      rootEnvironmentsExists: existsSync(path.join(root, 'environments.json')),
      rootCollectionsExists: existsSync(path.join(root, 'collections.json')),
    })
  ) {
    return false;
  }

  const configsPath = path.join(root, CONFIGS_DIR);
  const workspaceDir = path.join(root, WORKSPACES_DIR, DEFAULT_WORKSPACE_FOLDER);
  await mkdir(configsPath, { recursive: true });
  await mkdir(workspaceDir, { recursive: true });

  await moveIfExists(path.join(root, 'settings.json'), path.join(configsPath, 'settings.json'));
  await moveIfExists(path.join(root, 'session.json'), path.join(configsPath, 'session.json'));
  await moveIfExists(path.join(root, 'environments.json'), path.join(workspaceDir, 'environments.json'));
  await moveIfExists(path.join(root, 'collections.json'), path.join(workspaceDir, 'collections.json'));

  await writeJsonFile(
    path.join(root, WORKSPACES_DIR, WORKSPACES_FILE_NAME),
    createDefaultWorkspacesFile(new Date().toISOString(), DEFAULT_WORKSPACE_FOLDER),
  );
  return true;
}
