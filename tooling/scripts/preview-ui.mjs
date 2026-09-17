#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const electronPath = require('electron');

const SURFACES = ['splash', 'boot-error', 'app-error', 'installer', 'uninstaller'];
const surface = process.argv[2];

if (!surface || !SURFACES.includes(surface)) {
  console.error(`Usage: node tooling/scripts/preview-ui.mjs <${SURFACES.join('|')}>`);
  process.exit(1);
}

if (surface === 'installer' || surface === 'uninstaller') {
  const args = [path.join(root, 'tooling/scripts/preview-setup.mjs')];
  if (surface === 'uninstaller') {
    args.push('--mode=uninstall');
  }
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  spawnSync(process.execPath, [path.join(root, 'tooling/scripts/sync-brand-assets.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  spawnSync(process.execPath, [path.join(root, 'tooling/scripts/bundle-electron.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });

  const env = { ...process.env, TESTRIX_PREVIEW: surface };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.TESTRIX_SERVE_RENDERER;

  const child = spawn(electronPath, [path.join(root, 'apps/desktop'), `--preview=${surface}`], {
    cwd: root,
    stdio: 'inherit',
    env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
