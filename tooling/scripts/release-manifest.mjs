#!/usr/bin/env node
// Writes and signs the update manifest for one release. Run by .github/workflows/release.yml.
//
//   node tooling/scripts/release-manifest.mjs --exe release/setup-shell-build/Testrix.exe \
//     [--version 2.1.0] [--tag v2.1.0] [--out release/update] [--current-beta path/beta.json] [--min-version 2.0.0]
//     [--notes-out release/notes.md] [--download-base http://127.0.0.1:4173] [--notes "..."] [--public-key <spki>]
//
// The private key comes from UPDATE_SIGNING_KEY (PKCS#8 PEM) or --key-file.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildManifest,
  changelogSection,
  channelForVersion,
  installerDownloadUrl,
  readStringConstant,
  sha512Base64,
  shouldStableReplaceBeta,
  signManifest,
  verifyManifest,
} from './release-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { values } = parseArgs({
  options: {
    exe: { type: 'string' },
    version: { type: 'string' },
    tag: { type: 'string' },
    out: { type: 'string', default: path.join(root, 'release/update') },
    'current-beta': { type: 'string' },
    'min-version': { type: 'string' },
    'key-file': { type: 'string' },
    'released-at': { type: 'string' },
    'notes-out': { type: 'string' },
    'download-base': { type: 'string' },
    notes: { type: 'string' },
    'public-key': { type: 'string' },
  },
});

function fail(message) {
  console.error(`release-manifest: ${message}`);
  process.exit(1);
}

const version =
  values.version ?? JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const tag = values.tag ?? `v${version}`;
if (tag !== `v${version}`) fail(`tag ${tag} does not match package version ${version}`);
if (!values.exe || !existsSync(values.exe))
  fail(`installer not found: ${values.exe ?? '(pass --exe)'}`);

const contracts = readFileSync(path.join(root, 'packages/contracts/src/update.ts'), 'utf8');
const repository = readStringConstant(contracts, 'UPDATE_REPOSITORY');
const assetName = readStringConstant(contracts, 'UPDATE_ASSET_NAME');
const publicKey = values['public-key'] || readStringConstant(contracts, 'UPDATE_PUBLIC_KEY');

const privateKey = values['key-file']
  ? readFileSync(values['key-file'], 'utf8')
  : process.env.UPDATE_SIGNING_KEY;
if (!privateKey?.includes('PRIVATE KEY'))
  fail('set UPDATE_SIGNING_KEY to the PEM private key from `npm run updater:keygen`');

const bytes = readFileSync(values.exe);
const channel = channelForVersion(version);
const fromChangelog = changelogSection(
  readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'),
  version,
);
const notes =
  values.notes ||
  fromChangelog ||
  (values['download-base'] ? 'Local updater feed. This build is not a GitHub release.' : '');
if (!notes) console.warn(`release-manifest: CHANGELOG has no notes for ${version}`);
if (values['notes-out']) {
  const unsigned =
    '> **Installers.** Windows: `Testrix.exe` (unsigned; SmartScreen may warn). In-app updates are Windows-only and still verify an Ed25519-signed manifest and the SHA-512 of that file. macOS: `Testrix-mac-arm64.dmg` and `Testrix-mac-x64.dmg` (unsigned; Control-click → Open the first time). Linux x64: `Testrix-linux-x64.AppImage` and `Testrix-linux-x64.deb`.\n\n';
  writeFileSync(values['notes-out'], `${unsigned}${notes || `Testrix ${version}`}\n`);
}

const fields = {
  version,
  releasedAt: values['released-at'] ?? new Date().toISOString(),
  notes,
  url: installerDownloadUrl({
    repository,
    tag,
    assetName,
    downloadBase: values['download-base'],
  }),
  sha512: sha512Base64(bytes),
  size: statSync(values.exe).size,
  minVersion: values['min-version'],
};

const channels = [channel];
if (channel === 'stable') {
  const betaPath = values['current-beta'];
  const currentBeta =
    betaPath && existsSync(betaPath) ? JSON.parse(readFileSync(betaPath, 'utf8')).version : null;
  if (shouldStableReplaceBeta(version, currentBeta)) channels.push('beta');
}

mkdirSync(values.out, { recursive: true });
for (const target of channels) {
  const manifest = buildManifest({ ...fields, channel: target });
  const signature = signManifest(manifest, privateKey);
  if (!verifyManifest(manifest, signature, publicKey))
    fail('the signing key does not match UPDATE_PUBLIC_KEY in packages/contracts/src/update.ts');
  writeFileSync(path.join(values.out, `${target}.json`), manifest);
  writeFileSync(path.join(values.out, `${target}.json.sig`), `${signature}\n`);
  console.log(`release-manifest: wrote ${target}.json for ${version}`);
}
