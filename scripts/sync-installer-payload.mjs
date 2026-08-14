/**
 * Bundles the platform-specific main-app `dir` build for the setup shell.
 *
 * All platforms ship a compressed `payload.zip` (extracted when the user clicks Install).
 *
 * Usage:
 *   node scripts/sync-installer-payload.mjs --platform=win
 *   node scripts/sync-installer-payload.mjs --platform=linux
 *   node scripts/sync-installer-payload.mjs --platform=mac
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveWinUnpackedDir } from './win-payload-build-path.mjs';
import { verifyWinPayload } from './verify-win-payload.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const resourcesDir = join(root, 'installer-shell', 'resources');
const destFolder = join(resourcesDir, 'payload');
const destZip = join(resourcesDir, 'payload.zip');

function argPlatform() {
  const raw = process.argv.find((arg) => arg.startsWith('--platform='));
  if (raw) return raw.split('=')[1];
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function payloadSource(platform) {
  if (platform === 'win' || platform === 'windows' || platform === 'win32') {
    return { platform: 'win', src: resolveWinUnpackedDir(), archiveRoot: resolveWinUnpackedDir() };
  }
  if (platform === 'linux') {
    const src = join(root, 'release', 'linux-unpacked');
    return { platform: 'linux', src, archiveRoot: src };
  }
  if (platform === 'mac' || platform === 'darwin' || platform === 'macos') {
    const candidates = ['mac-arm64', 'mac-x64', 'mac'];
    for (const dir of candidates) {
      const candidate = join(root, 'release', dir, 'Testrix.app');
      if (existsSync(candidate)) {
        return { platform: 'mac', src: candidate, archiveRoot: candidate };
      }
    }
    const fallback = join(root, 'release', 'mac', 'Testrix.app');
    return { platform: 'mac', src: fallback, archiveRoot: fallback };
  }
  console.error(`[sync-installer-payload] Unsupported platform: ${platform}`);
  process.exit(1);
}

/**
 * Creates `payload.zip` from a directory or `.app` bundle using built-in tar.
 *
 * @param {string} srcPath
 * @param {string} zipPath
 */
function createPayloadZip(srcPath, zipPath) {
  rmSync(zipPath, { force: true });
  const result = spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', srcPath, '.'], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`[sync-installer-payload] Failed to create ${zipPath} (tar exit ${result.status ?? 'unknown'})`);
    process.exit(1);
  }
  if (!existsSync(zipPath)) {
    console.error(`[sync-installer-payload] Missing archive after tar: ${zipPath}`);
    process.exit(1);
  }
}

const { platform, src, archiveRoot } = payloadSource(argPlatform());

if (!existsSync(src)) {
  console.error(
    `[sync-installer-payload] Missing ${platform} payload at ${src}. Run the matching payload build first.`,
  );
  process.exit(1);
}

if (platform === 'win') {
  const check = verifyWinPayload(src);
  if (!check.ok) {
    console.error(`[sync-installer-payload] Refusing to bundle incomplete payload: ${src}`);
    for (const rel of check.missing) {
      console.error(`  missing: ${rel}`);
    }
    process.exit(1);
  }
}

mkdirSync(resourcesDir, { recursive: true });
rmSync(destZip, { force: true });
try {
  rmSync(destFolder, { recursive: true, force: true });
} catch (err) {
  console.warn(
    `[sync-installer-payload] Could not remove legacy folder ${destFolder} (${err.code || err.message}); continuing.`,
  );
}

createPayloadZip(archiveRoot, destZip);
console.log(`[sync-installer-payload] created ${platform} payload archive`, archiveRoot, '->', destZip);
