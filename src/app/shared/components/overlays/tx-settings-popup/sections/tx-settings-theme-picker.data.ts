import { THEME_UI_GROUPS, findThemePalette, type AppearanceThemeId, type ThemePalette } from '@shared/theme';

export interface SettingsThemePickerCard {
  readonly id: AppearanceThemeId;
  readonly palette: ThemePalette;
}

export interface SettingsThemePickerGroup {
  readonly id: (typeof THEME_UI_GROUPS)[number]['id'];
  readonly label: string;
  readonly cards: readonly SettingsThemePickerCard[];
}

/** Pre-resolved theme cards for the settings appearance grid (avoids per-change lookup in templates). */
export const SETTINGS_THEME_PICKER_GROUPS: readonly SettingsThemePickerGroup[] = THEME_UI_GROUPS.map(
  (group) => ({
    id: group.id,
    label: group.label,
    cards: group.themes
      .map((id) => {
        const palette = findThemePalette(id);
        return palette ? ({ id: id as AppearanceThemeId, palette } as const) : null;
      })
      .filter((card): card is SettingsThemePickerCard => card !== null),
  }),
);
