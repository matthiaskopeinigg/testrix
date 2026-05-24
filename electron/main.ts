import './config/dev-chromium-paths';

import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Uninstall mode short-circuit. When the executable is invoked with
 * `--uninstall` (the registry `UninstallString` on Windows) we skip the
 * workspace bootstrap and hand control to the dedicated uninstaller UI.
 *
 * Must run before any other service module is loaded.
 */
const isUninstaller = process.argv.includes('--uninstall');

if (isUninstaller) {
  const require = createRequire(__filename);
  const servicePath = path.join(__dirname, 'uninstaller', 'uninstaller.service.js');
  require(servicePath).boot();
} else {
  void import('./boot-main-app.js').then(({ bootMainApp }) => bootMainApp());
}
