/**
 * Authenticode-signs release Windows artifacts when `CSC_LINK` (base64 PFX) is set.
 * Skips quietly when no certificate is configured (local unsigned builds).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveShippedWindowsInstaller } from './installer-release-paths.mjs';
import { resolvePackagedTestrixExe } from './win-payload-build-path.mjs';

const link = process.env.CSC_LINK || process.env.WIN_CSC_LINK;
const password = process.env.CSC_KEY_PASSWORD || process.env.WIN_CSC_KEY_PASSWORD || '';
const targets = [resolveShippedWindowsInstaller(), resolvePackagedTestrixExe()];

if (!link) {
  if (process.env.REQUIRE_WIN_CODE_SIGN === '1') {
    console.error(
      '[sign-win-release] REQUIRE_WIN_CODE_SIGN=1 but CSC_LINK / WIN_CSC_LINK is not set.\n' +
        'Add GitHub secrets WIN_CSC_LINK (base64 PFX) and WIN_CSC_KEY_PASSWORD.',
    );
    process.exit(1);
  }
  console.log('[sign-win-release] skip — set CSC_LINK / WIN_CSC_LINK to sign');
  process.exit(0);
}

if (!password) {
  console.error('[sign-win-release] CSC_KEY_PASSWORD / WIN_CSC_KEY_PASSWORD is required when CSC_LINK is set');
  process.exit(1);
}

const certPath = join(tmpdir(), `testrix-sign-${Date.now()}.pfx`);
writeFileSync(certPath, Buffer.from(link, 'base64'));

function resolveSigntool() {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const kitsRoot = join(pf86, 'Windows Kits', '10', 'bin');
  if (existsSync(kitsRoot)) {
    const versions = readdirSync(kitsRoot)
      .filter((name) => /^\d/.test(name))
      .sort()
      .reverse();
    for (const ver of versions) {
      for (const arch of ['x64', 'x86']) {
        const candidate = join(kitsRoot, ver, arch, 'signtool.exe');
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return 'signtool';
}

const signtool = resolveSigntool();

function signFile(exePath) {
  if (!existsSync(exePath)) {
    console.warn('[sign-win-release] skip missing', exePath);
    return;
  }
  execFileSync(
    signtool,
    [
      'sign',
      '/f',
      certPath,
      '/p',
      password,
      '/tr',
      'http://timestamp.digicert.com',
      '/td',
      'sha256',
      '/fd',
      'sha256',
      exePath,
    ],
    { stdio: 'inherit' },
  );
  console.log('[sign-win-release] signed', exePath);
}

try {
  for (const target of targets) {
    signFile(target);
  }
} finally {
  try {
    unlinkSync(certPath);
  } catch {
    /* non-fatal */
  }
}
