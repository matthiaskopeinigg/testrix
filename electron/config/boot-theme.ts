import { normalizeAppearanceThemeId, isLightTheme } from '../../shared/theme/theme-catalog';

import { getMainSettings } from '../services/settings-runtime';

/** Chromium `additionalArguments` so preload can apply the saved theme before Angular paints. */
export function bootThemeAdditionalArguments(): readonly string[] {
  const theme = normalizeAppearanceThemeId(getMainSettings().appearance.theme);
  const mode = isLightTheme(theme) ? 'light' : 'dark';
  return [`--boot-theme=${theme}`, `--boot-theme-mode=${mode}`];
}
