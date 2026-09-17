export const DESKTOP_PREVIEW_SURFACES = ['splash', 'boot-error', 'app-error'] as const;

export type DesktopPreviewSurface = (typeof DESKTOP_PREVIEW_SURFACES)[number];

function isDesktopPreviewSurface(value: string): value is DesktopPreviewSurface {
  return (DESKTOP_PREVIEW_SURFACES as readonly string[]).includes(value);
}

/**
 * Reads `--preview=<surface>` or `TESTRIX_PREVIEW` for design-time surface windows.
 */
export function resolveDesktopPreviewSurface(): DesktopPreviewSurface | null {
  const flag = process.argv.find((item) => item.startsWith('--preview='));
  const raw = flag ? flag.slice('--preview='.length) : process.env.TESTRIX_PREVIEW;
  if (!raw) {
    return null;
  }
  return isDesktopPreviewSurface(raw) ? raw : null;
}
