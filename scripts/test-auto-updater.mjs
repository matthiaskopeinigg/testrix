/**
 * Exercises the real in-app auto-updater against published GitHub beta
 * releases (not the design-system simulation).
 *
 * Default: silent-downgrade the installed app to the previous published beta
 * that still ships `Testrix-Setup.*`, then relaunch. Published GitHub builds
 * ignore `TESTRIX_UPDATER_CURRENT_VERSION` (that override is only in this
 * branch until it is packed).
 *
 * Usage:
 *   npm run test:updater
 *   npm run test:updater -- --list
 *   npm run test:updater -- --from v1.0.2-beta.4
 *   npm run test:updater -- --simulate-only
 *
 * Env: GH_TOKEN / GITHUB_TOKEN / TESTRIX_GITHUB_TOKEN (optional, higher API rate).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const LOG = '[test:updater]';
const GITHUB_REPO = 'matthiaskopeinigg/testrix';
const META_FILE = '.install-meta.json';
const CACHE_FILE = 'update-check-cache.json';
const SETTINGS_FILE = 'settings.json';
const SETUP_WAIT_MS = 4 * 60 * 1000;
/** Must match `TESTRIX_UPDATER_CURRENT_VERSION` in the Electron updater. */
const UPDATER_CURRENT_VERSION_ENV = 'TESTRIX_UPDATER_CURRENT_VERSION';
const DEFAULT_SIMULATED_VERSION = '1.0.0-beta.1';

/**
 * @returns {Record<string, string | boolean>}
 */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') {
      out.list = true;
      continue;
    }
    if (arg.startsWith('--from=')) {
      out.from = arg.slice('--from='.length);
      continue;
    }
    if (arg === '--from') {
      out.from = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg.startsWith('--install-dir=')) {
      out.installDir = arg.slice('--install-dir='.length);
      continue;
    }
    if (arg.startsWith('--simulate-version=')) {
      out.simulateVersion = arg.slice('--simulate-version='.length);
      continue;
    }
    if (arg === '--simulate-only') {
      out.simulateOnly = true;
      continue;
    }
  }
  return out;
}

/**
 * @param {string} tag
 */
function normalizeTag(tag) {
  return String(tag || '')
    .replace(/^v/i, '')
    .trim();
}

/**
 * @param {string} version
 */
function isBetaVersion(version) {
  return normalizeTag(version).includes('-');
}

/**
 * @param {string} current
 * @param {string} candidate
 */
function isNewer(current, candidate) {
  const left = normalizeTag(current);
  const right = normalizeTag(candidate);
  if (!left || !right || left === right) {
    return false;
  }

  const split = (value) => {
    const [core, pre] = value.split('-', 2);
    const parts = (core ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0);
    while (parts.length < 3) {
      parts.push(0);
    }
    return { parts: parts.slice(0, 3), pre: pre ?? '' };
  };

  const a = split(left);
  const b = split(right);
  for (let i = 0; i < 3; i += 1) {
    if (a.parts[i] !== b.parts[i]) {
      return b.parts[i] > a.parts[i];
    }
  }
  if (!a.pre && b.pre) {
    return true;
  }
  if (a.pre && !b.pre) {
    return false;
  }
  if (a.pre && b.pre) {
    return b.pre.localeCompare(a.pre, undefined, { numeric: true }) > 0;
  }
  return false;
}

function githubHeaders() {
  const token = (
    process.env.TESTRIX_GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    ''
  ).trim();
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Testrix-Updater-Test',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function setupAssetName() {
  if (process.platform === 'linux') {
    return 'Testrix-Setup.AppImage';
  }
  if (process.platform === 'darwin') {
    return 'Testrix-Setup.dmg';
  }
  return 'Testrix-Setup.exe';
}

function defaultInstallDir() {
  if (process.platform === 'linux') {
    return path.join(os.homedir(), '.local', 'share', 'testrix');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Applications', 'Testrix.app');
  }
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Programs', 'Testrix');
}

function mainExePath(installDir) {
  if (process.platform === 'linux') {
    return path.join(installDir, 'testrix');
  }
  if (process.platform === 'darwin') {
    return path.join(installDir, 'Contents', 'MacOS', 'Testrix');
  }
  return path.join(installDir, 'Testrix.exe');
}

/**
 * @param {string} installDir
 * @returns {string | null}
 */
