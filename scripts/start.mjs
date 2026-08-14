#!/usr/bin/env node
/**
 * Runs Electron against **built** artefacts only (`dist/testrix/browser/index.html`
 * + esbuild Electron output). Angular is **not** served — build first (`npm run build`).
 * Use **`npm start`** / **`npm run dev`** (`serve-desktop.mjs`) for `ng serve` + watch.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptsDir, '..');

process.chdir(repoRoot);

const browserIndex = path.join(repoRoot, 'dist', 'testrix', 'browser', 'index.html');
const electronMain = path.join(repoRoot, 'dist', 'electron', 'main.js');

const exists = async (p) =>
  fs
    .access(p)
    .then(() => true)
    .catch(() => false);

if (!(await exists(browserIndex)) || !(await exists(electronMain))) {
  console.error('Missing built artifacts.');
  console.error('Expected:');
  console.error(` - ${browserIndex}`);
  console.error(` - ${electronMain}`);
  console.error('Run npm run build first.');
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';
delete process.env.TESTRIX_DEV;

delete process.env.TESTRIX_SERVE_RENDERER;

const child = spawn('npx', ['electron', '.'], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
  cwd: repoRoot,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
