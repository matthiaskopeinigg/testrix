/**
 * Copies the platform-specific main-app `dir` build into
 * `installer-shell/resources/payload` for the setup shell extraResources bundle.
 *
 * Usage:
 *   node scripts/sync-installer-payload.mjs --platform=win
 *   node scripts/sync-installer-payload.mjs --platform=linux
 *   node scripts/sync-installer-payload.mjs --platform=mac
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dest = join(root, 'installer-shell', 'resources', 'payload');

function argPlatform() {
  const raw = process.argv.find((arg) => arg.startsWith('--platform='));
  if (raw) return raw.split('=')[1];
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function payloadSource(platform) {
  if (platform === 'win' || platform === 'windows' || platform === 'win32') {
    return { platform: 'win', src: join(root, 'release', 'win-unpacked') };
  }
  if (platform === 'linux') {
    return { platform: 'linux', src: join(root, 'release', 'linux-unpacked') };
  }
  if (platform === 'mac' || platform === 'darwin' || platform === 'macos') {
    const candidates = ['mac-arm64', 'mac-x64', 'mac'];
    for (const dir of candidates) {
      const candidate = join(root, 'release', dir, 'Testrix.app');
      if (existsSync(candidate)) return { platform: 'mac', src: candidate };
    }
    return { platform: 'mac', src: join(root, 'release', 'mac', 'Testrix.app') };
  }
  console.error(`[sync-installer-payload] Unsupported platform: ${platform}`);
  process.exit(1);
}

const { platform, src } = payloadSource(argPlatform());

if (!existsSync(src)) {
  console.error(
    `[sync-installer-payload] Missing ${platform} payload at ${src}. Run the matching payload build first.`,
  );
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
rmSync(dest, { recursive: true, force: true });
if (platform === 'mac') {
  mkdirSync(dest, { recursive: true });
  cpSync(src, join(dest, 'Testrix.app'), { recursive: true });
} else {
  cpSync(src, dest, { recursive: true });
}
console.log(`[sync-installer-payload] copied ${platform} payload`, src, '->', dest);
