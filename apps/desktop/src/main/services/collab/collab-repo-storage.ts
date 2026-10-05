import { existsSync } from 'node:fs';
import { cp, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  COLLAB_LEGACY_WORKSPACE,
  COLLAB_LOCAL_DIR,
  COLLAB_LOCAL_FILES,
  COLLAB_MANIFEST_FILE,
  COLLAB_SHARED_DIR,
  COLLAB_TEAM_FILES,
  COLLAB_WORKSPACES_DIR,
  applyCollabSecrets,
  parseCollectionsFile,
  parseDatabasesFile,
  parseEnvironmentsFile,
  peelWorkspaceSecrets,
  type CollabManifest,
  type PeeledWorkspaceSecrets,
} from '@testrix/contracts';

import { readJsonFile, writeJsonFile } from '../json-file';
import { readSecretsFile, updateSecretsFile } from './collab-secrets-file';

const SECRETS_FILE = 'secrets.local.json';
const SECRET_BEARING = ['environments.json', 'collections.json', 'database.json'] as const;

/** Files that only ever belong to this PC, removed when a workspace leaves it. */
export const COLLAB_PC_ONLY_FILES = [
  'history.json',
  'cookies.json',
  'emulator.json',
  SECRETS_FILE,
] as const;

/** Moves a folder, falling back to copy and delete when a rename crosses volumes. */
export async function moveDir(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch {
    await cp(from, to, { recursive: true });
    await rm(from, { recursive: true, force: true });
  }
}

/**
 * Reorganizes a clone written when one repository held one workspace: root files move
 * into `workspaces/workspace/`, together with their merge bases, locks, and runs.
 */
export async function migrateLegacyRepoLayout(repoDir: string, workspaceName: string): Promise<void> {
  const { folder, id } = COLLAB_LEGACY_WORKSPACE;
  const workspaceDir = path.join(repoDir, COLLAB_WORKSPACES_DIR, folder);
  await mkdir(workspaceDir, { recursive: true });
  for (const file of [...COLLAB_TEAM_FILES, ...COLLAB_LOCAL_FILES, 'seed-meta.json'])
    await moveIfPresent(path.join(repoDir, file), path.join(workspaceDir, file));
  const localDir = abs(repoDir, COLLAB_LOCAL_DIR);
  for (const file of COLLAB_TEAM_FILES) {
    await moveIfPresent(
      path.join(localDir, 'base', file),
      path.join(localDir, 'base', COLLAB_WORKSPACES_DIR, folder, file),
    );
  }
  // Reviews point at root file names that no longer exist; the next sync raises them again.
  await rm(path.join(localDir, 'reviews.json'), { force: true });
  for (const kind of ['locks', 'runs']) {
    await moveIfPresent(
      path.join(abs(repoDir, COLLAB_SHARED_DIR), kind),
      path.join(abs(workspaceDir, COLLAB_SHARED_DIR), kind),
    );
  }
  const manifest: CollabManifest = {
    schemaVersion: 1,
    workspaces: [{ id, name: workspaceName.trim() || 'Workspace', folder }],
  };
  await writeJsonFile(path.join(repoDir, COLLAB_MANIFEST_FILE), manifest);
}

/**
 * Copies a repository workspace into a plain local folder, folding this PC's secrets
 * back into the files so the copy works on its own.
 */
export async function copyWorkspaceOut(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const secrets = await readSecretsFile(path.join(sourceDir, SECRETS_FILE));
  const applied = applyCollabSecrets({
    environments: parseEnvironmentsFile(await readJsonFile(path.join(sourceDir, 'environments.json'))),
    collections: parseCollectionsFile(await readJsonFile(path.join(sourceDir, 'collections.json'))),
    databases: parseDatabasesFile(await readJsonFile(path.join(sourceDir, 'database.json'))),
    secrets,
  });
  await Promise.all([
    writeJsonFile(path.join(targetDir, 'environments.json'), applied.environments),
    writeJsonFile(path.join(targetDir, 'collections.json'), applied.collections),
    writeJsonFile(path.join(targetDir, 'database.json'), applied.databases),
  ]);
  const rest = [...COLLAB_TEAM_FILES, 'history.json', 'cookies.json', 'emulator.json'].filter(
    (file) => !(SECRET_BEARING as readonly string[]).includes(file),
  );
  for (const file of rest) {
    const from = path.join(sourceDir, file);
    if (existsSync(from))
      await cp(from, path.join(targetDir, file));
  }
}

/** Moves secret values out of team files into `secrets.local.json`, for a folder not loaded in memory. */
export async function peelWorkspaceFolder(dir: string): Promise<void> {
  const files = {
    environments: parseEnvironmentsFile(await readJsonFile(path.join(dir, 'environments.json'))),
    collections: parseCollectionsFile(await readJsonFile(path.join(dir, 'collections.json'))),
    databases: parseDatabasesFile(await readJsonFile(path.join(dir, 'database.json'))),
  };
  let peeled: PeeledWorkspaceSecrets | null = null;
  await updateSecretsFile(path.join(dir, SECRETS_FILE), (secrets) => {
    peeled = peelWorkspaceSecrets({ ...files, secrets });
    return peeled.secrets;
  });
  const team = peeled as PeeledWorkspaceSecrets | null;
  if (!team)
    return;
  await Promise.all([
    writeJsonFile(path.join(dir, 'environments.json'), team.environments),
    writeJsonFile(path.join(dir, 'collections.json'), team.collections),
    writeJsonFile(path.join(dir, 'database.json'), team.databases),
  ]);
}

/** Deletes what only this PC kept for a workspace; team files stay with the repository. */
export async function removePcOnlyFiles(dir: string): Promise<void> {
  for (const file of COLLAB_PC_ONLY_FILES)
    await rm(path.join(dir, file), { force: true });
}

async function moveIfPresent(from: string, to: string): Promise<void> {
  if (!existsSync(from))
    return;
  await mkdir(path.dirname(to), { recursive: true });
  await rename(from, to);
}

function abs(dir: string, relative: string): string {
  return path.join(dir, ...relative.split('/'));
}
