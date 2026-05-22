import { resolveThemeContentBackground } from '../../shared/theme/theme-catalog';

import { getMainSettings } from '../services/settings-runtime';

/** Native BrowserWindow fill — must match `--tx-content-bg` to avoid a visible seam. */
export function resolveBootWindowBackgroundColor(): string {
  return resolveThemeContentBackground(getMainSettings().appearance.theme);
}
