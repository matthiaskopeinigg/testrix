/**
 * electron-builder afterPack hook for the installer shell (Windows VersionInfo + icon).
 */
const path = require('path');
const fs = require('fs');

const PRODUCT_NAME = 'Testrix-Setup';
const COMPANY_NAME = 'Testrix contributors';
const COPYRIGHT = 'Copyright \u00A9 2026 Testrix contributors';

function numericVersion(raw) {
  const numeric = String(raw || '0.0.0').replace(/[^0-9.]/g, '');
  const parts = numeric.split('.').filter(Boolean);
  while (parts.length < 4) parts.push('0');
  return parts.slice(0, 4).join('.');
}

function resolveInstallerShellVersion() {
  try {
    return require('../installer-shell/package.json').version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const productFilename =
    (context.packager && context.packager.appInfo && context.packager.appInfo.productFilename) ||
    PRODUCT_NAME;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.resolve(__dirname, '..', 'build', 'icons', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn(`[installer-after-pack] target .exe not found: ${exePath}`);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn(`[installer-after-pack] icon source not found: ${iconPath}`);
    return;
  }

  const version = resolveInstallerShellVersion();
  const versionNumeric = numericVersion(version);
  const { rcedit } = await import('rcedit');

  try {
    await rcedit(exePath, {
      icon: iconPath,
      'file-version': versionNumeric,
      'product-version': versionNumeric,
      'version-string': {
        CompanyName: COMPANY_NAME,
        FileDescription: PRODUCT_NAME,
        ProductName: PRODUCT_NAME,
        LegalCopyright: COPYRIGHT,
        OriginalFilename: `${productFilename}.exe`,
        InternalName: productFilename,
      },
    });
    console.log(
      `[installer-after-pack] stamped VersionInfo on ${path.basename(exePath)} ` +
        `(file/product=${versionNumeric}, source=${version})`,
    );
  } catch (err) {
    console.error('[installer-after-pack] rcedit failed:', (err && err.message) || err);
    throw err;
  }
};