function readInstalledVersion(installDir) {
  const metaPath = path.join(installDir, META_FILE);
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(metaPath, 'utf8'));
    const version = typeof raw?.version === 'string' ? raw.version.trim() : '';
    return version || null;
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`${LOG} ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function fetchBetaReleases() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`;
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    fail(`GitHub releases failed (${response.status}): ${body.trim() || response.statusText}`);
  }
  const releases = /** @type {Array<{
    tag_name?: string;
    draft?: boolean;
    prerelease?: boolean;
    html_url?: string;
    assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
  }>} */ (await response.json());

  const expected = setupAssetName();
  /** @type {Array<{ version: string; tag: string; url: string; assetName: string; downloadUrl: string; size: number }>} */
  const betas = [];
  for (const release of releases) {
    if (release.draft) {
      continue;
    }
    const tag = String(release.tag_name || '');
    const version = normalizeTag(tag);
    if (!isBetaVersion(version)) {
      continue;
    }
    const asset = (release.assets ?? []).find((entry) => entry.name === expected);
    if (!asset?.browser_download_url) {
      continue;
    }
    betas.push({
      version,
      tag: tag.startsWith('v') ? tag : `v${version}`,
      url: release.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
      assetName: asset.name,
      downloadUrl: asset.browser_download_url,
      size: asset.size ?? 0,
    });
  }

  betas.sort((a, b) => {
    if (isNewer(a.version, b.version)) {
      return -1;
    }
    if (isNewer(b.version, a.version)) {
      return 1;
    }
    return 0;
  });
  return betas;
}

/**
 * @template {{ version: string }} T
 * @param {readonly T[]} releases
 * @returns {T | undefined}
 */
function pickNewest(releases) {
  let newest = releases[0];
  for (const release of releases) {
    if (newest && isNewer(newest.version, release.version)) {
      newest = release;
    }
  }
  return newest;
}

/**
 * Newest published beta that is still older than `latestVersion`.
 *
 * @param {readonly { version: string }[]} releases
 * @param {string} latestVersion
 */
function pickPrevious(releases, latestVersion) {
  /** @type {{ version: string } | undefined} */
  let previous;
  for (const release of releases) {
    // isNewer(current, candidate) is true when candidate > current.
    if (!isNewer(release.version, latestVersion)) {
      continue;
    }
    if (!installCanDownloadHyphenatedSetup(release.version)) {
      continue;
    }
    if (!previous || isNewer(previous.version, release.version)) {
      previous = release;
    }
  }
  return previous;
}

/** `1.0.0-beta.*` looks for `Testrix Setup.exe` and cannot download `Testrix-Setup.exe`. */
function installCanDownloadHyphenatedSetup(version) {
  const tag = normalizeTag(version);
  return !tag.startsWith('1.0.0-');
}

/**
 * @param {string} downloadUrl
 * @param {string} destPath
 * @param {number} expectedSize
 */
async function downloadSetup(downloadUrl, destPath, expectedSize) {
  mkdirSync(path.dirname(destPath), { recursive: true });
  if (existsSync(destPath) && expectedSize > 0 && statSync(destPath).size === expectedSize) {
    console.log(`${LOG} Reusing cached Setup (${destPath})`);
    return;
  }

  console.log(`${LOG} Downloading ${path.basename(destPath)}…`);
  const response = await fetch(downloadUrl, {
    headers: {
      ...githubHeaders(),
      Accept: 'application/octet-stream',
    },
    redirect: 'follow',
  });
  if (!response.ok || !response.body) {
    fail(`Download failed (HTTP ${response.status})`);
  }

  const tmp = `${destPath}.partial`;
  rmSync(tmp, { force: true });
  await pipeline(response.body, createWriteStream(tmp));
  rmSync(destPath, { force: true });
  renameSync(tmp, destPath);
  console.log(`${LOG} Saved ${destPath} (${(statSync(destPath).size / (1024 * 1024)).toFixed(1)} MB)`);
}

