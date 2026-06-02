import { app, shell } from 'electron';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { resolveInstallerAssetName } from '../../../shared/updater/installer-artifacts';
import type { InstallLocation } from '../install/install-location.service';
import { runtimeUpdaterPlatform } from './updater-platform';

export interface LaunchInstallerOptions {
  /** When true, run a headless in-place update instead of opening the setup UI. */
  readonly silentUpdate?: boolean;
  /** Target install directory for silent updates. */
  readonly installDir?: string;
  /** PID of the running app to wait for before replacing files. */
  readonly parentPid?: number;
}

export interface InstallerDownloadProgress {
  readonly percent: number;
  readonly bytesPerSecond: number;
  readonly transferred: number;
  readonly total: number;
}

/**
 * Resolves a temp path for a downloaded release installer.
 *
 * @param version Offered release version.
 */
export function resolveInstallerDownloadPath(version: string): string {
  const safeVersion = version.replace(/[^a-zA-Z0-9._+-]+/g, '_');
  const assetName = resolveInstallerAssetName(runtimeUpdaterPlatform());
  const ext = path.extname(assetName);
  const base = path.basename(assetName, ext);
  const fileName = `${base}-${safeVersion}${ext}`;
  return path.join(app.getPath('temp'), 'testrix-updates', fileName);
}

/**
 * Downloads a GitHub release installer asset with progress callbacks.
 *
 * @param downloadUrl GitHub `browser_download_url`.
 * @param destPath Absolute path to write.
 * @param expectedSize Asset size from GitHub metadata (bytes).
 * @param onProgress Progress callback invoked during transfer.
 */
export async function downloadInstallerAsset(
  downloadUrl: string,
  destPath: string,
  expectedSize: number,
  onProgress: (progress: InstallerDownloadProgress) => void,
): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const token = process.env.TESTRIX_GITHUB_TOKEN?.trim();
  const response = await fetch(downloadUrl, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'Testrix-Updater',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Installer download failed (HTTP ${response.status}).`);
  }

  const headerLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  const total = Number.isFinite(headerLength) && headerLength > 0 ? headerLength : expectedSize;
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Installer download failed: empty response body.');
  }

  const file = fs.createWriteStream(destPath);
  let transferred = 0;
  let lastTickAt = Date.now();
  let lastTickBytes = 0;

  const reportProgress = (): void => {
    const now = Date.now();
    const elapsedMs = Math.max(1, now - lastTickAt);
    const deltaBytes = transferred - lastTickBytes;
    const bytesPerSecond = Math.round((deltaBytes * 1000) / elapsedMs);
    lastTickAt = now;
    lastTickBytes = transferred;
    const percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
    onProgress({ percent, bytesPerSecond, transferred, total });
  };

  reportProgress();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      await new Promise<void>((resolve, reject) => {
        file.write(value, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      transferred += value.byteLength;
      reportProgress();
    }
  } catch (error) {
    file.close();
    fs.rmSync(destPath, { force: true });
    throw error;
  }

  await new Promise<void>((resolve, reject) => {
    file.end((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  if (total > 0 && transferred !== total) {
    fs.rmSync(destPath, { force: true });
    throw new Error('Installer download failed: incomplete file.');
  }

  onProgress({
    percent: 100,
    bytesPerSecond: 0,
    transferred,
    total: total > 0 ? total : transferred,
  });
}

/**
 * Launches the downloaded custom Testrix Setup installer and returns once spawned.
 *
 * @param installerPath Absolute path to the downloaded installer artifact.
 * @param options Silent in-app update options when replacing an existing install.
 */
export async function launchDownloadedInstaller(
  installerPath: string,
  options: LaunchInstallerOptions = {},
): Promise<void> {
  if (!fs.existsSync(installerPath)) {
    throw new Error('Installer file is missing.');
  }

  const platform = process.platform;
  const silentUpdate = options.silentUpdate === true;
  const args = silentUpdate ? ['--silent-update'] : [];
  const silentEnv = silentUpdate
    ? {
        TESTRIX_SILENT_UPDATE: '1',
        ...(options.installDir ? { TESTRIX_INSTALL_DIR: options.installDir } : {}),
        ...(options.parentPid ? { TESTRIX_PARENT_PID: String(options.parentPid) } : {}),
      }
    : {};

  if (platform === 'win32') {
    const child = spawn(installerPath, args, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ...silentEnv,
        PORTABLE_EXECUTABLE_FILE: installerPath,
        PORTABLE_EXECUTABLE_DIR: path.dirname(installerPath),
      },
    });
    child.unref();
    return;
  }

  if (platform === 'linux') {
    fs.chmodSync(installerPath, 0o755);
    const child = spawn(installerPath, args, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ...silentEnv,
        APPIMAGE: installerPath,
      },
    });
    child.unref();
    return;
  }

  if (platform === 'darwin') {
    if (silentUpdate && options.installDir) {
      const child = spawn(installerPath, args, {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ...silentEnv,
        },
      });
      child.unref();
      return;
    }

    const opened = await shell.openPath(installerPath);
    if (opened) {
      throw new Error(opened);
    }
    return;
  }

  throw new Error(`Updates are not supported on platform: ${platform}`);
}

/** Builds launch options for an in-app update when the app is already installed. */
export function buildSilentUpdateLaunchOptions(
  install: InstallLocation | null,
): LaunchInstallerOptions {
  if (!install) {
    return {};
  }

  return {
    silentUpdate: true,
    installDir: install.installDir,
    parentPid: process.pid,
  };
}
