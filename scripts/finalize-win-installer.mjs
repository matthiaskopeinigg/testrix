/**
 * Copies the portable setup shell to `release/Testrix-Setup.exe` and stamps icon + VersionInfo.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rcedit } from 'rcedit';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP_EXE = 'Testrix-Setup.exe';
const built = join(root, 'release', 'setup-shell', SETUP_EXE);
const dest = join(root, 'release', SETUP_EXE);
const iconPath = join(root, 'build', 'icons', 'icon.ico');

function numericVersion(raw) {
  const numeric = String(raw || '0.0.0').replace(/[^0-9.]/g, '');
  const parts = numeric.split('.').filter(Boolean);
  while (parts.length < 4) parts.push('0');
  return parts.slice(0, 4).join('.');
}

if (!existsSync(built)) {
  console.error(`[finalize-win-installer] Missing portable setup: ${built}`);
  process.exit(1);
}

if (!existsSync(iconPath)) {
  console.error(`[finalize-win-installer] Missing icon: ${iconPath}`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(built, dest);

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || '0.0.0';
const versionNumeric = numericVersion(version);

await rcedit(dest, {
  icon: iconPath,
  'file-version': versionNumeric,
  'product-version': versionNumeric,
  'version-string': {
    CompanyName: 'Testrix contributors',
    FileDescription: 'Testrix Setup',
    ProductName: 'Testrix Setup',
    LegalCopyright: 'Copyright \u00A9 2026 Testrix contributors',
    OriginalFilename: SETUP_EXE,
    InternalName: 'Testrix-Setup',
  },
});

console.log('[finalize-win-installer] wrote', dest, `(v${version})`);
