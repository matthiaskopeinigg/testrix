#!/usr/bin/env node
// Creates the Ed25519 key pair that signs update manifests. The public key is written into
// packages/contracts/src/update.ts; the private key goes to .secrets/ (git-ignored) so it
// can be pasted into the UPDATE_SIGNING_KEY GitHub secret.
//
//   npm run updater:keygen            refuses to replace an existing key
//   npm run updater:keygen -- --force rotates the key (older builds reject new manifests)
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeStringConstant } from './release-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const contractsPath = path.join(root, 'packages/contracts/src/update.ts');
const secretPath = path.join(root, '.secrets/update-signing-key.pem');
const force = process.argv.includes('--force');

if (existsSync(secretPath) && !force) {
  console.error(
    `updater-keygen: ${path.relative(root, secretPath)} already exists. Pass --force to rotate the key.`,
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

mkdirSync(path.dirname(secretPath), { recursive: true });
writeFileSync(secretPath, privatePem, { mode: 0o600 });
writeFileSync(
  contractsPath,
  writeStringConstant(readFileSync(contractsPath, 'utf8'), 'UPDATE_PUBLIC_KEY', publicBase64),
);

console.log(`updater-keygen: public key written to ${path.relative(root, contractsPath)}`);
console.log(`updater-keygen: private key written to ${path.relative(root, secretPath)}`);
console.log(
  "Next: add that file's contents as the UPDATE_SIGNING_KEY repository secret, keep an offline backup, then delete it.",
);
