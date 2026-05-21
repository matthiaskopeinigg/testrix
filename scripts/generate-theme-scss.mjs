#!/usr/bin/env node
/**
 * Regenerates src/styles/_themes.scss from shared/theme/theme-palettes.json.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const palettesPath = path.join(root, 'shared', 'theme', 'theme-palettes.json');
const systemPalettesPath = path.join(root, 'shared', 'theme', 'system-palettes.json');
const outPath = path.join(root, 'src', 'styles', '_themes.scss');

const palettes = JSON.parse(await fs.readFile(palettesPath, 'utf8'));
const systemPalettes = JSON.parse(await fs.readFile(systemPalettesPath, 'utf8'));

const systemLight = { appearance: 'light', ...systemPalettes.light };
const systemDark = { appearance: 'dark', ...systemPalettes.dark };

const darkTextSelectors = palettes
  .filter((p) => p.appearance === 'dark')
  .map((p) => `html.theme-${p.id},\nbody.theme-${p.id}`)
  .join(',\n');

let scss = `@use './tokens';

@mixin tx-theme-palette(
  $bg,
  $surface,
  $text,
  $primary,
  $secondary,
  $accent,
  $border,
  $on-primary
) {
  --tx-surface-0: #{$bg};
  --tx-surface-1: #{$surface};
  --tx-surface-2: #{color-mix(in srgb, #{$surface} 88%, #{$bg})};
  --tx-text-0: #{$text};
  --tx-text-1: #{color-mix(in srgb, #{$text} 72%, #{$bg})};
  --tx-border-0: #{color-mix(in srgb, #{$border} 70%, transparent)};
  --tx-border-strong: #{color-mix(in srgb, #{$border} 90%, transparent)};
  --tx-focus-ring: #{color-mix(in srgb, #{$primary} 55%, transparent)};
  --tx-link: #{$primary};
  --tx-primary: #{$primary};
  --tx-primary-strong: #{color-mix(in srgb, #{$primary} 72%, #{$text})};
  --tx-primary-muted: #{color-mix(in srgb, #{$primary} 16%, #{$surface})};
  --tx-primary-subtle: #{color-mix(in srgb, #{$primary} 8%, #{$surface})};
  --tx-secondary: #{$secondary};
  --tx-accent: #{$accent};
  --tx-danger: #{color-mix(in srgb, #f87171 72%, #{$accent} 28%)};
  --tx-success: #{color-mix(in srgb, #4ade80 72%, #{$accent} 28%)};
  --tx-warning: #{color-mix(in srgb, #fbbf24 70%, #{$secondary} 30%)};
  --tx-scrim: #{color-mix(in srgb, #{$bg} 68%, transparent)};
  --tx-shadow-color: #{$bg};
  --tx-content-bg: #{$bg};
  --tx-chrome-bg: #{$surface};
  --tx-chrome-surface: #{color-mix(in srgb, #{$surface} 96%, transparent)};
  --tx-highlight: #{color-mix(in srgb, #{$text} 14%, #{$surface} 86%)};
  --tx-control-face: #{color-mix(in srgb, #{$text} 6%, #{$surface} 94%)};
  --tx-scrollbar-track: #{color-mix(in srgb, #{$surface} 94%, #{$bg} 6%)};
  --tx-scrollbar-thumb: #{color-mix(in srgb, #{$primary} 48%, #{$surface} 52%)};
  --tx-scrollbar-thumb-hover: #{color-mix(in srgb, #{$primary} 62%, #{$surface} 38%)};
  --tx-scrollbar-thumb-active: #{color-mix(in srgb, #{$secondary} 55%, #{$primary} 45%)};
  --tx-on-primary: #{$on-primary};
  --tx-shadow-sm: 0 1px 3px #{color-mix(in srgb, #{$bg} 88%, transparent)};
  --tx-shadow-md: 0 4px 14px #{color-mix(in srgb, #{$bg} 78%, transparent)};

  --tx-btn-focus-ring: #{color-mix(in srgb, #{$primary} 50%, transparent)};
  --tx-btn-secondary-bg: #{$surface};
  --tx-btn-secondary-fg: #{$text};
  --tx-btn-secondary-border: #{color-mix(in srgb, #{$border} 88%, transparent)};
  --tx-btn-secondary-hover-bg: #{color-mix(in srgb, #{$surface} 72%, #{$text} 10%)};
  --tx-btn-secondary-active-bg: #{color-mix(in srgb, #{$surface} 58%, #{$bg} 42%)};
  --tx-btn-primary-bg: #{color-mix(in srgb, #{$primary} 14%, #{$surface})};
  --tx-btn-primary-fg: #{color-mix(in srgb, #{$primary} 94%, #{$text})};
  --tx-btn-primary-border: #{color-mix(in srgb, #{$primary} 46%, #{$border})};
  --tx-btn-primary-hover-bg: #{color-mix(in srgb, #{$primary} 22%, #{$surface})};
  --tx-btn-primary-active-bg: #{color-mix(in srgb, #{$primary} 30%, #{$surface})};
  --tx-btn-cta-bg: #{$primary};
  --tx-btn-cta-fg: #{$on-primary};
  --tx-btn-cta-border: #{color-mix(in srgb, #{$primary} 92%, #{$border})};
  --tx-btn-cta-hover-bg: #{color-mix(in srgb, #{$primary} 88%, #{$text} 12%)};
  --tx-btn-cta-active-bg: #{color-mix(in srgb, #{$primary} 82%, #{$bg} 18%)};
  --tx-btn-add-bg: #{color-mix(in srgb, #{$accent} 10%, #{$surface})};
  --tx-btn-add-fg: #{color-mix(in srgb, #{$accent} 82%, #{$text})};
  --tx-btn-add-border: #{color-mix(in srgb, #{$accent} 52%, #{$border})};
  --tx-btn-add-hover-bg: #{color-mix(in srgb, #{$accent} 16%, #{$surface})};
}

${darkTextSelectors} {
  color-scheme: dark;
}

`;

for (const p of palettes) {
  const args = paletteArgs(p);
  scss += `html.theme-${p.id},\nbody.theme-${p.id} {\n  @include tx-theme-palette(${args});\n}\n\n`;
}

scss += `@media (prefers-color-scheme: light) {
  html.theme-system,
  body.theme-system {
    @include tx-theme-palette(${paletteArgs(systemLight)});
  }
}

@media (prefers-color-scheme: dark) {
  html.theme-system,
  body.theme-system {
    @include tx-theme-palette(${paletteArgs(systemDark)});
    /* Welcome backdrop: extra lift above unified shell/chrome. */
    --tx-surface-2: #{color-mix(in srgb, ${hex(systemDark.surface)} 72%, ${hex(systemDark.bg)} 28%)};
  }
}
`;

function paletteArgs(p) {
  const onPrimary = p.appearance === 'light' ? p.text : p.bg;
  return `${hex(p.bg)}, ${hex(p.surface)}, ${hex(p.text)}, ${hex(p.primary)}, ${hex(p.secondary)}, ${hex(p.accent)}, ${hex(p.border)}, ${hex(onPrimary)}`;
}

function hex(value) {
  return value;
}

await fs.writeFile(outPath, scss, 'utf8');
console.log(`Wrote ${palettes.length} theme blocks to ${path.relative(root, outPath)}`);
