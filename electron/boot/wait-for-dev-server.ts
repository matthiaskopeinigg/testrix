import {
  TESTRIX_DEV_SERVER_HOST,
  TESTRIX_DEV_SERVER_HTML_MARKER,
  TESTRIX_DEV_SERVER_PORT,
} from '../../shared/config/constants';

const DEFAULT_DEV_ORIGIN = `http://${TESTRIX_DEV_SERVER_HOST}:${TESTRIX_DEV_SERVER_PORT}`;

/** Origin for `ng serve` (overridable via `TESTRIX_DEV_URL`). */
export function resolveDevServerOrigin(): string {
  const fromEnv = process.env.TESTRIX_DEV_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_DEV_ORIGIN;
}

async function responseLooksLikeTestrix(response: Response): Promise<boolean> {
  if (!response.ok) {
    return false;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    return false;
  }
  const html = await response.text();
  return html.includes(TESTRIX_DEV_SERVER_HTML_MARKER);
}

/**
 * Polls until the Testrix Angular dev server answers HTTP, or the deadline passes.
 * Splash can show while this runs — Electron must not wait on this in `serve-desktop.mjs`.
 */
export async function waitForDevServerReady(origin: string, timeoutMs: number): Promise<boolean> {
  const url = origin.replace(/\/$/, '');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (await responseLooksLikeTestrix(response)) {
        return true;
      }
    } catch {
      /* Dev server still starting or wrong process on the port */
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  return false;
}
