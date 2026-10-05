import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell,
  utilityProcess,
} from 'electron';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  APP_ID,
  MAIN_EXECUTABLE,
  PRODUCT_NAME,
  PUBLISHER_NAME,
  SETUP_APP_ID,
  SetupIpcChannels,
  setupSurfaceTitle,
  type SetupInstallRequest,
  type SetupMeta,
  type SetupMode,
  type SetupProgressEvent,
  type SetupScope,
  type SetupUninstallRequest,
} from '@testrix/contracts';
import {
  applyWindowIcon,
  attachDefaultCsp,
  bundledPath,
  sandboxedWebPreferences,
  setupWindowDefaults,
  windowIconOption,
} from '@testrix/electron-core';

import {
  legacyV1InstallDirs,
  prepareInstallDestination,
  removeLegacyV1Installs,
} from './legacy-v1';
import { extractAppendedPayload, resolvePayloadRoot } from './payload';
import {
  copySetupRuntime,
  createUpdateLog,
  deferredDeleteSpawn,
  deleteInstallContents,
  isPathInside,
  parseSilentUpdateArgs,
  swapInstall,
  waitForExit,
  writeDeferredDeleteScript,
} from './silent-update';
import {
  deleteWindowsUninstallKeys,
  resolveInstallLocation,
  STALE_WINDOWS_UNINSTALL_KEYS,
} from './windows-arp';

app.commandLine.appendSwitch('disable-features', 'Translate,OptimizationGuideModelDownloading');
if (process.platform === 'win32') app.setAppUserModelId(SETUP_APP_ID);
app.setPath('userData', path.join(app.getPath('appData'), `${PRODUCT_NAME}Setup`));

function parseMode(): SetupMode {
  if (isSilentUpdate()) return 'update';
  if (process.argv.includes('--mode=uninstall') || process.argv.includes('--uninstall')) {
    return 'uninstall';
  }
  return 'install';
}

function isPreview(): boolean {
  return process.env['TESTRIX_SETUP_PREVIEW'] === '1' || process.argv.includes('--preview');
}

function isSilentUpdate(): boolean {
  return process.argv.includes('--silent-update') || process.env['TESTRIX_SILENT_UPDATE'] === '1';
}

function defaultInstallDir(scope: SetupScope): string {
  if (process.platform === 'win32') {
    if (scope === 'machine') {
      return path.join(process.env['ProgramFiles'] || 'C:\\Program Files', PRODUCT_NAME);
    }
    const local = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
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
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
        installDir?: string;
        scope?: SetupScope;
      };
      if (raw.installDir) {
        return { installDir: raw.installDir, scope: raw.scope === 'machine' ? 'machine' : 'user' };
      }
    } catch {
      return { installDir: dir, scope: dir.includes('Program Files') ? 'machine' : 'user' };
    }
  }
  return null;
}

/** Install folder from meta, or leftover files / this Setup exe after a hung uninstall. */
function locateInstall(): { installDir: string; scope: SetupScope } | null {
  return resolveInstallLocation({
    meta: readInstallMeta(),
    execPath: process.execPath,
    userDir: defaultInstallDir('user'),
    machineDir: defaultInstallDir('machine'),
    exists: (file) => fs.existsSync(file),
  });
}

let mainWindow: BrowserWindow | null = null;
let lastProgress: SetupProgressEvent | null = null;

function sendProgress(event: SetupProgressEvent): void {
  lastProgress = event;
  mainWindow?.webContents.send(SetupIpcChannels.progress, event);
}

/** Keeps the update meter moving while a long extract or copy runs off the UI thread. */
function startProgressPulse(
  label: string,
  from: number,
  to: number,
  phase: SetupProgressEvent['phase'] = 'extract',
): () => void {
  let percent = from;
  sendProgress({ phase, label, percent });
  const timer = setInterval(() => {
    if (percent < to) percent = Math.min(to, percent + 2);
    sendProgress({ phase, label, percent });
  }, 450);
  return () => clearInterval(timer);
}

/** Shows a timeout countdown while Setup waits for the running app to exit. */
async function waitForAppExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  const tick = (): void => {
    const elapsed = Date.now() - startedAt;
    sendProgress({
      phase: 'extract',
      label: 'Waiting for Testrix to close…',
      percent: Math.min(99, Math.round((elapsed / timeoutMs) * 100)),
    });
  };
  tick();
  const timer = setInterval(tick, 400);
  try {
    return await waitForExit(pid, timeoutMs);
  } finally {
    clearInterval(timer);
  }
}

function replayProgress(): void {
  if (lastProgress) mainWindow?.webContents.send(SetupIpcChannels.progress, lastProgress);
}

