/**
 * Keeps Linux CI optional deps in package-lock.json.
 *
 * `npm install` on Windows omits platform-specific optional packages such as
 * `@emnapi/core` and `@emnapi/runtime`, which breaks `npm ci` on Ubuntu runners.
 *
 * Versions are taken from `package.json` `optionalDependencies` so Dependabot
 * bumps stay consistent with the lockfile.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'package-lock.json');
const packagePath = join(root, 'package.json');

const OPTIONAL_NAMES = ['@emnapi/core', '@emnapi/runtime'];

/**
 * @param {string} name
 * @param {string} version
 * @returns {Promise<Record<string, unknown>>}
 */
async function fetchPackument(name, version) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${name}@${version}: ${res.status}`);
  }
  return /** @type {Record<string, unknown>} */ (await res.json());
}

/**
 * @param {Record<string, unknown>} meta
 * @param {boolean} optional
 */
function toLockEntry(meta, optional) {
  const dist = /** @type {{ tarball: string; integrity: string }} */ (meta['dist']);
  const dependencies = meta['dependencies'];
  /** @type {Record<string, unknown>} */
  const entry = {
    version: meta['version'],
    resolved: dist.tarball,
    integrity: dist.integrity,
    license: meta['license'] ?? 'MIT',
  };
  if (optional) {
    entry.optional = true;
  }
  if (dependencies && typeof dependencies === 'object' && Object.keys(dependencies).length > 0) {
    entry.dependencies = dependencies;
  }
  return entry;
}

/**
 * @param {Record<string, unknown>} lock
 * @param {string} name
 * @param {string} version
 * @param {boolean} optional
 * @returns {Promise<boolean>}
 */
async function ensureLockPackage(lock, name, version, optional) {
  const packages = /** @type {Record<string, Record<string, unknown>>} */ (lock['packages']);
  const key = `node_modules/${name}`;
  const existing = packages[key];
  if (existing?.['version'] === version && typeof existing['integrity'] === 'string') {
    return false;
  }
  const meta = await fetchPackument(name, version);
  packages[key] = toLockEntry(meta, optional);
  return true;
}

/**
 * @param {unknown} range
 * @returns {range is string}
 */
function isExactVersion(range) {
  return typeof range === 'string' && /^\d+\.\d+\.\d+$/.test(range);
}

async function main() {
  const pkgJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  let changed = false;

  lock.packages ??= {};
  lock.packages[''] ??= { name: pkgJson.name };
  lock.packages[''].optionalDependencies ??= {};

  const wanted = pkgJson.optionalDependencies ?? {};

  for (const name of OPTIONAL_NAMES) {
    const version = wanted[name];
    if (typeof version !== 'string' || version.length === 0) {
      continue;
    }

    if (lock.packages[''].optionalDependencies[name] !== version) {
      lock.packages[''].optionalDependencies[name] = version;
      changed = true;
    }

    if (await ensureLockPackage(lock, name, version, true)) {
      changed = true;
    }

    const entry = lock.packages[`node_modules/${name}`];
    const dependencies = entry?.dependencies ?? {};
    for (const [depName, depRange] of Object.entries(dependencies)) {
      if (depName === 'tslib' || !isExactVersion(depRange)) {
        continue;
      }
      if (await ensureLockPackage(lock, depName, depRange, true)) {
        changed = true;
      }
    }
  }

  if (!changed) {
    console.log('[ensure-emnapi-lock] ok');
    return;
  }

  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log('[ensure-emnapi-lock] restored @emnapi optional lock entries');
}

main().catch((error) => {
  console.error('[ensure-emnapi-lock]', error);
  process.exit(1);
});
