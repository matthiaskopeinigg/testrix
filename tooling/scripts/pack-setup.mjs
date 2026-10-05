#!/usr/bin/env node
/**
 * Builds the Setup portable and appends payload.zip with a TESTRIXPK footer.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const platform = (
  process.argv.find((arg) => arg.startsWith('--platform=')) ?? '--platform=win'
).split('=')[1];
const zipPath = path.join(root, 'apps/setup/resources/payload.zip');

spawnSync(process.execPath, [path.join(root, 'tooling/scripts/sync-brand-assets.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
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

if (platform !== 'win') {
  console.log('Setup packed. Append payload skipped (non-Windows).');
  process.exit(0);
}
if (!existsSync(zipPath)) {
  console.error(`Missing ${zipPath}. Run electron:build:win:payload first.`);
  process.exit(1);
}

const setupDir = path.join(root, 'release/setup-shell-build');
const artifact = path.join(setupDir, 'Testrix.exe');
if (!existsSync(artifact)) {
  console.error(`Missing ${artifact} after pack:win.`);
  process.exit(1);
}

function appendWithRetry(file, data) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      appendFileSync(file, data);
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
      if (code !== 'EBUSY' && code !== 'EPERM') throw error;
      if (attempt === 7) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
    }
  }
}

const payload = readFileSync(zipPath);
const offset = statSync(artifact).size;
appendWithRetry(artifact, payload);
const magic = 'TESTRIXPK';
const footer = Buffer.alloc(8 + 8 + magic.length);
footer.writeBigUInt64LE(BigInt(offset), 0);
footer.writeBigUInt64LE(BigInt(payload.length), 8);
footer.write(magic, 16, 'ascii');
appendWithRetry(artifact, footer);
console.log('Appended payload to', artifact);
