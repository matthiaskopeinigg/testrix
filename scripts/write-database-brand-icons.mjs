/**
 * Writes single-color official logo silhouettes into `assets/icons/` for
 * sidebar `tx-icon` slots (24×24). Not invoked by `icons:generate`.
 *
 * Sources in `scripts/vendor/database-brands/`:
 *   Simple Icons (CC0) — one-path brand marks
 *   Devicon MySQL dolphin / Redis cube (MIT) — flattened to one fill so the
 *   wordmark and extra colors are dropped
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'scripts', 'vendor', 'database-brands');
const outDir = path.join(root, 'assets', 'icons');

const SLOT = 24;
const PAD = 1.25;

/**
 * @type {readonly { name: string; fill: string }[]}
 */
const ICONS = [
  { name: 'postgresql', fill: '#4169E1' },
  { name: 'mysql', fill: '#4479A1' },
  { name: 'mariadb', fill: '#2A8A96' },
  { name: 'mssql', fill: '#CC2927' },
  { name: 'sqlite', fill: '#0F7FCC' },
  { name: 'redis', fill: '#FF4438' },
  { name: 'mongodb', fill: '#47A248' },
  { name: 'clickhouse', fill: '#FFCC01' },
  { name: 'oracle', fill: '#F80000' },
  { name: 'cockroachdb', fill: '#6933FF' },
];

/**
 * @param {string} svg
 * @returns {{ viewBox: string; inner: string }}
 */
function parseSvg(svg) {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) {
    throw new Error('Vendor SVG is missing viewBox');
  }
  const openEnd = svg.indexOf('>');
  const close = svg.lastIndexOf('</svg>');
  if (openEnd < 0 || close < 0) {
    throw new Error('Vendor SVG is missing <svg> wrappers');
  }
  const inner = svg
    .slice(openEnd + 1, close)
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<defs>[\s\S]*?<\/defs>/gi, '')
    .trim();
  return { viewBox, inner };
}

/**
 * @param {string} viewBox
 * @returns {number}
 */
function viewBoxWidth(viewBox) {
  const parts = viewBox.trim().split(/[\s,]+/);
  const width = Number(parts[2]);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`Invalid viewBox: ${viewBox}`);
  }
  return width;
}

/**
 * Drops white / near-white highlight paths so the mark is one silhouette.
 *
 * @param {string} inner
 * @param {string} fill
 */
function flattenToFill(inner, fill) {
  return inner
    .replace(/fill-opacity="[^"]*"/g, '')
    .replace(/fill="url\([^"]+\)"/g, `fill="${fill}"`)
    .replace(/fill="#fff(?:fff)?"/gi, 'fill="none"')
    .replace(/fill="white"/gi, 'fill="none"')
    .replace(/fill="#[0-9a-fA-F]{3,8}"/g, `fill="${fill}"`)
    .replace(/<(path|ellipse|rect|circle)\b(?![^>]*fill=)/g, `<$1 fill="${fill}"`);
}

/**
 * @param {string} name
 * @param {string} source
 * @param {string} fill
 */
function wrapForTxIcon(name, source, fill) {
  const { viewBox, inner: children } = parseSvg(source);
  const body = flattenToFill(children, fill);
  const width = viewBoxWidth(viewBox);

  if (width === SLOT) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="none" aria-hidden="true">',
      `  <g fill="${fill}" stroke="none">${body}</g>`,
      '</svg>',
      '',
    ].join('\n');
  }

  const scale = (SLOT - PAD * 2) / width;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="none" aria-hidden="true">',
    `  <g fill="${fill}" stroke="none" transform="translate(${PAD} ${PAD}) scale(${scale})">`,
    `    ${body}`,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

await fs.mkdir(outDir, { recursive: true });

for (const icon of ICONS) {
  const source = await fs.readFile(path.join(vendorDir, `${icon.name}.svg`), 'utf8');
  const out = wrapForTxIcon(icon.name, source, icon.fill);
  await fs.writeFile(path.join(outDir, `${icon.name}.svg`), out, 'utf8');
}

console.log(`Wrote ${ICONS.length} single-color database logos to assets/icons`);
