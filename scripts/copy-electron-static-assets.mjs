import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Copies E2E runner JS and uninstaller assets that are required at runtime
 * (not bundled into `dist/electron/main.js`).
 *
 * @param {string} root Repo root.
 */
export function copyElectronStaticAssets(root) {
  const distElectron = path.join(root, 'dist/electron');
  const e2eSrc = path.join(root, 'electron/services/testing/e2e');
  const e2eDest = path.join(distElectron, 'services/testing/e2e');
  mkdirSync(e2eDest, { recursive: true });
  cpSync(e2eSrc, e2eDest, { recursive: true });
  mkdirSync(path.join(distElectron, 'preload'), { recursive: true });
  cpSync(
    path.join(root, 'electron/preload/e2e-pick.preload.js'),
    path.join(distElectron, 'preload/e2e-pick.preload.js'),
  );

  const uninstallerSrc = path.join(root, 'electron/uninstaller');
  const uninstallerDest = path.join(distElectron, 'uninstaller');
  mkdirSync(uninstallerDest, { recursive: true });
  cpSync(uninstallerSrc, uninstallerDest, { recursive: true });
}
