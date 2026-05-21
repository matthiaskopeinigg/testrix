#!/usr/bin/env node
/**
 * Copies canonical SVG branding into Electron static dirs + Angular `public`,
 * renders ICO masters for electron-builder,
 * emits NSIS BMP assets (electron-builder sizing).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'assets', 'brand');

const DESTINATIONS_REL = ['electron/splash/assets', 'electron/error/assets', 'public/brand'];

const WINDOWS_ASSETS_DIR = path.join(root, 'build', 'installer', 'windows', 'assets');
const ICONS_OUT = path.join(root, 'build', 'icons');

const LOGO_PRIMARY = path.join(assetsDir, 'logo.svg');
const LOGO_DARK = path.join(assetsDir, 'logo-dark.svg');

async function sha256(pathname) {
  try {
    const buf = await fs.readFile(pathname);
    const h = crypto.createHash('sha256');
    h.update(buf);
    return h.digest('hex');
  } catch {
    return null;
  }
}

async function copyChanged(srcAbs, dstAbs) {
  await fs.mkdir(path.dirname(dstAbs), { recursive: true });
  const srcHash = await sha256(srcAbs);
  const dstHash = await sha256(dstAbs);
  if (srcHash && dstHash && srcHash === dstHash) {
    return false;
  }
  await fs.copyFile(srcAbs, dstAbs);
  return true;
}

/**
 * BMP 24-bit, bottom-up raster, no color table.
 *
 * `rgbTopDown`: length `width * height * 3`, RGB, top row first.
 */
function bmp24(rgbTopDown, width, height) {
  const rowStride = Math.floor((width * 3 + 3) / 4) * 4;
  const imageSize = rowStride * height;
  const raster = Buffer.alloc(imageSize);

  let out = 0;
  /** Bottom row first */
  for (let y = height - 1; y >= 0; y -= 1) {
    let inRow = y * width * 3;

    for (let x = 0; x < width; x += 1) {
      const i = inRow + x * 3;
      const r = rgbTopDown[i];
      const g = rgbTopDown[i + 1];
      const b = rgbTopDown[i + 2];
      raster[out++] = b;
      raster[out++] = g;
      raster[out++] = r;
    }

    const pad = rowStride - width * 3;
    for (let p = 0; p < pad; p += 1) {
      raster[out++] = 0;
    }
  }

  const header = Buffer.alloc(54);
  header.write('BM', 0);
  header.writeUInt32LE(54 + imageSize, 2); /** bfSize */

  header.writeUInt32LE(0, 6);
  header.writeUInt32LE(54, 10);

  header.writeUInt32LE(40, 14); /** biSize */

  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22); /** positive bottom-up bitmap */

  header.writeUInt16LE(1, 26); /** planes */
  header.writeUInt16LE(24, 28); /** bitCount */
  header.writeUInt32LE(0, 30); /** compression */
  header.writeUInt32LE(imageSize, 34); /** image size */
  header.writeUInt32LE(2835, 38); /** X ppm */
  header.writeUInt32LE(2835, 42); /** Y ppm */
  header.writeUInt32LE(0, 46);
  header.writeUInt32LE(0, 50);

  return Buffer.concat([header, raster]);
}

async function renderSvgBmp(svgPath, width, height, outPath) {
  const svg = await fs.readFile(svgPath);
  const raster = await sharp(svg)
    .resize({
      width,
      height,
      fit: 'contain',
      background: { r: 15, g: 18, b: 22, alpha: 1 },
    })
    .flatten({ background: { r: 15, g: 18, b: 22 } })
    .raw({
      depth: 'uchar',
    })
    .toBuffer({ resolveWithObject: true });

  if (raster.info.width !== width || raster.info.height !== height) {
    throw new Error(`Unexpected raster dimensions ${raster.info.width}x${raster.info.height} (wanted ${width}x${height}).`);
  }
  if (raster.info.channels !== 3) {
    throw new Error(`Unexpected channel count (${raster.info.channels}). Expected RGB.`);
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, bmp24(raster.data, width, height));
}

async function renderIco(svgPath, sizes) {
  const svg = await fs.readFile(svgPath);
  const pngs = [];

  for (const dim of sizes) {
    pngs.push(
      await sharp(svg)
        .resize(dim, dim, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
  }

  await fs.mkdir(ICONS_OUT, { recursive: true });
  await fs.writeFile(path.join(ICONS_OUT, 'icon.ico'), await pngToIco(pngs));
}

async function renderIconPng(svgPath) {
  await fs.mkdir(ICONS_OUT, { recursive: true });
  const svg = await fs.readFile(svgPath);
  const png = await sharp(svg).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({
    compressionLevel: 9,
  }).toBuffer();
  await fs.writeFile(path.join(ICONS_OUT, 'icon-1024.png'), png);
}

async function exists(pathname) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(LOGO_PRIMARY))) {
    console.error(`[sync-brand] Missing required file: ${LOGO_PRIMARY}`);
    process.exitCode = 1;
    return;
  }

  for (const rel of DESTINATIONS_REL) {
    await copyChanged(LOGO_PRIMARY, path.join(root, rel, 'logo.svg'));

    if (await exists(LOGO_DARK)) {
      await copyChanged(LOGO_DARK, path.join(root, rel, 'logo-dark.svg'));
    } else {
      await copyChanged(LOGO_PRIMARY, path.join(root, rel, 'logo-dark.svg'));
    }
  }

  /** NSIS images (electron-builder defaults) */

  await renderSvgBmp(LOGO_PRIMARY, 164, 314, path.join(WINDOWS_ASSETS_DIR, 'installer-sidebar.bmp'));
  await renderSvgBmp(LOGO_PRIMARY, 150, 57, path.join(WINDOWS_ASSETS_DIR, 'installer-header.bmp'));
  await renderSvgBmp(LOGO_PRIMARY, 164, 314, path.join(WINDOWS_ASSETS_DIR, 'uninstaller-sidebar.bmp'));

  await renderIco(LOGO_PRIMARY, [16, 24, 32, 48, 64, 128, 256]);
  await renderIconPng(LOGO_PRIMARY);

  console.info('[sync-brand] Finished');
}

void main();
