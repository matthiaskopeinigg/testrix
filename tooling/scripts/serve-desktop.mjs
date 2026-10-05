#!/usr/bin/env node
import concurrently from 'concurrently';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);

const devToolkit = process.argv.includes('--devtools');
process.env.TESTRIX_SERVE_RENDERER = '1';
process.env.TESTRIX_DEV_URL = process.env.TESTRIX_DEV_URL ?? 'http://localhost:4200';
process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
if (devToolkit) {
  process.env.TESTRIX_DEV = '1';
}

const run = (script) =>
  spawnSync(process.execPath, [path.join(root, script)], { stdio: 'inherit', cwd: root }).status ??
  1;

if (run('tooling/scripts/sync-brand-assets.mjs') !== 0) {
  process.exit(1);
}
if (run('tooling/scripts/bundle-electron.mjs') !== 0) {
  process.exit(1);
}

const { result } = concurrently(
  [
    {
      command: 'npm run start --workspace=@testrix/renderer',
      name: 'ng',
      prefixColor: 'blue',
    },
    {
      command: 'node tooling/scripts/bundle-electron.mjs --watch',
      name: 'electron-build',
      prefixColor: 'yellow',
    },
    {
      command:
        'npx wait-on http-get://localhost:4200 file:apps/desktop/dist/main.cjs file:apps/desktop/dist/preload/main.preload.cjs && node tooling/scripts/launch-electron.mjs',
      name: 'electron',
      prefixColor: 'green',
    },
  ],
  {
    cwd: root,
    // Closing the workbench stops ng serve and the Electron watcher with it.
    killOthersOn: ['failure', 'success'],
  },
);

result
  .then((results) => {
    const failed = results.find((item) => item.exitCode && item.exitCode !== 0);
    process.exit(failed?.exitCode ?? 0);
  })
  .catch(() => process.exit(1));
