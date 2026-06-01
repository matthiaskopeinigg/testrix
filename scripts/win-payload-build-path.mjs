/**
 * Resolves paths for the latest Windows payload (`dir`) build.
 * Written by `prepare-win-payload-build.mjs` before electron-builder runs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'release', '.win-payload-build.json');

/** @typedef {{ outputDir: string, winUnpacked: string, testrixExe: string }} WinPayloadBuildManifest */

/**
 * @returns {WinPayloadBuildManifest}
 */
export function readWinPayloadBuildManifest() {
  if (existsSync(manifestPath)) {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  }

  const winUnpacked = join(root, 'release', 'win-unpacked');
  return {
    outputDir: join(root, 'release'),
    winUnpacked,
    testrixExe: join(winUnpacked, 'Testrix.exe'),
  };
}

/**
 * @returns {string}
 */
export function resolveWinUnpackedDir() {
  return readWinPayloadBuildManifest().winUnpacked;
}

/**
 * @returns {string}
 */
export function resolveWinPayloadOutputDir() {
  return readWinPayloadBuildManifest().outputDir;
}

/**
 * @returns {string}
 */
export function resolvePackagedTestrixExe() {
  return readWinPayloadBuildManifest().testrixExe;
}
