import palettesJson from './theme-palettes.json';

export interface ThemePalette {
  readonly id: string;
  readonly label: string;
  readonly appearance: 'light' | 'dark';
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly border: string;
}

export type ThemeUiGroupId = 'popular' | 'accessibility';

export interface ThemeUiGroup {
  readonly id: ThemeUiGroupId;
  readonly label: string;
  readonly themes: readonly string[];
}

/** Applied when settings omit a theme or store a removed id (system / workbench). */
export const DEFAULT_APPEARANCE_THEME_ID = 'github-light' as const;

/** Workbench-only palettes kept in JSON/SCSS but not selectable in settings. */
const NON_SELECTABLE_THEME_IDS = new Set<string>(['light', 'dark']);

export const THEME_PALETTES: readonly ThemePalette[] = palettesJson as ThemePalette[];

export const TESTRIX_THEME_IDS = THEME_PALETTES.map((p) => p.id) as readonly string[];

export type TestrixThemeId = (typeof TESTRIX_THEME_IDS)[number];

type SelectableThemeId = Exclude<TestrixThemeId, 'light' | 'dark'>;

export const APPEARANCE_THEME_IDS = TESTRIX_THEME_IDS.filter(
  (id): id is SelectableThemeId => !NON_SELECTABLE_THEME_IDS.has(id),
);

export type AppearanceThemeId = SelectableThemeId;

const PALETTE_BY_ID = new Map(THEME_PALETTES.map((p) => [p.id, p]));

const APPEARANCE_THEME_ID_SET = new Set<string>(APPEARANCE_THEME_IDS);

export const LIGHT_THEME_IDS: ReadonlySet<string> = new Set(
  THEME_PALETTES.filter((p) => p.appearance === 'light').map((p) => p.id),
);

export const DARK_THEME_IDS: ReadonlySet<string> = new Set(
  THEME_PALETTES.filter((p) => p.appearance === 'dark').map((p) => p.id),
);

const POPULAR_THEME_IDS: readonly string[] = [
  'github-dark',
  'github-light',
  'dracula',
  'one-dark',
  'catppuccin-mocha',
  'catppuccin-latte',
  'tokyo-night',
  'nord',
  'gruvbox-dark',
  'solarized-dark',
  'monokai',
  'ayu-dark',
  'material-palenight',
  'vscode-dark',
  'vscode-light',
];

export const THEME_UI_GROUPS: readonly ThemeUiGroup[] = [
  {
    id: 'popular',
    label: 'Popular',
    themes: POPULAR_THEME_IDS.filter((id) => PALETTE_BY_ID.has(id)),
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    themes: ['high-contrast-dark', 'high-contrast-darklight'],
  },
];

export function findThemePalette(themeId: string): ThemePalette | undefined {
  return PALETTE_BY_ID.get(themeId);
}

export function getThemeLabel(themeId: AppearanceThemeId): string {
  return findThemePalette(themeId)?.label ?? themeId;
}

export function isLightTheme(themeId: AppearanceThemeId): boolean {
  return LIGHT_THEME_IDS.has(themeId);
}

export function isDarkTheme(themeId: AppearanceThemeId): boolean {
  return DARK_THEME_IDS.has(themeId);
}

export function isKnownThemeId(themeId: string): themeId is TestrixThemeId {
  return PALETTE_BY_ID.has(themeId);
}

export function isAppearanceThemeId(themeId: string): themeId is AppearanceThemeId {
  return APPEARANCE_THEME_ID_SET.has(themeId);
}

/**
 * Maps legacy `system` / workbench `light`/`dark` and unknown ids to a selectable palette.
 */
export function normalizeAppearanceThemeId(theme: unknown): AppearanceThemeId {
  if (typeof theme !== 'string' || !theme.trim()) {
    return DEFAULT_APPEARANCE_THEME_ID;
  }
  if (theme === 'system' || theme === 'light') {
    return DEFAULT_APPEARANCE_THEME_ID;
  }
  if (theme === 'dark') {
    return 'github-dark';
  }
  if (isAppearanceThemeId(theme)) {
    return theme;
  }
  return DEFAULT_APPEARANCE_THEME_ID;
}

export const THEME_BG_HEX: Readonly<Record<string, string>> = Object.fromEntries(
  THEME_PALETTES.map((p) => [p.id, p.bg]),
);

/** Window / content backdrop hex for a saved appearance theme id. */
export function resolveThemeContentBackground(theme: unknown): string {
  const themeId = normalizeAppearanceThemeId(theme);
  return THEME_BG_HEX[themeId] ?? THEME_BG_HEX[DEFAULT_APPEARANCE_THEME_ID] ?? '#ffffff';
}
