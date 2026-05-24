/**
 * Opens the Windows installer-shell in dev mode with a throwaway payload directory.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellDir = path.join(repoRoot, 'installer-shell');
const payload = path.join(os.tmpdir(), `testrix-installer-payload-${Date.now()}`);

mkdirSync(payload, { recursive: true });
const stubExe = path.join(payload, 'Testrix.exe');
writeFileSync(stubExe, '');

const unpacked = path.join(repoRoot, 'release', 'win-unpacked');
if (existsSync(unpacked)) {
  rmSync(payload, { recursive: true, force: true });
  cpSync(unpacked, payload, { recursive: true });
  console.log('[installer:shell:dev] using release/win-unpacked as payload');
} else {
  console.log('[installer:shell:dev] using empty stub payload (build win-unpacked for a real copy test)');
}

const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['start'], {
  cwd: shellDir,
  env: { ...process.env, TX_PAYLOAD_ROOT: payload },
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
