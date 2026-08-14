/**
 * Ensures a Windows `dir` payload contains the full Electron runtime.
 * Incomplete folders (e.g. file-locked partial rebuilds) cause ICU startup failures.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveWinUnpackedDir } from './win-payload-build-path.mjs';

/** @param {string} winUnpacked */
export function verifyWinPayload(winUnpacked) {
  const requiredFiles = [
    'Testrix.exe',
    'icudtl.dat',
    'ffmpeg.dll',
    'libEGL.dll',
    'libGLESv2.dll',
    'resources.pak',
    'chrome_100_percent.pak',
    'chrome_200_percent.pak',
    'snapshot_blob.bin',
    'v8_context_snapshot.bin',
    join('resources', 'app.asar'),
  ];

  const missing = requiredFiles.filter((rel) => !existsSync(join(winUnpacked, rel)));
  const localesDir = join(winUnpacked, 'locales');
  const localesOk = existsSync(localesDir) && readdirSync(localesDir).some((name) => name.endsWith('.pak'));

  if (!localesOk) {
    missing.push('locales/*.pak');
  }

  return { ok: missing.length === 0, missing, winUnpacked };
}

function main() {
  const { ok, missing, winUnpacked } = verifyWinPayload(resolveWinUnpackedDir());

  if (ok) {
    console.log(`[verify-win-payload] ok ${winUnpacked}`);
    return;
  }

  console.error(`[verify-win-payload] Incomplete Windows payload: ${winUnpacked}`);
  for (const rel of missing) {
    console.error(`  missing: ${rel}`);
  }
  console.error(
    '[verify-win-payload] Close running Testrix / Testrix Setup windows and File Explorer on release\\win-unpacked, then rerun npm run electron:pack.',
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
