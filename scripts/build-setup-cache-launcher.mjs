/**
 * Builds `release/Testrix Setup.exe` — NSIS bootstrap with a one-time cached extract.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(root, 'build', 'installer', 'windows', 'staging');
const nsi = join(root, 'build', 'installer', 'windows', 'setup-cache-launcher.nsi');
const outFile = join(root, 'release', 'Testrix Setup.exe');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

if (!existsSync(join(staging, 'Testrix Setup.exe'))) {
  console.error('[build-setup-cache-launcher] Missing staging — run stage-installer-release first');
  process.exit(1);
}

if (!existsSync(join(staging, 'payload', 'Testrix.exe'))) {
  console.error('[build-setup-cache-launcher] Missing staged payload/Testrix.exe');
  process.exit(1);
}

const { NSIS_PATH, NsisTargetOptions } = require('app-builder-lib/out/targets/nsis/nsisUtil');
NsisTargetOptions.resolve({});

const nsisDir = await NSIS_PATH();
const makensis = join(nsisDir, 'Bin', 'makensis.exe');

mkdirSync(dirname(outFile), { recursive: true });

const stagingDefine = staging.replace(/\\/g, '/');
const outDefine = outFile.replace(/\\/g, '/');

execFileSync(
  makensis,
  [
    '-INPUTCHARSET',
    'UTF8',
    `-DOUT_FILE=${outDefine}`,
    `-DSTAGING=${stagingDefine}`,
    `-DPRODUCT_VERSION=${version}`,
    nsi,
  ],
  { stdio: 'inherit', env: { ...process.env, NSISDIR: nsisDir } },
);

console.log('[build-setup-cache-launcher] wrote', outFile);
