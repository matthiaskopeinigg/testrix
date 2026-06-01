/**
 * Creates a single-file installer: thin setup shell + appended payload.zip.
 *
 * - Windows: portable `.exe` + append → `release/Testrix Setup.exe`
 * - Linux: AppImage + append → `release/Testrix Setup.AppImage`
 * - macOS: append to setup `.app` binary, then `hdiutil` → `release/Testrix Setup.dmg`
 */
import { cpSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendPayloadToInstaller } from './installer-appended-payload.mjs';
import {
  INSTALLER_PRODUCT_NAME,
  resolveInstallerPayloadZip,
  resolveMacSetupAppBundleDir,
  resolveMacSetupHostBinary,
  resolveReleaseDir,
  resolveShippedInstaller,
  resolveThinLinuxAppImage,
  resolveThinWindowsPortable,
} from './installer-release-paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_HOST_BYTES = 5 * 1024 * 1024;

function argPlatform() {
  const raw = process.argv.find((arg) => arg.startsWith('--platform='));
  if (raw) {
    return raw.split('=')[1];
  }
  if (process.platform === 'win32') {
    return 'win';
  }
  if (process.platform === 'darwin') {
    return 'mac';
  }
  return 'linux';
}

function fail(message) {
  console.error(`[finalize-installer] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed (exit ${result.status ?? 'unknown'})`);
  }
}

/**
 * @param {string} platform
 */
async function finalizeWindows() {
  const host = resolveThinWindowsPortable();
  const dest = resolveShippedInstaller('win');

  if (!existsSync(host)) {
    fail(`Missing thin portable at ${host}. Run electron:build:win:setup first.`);
  }

  if (statSync(host).size < MIN_HOST_BYTES) {
    fail(`Portable shell looks incomplete: ${host}`);
  }

  const payloadZip = resolveInstallerPayloadZip();
  const staging = `${dest}.staging`;

  rmSync(staging, { force: true });
  await appendPayloadToInstaller(host, payloadZip, staging);

  try {
    rmSync(dest, { force: true });
    cpSync(staging, dest);
    rmSync(staging, { force: true });
  } catch (err) {
    if (err && err.code === 'EBUSY') {
      fail(
        `Could not replace ${dest} — close Testrix Setup and rerun finalize. ` +
          `Staged installer written to ${staging}`,
      );
    }
    throw err;
  }

  logResult(dest);
}

/**
 * @param {string} platform
 */
async function finalizeLinux() {
  const host = resolveThinLinuxAppImage();
  const dest = resolveShippedInstaller('linux');

  if (!existsSync(host)) {
    fail(`Missing AppImage at ${host}. Run electron:build:linux:setup first.`);
  }

  rmSync(dest, { force: true });
  await appendPayloadToInstaller(host, resolveInstallerPayloadZip(), dest);
  run('chmod', ['+x', dest]);
  logResult(dest);
}

/**
 * @param {string} platform
 */
async function finalizeMac() {
  const hostBinary = resolveMacSetupHostBinary();
  const bundleDir = resolveMacSetupAppBundleDir();
  const destDmg = resolveShippedInstaller('mac');
  const stagedBundle = join(resolveReleaseDir(), `${INSTALLER_PRODUCT_NAME}.app`);
  const stagedBinary = join(stagedBundle, 'Contents', 'MacOS', INSTALLER_PRODUCT_NAME);

  if (!existsSync(hostBinary)) {
    fail(`Missing setup app binary at ${hostBinary}. Run electron:build:mac:setup first.`);
  }

  rmSync(stagedBundle, { recursive: true, force: true });
  cpSync(bundleDir, stagedBundle, { recursive: true });
  await appendPayloadToInstaller(stagedBinary, resolveInstallerPayloadZip(), stagedBinary);

  rmSync(destDmg, { force: true });
  run('hdiutil', [
    'create',
    '-volname',
    INSTALLER_PRODUCT_NAME,
    '-srcfolder',
    stagedBundle,
    '-ov',
    '-format',
    'UDZO',
    destDmg,
  ]);

  logResult(destDmg);
}

function logResult(dest) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || '0.0.0';
  const payloadMb = (statSync(resolveInstallerPayloadZip()).size / (1024 * 1024)).toFixed(1);
  const totalMb = (statSync(dest).size / (1024 * 1024)).toFixed(1);
  console.log(`[finalize-installer] ok ${dest} (v${version}, ${totalMb} MB total, +${payloadMb} MB payload)`);
}

const platform = argPlatform();
const payloadZip = resolveInstallerPayloadZip();

if (!existsSync(payloadZip)) {
  fail(`Missing ${payloadZip}. Run sync-installer-payload first.`);
}

if (platform === 'win' || platform === 'windows' || platform === 'win32') {
  await finalizeWindows();
} else if (platform === 'linux') {
  await finalizeLinux();
} else if (platform === 'mac' || platform === 'darwin' || platform === 'macos') {
  await finalizeMac();
} else {
  fail(`Unsupported platform: ${platform}`);
}
