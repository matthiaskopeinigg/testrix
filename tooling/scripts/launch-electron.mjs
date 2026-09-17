#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [path.join(root, 'apps/desktop')], {
  cwd: root,
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => process.exit(code ?? 0));
