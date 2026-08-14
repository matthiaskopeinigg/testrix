import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DARK_THEME_IDS,
  DEFAULT_APPEARANCE_THEME_ID,
  LIGHT_THEME_IDS,
  THEME_PALETTES,
  THEME_UI_GROUPS,
  TESTRIX_THEME_IDS,
  findThemePalette,
  normalizeAppearanceThemeId,
} from '@shared/theme';

const themesScssPath = join(process.cwd(), 'src', 'styles', '_themes.scss');

function readThemesScss(): string {
  return readFileSync(themesScssPath, 'utf8');
}

/** Reads `tx-theme-palette(...)` args for a dedicated theme class block (not the dark selector list). */
function paletteArgsFromScss(themeId: string): string | undefined {
  const escaped = themeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `html\\.theme-${escaped},\\s*\\nbody\\.theme-${escaped}\\s*\\{\\s*\\n\\s*@include tx-theme-palette\\(([^)]+)\\)`,
  );
  return readThemesScss().match(pattern)?.[1];
}

describe('theme-catalog', () => {
  it('exposes exactly 90 palettes with unique ids', () => {
    expect(THEME_PALETTES.length).toBe(90);
    expect(new Set(TESTRIX_THEME_IDS).size).toBe(90);
  });

  it('balances light and dark appearances (~45 each)', () => {
    expect(LIGHT_THEME_IDS.size).toBe(45);
    expect(DARK_THEME_IDS.size).toBe(45);
  });

  it('resolves palettes by id', () => {
    expect(findThemePalette('dracula')?.label).toBeTruthy();
    expect(findThemePalette('missing-theme')).toBeUndefined();
  });

  it('excludes system and workbench groups from settings UI', () => {
    const groupIds = THEME_UI_GROUPS.map((g) => g.id);
    expect(groupIds).toEqual(['popular', 'accessibility']);
    expect(THEME_UI_GROUPS.flatMap((g) => g.themes)).not.toContain('system');
    expect(THEME_UI_GROUPS.flatMap((g) => g.themes)).not.toContain('light');
    expect(THEME_UI_GROUPS.flatMap((g) => g.themes)).not.toContain('dark');
  });

  it('normalizes legacy and missing theme ids to GitHub Light by default', () => {
    expect(DEFAULT_APPEARANCE_THEME_ID).toBe('github-light');
    expect(normalizeAppearanceThemeId(undefined)).toBe('github-light');
    expect(normalizeAppearanceThemeId('system')).toBe('github-light');
    expect(normalizeAppearanceThemeId('light')).toBe('github-light');
    expect(normalizeAppearanceThemeId('dark')).toBe('github-dark');
    expect(normalizeAppearanceThemeId('dracula')).toBe('dracula');
  });

  it('keeps generated SCSS in sync with Testrix Dark / Light catalog entries', () => {
    for (const id of ['dark', 'light'] as const) {
      const palette = findThemePalette(id);
      expect(palette).toBeDefined();
      const args = paletteArgsFromScss(id);
      expect(args, `missing theme-${id} block in _themes.scss`).toBeDefined();
      expect(args).toContain(palette!.bg);
      expect(args).toContain(palette!.primary);
      expect(args).toContain(palette!.surface);
    }
  });

  it('does not apply a legacy light-palette override after catalog themes', () => {
    const scss = readThemesScss();
    expect(scss).not.toContain('@include light-palette');
    expect(scss).not.toContain('html.theme-light,\nbody.theme-light {\n  @include light-palette');
  });

  it('defines opaque primary tokens in the theme mixin', () => {
    const scss = readThemesScss();
    expect(scss).toContain('--tx-primary: #{$primary}');
    expect(scss).toContain('--tx-secondary: #{$secondary}');
    expect(scss).toContain('--tx-link: #{$primary}');
    expect(scss).not.toContain('--tx-primary: #{color-mix(in srgb, #{$primary} 85%, transparent)}');
  });
});
