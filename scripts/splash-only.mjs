#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptsDir, '..');

process.chdir(repoRoot);

process.env.TESTRIX_SPLASH_ONLY = '1';
delete process.env.TESTRIX_DEV;

delete process.env.TESTRIX_SERVE_RENDERER;
const runNode = (abs) => spawnSync(process.execPath, [abs], { stdio: 'inherit', cwd: repoRoot }).status ?? 1;

if (runNode(path.join(repoRoot, 'scripts', 'sync-brand-assets.mjs')) !== 0) process.exit(1);
if (runNode(path.join(repoRoot, 'scripts', 'bundle-electron.mjs')) !== 0) process.exit(1);

const splashEntry = path.join(repoRoot, 'dist', 'electron', 'splash-only.main.js');

const child = spawn('npx', ['electron', splashEntry], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
  cwd: repoRoot,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
