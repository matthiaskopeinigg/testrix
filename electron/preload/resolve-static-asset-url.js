/**
 * Resolves a browser-bundle static asset URL for preload (`window.testrix`).
 */
const BROWSER_PROTOCOL_BASE = 'testrix://bundle/';

/** Keep in sync with `angular.json` serve port and `shared/config/constants.ts`. */
const DEFAULT_DEV_ORIGIN = 'http://localhost:4720';

/**
 * Matches `resolveDevServerOrigin()` in `electron/boot/wait-for-dev-server.ts`.
 *
 * @returns {string}
 */
function resolveDevServerOrigin() {
  const fromUrl = process.env.TESTRIX_DEV_URL?.trim();
  if (fromUrl) {
    return fromUrl.replace(/\/$/, '');
  }
  const legacy = process.env.TESTRIX_DEV_SERVER_ORIGIN?.trim();
  if (legacy) {
    return legacy.replace(/\/$/, '');
  }
  return DEFAULT_DEV_ORIGIN;
}

/**
 * @param {string} relativeFromPublic Path under Angular `public/` / packaged `resources/browser/`.
 * @returns {string}
 */
export function resolveStaticAssetUrl(relativeFromPublic) {
  const clean = String(relativeFromPublic || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!clean) {
    return BROWSER_PROTOCOL_BASE;
  }

  if (process.env.TESTRIX_SERVE_RENDERER === '1') {
    const base = `${resolveDevServerOrigin()}/`;
    return new URL(clean, base).href;
  }

  return new URL(clean, BROWSER_PROTOCOL_BASE).href;
}
