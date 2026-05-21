#!/usr/bin/env node
/**
 * Ports api-workbench welcome SCSS into Testrix tokens (`_home-welcome.scss`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(
  'C:',
  'Users',
  'matth',
  'Desktop',
  'api-workbench',
  'src',
  'app',
  'features',
  'workspace',
  'home.component.scss',
);

const raw = fs.readFileSync(srcPath, 'utf8');
const start = raw.indexOf('/* Welcome (empty state)');
if (start < 0) {
  throw new Error('Welcome section not found in api-workbench home.component.scss');
}

let scss = raw.slice(start);

const replacements = [
  ['--primary-color', '--tx-primary'],
  ['--secondary-color', '--tx-secondary'],
  ['--accent-color', '--tx-accent'],
  ['--aw-bg', '--tx-surface-0'],
  ['--aw-surface-muted', '--tx-surface-2'],
  ['--aw-surface', '--tx-surface-1'],
  ['--aw-text', '--tx-text-0'],
  ['--aw-border', '--tx-border-0'],
  ['--aw-focus-ring', '--tx-focus-ring'],
  ['--aw-radius-xl', '--tx-radius-lg'],
  ['--aw-radius-lg', '--tx-radius-lg'],
  ['--aw-radius-md', '--tx-radius-md'],
  ['--aw-radius-sm', '--tx-radius-sm'],
  ['--aw-radius-xs', '--tx-radius-sm'],
  ['--aw-duration-fast', '--tx-duration-fast'],
  ['--aw-duration-base', '--tx-duration-base'],
  ['--aw-ease-standard', '--tx-ease-standard'],
  ['--aw-status-success', '--tx-success'],
  ['--aw-status-error', '--tx-danger'],
  ['--aw-font-mono', '--tx-font-mono'],
  ['--aw-shadow-lg', '--tx-shadow-md'],
  ['--aw-btn-cta-bg', '--tx-btn-cta-bg'],
  ['--aw-btn-cta-fg', '--tx-btn-cta-fg'],
  ['--aw-btn-cta-border', '--tx-btn-cta-border'],
  ['--aw-btn-cta-hover-bg', '--tx-btn-cta-hover-bg'],
  ['--aw-btn-cta-active-bg', '--tx-btn-cta-active-bg'],
  ['--aw-btn-cta-hover-border', '--tx-btn-cta-border'],
];

for (const [from, to] of replacements) {
  scss = scss.split(from).join(to);
}

scss = scss.replace(/@use[^;]+workspace-primary-cta[^;]+;\s*/g, '');
scss = scss.replace(
  /@include wsCta\.workspace-primary-cta;/g,
  `background: var(--tx-btn-cta-bg);
  color: var(--tx-btn-cta-fg);
  border: 1px solid var(--tx-btn-cta-border);`,
);

const header = `// Ported from api-workbench welcome empty state — tokens mapped to --tx-*.\n\n`;

const outPath = path.join(root, 'src', 'app', 'features', 'shell', 'pages', 'home', '_home-welcome.scss');
fs.writeFileSync(outPath, header + scss, 'utf8');
console.log(`Wrote ${path.relative(root, outPath)} (${scss.length} chars)`);
