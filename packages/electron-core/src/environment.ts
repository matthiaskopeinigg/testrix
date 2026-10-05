export function isDevMode(): boolean {
  return process.env['TESTRIX_SERVE_RENDERER'] === '1' || process.env['NODE_ENV'] === 'development';
}

export function shouldShowSplashBoot(): boolean {
  return process.env['TESTRIX_NO_SPLASH'] !== '1';
}

export function resolveDevServerOrigin(): string {
  return process.env['TESTRIX_DEV_URL'] ?? 'http://localhost:4200';
}

export function usesAngularDevServer(): boolean {
  return process.env['TESTRIX_SERVE_RENDERER'] === '1';
}

/** Isolated profile folder for automated runs; unset in normal use. */
export function userDataOverride(): string | null {
  return process.env['TESTRIX_USER_DATA_DIR']?.trim() || null;
}
