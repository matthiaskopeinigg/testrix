#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const logo = path.join(root, 'assets/brand/logo.svg');

const svgTargets = [
  'apps/desktop/src/splash/assets/logo.svg',
  'apps/desktop/src/error/assets/logo.svg',
  'apps/renderer/src/assets/logo.svg',
  'apps/setup/src/renderer/assets/logo.svg',
];

for (const rel of svgTargets) {
  const dest = path.join(root, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(logo, dest);
}

const svg = readFileSync(logo);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svg)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer(),
  ),
);
const png256 = pngBuffers[pngBuffers.length - 1];
const ico = await pngToIco(pngBuffers);

const pngTargets = [
  'assets/brand/icon.png',
  'build/icon.png',
  'apps/desktop/src/assets/icon.png',
  'apps/setup/src/assets/icon.png',
  'apps/setup/build/icon.png',
];
const icoTargets = [
  'assets/brand/icon.ico',
  'build/icon.ico',
  'apps/desktop/src/assets/icon.ico',
  'apps/setup/src/assets/icon.ico',
  'apps/setup/build/icon.ico',
];

for (const rel of pngTargets) {
  const dest = path.join(root, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, png256);
}
for (const rel of icoTargets) {
  const dest = path.join(root, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, ico);
}

console.log('Synced brand logo and window icons.');
