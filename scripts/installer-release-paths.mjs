/**
 * Release paths for the cross-platform Testrix Setup installer.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

export const INSTALLER_PRODUCT_NAME = 'Testrix Setup';

export function resolveSetupShellDir() {
  return join(root, 'release', 'setup-shell-build');
}

export function resolveInstallerPayloadZip() {
  return join(root, 'installer-shell', 'resources', 'payload.zip');
}

export function resolveReleaseDir() {
  return join(root, 'release');
}

/** @returns {string} */
export function resolveShippedWindowsInstaller() {
  return join(resolveReleaseDir(), `${INSTALLER_PRODUCT_NAME}.exe`);
}

/** @returns {string} */
export function resolveShippedLinuxInstaller() {
  return join(resolveReleaseDir(), `${INSTALLER_PRODUCT_NAME}.AppImage`);
}

/** @returns {string} */
export function resolveShippedMacInstaller() {
  return join(resolveReleaseDir(), `${INSTALLER_PRODUCT_NAME}.dmg`);
}

/** Thin portable exe (Windows, shell only). */
export function resolveThinWindowsPortable() {
  return join(resolveSetupShellDir(), `${INSTALLER_PRODUCT_NAME}.exe`);
}

/** Thin AppImage before payload append. */
export function resolveThinLinuxAppImage() {
  const dir = resolveSetupShellDir();
  const preferred = join(dir, `${INSTALLER_PRODUCT_NAME}.AppImage`);
  if (existsSync(preferred)) {
    return preferred;
  }

  const match = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.AppImage'))
    .map((entry) => join(dir, entry.name));

  if (match.length === 1) {
    return match[0];
  }

  return preferred;
}

/**
 * Resolves the setup-shell `.app` bundle directory for the current mac build.
 *
 * @returns {string}
 */
export function resolveMacSetupAppBundleDir() {
  const dir = resolveSetupShellDir();
  for (const name of ['mac-arm64', 'mac-x64', 'mac']) {
    const candidate = join(dir, 'mac', `${INSTALLER_PRODUCT_NAME}.app`);
    const flat = join(dir, name, `${INSTALLER_PRODUCT_NAME}.app`);
    if (existsSync(flat)) {
      return flat;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const bundle = join(dir, entry.name, `${INSTALLER_PRODUCT_NAME}.app`);
    if (existsSync(bundle)) {
      return bundle;
    }
  }

  return join(dir, 'mac-arm64', `${INSTALLER_PRODUCT_NAME}.app`);
}

/** Host binary inside the mac setup `.app` (payload is appended here). */
export function resolveMacSetupHostBinary() {
  return join(resolveMacSetupAppBundleDir(), 'Contents', 'MacOS', INSTALLER_PRODUCT_NAME);
}

/** Shipped artifact path for a platform slug. */
export function resolveShippedInstaller(platform) {
  if (platform === 'win' || platform === 'windows' || platform === 'win32') {
    return resolveShippedWindowsInstaller();
  }
  if (platform === 'linux') {
    return resolveShippedLinuxInstaller();
  }
  if (platform === 'mac' || platform === 'darwin' || platform === 'macos') {
    return resolveShippedMacInstaller();
  }
  throw new Error(`Unsupported platform: ${platform}`);
}
