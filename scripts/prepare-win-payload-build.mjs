/**
 * Stops running Testrix processes and picks a writable electron-builder output dir.
 * Falls back to `release/.payload-build` when `release/win-unpacked` is file-locked.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const manifestPath = join(releaseDir, '.win-payload-build.json');

/**
 * @param {string} dir
 * @returns {boolean}
 */
function tryRemoveDir(dir) {
  if (!existsSync(dir)) {
    return true;
  }
  try {
    rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} dir
 * @returns {boolean}
 */
function isCompleteWinUnpacked(dir) {
  return (
    existsSync(join(dir, 'Testrix.exe')) &&
    existsSync(join(dir, 'icudtl.dat')) &&
    existsSync(join(dir, 'resources', 'app.asar'))
  );
}

function stopPackagedTestrixProcesses() {
  if (process.platform !== 'win32') {
    return;
  }
  for (const imageName of ['Testrix.exe', 'Testrix Setup.exe']) {
    try {
      execFileSync('taskkill', ['/F', '/IM', imageName, '/T'], { stdio: 'ignore' });
    } catch {
      // Process was not running.
    }
  }
}

stopPackagedTestrixProcesses();

mkdirSync(releaseDir, { recursive: true });

const defaultOutputDir = releaseDir;
const defaultUnpacked = join(defaultOutputDir, 'win-unpacked');
let outputDir = defaultOutputDir;

if (existsSync(defaultUnpacked) && !tryRemoveDir(defaultUnpacked)) {
  outputDir = join(releaseDir, '.payload-build');
  if (!tryRemoveDir(outputDir)) {
    console.error(
      '[prepare-win-payload-build] Cannot write payload output.\n' +
        'Close any running Testrix / Testrix Setup windows, close File Explorer on release\\win-unpacked, then retry.',
    );
    process.exit(1);
  }
  console.warn(
    '[prepare-win-payload-build] release/win-unpacked is locked; building to release/.payload-build/win-unpacked instead.',
  );
} else if (existsSync(defaultUnpacked) && !isCompleteWinUnpacked(defaultUnpacked)) {
  outputDir = join(releaseDir, '.payload-build');
  tryRemoveDir(outputDir);
  console.warn(
    '[prepare-win-payload-build] release/win-unpacked is incomplete; building to release/.payload-build/win-unpacked instead.',
  );
}

const winUnpacked = join(outputDir, 'win-unpacked');
const manifest = {
  outputDir,
  winUnpacked,
  testrixExe: join(winUnpacked, 'Testrix.exe'),
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`[prepare-win-payload-build] output ${winUnpacked}`);
