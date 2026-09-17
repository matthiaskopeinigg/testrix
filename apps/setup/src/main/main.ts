import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell, utilityProcess } from 'electron';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  APP_ID,
  MAIN_EXECUTABLE,
  PRODUCT_NAME,
  SETUP_APP_ID,
  SetupIpcChannels,
  type SetupInstallRequest,
  type SetupMeta,
  type SetupProgressEvent,
  type SetupScope,
  type SetupUninstallRequest,
} from '@testrix/contracts';
import {
  attachDefaultCsp,
  bundledPath,
  sandboxedWebPreferences,
  setupWindowDefaults,
  windowIconOption,
} from '@testrix/electron-core';

import { extractAppendedPayload, resolvePayloadRoot } from './payload';

app.commandLine.appendSwitch('disable-features', 'Translate,OptimizationGuideModelDownloading');
if (process.platform === 'win32') {
  app.setAppUserModelId(SETUP_APP_ID);
}

function parseMode(): 'install' | 'uninstall' {
  if (process.argv.includes('--mode=uninstall') || process.argv.includes('--uninstall')) {
    return 'uninstall';
  }
  return 'install';
}

function isPreview(): boolean {
  return process.env.TESTRIX_SETUP_PREVIEW === '1' || process.argv.includes('--preview');
}

function isSilentUpdate(): boolean {
  return process.argv.includes('--silent-update') || process.env.TESTRIX_SILENT_UPDATE === '1';
}

function defaultInstallDir(scope: SetupScope): string {
  if (process.platform === 'win32') {
    if (scope === 'machine') {
      return path.join(process.env.ProgramFiles || 'C:\\Program Files', PRODUCT_NAME);
    }
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'Programs', PRODUCT_NAME);
  }
  if (process.platform === 'darwin') {
    return '/Applications/Testrix.app';
  }
  return path.join(os.homedir(), '.local', 'share', 'testrix');
}

function readInstallMeta(): { installDir: string; scope: SetupScope } | null {
  const candidates = [defaultInstallDir('user'), defaultInstallDir('machine')];
  for (const dir of candidates) {
    const metaPath = path.join(dir, '.install-meta.json');
    if (!fs.existsSync(metaPath)) {
      continue;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { installDir?: string; scope?: SetupScope };
      if (raw.installDir) {
        return { installDir: raw.installDir, scope: raw.scope === 'machine' ? 'machine' : 'user' };
      }
    } catch {
      return { installDir: dir, scope: dir.includes('Program Files') ? 'machine' : 'user' };
    }
  }
  return null;
}

let mainWindow: BrowserWindow | null = null;

function sendProgress(event: SetupProgressEvent): void {
  mainWindow?.webContents.send(SetupIpcChannels.progress, event);
}

async function copyWithProgress(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'robocopy',
        [from, to, '/E', '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS'],
        { windowsHide: true },
      );
      child.on('close', (code) => {
        const status = code ?? 16;
        if (status >= 0 && status < 8) {
          resolve();
          return;
        }
        reject(new Error(`robocopy failed with code ${status}`));
      });
    });
    return;
  }

  const workerPath = bundledPath('./copy-worker.js');
  if (fs.existsSync(workerPath)) {
    await new Promise<void>((resolve, reject) => {
      const child = utilityProcess.fork(workerPath, [from, to]);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`copy worker exited ${code}`));
      });
    });
    return;
  }

  fs.cpSync(from, to, { recursive: true });
}

