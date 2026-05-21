/**
 * Renders NSIS Modern UI BMP branding (sidebar + header + uninstall sidebar) using the
 * installer-shell visual language from api-workbench (dark elevated panels + warm accent).
 */

import { Jimp } from 'jimp';
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const logoSvgPath = join(root, 'public', 'brand', 'logo.svg');
const outDir = join(root, 'build', 'installer', 'windows', 'assets');

const SIDEBAR_W = 164;
const SIDEBAR_H = 314;
const HEADER_W = 150;
const HEADER_H = 57;

const INSTALL_ACCENT = '#ff9d3b';
const UNINSTALL_ACCENT = '#f97316';

/** @param {Buffer} pngBuffer @param {string} outPath */
async function writeBmp(pngBuffer, outPath) {
  const img = await Jimp.read(pngBuffer);
  await img.write(outPath);
}

async function buildSidebar(options) {
  const { accent, footerLine1, footerLine2 } = options;

  const sidebarSvg = `
<svg width="${SIDEBAR_W}" height="${SIDEBAR_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e1e22"/>
      <stop offset="55%" stop-color="#18181b"/>
      <stop offset="100%" stop-color="#121214"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="40%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${SIDEBAR_W}" height="${SIDEBAR_H}" fill="url(#sb)"/>
  <rect x="0" y="0" width="48" height="${SIDEBAR_H}" fill="url(#shine)"/>
  <rect x="${SIDEBAR_W - 4}" y="0" width="4" height="${SIDEBAR_H}" fill="${accent}"/>
  <text x="${SIDEBAR_W / 2}" y="${SIDEBAR_H - 28}" text-anchor="middle" fill="#c4c4ca" font-family="Segoe UI, Segoe UI Variable, system-ui, sans-serif" font-size="11" font-weight="600">${footerLine1}</text>
  <text x="${SIDEBAR_W / 2}" y="${SIDEBAR_H - 12}" text-anchor="middle" fill="#8d8d92" font-family="Segoe UI, Segoe UI Variable, system-ui, sans-serif" font-size="9">${footerLine2}</text>
</svg>`.trim();

  const sidebarBase = await sharp(Buffer.from(sidebarSvg)).png().toBuffer();

  const logoMax = 118;
  let logoBuf;
  try {
    const svg = await readFile(logoSvgPath);
    logoBuf = await sharp(svg)
      .resize(logoMax, logoMax, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    logoBuf = await sharp({
      create: {
        width: logoMax,
        height: logoMax,
        channels: 4,
        background: { r: 32, g: 34, b: 42, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  }

  const meta = await sharp(logoBuf).metadata();
  const lw = meta.width ?? logoMax;
  const lh = meta.height ?? logoMax;
  const left = Math.round((SIDEBAR_W - lw) / 2);
  const top = Math.round((SIDEBAR_H - lh) / 2 - 18);

  return sharp(sidebarBase).composite([{ input: logoBuf, left, top }]).png().toBuffer();
}

async function buildInstallerHeader() {
  const headerSvg = `
<svg width="${HEADER_W}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hd" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#232328"/>
      <stop offset="100%" stop-color="#1a1a1d"/>
    </linearGradient>
  </defs>
  <rect width="${HEADER_W}" height="${HEADER_H}" fill="url(#hd)"/>
  <rect x="0" y="${HEADER_H - 3}" width="${HEADER_W}" height="3" fill="${INSTALL_ACCENT}"/>
  <text x="52" y="24" fill="#f3f3f3" font-family="Segoe UI, Segoe UI Variable, system-ui, sans-serif" font-size="13" font-weight="600">Testrix</text>
  <text x="52" y="40" fill="#cccccc" font-family="Segoe UI, Segoe UI Variable, system-ui, sans-serif" font-size="10">Setup</text>
</svg>`.trim();

  const headerBase = await sharp(Buffer.from(headerSvg)).png().toBuffer();

  let iconSmall;
  try {
    const svg = await readFile(logoSvgPath);
    iconSmall = await sharp(svg)
      .resize(34, 34, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    iconSmall = await sharp({
      create: { width: 34, height: 34, channels: 4, background: INSTALL_ACCENT },
    })
      .png()
      .toBuffer();
  }

  return sharp(headerBase)
    .composite([{ input: iconSmall, left: 10, top: Math.round((HEADER_H - 34) / 2) }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const installerSidebar = await buildSidebar({
    accent: INSTALL_ACCENT,
    footerLine1: 'TESTRIX',
    footerLine2: 'Desktop shell - local-first',
  });
  await writeBmp(installerSidebar, join(outDir, 'installer-sidebar.bmp'));

  const uninstallerSidebar = await buildSidebar({
    accent: UNINSTALL_ACCENT,
    footerLine1: 'TESTRIX',
    footerLine2: 'Remove from this PC',
  });
  await writeBmp(uninstallerSidebar, join(outDir, 'uninstaller-sidebar.bmp'));

  const headerPng = await buildInstallerHeader();
  await writeBmp(headerPng, join(outDir, 'installer-header.bmp'));

  console.log('[installer:windows-assets] wrote NSIS BMP assets to', outDir);
}

void main().catch((err) => {
  console.error('[installer:windows-assets]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
