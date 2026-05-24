/**
 * Verifies Authenticode signatures on shipped Windows release artifacts.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  join(root, 'release', 'Testrix-Setup.exe'),
  join(root, 'release', 'win-unpacked', 'Testrix.exe'),
];

function resolveSigntool() {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const kitsRoot = join(pf86, 'Windows Kits', '10', 'bin');
  if (!existsSync(kitsRoot)) return 'signtool';
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
  return 'signtool';
}

const signtool = resolveSigntool();
let failed = false;

for (const exePath of targets) {
  if (!existsSync(exePath)) {
    console.warn('[verify-win-signature] skip missing', exePath);
    continue;
  }
  try {
    execFileSync(signtool, ['verify', '/pa', '/v', exePath], { stdio: 'inherit' });
    console.log('[verify-win-signature] ok', exePath);
  } catch {
    console.error('[verify-win-signature] NOT signed or invalid signature:', exePath);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
