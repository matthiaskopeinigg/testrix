import * as path from 'node:path';

/** Repo-relative folder for workspace JSON during `npm start` / `npm run dev`. */
export const LOCAL_DEV_CONFIG_DIR_NAME = '.config';

/** Chromium userData lives here so profile JSON stays easy to edit. */
export const LOCAL_DEV_ELECTRON_USER_DATA_DIR_NAME = 'electron';

export interface LocalDevConfigDirInput {
  readonly cwd: string;
  readonly configDirEnv?: string;
  readonly serveRenderer?: boolean;
}

/**
 * Resolves the project-local config root for unpackaged `ng serve` Electron runs.
 * Packaged builds return null so they keep the OS userData directory.
 */
export function resolveLocalDevConfigDir(input: LocalDevConfigDirInput): string | null {
  const explicit = input.configDirEnv?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  if (input.serveRenderer) {
    return path.join(input.cwd, LOCAL_DEV_CONFIG_DIR_NAME);
  }
  return null;
}

/** Chromium session/logs directory under the local config root. */
export function resolveLocalDevElectronUserDataDir(configDir: string): string {
  return path.join(configDir, LOCAL_DEV_ELECTRON_USER_DATA_DIR_NAME);
}

/**
 * Directory that holds `paths.json`, `profiles.json`, settings, and profile workspaces.
 */
export function resolveTestrixConfigHome(
  userData: string,
  env: NodeJS.Dict<string> = process.env,
  cwd = process.cwd(),
): string {
  return (
    resolveLocalDevConfigDir({
      cwd,
      configDirEnv: env.TESTRIX_CONFIG_DIR,
      serveRenderer: env.TESTRIX_SERVE_RENDERER === '1',
    }) ?? userData
  );
}
