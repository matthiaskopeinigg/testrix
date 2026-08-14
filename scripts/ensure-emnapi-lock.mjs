/**
 * Keeps Linux CI optional deps in package-lock.json.
 *
 * `npm install` on Windows omits platform-specific optional packages such as
 * `@emnapi/core` and `@emnapi/runtime`, which breaks `npm ci` on Ubuntu runners.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'package-lock.json');

/** @type {Record<string, object>} */
const REQUIRED_OPTIONAL_PACKAGES = {
  'node_modules/@emnapi/core': {
    version: '1.10.0',
    resolved: 'https://registry.npmjs.org/@emnapi/core/-/core-1.10.0.tgz',
    integrity:
      'sha512-yq6OkJ4p82CAfPl0u9mQebQHKPJkY7WrIuk205cTYnYe+k2Z8YBh11FrbRG/H6ihirqcacOgl2BIO8oyMQLeXw==',
    license: 'MIT',
    optional: true,
    dependencies: {
      '@emnapi/wasi-threads': '1.2.1',
      tslib: '^2.4.0',
    },
  },
  'node_modules/@emnapi/runtime': {
    version: '1.10.0',
    resolved: 'https://registry.npmjs.org/@emnapi/runtime/-/runtime-1.10.0.tgz',
    integrity:
      'sha512-ewvYlk86xUoGI0zQRNq/mC+16R1QeDlKQy21Ki3oSYXNgLb45GV1P6A0M+/s6nyCuNDqe5VpaY84BzXGwVbwFA==',
    license: 'MIT',
    optional: true,
    dependencies: {
      tslib: '^2.4.0',
    },
  },
};

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
let changed = false;

for (const [key, entry] of Object.entries(REQUIRED_OPTIONAL_PACKAGES)) {
  if (lock.packages[key]) {
    continue;
  }
  lock.packages[key] = entry;
  changed = true;
}

const rootOptional = lock.packages['']?.optionalDependencies ?? {};
for (const pkg of ['@emnapi/core', '@emnapi/runtime']) {
  if (rootOptional[pkg] === '1.10.0') {
    continue;
  }
  lock.packages[''] ??= { name: 'testrix' };
  lock.packages[''].optionalDependencies ??= {};
  lock.packages[''].optionalDependencies[pkg] = '1.10.0';
  changed = true;
}

if (!changed) {
  console.log('[ensure-emnapi-lock] ok');
  process.exit(0);
}

writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log('[ensure-emnapi-lock] restored @emnapi optional lock entries');
