#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const electronPath = require('electron');
const uninstall = process.argv.includes('--mode=uninstall');

spawnSync(process.execPath, [path.join(root, 'tooling/scripts/sync-brand-assets.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
spawnSync(process.execPath, [path.join(root, 'tooling/scripts/bundle-setup.mjs')], {
  cwd: root,
  stdio: 'inherit',
});

const args = [path.join(root, 'apps/setup'), '--preview'];
if (uninstall) {
  args.push('--mode=uninstall');
}

const env = { ...process.env, TESTRIX_SETUP_PREVIEW: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, args, {
  cwd: root,
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => process.exit(code ?? 0));
