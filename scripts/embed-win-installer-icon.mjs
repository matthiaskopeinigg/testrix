/**
 * Embeds `build/icons/icon.ico` into the setup-shell `Testrix Setup.exe` (dir build).
 *
 * electron-builder `afterPack` stamps the unpacked binary during pack; this script is
 * for manual re-runs when needed.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rcedit } from 'rcedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const PRODUCT_NAME = 'Testrix Setup';
const COMPANY_NAME = 'Testrix contributors';
const COPYRIGHT = 'Copyright \u00A9 2026 Testrix contributors';

/**
 * @param {string} exePath
 * @returns {Promise<void>}
 */
export async function embedWinInstallerIcon(exePath) {
  const iconPath = path.join(repoRoot, 'build', 'icons', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    throw new Error(`target .exe not found: ${exePath}`);
  }
  if (!fs.existsSync(iconPath)) {
    throw new Error(`icon source not found: ${iconPath}`);
  }

  let version = '0.0.0';
  try {
    version = require('../installer-shell/package.json').version || version;
  } catch {
    /* use default */
  }

  const numeric = String(version).replace(/[^0-9.]/g, '');
  const parts = numeric.split('.').filter(Boolean);
  while (parts.length < 4) parts.push('0');
  const versionNumeric = parts.slice(0, 4).join('.');

  await rcedit(exePath, {
    icon: iconPath,
    'file-version': versionNumeric,
    'product-version': versionNumeric,
    'version-string': {
      CompanyName: COMPANY_NAME,
      FileDescription: PRODUCT_NAME,
      ProductName: PRODUCT_NAME,
      LegalCopyright: COPYRIGHT,
      OriginalFilename: `${PRODUCT_NAME}.exe`,
      InternalName: PRODUCT_NAME,
    },
  });

  console.log(
    `[embed-win-installer-icon] embedded icon + VersionInfo into ${path.basename(exePath)} ` +
      `(file/product=${versionNumeric}, source=${version})`,
  );
}

async function main() {
  const target =
    process.argv[2] || path.join(repoRoot, 'release', 'setup-shell-build', `${PRODUCT_NAME}.exe`);

  try {
    await embedWinInstallerIcon(target);
  } catch (err) {
    console.error('[embed-win-installer-icon]', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

void main();