/** Payload extract lands in `%TEMP%/testrix-payload-*`; do not leave those behind. */
async function removePayloadTemp(source: string | null): Promise<void> {
  if (!source) return;
  const parent = path.dirname(source);
  if (!path.basename(parent).startsWith('testrix-payload-')) return;
  await rm(parent, { recursive: true, force: true }).catch(() => undefined);
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

/** Setup shell copied beside the app so Update and Uninstall keep a Testrix.exe. */
function setupShellPath(installDir: string): string {
  return path.join(
    installDir,
    'setup',
    PRODUCT_NAME + (process.platform === 'win32' ? '.exe' : ''),
  );
}

function copySetupShell(installDir: string): string {
  const dest = setupShellPath(installDir);
  copySetupRuntime(path.dirname(process.execPath), path.dirname(dest));
  return dest;
}

function writeUninstallEntry(installDir: string, scope: SetupScope): void {
  if (process.platform !== 'win32') {
    return;
  }
  const setupExe = isPreview() ? process.execPath : copySetupShell(installDir);
  const uninstallCmd = path.join(installDir, 'uninstall.cmd');
  fs.writeFileSync(
    uninstallCmd,
    `@echo off\r\nstart "" "${setupExe}" -- --mode=uninstall\r\n`,
    'utf8',
  );
  const root = scope === 'machine' ? 'HKLM' : 'HKCU';
  const key = `${root}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;
  const uninstallString = `"${setupExe}" -- --mode=uninstall`;
  const add = (name: string, value: string, type = 'REG_SZ'): void => {
    spawn('reg', ['add', key, '/v', name, '/t', type, '/d', value, '/f'], { windowsHide: true });
  };
  add('DisplayName', PRODUCT_NAME);
  add('Publisher', PUBLISHER_NAME);
  add('InstallLocation', installDir);
  add('UninstallString', uninstallString);
  add('DisplayIcon', path.join(installDir, MAIN_EXECUTABLE));
  add('NoModify', '1', 'REG_DWORD');
  add('NoRepair', '1', 'REG_DWORD');
  spawn('reg', ['delete', key, '/v', 'QuietUninstallString', '/f'], { windowsHide: true });
  for (const hive of ['HKCU', 'HKLM'] as const) {
    for (const stale of STALE_WINDOWS_UNINSTALL_KEYS) {
      spawn(
        'reg',
        [
          'delete',
          `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${stale}`,
          '/f',
        ],
        { windowsHide: true },
      );
    }
  }
  writeDisplayVersion(scope);
}

function writeDisplayVersion(scope: SetupScope): void {
  if (process.platform !== 'win32') {
    return;
  }
  const root = scope === 'machine' ? 'HKLM' : 'HKCU';
  const key = `${root}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;
  spawn('reg', ['add', key, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', app.getVersion(), '/f'], {
    windowsHide: true,
  });
}

function shortcutPaths(): { readonly startMenu: string; readonly desktop: string } {
  const startMenu = path.join(
    process.env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming'),
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
      $s.IconLocation = '${exe.replace(/'/g, "''")}'
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

function windowsLocalAppData(): string {
  return process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
}

function windowsAppData(): string {
  return process.env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming');
}

/** Stops every process whose exe lives under `rootDir`, except this Setup pid. */
async function stopProcessesUnder(rootDir: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const root = path.resolve(rootDir).replace(/'/g, "''");
  await new Promise<void>((resolve) => {
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$root = '${root}'; $prefix = if ($root.EndsWith('\\')) { $root } else { $root + '\\' }; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ProcessId -ne ${process.pid} -and ($_.ExecutablePath -ieq $root -or $_.ExecutablePath.ToLower().StartsWith($prefix.ToLower())) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      { windowsHide: true },
    );
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

async function wipePath(target: string): Promise<void> {
  await deleteInstallContents(target);
}

/** Removes 1.x Squirrel copies and empties a previous Testrix dest before overlay copy. */
async function cleanupPreviousVersion(installDir: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const localAppData = windowsLocalAppData();
  const appData = windowsAppData();
  await stopProcessesUnder(installDir);
  for (const dir of legacyV1InstallDirs({ localAppData, keepDir: installDir })) {
    await stopProcessesUnder(dir);
  }
  await removeLegacyV1Installs({
    keepDir: installDir,
    localAppData,
    appData,
    remove: wipePath,
  });
  await prepareInstallDestination(installDir, { remove: wipePath });
}

async function runInstall(request: SetupInstallRequest): Promise<void> {
  try {
    const stopExtract = startProgressPulse('Reading payload…', 8, 32);
    let source: string | null = null;
    try {
      source = (await extractAppendedPayload()) ?? (await resolvePayloadRoot());
    } finally {
      stopExtract();
    }
    if (!source && !isPreview()) {
      sendProgress({
        phase: 'error',
        label: 'Payload missing',
        percent: null,
        error:
          'This installer has no app payload. Rebuild with npm run electron:pack or use setup:preview.',
      });
      return;
    }

    if (!isPreview()) {
      sendProgress({ phase: 'cleanup', label: 'Removing the previous version…', percent: 33 });
      await cleanupPreviousVersion(request.installDir);
    }

    const stopCopy = startProgressPulse('Copying files…', 35, 74, 'copy');
    try {
      if (source && !isPreview()) await copyWithProgress(source, request.installDir);
      else {
        await mkdir(request.installDir, { recursive: true });
        await new Promise((r) => setTimeout(r, 700));
      }
    } finally {
      stopCopy();
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
      if (fs.existsSync(exe)) spawn(exe, { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (error) {
    sendProgress({
      phase: 'error',
      label: 'Setup failed',
      percent: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function readMetaAt(installDir: string): { scope: SetupScope } | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(installDir, '.install-meta.json'), 'utf8'),
    ) as { scope?: SetupScope };
    return { scope: raw.scope === 'machine' ? 'machine' : 'user' };
  } catch {
    return null;
  }
}

function launchInstalledApp(installDir: string, args: readonly string[] = []): void {
  const exe = path.join(installDir, MAIN_EXECUTABLE);
  if (fs.existsSync(exe)) {
    spawn(exe, [...args], { detached: true, stdio: 'ignore' }).unref();
  }
}

/**
 * Update handed over by the running app: wait for it to exit, swap the install folder
 * and start the new build. On any failure the previous build is started again.
 */
async function runSilentUpdate(): Promise<boolean> {
  const args = parseSilentUpdateArgs(process.argv);
  const log = createUpdateLog(args.logFile);
  const installDir = args.installDir ?? readInstallMeta()?.installDir ?? defaultInstallDir('user');
  const meta = readMetaAt(installDir);
  const relaunch = (withNotes: boolean): void => {
    if (!args.relaunch) {
      return;
    }
    launchInstalledApp(
      installDir,
      withNotes && args.updatedFrom ? [`--updated-from=${args.updatedFrom}`] : [],
    );
  };
  log(`Updating ${installDir} to ${app.getVersion()}.`);
  sendProgress({ phase: 'extract', label: 'Preparing the update…', percent: null });
  if (!meta) {
    log('No .install-meta.json in the install folder; only Setup installs can be updated.');
    sendProgress({
      phase: 'error',
      label: 'Update cancelled',
      percent: null,
      error: 'This copy was not installed with Testrix.',
    });
    relaunch(false);
    return false;
  }
  const payloadTask = extractAppendedPayload().then((payload) => payload ?? resolvePayloadRoot());
  let source: string | null = null;
  if (args.waitPid) {
    sendProgress({ phase: 'extract', label: 'Waiting for Testrix to close…', percent: 0 });
    if (!(await waitForAppExit(args.waitPid, 60_000))) {
      log(`Testrix (pid ${args.waitPid}) did not exit within a minute; the update was cancelled.`);
      sendProgress({
        phase: 'error',
        label: 'Update cancelled',
        percent: null,
        error: 'Testrix did not exit in time, so the update was cancelled.',
      });
      relaunch(false);
      await removePayloadTemp(await payloadTask.catch(() => null));
      return false;
    }
  }
  const stopPulse = startProgressPulse('Unpacking the new build…', 12, 46);
  try {
    source = await payloadTask;
  } finally {
    stopPulse();
  }
  try {
    if (!source) {
      log('This installer has no app payload.');
      sendProgress({
        phase: 'error',
        label: 'Update failed',
        percent: null,
        error: 'This installer has no app payload.',
      });
      relaunch(false);
      return false;
    }
    const stopCopy = startProgressPulse('Replacing the installed files…', 50, 90, 'copy');
    try {
      await swapInstall({ source, installDir, log });
    } finally {
      stopCopy();
    }
    sendProgress({ phase: 'cleanup', label: 'Removing the previous version…', percent: 92 });
    await removeLegacyV1Installs({
      keepDir: installDir,
      localAppData: windowsLocalAppData(),
      appData: windowsAppData(),
      remove: wipePath,
    });
    sendProgress({ phase: 'register', label: 'Finishing the update…', percent: 96 });
    await writeFile(
      path.join(installDir, '.install-meta.json'),
      JSON.stringify({ installDir, scope: meta.scope, version: app.getVersion() }, null, 2),
      'utf8',
    );
    writeUninstallEntry(installDir, meta.scope);
    log('Update installed.');
    sendProgress({ phase: 'done', label: 'Update installed', percent: 100 });
    relaunch(true);
    return true;
  } catch (error) {
    log(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
    sendProgress({
      phase: 'error',
      label: 'Update failed',
      percent: null,
      error: error instanceof Error ? error.message : String(error),
    });
    relaunch(false);
    return false;
  } finally {
    await removePayloadTemp(source);
  }
}

async function runUninstall(request: SetupUninstallRequest): Promise<void> {
  const located = locateInstall();
  const stopPulse = startProgressPulse('Removing files…', 40, 88, 'cleanup');
  try {
    if (!isPreview()) {
      if (process.platform === 'win32') await deleteWindowsUninstallKeys();
      if (located) {
        await stopMainApp(located.installDir);
        const keepDir = isPathInside(process.execPath, located.installDir)
          ? path.dirname(process.execPath)
          : null;
        await deleteInstallContents(located.installDir, keepDir);
        if (keepDir) scheduleInstallDirDelete(located.installDir);
      }
      if (request.removeUserData) {
        await rm(path.join(app.getPath('appData'), PRODUCT_NAME), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
      removeShortcuts();
    }
    stopPulse();
    sendProgress({ phase: 'done', label: 'Uninstall finished', percent: 100 });
  } catch (error) {
    stopPulse();
    sendProgress({
      phase: 'error',
      label: 'Uninstall failed',
      percent: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Closes the installed workbench exe so its files can be deleted. Does not kill this Setup process. */
async function stopMainApp(installDir: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const mainExe = path.resolve(path.join(installDir, MAIN_EXECUTABLE)).replace(/'/g, "''");
  await new Promise<void>((resolve) => {
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq '${mainExe}') -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      { windowsHide: true },
    );
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

function scheduleInstallDirDelete(installDir: string): void {
  if (process.platform !== 'win32') return;
  const script = path.join(os.tmpdir(), `testrix-uninstall-${process.pid}.vbs`);
  writeDeferredDeleteScript(installDir, process.pid, script);
  const launch = deferredDeleteSpawn(script);
  spawn(launch.command, launch.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

function buildMeta(): SetupMeta {
  const existing = locateInstall();
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return {
    mode: parseMode(),
    version: app.getVersion(),
    productName: PRODUCT_NAME,
    defaultDir: defaultInstallDir('user'),
    machineDir: defaultInstallDir('machine'),
    defaultScope: 'user',
    installDir: existing?.installDir ?? null,
    installScope: existing?.scope ?? null,
    preview: isPreview(),
    theme,
  };
}

async function createWindow(): Promise<void> {
  const mode = parseMode();
  const title = setupSurfaceTitle(mode);
  app.setName(title);
  const size =
    mode === 'update'
      ? { width: 440, height: 460 }
      : mode === 'uninstall'
        ? { width: 500, height: 460 }
        : { width: 540, height: 520 };
  const existing = locateInstall();
  mainWindow = new BrowserWindow({
    ...setupWindowDefaults,
    ...size,
    ...windowIconOption(),
    title,
    webPreferences: {
      ...sandboxedWebPreferences,
      preload: bundledPath('preload/preload.cjs'),
    },
  });
  applyWindowIcon(mainWindow);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.moveTop();
  });
  mainWindow.webContents.on('did-finish-load', () => replayProgress());
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    dialog.showErrorBox(title, `Preload failed (${preloadPath}): ${error.message}`);
  });
  const html = bundledPath('../src/renderer/index.html');
  await mainWindow.loadFile(html, {
    query: {
      ...(mode === 'install' ? {} : { mode }),
      defaultDir: defaultInstallDir('user'),
      machineDir: defaultInstallDir('machine'),
      installDir: existing?.installDir ?? defaultInstallDir('user'),
      version: app.getVersion(),
    },
  });
}

app
  .whenReady()
  .then(async () => {
    attachDefaultCsp(session.defaultSession, { connectSrc: `'self'` });

    ipcMain.handle(SetupIpcChannels.getMeta, () => {
      queueMicrotask(() => replayProgress());
      return buildMeta();
    });
    ipcMain.handle(SetupIpcChannels.chooseDirectory, async (_e, current: string) => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        defaultPath: current,
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    ipcMain.handle(SetupIpcChannels.startInstall, (_e, request: SetupInstallRequest) =>
      runInstall(request),
    );
    ipcMain.handle(SetupIpcChannels.startUninstall, (_e, request: SetupUninstallRequest) =>
      runUninstall(request),
    );
    ipcMain.handle(SetupIpcChannels.cancel, () => {
      app.quit();
    });
    ipcMain.handle(SetupIpcChannels.launchApp, async () => {
      if (!isPreview()) {
        const meta = locateInstall();
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
      await createWindow();
      const didInstall = await runSilentUpdate();
      if (didInstall) app.quit();
      return;
    }

    await createWindow();
  })
  .catch((error: unknown) => {
    dialog.showErrorBox(
      setupSurfaceTitle(parseMode()),
      error instanceof Error ? error.message : String(error),
    );
    app.exit(1);
  });
