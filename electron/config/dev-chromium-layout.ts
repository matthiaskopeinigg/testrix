import * as path from 'node:path';

export interface DevChromiumLayoutInput {
  /** OS temp directory used for per-process disk cache. */
  readonly tmpdir: string;
  /** Electron userData directory (stable across restarts). */
  readonly userData: string;
  /** Current Electron process id. */
  readonly pid: number;
}

export interface DevChromiumLayout {
  /** Per-process disk cache so Win32 restarts do not contend on Chromium cache files. */
  readonly diskCacheDir: string;
  /** Per-process GPU shader cache directory. */
  readonly gpuCacheDir: string;
  /** Per-process Chromium `cache` path. */
  readonly appCacheDir: string;
  /** Stable Chromium session (cookies, localStorage) across `npm run dev` restarts. */
  readonly sessionDataDir: string;
}

/**
 * Resolves Chromium path isolation for `ng serve` Electron runs.
 * Disk cache stays per-pid; session data lives under userData so workspace fallbacks survive restarts.
 */
export function resolveDevChromiumLayout(input: DevChromiumLayoutInput): DevChromiumLayout {
  const ephemeralCache = path.join(input.tmpdir, 'testrix-dev-chromium', String(input.pid));
  return {
    diskCacheDir: path.join(ephemeralCache, 'disk-cache'),
    gpuCacheDir: path.join(ephemeralCache, 'gpu-cache'),
    appCacheDir: path.join(ephemeralCache, 'app-cache'),
    sessionDataDir: path.join(input.userData, 'dev-session'),
  };
}
