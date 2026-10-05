/** UI zoom helpers safe for Electron sandboxed preload (no Node builtins). */

export const UI_ZOOM_MIN = 0.75;
export const UI_ZOOM_MAX = 1.5;
export const UI_ZOOM_STEP = 0.05;
export const UI_ZOOM_DEFAULT = 1;

/** Snaps a zoom factor onto the allowed UI zoom range. */
export function clampUiZoom(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value))
    return UI_ZOOM_DEFAULT;
  const stepped = Math.round(value / UI_ZOOM_STEP) * UI_ZOOM_STEP;
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, Number(stepped.toFixed(2))));
}

/** Steps zoom up or down by one notch. */
export function nudgeUiZoom(current: number, direction: 1 | -1): number {
  return clampUiZoom(current + direction * UI_ZOOM_STEP);
}
