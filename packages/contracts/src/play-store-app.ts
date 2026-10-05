/** Official Play listing used only to read a package id — never to download an APK. */
export const PLAY_STORE_DETAILS_BASE_URL = 'https://play.google.com/store/apps/details';

export interface PlayStoreAppRef {
  readonly packageName: string;
  readonly playUrl: string;
}

const ANDROID_PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/**
 * True when the value looks like a reverse-DNS Android package name.
 */
export function isAndroidPackageName(value: string | null | undefined): boolean {
  return typeof value === 'string' && ANDROID_PACKAGE_RE.test(value.trim());
}

/**
 * Reads `id=` from a Play Store details URL or `market://` link.
 */
export function parsePlayStorePackageId(input: string): string | null {
  const raw = input.trim();
  if (!raw)
    return null;

  if (/^market:/i.test(raw)) {
    const id = readQueryPackageId(raw);
    return isAndroidPackageName(id) ? id : null;
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'play.google.com' && /\/store\/apps\/details/i.test(url.pathname)) {
      const id = url.searchParams.get('id')?.trim() ?? '';
      return isAndroidPackageName(id) ? id : null;
    }
  } catch {
    const id = readQueryPackageId(raw);
    if (/play\.google\.com/i.test(raw) && isAndroidPackageName(id))
      return id;
  }

  return null;
}

/**
 * Play listing metadata when the input is a store URL or market link.
 */
export function parsePlayStoreAppRef(input: string): PlayStoreAppRef | null {
  const packageName = parsePlayStorePackageId(input);
  if (!packageName)
    return null;
  return {
    packageName,
    playUrl: `${PLAY_STORE_DETAILS_BASE_URL}?id=${encodeURIComponent(packageName)}`,
  };
}

/**
 * Turns a Play URL into a package name; leaves other input unchanged.
 */
export function normalizeAndroidPackageInput(input: string): string {
  const trimmed = input.trim();
  return parsePlayStorePackageId(trimmed) ?? trimmed;
}

function readQueryPackageId(raw: string): string {
  const match = /[?&]id=([^&#]+)/i.exec(raw);
  if (!match)
    return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}
