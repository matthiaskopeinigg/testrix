#!/usr/bin/env npx tsx
/**
 * Seeds Public API demo test-suite flows and a smoke regression into a Testrix profile.
 *
 * Usage:
 *   npm run seed:testing-demo
 *   npm run seed:testing-demo -- --user-data "C:/Users/you/AppData/Roaming/Testrix"
 *   npm run seed:testing-demo -- --bulk-count 400
 *   npm run seed:testing-demo -- --profile-id profile-testing-demo --activate --bulk-count 400
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PATHS_ANCHOR_FILE_NAME,
  PROFILES_FILE_NAME,
  REGRESSIONS_FILE_NAME,
  TEST_SUITES_FILE_NAME,
  createDefaultProfilesManifest,
  pathsAnchorSchema,
  profilesManifestSchema,
} from '../shared/config';
import {
  createDefaultRegressionsFile,
  createDefaultTestSuitesFile,
  DEMO_BULK_FLOW_COUNT_DEFAULT,
  DEMO_TESTING_PROFILE_ID,
  mergeDemoPublicApiRegressions,
  mergeDemoPublicApiTestSuites,
  migrateRegressionsFile,
  testSuitesFileSchema,
  type DemoSeedOptions,
} from '../shared/testing';

const DEMO_PROFILE_NAME = 'Testing Demo';

function parseArgs(argv: readonly string[]): {
  readonly userData: string;
  readonly profileId: string | null;
  readonly activate: boolean;
  readonly createProfile: boolean;
  readonly bulkFlowCount: number;
} {
  let userData = process.env['TESTRIX_USER_DATA'] ?? defaultUserData();
  let profileId: string | null = null;
  let activate = false;
  let createProfile = false;
  let bulkFlowCount = DEMO_BULK_FLOW_COUNT_DEFAULT;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user-data' && argv[i + 1]) {
      userData = argv[++i]!;
    } else if (arg === '--profile-id' && argv[i + 1]) {
      profileId = argv[++i]!;
    } else if (arg === '--activate') {
      activate = true;
    } else if (arg === '--create-profile') {
      createProfile = true;
    } else if (arg === '--bulk-count' && argv[i + 1]) {
      bulkFlowCount = Math.max(0, Number.parseInt(argv[++i]!, 10) || 0);
    } else if (arg === '--no-bulk') {
      bulkFlowCount = 0;
    }
  }

  if (createProfile && !profileId) {
    profileId = DEMO_TESTING_PROFILE_ID;
  }

  return { userData, profileId, activate, createProfile, bulkFlowCount };
}

function defaultUserData(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Testrix');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Testrix');
  }
  return path.join(os.homedir(), '.config', 'Testrix');
}

async function readJsonFile<T>(filePath: string, fallback: () => T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback();
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function ensureDemoProfile(
  userData: string,
  profileId: string,
  profileName: string,
): Promise<{ readonly profilesRoot: string; readonly profileDir: string }> {
  const pathsFile = path.join(userData, PATHS_ANCHOR_FILE_NAME);
  const anchorRaw = await readJsonFile(pathsFile, () => null);
  const anchor = anchorRaw ? pathsAnchorSchema.parse(anchorRaw) : null;
  const profilesRoot = anchor?.profilesRoot ?? path.join(userData, 'profiles');
  const profileDir = path.join(profilesRoot, profileId);

  const manifestPath = path.join(userData, PROFILES_FILE_NAME);
  const manifestRaw = await readJsonFile(manifestPath, () => createDefaultProfilesManifest(profileId, profileName));
  const manifest = profilesManifestSchema.parse(manifestRaw);

  const hasProfile = manifest.profiles.some((entry) => entry.id === profileId);
  const ts = new Date().toISOString();
  const nextManifest = hasProfile
    ? manifest
    : profilesManifestSchema.parse({
        ...manifest,
        meta: { ...manifest.meta, updatedAt: ts },
        profiles: [
          ...manifest.profiles,
          { id: profileId, name: profileName, createdAt: ts },
        ],
      });

  await fs.mkdir(profileDir, { recursive: true });
  await writeJsonFile(manifestPath, nextManifest);

  return { profilesRoot, profileDir };
}

async function ensureDefaultWorkspaceFiles(profileDir: string): Promise<void> {
  const testSuitesPath = path.join(profileDir, TEST_SUITES_FILE_NAME);
  const regressionsPath = path.join(profileDir, REGRESSIONS_FILE_NAME);

  const testSuitesExists = await fs
    .access(testSuitesPath)
    .then(() => true)
    .catch(() => false);
  const regressionsExists = await fs
    .access(regressionsPath)
    .then(() => true)
    .catch(() => false);

  if (!testSuitesExists) {
    await writeJsonFile(testSuitesPath, createDefaultTestSuitesFile());
  }
  if (!regressionsExists) {
    await writeJsonFile(regressionsPath, createDefaultRegressionsFile());
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ts = new Date().toISOString();

  let profileDir: string;
  let profileId: string;

  if (args.createProfile || args.profileId) {
    profileId = args.profileId ?? DEMO_TESTING_PROFILE_ID;
    const resolved = await ensureDemoProfile(args.userData, profileId, DEMO_PROFILE_NAME);
    profileDir = resolved.profileDir;

    if (args.activate) {
      const pathsFile = path.join(args.userData, PATHS_ANCHOR_FILE_NAME);
      const anchorRaw = await readJsonFile(pathsFile, () => null);
      if (anchorRaw) {
        const anchor = pathsAnchorSchema.parse(anchorRaw);
        await writeJsonFile(pathsFile, {
          ...anchor,
          activeProfileId: profileId,
          meta: { ...anchor.meta, updatedAt: ts },
        });
      }
    }
  } else {
    const pathsFile = path.join(args.userData, PATHS_ANCHOR_FILE_NAME);
    const anchorRaw = await readJsonFile(pathsFile, () => null);
    if (!anchorRaw) {
      console.error(`No paths.json found at ${pathsFile}. Run Testrix once or pass --create-profile.`);
      process.exit(1);
    }
    const anchor = pathsAnchorSchema.parse(anchorRaw);
    profileId = anchor.activeProfileId;
    profileDir = path.join(anchor.profilesRoot, profileId);
  }

  await ensureDefaultWorkspaceFiles(profileDir);

  const testSuitesPath = path.join(profileDir, TEST_SUITES_FILE_NAME);
  const regressionsPath = path.join(profileDir, REGRESSIONS_FILE_NAME);

  const testSuitesRaw = await readJsonFile(testSuitesPath, createDefaultTestSuitesFile);
  const regressionsRaw = await readJsonFile(regressionsPath, createDefaultRegressionsFile);

  const seedOptions: DemoSeedOptions = { bulkFlowCount: args.bulkFlowCount };

  const testSuites = mergeDemoPublicApiTestSuites(testSuitesFileSchema.parse(testSuitesRaw), ts, seedOptions);
  const regressions = mergeDemoPublicApiRegressions(migrateRegressionsFile(regressionsRaw), ts, seedOptions);

  await writeJsonFile(testSuitesPath, testSuites);
  await writeJsonFile(regressionsPath, regressions);

  console.log('Seeded Public API demo data:');
  console.log(`  Profile: ${profileId} (${profileDir})`);
  console.log('  Test suite folder: Public API Demo (3 flows)');
  if (args.bulkFlowCount > 0) {
    console.log(`  Test suite folder: Bulk API Stress (${args.bulkFlowCount} flows in groups of 50)`);
    console.log(`  Regression: Bulk API Stress (${args.bulkFlowCount} flows, parallel x10)`);
  }
  console.log('  Regression: Public API Smoke (3 flows)');
  console.log('');
  console.log('Restart Testrix or switch to this profile to see the demo content.');
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
