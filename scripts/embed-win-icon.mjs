/**
 * Embeds `build/icons/icon.ico` into the packaged `Testrix.exe` after `electron-builder --win dir`.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { rcedit } from 'rcedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const exePath = path.join(repoRoot, 'release', 'win-unpacked', 'Testrix.exe');
const iconPath = path.join(repoRoot, 'build', 'icons', 'icon.ico');
const require = createRequire(import.meta.url);

function pkgVersion() {
  try {
    return require('../package.json').version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function numericVersion(v) {
  const numeric = String(v).replace(/[^0-9.]/g, '');
  const parts = numeric.split('.').filter(Boolean);
  while (parts.length < 4) parts.push('0');
  return parts.slice(0, 4).join('.');
}

async function main() {
  if (!fs.existsSync(exePath)) {
    console.error(`[embed-win-icon] target .exe not found: ${exePath}`);
    process.exit(0);
  }
  if (!fs.existsSync(iconPath)) {
    console.error(`[embed-win-icon] icon source not found: ${iconPath}`);
    process.exit(1);
  }
  const version = pkgVersion();
  const versionNumeric = numericVersion(version);
  try {
    await rcedit(exePath, {
      icon: iconPath,
      'file-version': versionNumeric,
      'product-version': versionNumeric,
      'version-string': {
        CompanyName: 'Testrix contributors',
        FileDescription: 'Testrix',
        ProductName: 'Testrix',
        LegalCopyright: 'Copyright \u00A9 2026 Testrix contributors',
        OriginalFilename: 'Testrix.exe',
      },
    });
    console.log(
      `[embed-win-icon] embedded ${path.basename(iconPath)} + VersionInfo ` +
        `(file/product=${versionNumeric}, source=${version}) into ${path.basename(exePath)}`,
    );
  } catch (err) {
    console.error('[embed-win-icon] rcedit failed:', err.message || err);
    process.exit(1);
  }
}

void main();
