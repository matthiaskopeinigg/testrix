#!/usr/bin/env node
/**
 * Packs Testrix.exe, serves a GitHub-shaped local release feed, and writes a
 * discovery file so an unpackaged `npm start` checks that feed instead of GitHub.
 *
 *   npm run updater:local
 *   npm run updater:local -- --skip-pack --launch
 */
import { generateKeyPairSync } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { readStringConstant } from './release-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultExe = path.join(root, 'release/setup-shell-build/Testrix.exe');
const repoKey = path.join(root, '.secrets/update-signing-key.pem');

const { values } = parseArgs({
  options: {
    exe: { type: 'string' },
    port: { type: 'string' },
    version: { type: 'string', default: '99.0.0' },
    'skip-pack': { type: 'boolean', default: false },
    launch: { type: 'boolean', default: false },
  },
  strict: false,
});

const contracts = readFileSync(path.join(root, 'packages/contracts/src/update.ts'), 'utf8');
const repository = readStringConstant(contracts, 'UPDATE_REPOSITORY');
const assetName = readStringConstant(contracts, 'UPDATE_ASSET_NAME');
const shippedPublicKey = readStringConstant(contracts, 'UPDATE_PUBLIC_KEY');

const installerPath = path.resolve(values.exe ?? defaultExe);
if (!values['skip-pack']) {
  console.log('updater-local: packing Testrix.exe');
  const pack = spawnSync('npm', ['run', 'electron:pack'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (pack.status !== 0) process.exit(pack.status ?? 1);
} else if (!existsSync(installerPath)) {
  console.error(
    'updater-local: --skip-pack needs a packed installer. Run npm run electron:pack first.',
  );
  process.exit(1);
}
if (!existsSync(installerPath)) {
  console.error(`updater-local: installer not found: ${installerPath}`);
  process.exit(1);
}

const work = path.join(os.tmpdir(), 'testrix-local-releases');
const installDir = path.join(work, 'install');
const profileDir = path.join(work, 'profile');
const manifestDir = path.join(work, 'update');
const discoveryPath = path.join(os.tmpdir(), 'testrix-local-releases.json');
mkdirSync(installDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });
writeFileSync(
  path.join(installDir, '.install-meta.json'),
  `${JSON.stringify({ scope: 'user' })}\n`,
);
const previewSettings = path.join(profileDir, 'configs', 'settings.json');
if (existsSync(previewSettings)) {
  try {
    const raw = JSON.parse(readFileSync(previewSettings, 'utf8'));
    if (raw && typeof raw === 'object') {
      raw.settingsWizardCompleted = true;
      writeFileSync(previewSettings, `${JSON.stringify(raw, null, 2)}\n`);
    }
  } catch {
    // Leave a broken preview profile alone; Settings still opens.
  }
}

const bundle = spawnSync(process.execPath, [path.join(root, 'tooling/scripts/bundle-setup.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (bundle.status !== 0) {
  console.error('updater-local: Setup bundle failed');
  process.exit(bundle.status ?? 1);
}

const installerSize = statSync(installerPath).size;
const installerRoute = `/${repository}/releases/download/v${values.version}/${assetName}`;
/** @type {Map<string, { body: Buffer, type: string }>} */
const routes = new Map();

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url?.split('?')[0] ?? '');
  if (urlPath === installerRoute) {
    sendInstaller(req, res);
    return;
  }
  const route = routes.get(urlPath);
  if (!route) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    'content-type': route.type,
    'content-length': route.body.byteLength,
  });
  res.end(route.body);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(values.port ? Number(values.port) : 0, '127.0.0.1', resolve);
});
const address = server.address();
const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
server.removeAllListeners('error');

const usingRepoKey = existsSync(repoKey);
let publicKeyB64 = shippedPublicKey;
let keyFile = repoKey;
if (!usingRepoKey) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  publicKeyB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  keyFile = path.join(work, 'signing-key.pem');
  writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  console.log(
    'updater-local: no .secrets/update-signing-key.pem; using a throwaway key for this feed',
  );
}

const manifestArgs = [
  path.join(root, 'tooling/scripts/release-manifest.mjs'),
  `--exe=${installerPath}`,
  `--version=${values.version}`,
  `--tag=v${values.version}`,
  `--out=${manifestDir}`,
  `--download-base=${origin}`,
  `--key-file=${keyFile}`,
];
if (!usingRepoKey) manifestArgs.push(`--public-key=${publicKeyB64}`);
const manifest = spawnSync(process.execPath, manifestArgs, { cwd: root, stdio: 'inherit' });
if (manifest.status !== 0) process.exit(manifest.status ?? 1);

for (const channel of ['stable', 'beta']) {
  const json = path.join(manifestDir, `${channel}.json`);
  const sig = `${json}.sig`;
  if (!existsSync(json) || !existsSync(sig)) continue;
  const prefix = `/${repository}/releases/download/updates/${channel}`;
  routes.set(`${prefix}.json`, { body: readFileSync(json), type: 'application/json' });
  routes.set(`${prefix}.json.sig`, { body: readFileSync(sig), type: 'text/plain' });
}

const setupMain = path.join(root, 'apps/setup/dist/main.cjs');
writeFileSync(
  discoveryPath,
  `${JSON.stringify({ origin, publicKey: publicKeyB64, installDir, profileDir, setupMain }, null, 2)}\n`,
);

/**
 * Serves the packed installer from disk, including Range resumes.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function sendInstaller(req, res) {
  const range = /^bytes=(\d*)-(\d*)$/u.exec(req.headers.range ?? '');
  let start = 0;
  let end = installerSize - 1;
  if (range) {
    if (range[1]) start = Number(range[1]);
    if (range[2]) end = Number(range[2]);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start > end ||
      end >= installerSize
    ) {
      res.writeHead(416, { 'content-range': `bytes */${installerSize}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'content-type': 'application/octet-stream',
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${installerSize}`,
      'accept-ranges': 'bytes',
    });
  } else {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': installerSize,
      'accept-ranges': 'bytes',
    });
  }
  createReadStream(installerPath, { start, end }).pipe(res);
}

function removeDiscovery() {
  try {
    unlinkSync(discoveryPath);
  } catch {
    // Already gone.
  }
}

function shutDown(code = 0) {
  removeDiscovery();
  server.close();
  process.exit(code);
}

process.on('SIGINT', () => shutDown(0));
process.on('SIGTERM', () => shutDown(0));

const stableUrl = `${origin}/${repository}/releases/download/updates/stable.json`;
console.log(`updater-local: feed ${stableUrl}`);
console.log(`updater-local: offering ${values.version} (${installerSize} bytes)`);
console.log(`updater-local: throwaway install dir ${installDir}`);
console.log(`updater-local: profile ${profileDir}`);
console.log('updater-local: run npm start (or npm run dev), then Settings → Updates → Check now.');
if (!values.launch) {
  console.log('updater-local: leave this process running. Ctrl+C stops the feed.');
} else {
  const env = {
    ...process.env,
    TESTRIX_UPDATE_FEED: origin,
    TESTRIX_UPDATE_PUBLIC_KEY: publicKeyB64,
    TESTRIX_UPDATE_INSTALL_DIR: installDir,
    TESTRIX_USER_DATA_DIR: profileDir,
    TESTRIX_NO_SPLASH: '1',
    TESTRIX_UPDATE_SETUP_MAIN: setupMain,
  };
  console.log('updater-local: launching the local app');
  const child = spawn(process.execPath, [path.join(root, 'tooling/scripts/serve-desktop.mjs')], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  child.on('exit', (code) => shutDown(code ?? 0));
}
