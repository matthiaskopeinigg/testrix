#!/usr/bin/env node
/**
 * Builds the Setup portable and appends payload.zip with a TESTRIXPK footer.
 */
import { spawnSync } from 'node:child_process';
import { openSync, readFileSync, writeFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const platform = (process.argv.find((arg) => arg.startsWith('--platform=')) ?? '--platform=win').split('=')[1];
const zipPath = path.join(root, 'apps/setup/resources/payload.zip');

spawnSync(process.execPath, [path.join(root, 'tooling/scripts/bundle-setup.mjs')], {
  cwd: root,
  stdio: 'inherit',
});

const pack = spawnSync('npm', ['run', 'pack:win', '--workspace=@testrix/setup'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});
if (pack.status !== 0) {
  process.exit(pack.status ?? 1);
}

if (platform !== 'win' || !existsSync(zipPath)) {
  console.log('Setup packed. Append payload skipped (non-Windows or missing payload.zip).');
  process.exit(0);
}

const setupDir = path.join(root, 'release/setup-shell-build');
const artifact = path.join(setupDir, 'Testrix-Setup.exe');
if (!existsSync(artifact)) {
  console.warn('Testrix-Setup.exe not found; skip append.');
  process.exit(0);
}

const payload = readFileSync(zipPath);
const offset = statSync(artifact).size;
appendFileSync(artifact, payload);
const footer = Buffer.alloc(8 + 8 + 8);
footer.writeBigUInt64LE(BigInt(offset), 0);
footer.writeBigUInt64LE(BigInt(payload.length), 8);
footer.write('TESTRIXPK', 16, 'ascii');
appendFileSync(artifact, footer);
console.log('Appended payload to', artifact);
void openSync;
void writeFileSync;