function stopRunningApp() {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/F', '/IM', 'Testrix.exe'], { stdio: 'ignore', windowsHide: true });
    spawnSync('taskkill', ['/F', '/IM', 'Testrix Setup.exe'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  spawnSync('pkill', ['-f', 'Testrix'], { stdio: 'ignore' });
}

function userDataRoots() {
  const roots = [];
  if (process.env.APPDATA) {
    roots.push(path.join(process.env.APPDATA, 'Testrix'));
    roots.push(path.join(process.env.APPDATA, 'testrix'));
  }
  roots.push(path.join(os.homedir(), '.config', 'Testrix'));
  roots.push(path.join(os.homedir(), 'Library', 'Application Support', 'Testrix'));
  return [...new Set(roots)];
}

function clearUpdateCache() {
  const files = [];
  for (const root of userDataRoots()) {
    if (!existsSync(root)) {
      continue;
    }
    files.push(path.join(root, CACHE_FILE));
    const profiles = path.join(root, 'profiles');
    if (!existsSync(profiles)) {
      continue;
    }
    for (const entry of readdirSync(profiles, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        files.push(path.join(profiles, entry.name, CACHE_FILE));
      }
    }
  }
  for (const filePath of files) {
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
      console.log(`${LOG} Cleared update cache ${filePath}`);
    }
  }
}

function resolveSettingsPaths() {
  /** @type {string[]} */
  const paths = [];
  if (process.env.TESTRIX_CONFIG_DIR) {
    paths.push(path.join(process.env.TESTRIX_CONFIG_DIR, SETTINGS_FILE));
  }
  for (const userData of userDataRoots()) {
    const anchor = path.join(userData, 'paths.json');
    if (existsSync(anchor)) {
      try {
        const json = JSON.parse(readFileSync(anchor, 'utf8'));
        if (typeof json?.sharedConfigDir === 'string' && json.sharedConfigDir.trim()) {
          paths.push(path.join(json.sharedConfigDir, SETTINGS_FILE));
        }
      } catch {
        // Ignore unreadable anchors.
      }
    }
    paths.push(path.join(userData, SETTINGS_FILE));
  }
  paths.push(path.join(os.homedir(), 'Documents', 'Testrix', SETTINGS_FILE));
  if (process.platform === 'linux') {
    const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    paths.push(path.join(base, 'testrix', SETTINGS_FILE));
  }
  return [...new Set(paths)];
}

/**
 * Beta GitHub releases are never GitHub "Latest". A Stable channel on a beta
 * install 404s `/releases/latest` on older builds.
 */
function ensureBetaUpdateChannel() {
  const settingsPaths = resolveSettingsPaths().filter((filePath) => existsSync(filePath));
  if (settingsPaths.length === 0) {
    console.log(`${LOG} No settings.json found; click Beta in About if the check fails.`);
    return;
  }

  for (const settingsPath of settingsPaths) {
    try {
      const json = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const current = json?.updates?.channel;
      if (current === 'beta') {
        console.log(`${LOG} Update channel is already beta (${settingsPath})`);
        continue;
      }
      json.updates = { ...(json.updates ?? {}), channel: 'beta' };
      writeFileSync(settingsPath, `${JSON.stringify(json, null, 2)}\n`);
      console.log(`${LOG} Set updates.channel=beta in ${settingsPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${LOG} Could not set beta channel in ${settingsPath}: ${message}`);
    }
  }
}

/**
 * @param {string} setupPath
 * @param {string} installDir
 */
function startSilentDowngrade(setupPath, installDir) {
  const env = {
    ...process.env,
    TESTRIX_SILENT_UPDATE: '1',
    TESTRIX_INSTALL_DIR: installDir,
    PORTABLE_EXECUTABLE_FILE: setupPath,
    PORTABLE_EXECUTABLE_DIR: path.dirname(setupPath),
  };
  delete env.TESTRIX_PARENT_PID;
  delete env.TESTRIX_UPDATE_READY_FILE;

  const child = spawn(setupPath, ['--silent-update'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env,
  });
  child.unref();
  console.log(`${LOG} Started silent Setup pid=${child.pid}`);
}

/**
 * @param {string} installDir
 * @param {string} expectedVersion
 */
async function waitForInstalledVersion(installDir, expectedVersion) {
  const started = Date.now();
  const want = normalizeTag(expectedVersion);
  while (Date.now() - started < SETUP_WAIT_MS) {
    const got = readInstalledVersion(installDir);
    if (got && normalizeTag(got) === want) {
      return got;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  fail(
    `Timed out waiting for install meta version ${want} under ${installDir} (now ${readInstalledVersion(installDir) ?? 'unknown'}).`,
  );
}

/**
 * @param {string} installDir
 * @param {string | null} simulatedVersion
 */
function launchInstalledApp(installDir, simulatedVersion) {
  const exe = mainExePath(installDir);
  const env = { ...process.env };
  if (simulatedVersion) {
    env[UPDATER_CURRENT_VERSION_ENV] = simulatedVersion;
  } else {
    delete env[UPDATER_CURRENT_VERSION_ENV];
  }
  const child = spawn(exe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env,
    cwd: installDir,
  });
  child.unref();
  if (simulatedVersion) {
    console.log(`${LOG} Launched ${exe} pid=${child.pid} as ${simulatedVersion}`);
    return;
  }
  console.log(`${LOG} Launched ${exe} pid=${child.pid}`);
}

function printNextSteps(fromVersion, toVersion, simulated) {
  console.log('');
  if (simulated) {
    console.log(`${LOG} Updater will treat this process as ${fromVersion} (env override).`);
    console.log(`${LOG} Settings → About still shows the real installed version.`);
  } else {
    console.log(`${LOG} Installed version is now ${fromVersion}.`);
    console.log(`${LOG} Settings → About should show ${fromVersion}.`);
  }
  console.log(`${LOG} Latest published beta is ${toVersion}.`);
  console.log(`${LOG} In Testrix:`);
  console.log('    1. Settings → About → Check for updates (channel must be Beta)');
  console.log('    2. Download, then Install and restart');
  console.log('    3. Time from Install click until the app is usable again');
  console.log(`${LOG} Watch for: in-app overlay staying up, then Setup "Updating Testrix", then relaunch.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const installDir = String(args.installDir || defaultInstallDir());
  const betas = await fetchBetaReleases();
  if (betas.length === 0) {
    fail(`No published beta releases with ${setupAssetName()} on ${GITHUB_REPO}.`);
  }

  if (args.list) {
    console.log(`${LOG} Published betas with ${setupAssetName()}:`);
    for (const release of betas) {
      console.log(`    ${release.tag}  ${(release.size / (1024 * 1024)).toFixed(1)} MB  ${release.url}`);
    }
    const latestListed = pickNewest(betas);
    const previousListed = latestListed ? pickPrevious(betas, latestListed.version) : undefined;
    if (latestListed && previousListed) {
      console.log(`${LOG} Default update path: ${previousListed.tag}  →  ${latestListed.tag}`);
    }
    return;
  }

  const latest = pickNewest(betas);
  if (!latest) {
    fail('No latest beta release.');
  }

  const simulateOnly = Boolean(args.simulateOnly);
  const simulatedVersion = normalizeTag(String(args.simulateVersion || DEFAULT_SIMULATED_VERSION));
  let fromArg = normalizeTag(String(args.from || ''));
  const exe = mainExePath(installDir);

  if (!existsSync(exe)) {
    fail(`No installed Testrix at ${exe}. Install any beta Setup, then rerun.`);
  }

  if (simulateOnly && fromArg) {
    fail('Use either --simulate-only or --from, not both.');
  }

  if (!simulateOnly && !fromArg) {
    const previous = pickPrevious(betas, latest.version);
    if (!previous) {
      fail(
        `Need two published betas to test an update (latest is ${latest.tag}). Use --simulate-only after packing this branch.`,
      );
    }
    fromArg = normalizeTag(previous.version);
    console.log(
      `${LOG} Published builds ignore ${UPDATER_CURRENT_VERSION_ENV}. Downgrading to ${previous.tag} so Check can offer ${latest.tag}.`,
    );
  }

  if (fromArg && !installCanDownloadHyphenatedSetup(fromArg)) {
    console.warn(
      `${LOG} ${fromArg} looks for "Testrix Setup.exe" and cannot download GitHub's "Testrix-Setup.exe". Prefer --from v1.0.2-beta.4 or later.`,
    );
  }

  if (fromArg) {
    const from = betas.find((release) => normalizeTag(release.version) === fromArg);
    if (!from) {
      fail(`No published beta ${fromArg} with ${setupAssetName()}. Use --list.`);
    }
    if (!isNewer(from.version, latest.version)) {
      fail(`From ${from.tag} is not older than latest ${latest.tag}.`);
    }

    console.log(`${LOG} Update path: ${from.tag}  →  ${latest.tag}`);
    console.log(`${LOG} Install dir: ${installDir}`);

    const dest = path.join(
      os.tmpdir(),
      'testrix-updater-test',
      `Testrix-Setup-${from.version}${path.extname(from.assetName)}`,
    );
    await downloadSetup(from.downloadUrl, dest, from.size);

    const installed = readInstalledVersion(installDir);
    if (normalizeTag(installed ?? '') !== normalizeTag(from.version)) {
      console.log(`${LOG} Current install is ${installed ?? 'unknown'}. Downgrading to ${from.tag}…`);
      stopRunningApp();
      const t0 = Date.now();
      startSilentDowngrade(dest, installDir);
      await waitForInstalledVersion(installDir, from.version);
      console.log(`${LOG} Downgrade finished in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    } else {
      console.log(`${LOG} Already installed ${from.tag}.`);
    }

    stopRunningApp();
    clearUpdateCache();
    ensureBetaUpdateChannel();
    launchInstalledApp(installDir, null);
    printNextSteps(from.version, latest.version, false);
    return;
  }

  console.log(`${LOG} Install dir: ${installDir}`);
  console.log(`${LOG} Simulating updater version ${simulatedVersion} → latest ${latest.tag}`);
  console.log(
    `${LOG} --simulate-only only works after packing this branch. Published GitHub builds ignore the env override.`,
  );

  stopRunningApp();
  clearUpdateCache();
  ensureBetaUpdateChannel();
  launchInstalledApp(installDir, simulatedVersion);
  printNextSteps(simulatedVersion, latest.version, true);
}

main().catch((error) => {
  if (process.exitCode) {
    return;
  }
  console.error(`${LOG} ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
