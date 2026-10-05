#!/usr/bin/env node
// Sets one version across the root and every workspace package.json, and moves the
// CHANGELOG's Unreleased notes under the new version.
//
//   npm run release:bump -- 2.1.0
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bumpPackageJson, parseVersion, releaseChangelog } from './release-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!parseVersion(version)) {
  console.error('Usage: npm run release:bump -- <version>   (for example 2.1.0 or 2.1.0-beta.1)');
  process.exit(1);
}

const manifests = [path.join(root, 'package.json')];
for (const group of ['apps', 'packages']) {
  for (const name of readdirSync(path.join(root, group))) {
    const file = path.join(root, group, name, 'package.json');
    if (existsSync(file)) manifests.push(file);
  }
}

for (const file of manifests) {
  writeFileSync(file, bumpPackageJson(readFileSync(file, 'utf8'), version));
  console.log(`bump-version: ${path.relative(root, file)} -> ${version}`);
}

const changelogPath = path.join(root, 'CHANGELOG.md');
const today = new Date().toISOString().slice(0, 10);
writeFileSync(changelogPath, releaseChangelog(readFileSync(changelogPath, 'utf8'), version, today));
console.log(`bump-version: CHANGELOG.md has a ${version} section dated ${today}`);
console.log('Next: npm install --package-lock-only, commit, then tag v' + version);
