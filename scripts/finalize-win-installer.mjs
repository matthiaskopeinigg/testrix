/**
 * Copies the portable setup shell to `release/Testrix-Setup.exe`.
 *
 * Do not run rcedit (or any PE editor) on the shipped portable exe — electron-builder
 * wraps it in NSIS, and post-build edits break the NSIS integrity CRC.
 * Icon + VersionInfo for the inner Electron binary are applied in installer-after-pack.cjs
 * before the portable wrapper is sealed.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP_EXE = 'Testrix-Setup.exe';
const built = join(root, 'release', 'setup-shell', SETUP_EXE);
const dest = join(root, 'release', SETUP_EXE);

if (!existsSync(built)) {
  console.error(`[finalize-win-installer] Missing portable setup: ${built}`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(built, dest);

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || '0.0.0';
console.log('[finalize-win-installer] wrote', dest, `(v${version})`);
