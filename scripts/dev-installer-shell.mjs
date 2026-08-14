/**
 * Opens the Windows installer-shell in dev mode with a throwaway payload directory.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { resolveWinUnpackedDir } from './win-payload-build-path.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellDir = path.join(repoRoot, 'installer-shell');
const payload = path.join(os.tmpdir(), `testrix-installer-payload-${Date.now()}`);

mkdirSync(payload, { recursive: true });
const stubExe = path.join(payload, 'Testrix.exe');
writeFileSync(stubExe, '');

const unpacked = resolveWinUnpackedDir();
if (existsSync(unpacked)) {
  rmSync(payload, { recursive: true, force: true });
  cpSync(unpacked, payload, { recursive: true });
  console.log('[installer:shell:dev] using release/win-unpacked as payload');
} else {
  console.log('[installer:shell:dev] using empty stub payload (build win-unpacked for a real copy test)');
}

const requireFromShell = createRequire(path.join(shellDir, 'package.json'));
let electronBinary;

try {
  electronBinary = requireFromShell('electron');
} catch {
  console.error('[installer:shell:dev] Missing installer-shell dependencies — run: cd installer-shell && npm install');
  process.exit(1);
}

const child = spawn(electronBinary, ['.'], {
  cwd: shellDir,
  env: { ...process.env, TX_PAYLOAD_ROOT: payload },
  stdio: 'inherit',
  windowsHide: false,
});

child.on('error', (err) => {
  console.error('[installer:shell:dev] failed to launch Electron:', err.message || err);
  process.exit(1);
});

child.on('exit', (code) => process.exit(code ?? 0));
