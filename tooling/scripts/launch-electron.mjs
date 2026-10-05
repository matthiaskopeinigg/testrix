#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const electronPath = require('electron');
const desktopDir = path.join(root, 'apps/desktop');
const preloadPath = path.join(desktopDir, 'dist/preload/main.preload.cjs');
const mainPath = path.join(desktopDir, 'dist/main.cjs');

if (!fs.existsSync(mainPath) || !fs.existsSync(preloadPath)) {
  console.error(
    '[electron] Missing desktop bundles. Run: node tooling/scripts/bundle-electron.mjs',
  );
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

console.log(`[electron] Launching with preload: ${preloadPath}`);

const child = spawn(electronPath, [desktopDir], {
  cwd: root,
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.log(`[electron] Exited via ${signal}`);
    process.exit(0);
    return;
  }
  // Clean close is success; serve-desktop then stops ng and the watcher.
  process.exit(code === null ? 0 : code);
});
