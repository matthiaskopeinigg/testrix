#!/usr/bin/env node
/**
 * Packs the macOS dmg or Linux AppImage and deb.
 * Windows keeps the custom Setup shell (`npm run electron:pack`).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const platform =
  process.platform === 'darwin' ? 'mac' : process.platform === 'linux' ? 'linux' : '';
if (!platform) {
  console.error(
    'electron:pack:desktop runs on macOS or Linux. On Windows use npm run electron:pack.',
  );
  process.exit(1);
}

const sync = spawnSync(
  process.execPath,
  [path.join(root, 'tooling/scripts/sync-brand-assets.mjs')],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
if (sync.status !== 0) process.exit(sync.status ?? 1);

const desktop = path.join(root, 'apps/desktop');
const builder = spawnSync(
  'npx',
  [
    'electron-builder',
    '--project',
    desktop,
    '--config',
    path.join(desktop, 'electron-builder.yml'),
    `--${platform}`,
    '--publish',
    'never',
  ],
  {
    cwd: desktop,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  },
);
if (builder.status !== 0) process.exit(builder.status ?? 1);