function writeUninstallEntry(installDir: string, scope: SetupScope): void {
  if (process.platform !== 'win32') {
    return;
  }
  const uninstallCmd = path.join(installDir, 'uninstall.cmd');
  const setupExe = process.execPath;
  fs.writeFileSync(
    uninstallCmd,
    `@echo off\r\nstart "" "${setupExe}" --mode=uninstall\r\n`,
    'utf8',
  );
  const root = scope === 'machine' ? 'HKLM' : 'HKCU';
  const key = `${root}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;
  spawn('reg', ['add', key, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', PRODUCT_NAME, '/f'], {
    windowsHide: true,
  });
  spawn(
    'reg',
    ['add', key, '/v', 'UninstallString', '/t', 'REG_SZ', '/d', uninstallCmd, '/f'],
    { windowsHide: true },
  );
  spawn(
    'reg',
    ['add', key, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', app.getVersion(), '/f'],
    { windowsHide: true },
  );
}

function shortcutPaths(): { readonly startMenu: string; readonly desktop: string } {
  const startMenu = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    `${PRODUCT_NAME}.lnk`,
  );
  const desktop = path.join(os.homedir(), 'Desktop', `${PRODUCT_NAME}.lnk`);
  return { startMenu, desktop };
}

function createShortcut(installDir: string): void {
  if (process.platform !== 'win32') {
    return;
  }
  const exe = path.join(installDir, MAIN_EXECUTABLE);
  const { startMenu, desktop } = shortcutPaths();
  const ps = `
    $ws = New-Object -ComObject WScript.Shell
    foreach ($p in @('${startMenu.replace(/'/g, "''")}', '${desktop.replace(/'/g, "''")}')) {
      $s = $ws.CreateShortcut($p)
      $s.TargetPath = '${exe.replace(/'/g, "''")}'
      $s.WorkingDirectory = '${installDir.replace(/'/g, "''")}'
      $s.Save()
    }
  `;
  spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true });
}

function removeShortcuts(): void {
  if (process.platform !== 'win32') {
    return;
  }
  const { startMenu, desktop } = shortcutPaths();
  for (const target of [startMenu, desktop]) {
    try {
      fs.unlinkSync(target);
    } catch {
      /* already gone */
    }
  }
}

async function runInstall(request: SetupInstallRequest): Promise<void> {
  sendProgress({ phase: 'extract', label: 'Reading payload…', percent: 8 });
  const payload = await extractAppendedPayload();
  const source = payload ?? (await resolvePayloadRoot());
  if (!source && !isPreview()) {
    sendProgress({
      phase: 'error',
      label: 'Payload missing',
      percent: null,
      error: 'This installer has no app payload. Rebuild with npm run electron:pack or use setup:preview.',
    });
    return;
  }

  sendProgress({ phase: 'copy', label: 'Copying files…', percent: 35 });
  if (source && !isPreview()) {
    await copyWithProgress(source, request.installDir);
  } else {
    await mkdir(request.installDir, { recursive: true });
    await new Promise((r) => setTimeout(r, 700));
  }

  sendProgress({
    phase: 'register',
    label: request.createShortcuts ? 'Creating shortcuts…' : 'Finishing setup…',
    percent: 78,
  });
  await writeFile(
    path.join(request.installDir, '.install-meta.json'),
    JSON.stringify(
      {
        installDir: request.installDir,
        scope: request.scope,
        version: app.getVersion(),
      },
      null,
      2,
    ),
    'utf8',
  );
  if (!isPreview()) {
    writeUninstallEntry(request.installDir, request.scope);
    if (request.createShortcuts) {
      createShortcut(request.installDir);
    }
  }

  sendProgress({ phase: 'done', label: 'Setup finished', percent: 100 });
  if (request.launchWhenReady && !isPreview()) {
    const exe = path.join(request.installDir, MAIN_EXECUTABLE);
    if (fs.existsSync(exe)) {
      spawn(exe, { detached: true, stdio: 'ignore' }).unref();
    }
  }
}

async function runUninstall(request: SetupUninstallRequest): Promise<void> {
  const meta = readInstallMeta();
  const installDir = meta?.installDir;
  if (!installDir) {
    sendProgress({
      phase: 'error',
      label: 'Not found',
      percent: null,
      error: 'No Testrix installation was found on this account.',
    });
    return;
  }
  sendProgress({ phase: 'cleanup', label: 'Removing files…', percent: 40 });
  if (!isPreview()) {
    await rm(installDir, { recursive: true, force: true });
    if (request.removeUserData) {
      await rm(app.getPath('userData').replace('Testrix Setup', 'Testrix'), {
        recursive: true,
        force: true,
      });
    }
    removeShortcuts();
    if (process.platform === 'win32') {
      spawn(
        'reg',
        [
          'delete',
          `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`,
          '/f',
        ],
        { windowsHide: true },
      );
    }
  } else {
    await new Promise((r) => setTimeout(r, 700));
  }
  sendProgress({ phase: 'done', label: 'Uninstall finished', percent: 100 });
}

function buildMeta(): SetupMeta {
  const existing = readInstallMeta();
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return {
    mode: parseMode(),
    version: app.getVersion(),
    productName: PRODUCT_NAME,
    defaultDir: defaultInstallDir('user'),
    defaultScope: 'user',
    installDir: existing?.installDir ?? null,
    installScope: existing?.scope ?? null,
    preview: isPreview(),
    theme,
  };
}

async function createWindow(): Promise<void> {
  const uninstall = parseMode() === 'uninstall';
  mainWindow = new BrowserWindow({
    ...setupWindowDefaults,
    width: uninstall ? 500 : 540,
    height: uninstall ? 460 : 520,
    ...windowIconOption(),
    webPreferences: {
      ...sandboxedWebPreferences,
      preload: bundledPath('preload/preload.cjs'),
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  const html = bundledPath('../src/renderer/index.html');
  await mainWindow.loadFile(html);
}

app.whenReady().then(async () => {
  attachDefaultCsp(session.defaultSession, { connectSrc: `'self'` });

  ipcMain.handle(SetupIpcChannels.getMeta, () => buildMeta());
  ipcMain.handle(SetupIpcChannels.chooseDirectory, async (_e, current: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(SetupIpcChannels.startInstall, (_e, request: SetupInstallRequest) => runInstall(request));
  ipcMain.handle(SetupIpcChannels.startUninstall, (_e, request: SetupUninstallRequest) =>
    runUninstall(request),
  );
  ipcMain.handle(SetupIpcChannels.cancel, () => {
    app.quit();
  });
  ipcMain.handle(SetupIpcChannels.launchApp, async () => {
    if (!isPreview()) {
      const meta = readInstallMeta();
      if (meta) {
        const exe = path.join(meta.installDir, MAIN_EXECUTABLE);
        if (fs.existsSync(exe)) {
          spawn(exe, { detached: true, stdio: 'ignore' }).unref();
        }
      }
    }
    app.quit();
  });
  ipcMain.handle(SetupIpcChannels.windowMinimize, () => mainWindow?.minimize());
  ipcMain.handle(SetupIpcChannels.windowClose, () => app.quit());
  ipcMain.handle(SetupIpcChannels.openExternal, (_e, url: string) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
  });

  if (isSilentUpdate()) {
    const dir = defaultInstallDir('user');
    await runInstall({ scope: 'user', installDir: dir, launchWhenReady: false, createShortcuts: false });
    app.quit();
    return;
  }

  await createWindow();
});
