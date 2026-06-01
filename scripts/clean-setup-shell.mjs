/**
 * Clears stale electron-builder setup-shell artifacts that lock files on Windows.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const setupShellDir = join(root, 'release', 'setup-shell-build');

if (process.platform === 'win32') {
  for (const imageName of ['Testrix Setup.exe', 'Testrix.exe']) {
    try {
      execFileSync('taskkill', ['/F', '/IM', imageName, '/T'], { stdio: 'ignore' });
    } catch {
      /* not running */
    }
  }
}

if (!existsSync(setupShellDir)) {
  process.exit(0);
}

for (const name of ['win-unpacked', 'Testrix Setup.exe']) {
  try {
    rmSync(join(setupShellDir, name), { recursive: true, force: true });
  } catch (err) {
    console.warn(
      `[clean-setup-shell] Could not remove ${name} (${err.code || err.message}); continuing.`,
    );
  }
}

for (const name of readdirSync(setupShellDir)) {
  if (!name.endsWith('.nsis.7z')) {
    continue;
  }
  try {
    rmSync(join(setupShellDir, name), { force: true });
  } catch {
    /* ignore */
  }
}

console.log('[clean-setup-shell] cleared', setupShellDir);
