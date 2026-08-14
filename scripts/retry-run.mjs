#!/usr/bin/env node
/**
 * Retries a command on failure (e.g. flaky Electron ZIP downloads in CI).
 *
 * Usage: node scripts/retry-run.mjs [--retries=N] [--delay-ms=MS] [--clean-electron] -- <command> [args...]
 */
import { spawn } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function parseArgs(argv) {
  let retries = 3;
  let delayMs = 15_000;
  let cleanElectron = false;
  const command = [];
  let passthrough = false;

  for (const arg of argv) {
    if (passthrough) {
      command.push(arg);
      continue;
    }
    if (arg === '--') {
      passthrough = true;
      continue;
    }
    if (arg === '--clean-electron') {
      cleanElectron = true;
      continue;
    }
    const retriesMatch = /^--retries=(\d+)$/.exec(arg);
    if (retriesMatch) {
      retries = Math.max(1, Number(retriesMatch[1]));
      continue;
    }
    const delayMatch = /^--delay-ms=(\d+)$/.exec(arg);
    if (delayMatch) {
      delayMs = Math.max(0, Number(delayMatch[1]));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (command.length === 0) {
    throw new Error('Missing command after --');
  }

  return { retries, delayMs, cleanElectron, command };
}

function run(command) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
      cwd: process.cwd(),
    });
    child.on('exit', (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Removes a partial Electron install so the next npm install re-downloads cleanly. */
function cleanElectronArtifacts() {
  const targets = [
    join(process.cwd(), 'node_modules', 'electron'),
    join(process.cwd(), 'node_modules', '.bin', 'electron'),
    join(process.cwd(), 'node_modules', '.bin', 'electron.cmd'),
    join(process.cwd(), 'node_modules', '.bin', 'electron.ps1'),
  ];
  for (const target of targets) {
    if (!existsSync(target)) {
      continue;
    }
    try {
      rmSync(target, { recursive: true, force: true });
      console.log(`[retry-run] removed ${target}`);
    } catch (err) {
      console.warn(`[retry-run] could not remove ${target}: ${err.message}`);
    }
  }
}

const { retries, delayMs, cleanElectron, command } = parseArgs(process.argv.slice(2));

for (let attempt = 1; attempt <= retries; attempt += 1) {
  if (attempt > 1 && cleanElectron) {
    cleanElectronArtifacts();
  }
  console.log(`[retry-run] attempt ${attempt}/${retries}: ${command.join(' ')}`);
  const result = await run(command);
  if (result.code === 0) {
    process.exit(0);
  }
  console.error(`[retry-run] attempt ${attempt} failed with exit code ${result.code}`);
  if (attempt < retries) {
    const wait = delayMs * attempt;
    console.error(`[retry-run] waiting ${wait}ms before retry…`);
    await sleep(wait);
  }
}

process.exit(1);
