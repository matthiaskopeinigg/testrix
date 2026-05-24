/**
 * Stages setup shell (dir build) + app payload for the cached NSIS bootstrap.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const setupDir = join(root, 'release', 'setup-shell', 'win-unpacked');
const setupExe = join(setupDir, 'Testrix Setup.exe');
const payloadSrc = join(root, 'release', 'win-unpacked');
const staging = join(root, 'build', 'installer', 'windows', 'staging');

if (!existsSync(setupExe)) {
  console.error(`[stage-installer-release] Missing setup shell: ${setupExe}`);
  process.exit(1);
}

if (!existsSync(join(payloadSrc, 'Testrix.exe'))) {
  console.error(`[stage-installer-release] Missing app payload: ${payloadSrc}`);
  process.exit(1);
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(setupDir, staging, { recursive: true });
cpSync(payloadSrc, join(staging, 'payload'), { recursive: true });

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
console.log('[stage-installer-release] staged', staging, `(v${version})`);
