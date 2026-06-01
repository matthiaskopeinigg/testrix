/**
 * Runs electron-builder for the Windows payload using the prepared output dir.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveWinPayloadOutputDir } from './win-payload-build-path.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolveWinPayloadOutputDir();
const config = join(root, 'electron-builder.yml');
const electronBuilder = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');

if (!existsSync(config)) {
  console.error('[run-electron-builder-win-payload] Missing electron-builder.yml');
  process.exit(1);
}

if (!existsSync(electronBuilder)) {
  console.error('[run-electron-builder-win-payload] Missing electron-builder — run npm install in repo root');
  process.exit(1);
}

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

const result = spawnSync(
  electronBuilder,
  [
    '--config',
    config,
    '--config.directories.output',
    outputDir,
    '--win',
    'dir',
    '--publish',
    'never',
  ],
  { stdio: 'inherit', cwd: root, env: process.env, shell: true },
);

process.exit(result.status ?? 1);
