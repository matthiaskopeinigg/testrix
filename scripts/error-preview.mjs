#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const previewMsgKey = ['T', 'E', 'S', 'T', 'R', 'I', 'X', '_', 'E', 'R', 'R', 'O', 'R', '_', 'P', 'R', 'E', 'V', 'I', 'E', 'W', '_', 'M', 'E', 'S', 'S', 'A', 'G', 'E'].join('');

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptsDir, '..');

process.chdir(repoRoot);

delete process.env.TESTRIX_SPLASH_ONLY;
delete process.env.TESTRIX_DEV;
delete process.env.TESTRIX_SERVE_RENDERER;

const runNode = (abs) => spawnSync(process.execPath, [abs], { stdio: 'inherit', cwd: repoRoot }).status ?? 1;

if (runNode(path.join(repoRoot, 'scripts', 'sync-brand-assets.mjs')) !== 0) process.exit(1);
if (runNode(path.join(repoRoot, 'scripts', 'bundle-electron.mjs')) !== 0) process.exit(1);

const entry = path.join(repoRoot, 'dist', 'electron', 'error-only.main.js');
const fwd = process.argv.slice(2);
const spawnEnv = { ...process.env };
if (fwd.length > 0) {
  spawnEnv[previewMsgKey] = fwd.join(' ');
}

const child = spawn('npx', ['electron', entry], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
  cwd: repoRoot,
  env: spawnEnv,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
