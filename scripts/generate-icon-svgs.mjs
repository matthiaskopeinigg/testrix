#!/usr/bin/env node
/**
 * Emits stroke UI icons as standalone SVG files from the canonical path registry.
 * Source keys match `TxIconName`; files use kebab-case under `assets/icons/`.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets', 'icons');

/** @type {Record<string, string>} */
const TX_ICON_PATHS = {
  minimize: '<path d="M5 12h14" stroke-linecap="round"/>',
  maximize:
    '<rect x="5" y="5" width="14" height="14" rx="1" stroke-linecap="round" stroke-linejoin="round"/>',
  maximizeRestore:
    '<path d="M8 8h9v9H8z" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 16H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" stroke-linecap="round" stroke-linejoin="round"/>',
  close:
    '<path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" stroke-linejoin="round"/>',

  /** Heroicons cog-6-tooth (outline) — reads clearly as settings at 18px (Lucide cog looked like chain links). */
  settings:
    '<path d="M9.594 3.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.18.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22l-1.92 3.32c-.12.22-.07.47.12.61l2.03 1.58c-.05.31-.08.63-.08.94s.03.63.08.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.03-1.58z" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" stroke-linecap="round" stroke-linejoin="round"/>',
  development:
    '<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 7l-2 10" stroke-linecap="round" stroke-linejoin="round"/>',
  testing:
    '<path d="M10 3h4l1 9.5a4.5 4.5 0 1 1-6 0L10 3z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 17h6" stroke-linecap="round"/>',
  help:
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.25a2.75 2.75 0 1 1 5 1.5c0 2-2.75 1.75-2.75 3.75" stroke-linecap="round"/><circle cx="12" cy="17.5" r=".75" fill="currentColor" stroke="none"/>',
  interceptor:
    '<path d="M4 6h16M7 12h10M10 18h4" stroke-linecap="round"/><path d="M18 6l3 3-3 3M6 18 3 15l3-3" stroke-linecap="round" stroke-linejoin="round"/>',

  home: '<path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" stroke-linecap="round" stroke-linejoin="round"/>',
  search:
    '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5" stroke-linecap="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round"/>',
  filter:
    '<path d="M4 6h16l-6 7v5l-2 2v-7L4 6z" stroke-linecap="round" stroke-linejoin="round"/>',
  moreHorizontal:
    '<circle cx="6" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.25" fill="currentColor" stroke="none"/>',
  moreVertical:
    '<circle cx="12" cy="6" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.25" fill="currentColor" stroke="none"/>',

  chevronLeft: '<path d="M14 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronRight: '<path d="M10 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronUp: '<path d="M6 14l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronDown: '<path d="M6 10l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>',

  plus: '<path d="M12 5v14M5 12h14" stroke-linecap="round"/>',
  minus: '<path d="M5 12h14" stroke-linecap="round"/>',
  edit: '<path d="M12 20h9M16.5 5.5l2 2L8 18H6v-2l10.5-10.5z" stroke-linecap="round" stroke-linejoin="round"/>',
  trash:
    '<path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 12h10l1-12" stroke-linecap="round" stroke-linejoin="round"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="1"/><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" stroke-linecap="round" stroke-linejoin="round"/>',
  refresh:
    '<path d="M20 12a8 8 0 1 1-2.34-5.66" stroke-linecap="round"/><path d="M20 4v6h-6" stroke-linecap="round" stroke-linejoin="round"/>',
  download:
    '<path d="M12 4v10M8 10l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" stroke-linecap="round"/>',
  upload:
    '<path d="M12 20V10M8 14l4-4 4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 4h14" stroke-linecap="round"/>',
  share:
    '<circle cx="18" cy="8" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="16" r="3"/><path d="M8.5 10.8 15.5 9.2M8.5 13.2l7 1.6" stroke-linecap="round"/>',
  externalLink:
    '<path d="M14 5h5v5M10 14 19 9M15 9h4v4" stroke-linecap="round" stroke-linejoin="round"/>',
  link:
    '<path d="M10 13a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L10 7" stroke-linecap="round"/><path d="M14 11a4 4 0 0 0-5.66 0L5.51 14.15a4 4 0 1 0 5.66 5.66L14 17" stroke-linecap="round"/>',

  play: '<path d="M8 6l12 6-12 6V6z" stroke-linecap="round" stroke-linejoin="round"/>',
  pause: '<path d="M9 6v12M15 6v12" stroke-linecap="round"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1"/>',
  record:
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',

  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01" stroke-linecap="round"/>',
  warning:
    '<path d="M12 4 2.5 19h19L12 4z" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke-linecap="round"/>',
  error:
    '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6" stroke-linecap="round"/>',
  check: '<path d="M5 12l5 5L19 7" stroke-linecap="round" stroke-linejoin="round"/>',
  checkCircle:
    '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6" stroke-linecap="round" stroke-linejoin="round"/>',
  xCircle:
    '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6" stroke-linecap="round"/>',
  alertCircle:
    '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01" stroke-linecap="round"/>',

  code:
    '<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 7l-2 10" stroke-linecap="round" stroke-linejoin="round"/>',
  terminal:
    '<path d="M5 5h14v14H5z" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10l3 3-3 3M13 16h3" stroke-linecap="round" stroke-linejoin="round"/>',
  bug:
    '<path d="M8 11c0-2.2 1.8-4 4-4s4 1.8 4 4M4 11h2M18 11h2M6 15h12M8 19h8M10 7V5M14 7V5" stroke-linecap="round" stroke-linejoin="round"/>',
  gitBranch:
    '<circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="M7 9v4a3 3 0 0 0 3 3h4" stroke-linecap="round"/>',
  database:
    '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" stroke-linecap="round"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" stroke-linecap="round"/>',
  cloud:
    '<path d="M7 18h11a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6-1.5A3.5 3.5 0 0 0 7 18z" stroke-linecap="round" stroke-linejoin="round"/>',
  api:
    '<path d="M6 8h12v8H6z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12h6M4 12H6M18 12h-2" stroke-linecap="round"/>',
  http:
    '<path d="M9 8l-4 4 4 4M15 8l4 4-4 4M12 7v10" stroke-linecap="round" stroke-linejoin="round"/>',

  folder: '<path d="M4 8h5l2 2h9v9H4z" stroke-linecap="round" stroke-linejoin="round"/>',
  folderOpen:
    '<path d="M4 10V7a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v9H4z" stroke-linecap="round" stroke-linejoin="round"/>',
  file: '<path d="M8 4h8l4 4v12H8z" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 4v4h4" stroke-linecap="round" stroke-linejoin="round"/>',
  fileText:
    '<path d="M8 4h8l4 4v12H8z" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 4v4h4M11 13h6M11 17h6M11 9h2" stroke-linecap="round"/>',

  user: '<circle cx="12" cy="8" r="3.5"/><path d="M6 20c1.5-3 4-4.5 6-4.5s4.5 1.5 6 4.5" stroke-linecap="round"/>',
  users:
    '<circle cx="9" cy="9" r="2.5"/><circle cx="16" cy="10" r="2"/><path d="M5 19c.8-2.2 2.5-3.5 4-3.5s3.2 1.3 4 3.5M13 19c.6-1.6 1.8-2.5 3-2.5s2.4.9 3 2.5" stroke-linecap="round"/>',
  logOut:
    '<path d="M10 6H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4M14 16l4-4-4-4M18 12H9" stroke-linecap="round" stroke-linejoin="round"/>',
  lock:
    '<rect x="6" y="11" width="12" height="10" rx="1"/><path d="M8 11V8a4 4 0 1 1 8 0v3" stroke-linecap="round"/>',
  unlock:
    '<rect x="6" y="11" width="12" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 7.5-2" stroke-linecap="round"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff:
    '<path d="M4 4l16 16M10.6 10.6A4 4 0 0 0 12 16a4 4 0 0 0 3.4-6M7.2 7.7C5.5 8.8 4 10.5 2 12c2 3 6 6 10 6 1.5 0 3-.4 4.3-1M14 9.3c1-.8 1.6-1.8 1.6-3" stroke-linecap="round"/>',

  star: '<path d="M12 4 14.2 9.5 20 10l-4.5 3.7 1.4 5.8L12 16.8 7.1 19.5l1.4-5.8L4 10l5.8-.5z" stroke-linecap="round" stroke-linejoin="round"/>',
  bookmark:
    '<path d="M7 4h10v16l-5-3.5L7 20V4z" stroke-linecap="round" stroke-linejoin="round"/>',
  bell:
    '<path d="M6 17h12l-1.5-2V11a4.5 4.5 0 0 0-9 0v4L6 17z" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" stroke-linecap="round"/>',
  calendar:
    '<rect x="4" y="6" width="16" height="14" rx="1"/><path d="M8 4v4M16 4v4M4 11h16" stroke-linecap="round"/>',
  clock:
    '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2" stroke-linecap="round" stroke-linejoin="round"/>',
  zap: '<path d="M13 3 5 14h6l-1 7 9-12h-6l1-6z" stroke-linecap="round" stroke-linejoin="round"/>',
  layers:
    '<path d="M12 4 3 9l9 5 9-5-9-5zM3 14l9 5 9-5" stroke-linecap="round" stroke-linejoin="round"/>',
  grid:
    '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M5 6h.01M5 12h.01M5 18h.01" stroke-linecap="round"/>',
  box: '<path d="M12 3 4 8v8l8 5 8-5V8l-8-5z" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 8l8 5 8-5M12 13v8" stroke-linecap="round" stroke-linejoin="round"/>',
  package:
    '<path d="M12 3 3 8v8l9 5 9-5V8l-9-5z" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 12 21 8M12 12v8M12 12 3 8" stroke-linecap="round" stroke-linejoin="round"/>',
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  compass:
    '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 14 14l-5.5 1.5L10 10l5.5-1.5z" stroke-linecap="round" stroke-linejoin="round"/>',
  map:
    '<path d="M4 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 4v14M16 6v14" stroke-linecap="round"/>',
  wrench:
    '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L5 16l3 3 4.3-4.3a4 4 0 0 0 5.4-5.4l2.1-2.1-2.8-2.8-2.1 2.1z" stroke-linecap="round" stroke-linejoin="round"/>',
  tool:
    '<path d="M10 6H6a2 2 0 0 0-2 2v2h12v-2a2 2 0 0 0-2-2h-4zM6 10v8h12v-8" stroke-linecap="round" stroke-linejoin="round"/>',
  sliders:
    '<path d="M6 4v16M12 8v8M18 6v12" stroke-linecap="round"/><circle cx="6" cy="10" r="2"/><circle cx="12" cy="14" r="2"/><circle cx="18" cy="9" r="2"/>',
  toggleLeft:
    '<rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="9" cy="12" r="2.5" fill="currentColor" stroke="none"/>',
  toggleRight:
    '<rect x="3" y="8" width="18" height="8" rx="4"/><circle cx="15" cy="12" r="2.5" fill="currentColor" stroke="none"/>',

  activity:
    '<path d="M4 14l4-4 4 6 4-10 4 8" stroke-linecap="round" stroke-linejoin="round"/>',
  barChart: '<path d="M6 20V10M12 20V4M18 20v-6" stroke-linecap="round"/>',
  pieChart:
    '<path d="M12 4a8 8 0 0 1 8 8h-8V4z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="8"/>',
  clipboard:
    '<rect x="7" y="5" width="10" height="14" rx="1"/><path d="M9 5h6a1 1 0 0 1 1 1v1H8V6a1 1 0 0 1 1-1z" stroke-linecap="round"/>',
  tag:
    '<path d="M4 12V4h8l9 9-6 6-9-9z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="9.5" r="1.25" fill="currentColor" stroke="none"/>',
  hash: '<path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" stroke-linecap="round"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke-linecap="round"/>',
  mail:
    '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M4 8l8 5 8-5" stroke-linecap="round" stroke-linejoin="round"/>',
  message:
    '<path d="M4 6h16v10H8l-4 4V6z" stroke-linecap="round" stroke-linejoin="round"/>',
  shield:
    '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3z" stroke-linecap="round" stroke-linejoin="round"/>',
  rocket:
    '<path d="M12 3c2 5-1 9-1 9s4-1 9-1c-4 2-8 2-12 0 5-1 9-1 9-1s-3-4-1-9z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="11" r="2"/><path d="M8 16l-2 4M16 16l2 4" stroke-linecap="round"/>',
};

function toKebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function wrapSvg(inner) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">',
    `  ${inner.trim()}`,
    '</svg>',
    '',
  ].join('\n');
}

await fs.mkdir(outDir, { recursive: true });

let count = 0;
for (const [name, inner] of Object.entries(TX_ICON_PATHS)) {
  const fileName = `${toKebab(name)}.svg`;
  await fs.writeFile(path.join(outDir, fileName), wrapSvg(inner), 'utf8');
  count += 1;
}

console.log(`Wrote ${count} icons to ${path.relative(root, outDir)}`);
