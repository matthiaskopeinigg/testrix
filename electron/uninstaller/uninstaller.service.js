/**
 * Main-process uninstaller. Boots when the main app is launched with
 * `--uninstall`, presents a styled UI that mirrors the installer, and on
 * confirmation orchestrates an OS-specific cleanup that:
 *   - removes shortcuts / registry / .desktop entries / Applications entries
 *   - optionally removes the user data directory
 *   - schedules deletion of the install folder so it can run AFTER this
 *     Electron process exits (the running .exe / .app holds file locks)
 *
 * The renderer never touches Node APIs; everything OS-specific is gated
 * through the IPC handlers below.
 */
const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const APP_ID = 'dev.testrix.app';
const REG_SUBKEY = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;
const MAIN_EXE = 'Testrix.exe';
const META_FILE = '.install-meta.json';
const PRODUCT = 'Testrix';
const PATHS_ANCHOR_FILE = 'paths.json';
const PROFILES_MANIFEST_FILE = 'profiles.json';
const TEAM_WORKSPACE_FILE = 'testrix.team.json';
const TEAM_WORKSPACE_DIR_NAME = 'team-workspace';
/*
 * Electron uses `productName` from package.json for the userData folder.
 * Testrix ships with productName "Testrix", so user data lives under that key.
 */
const USER_DATA_DIR_NAME = 'Testrix';

/* ─────────────────────────────────────────────────────── window */

const WINDOW_WIDTH = 640;
const WINDOW_HEIGHT = 600;

let uninstallerWindow = null;

function rendererPath(...rel) {
  return path.join(__dirname, ...rel);
}

function resolveLogoForBrowserWindow() {
  // Prefer the packaged .ico from extraResources, fall back to bundled PNG.
  if (process.platform === 'win32') {
    const ico = path.join(process.resourcesPath || '', 'icon.ico');
    if (fs.existsSync(ico)) return ico;
  }
  return rendererPath('assets', 'logo.png');
}

function createUninstallerWindow() {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxWidth: WINDOW_WIDTH,
    maxHeight: WINDOW_HEIGHT,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    show: false,
    backgroundColor: '#00000000',
    icon: resolveLogoForBrowserWindow(),
    title: `${PRODUCT} Uninstall`,
    webPreferences: {
      preload: rendererPath('preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  if (process.platform === 'win32') {
    try {
      const image = nativeImage.createFromPath(resolveLogoForBrowserWindow());
      if (!image.isEmpty()) win.setIcon(image);
    } catch (_) {
      /* non-fatal */
    }
  }

  win.once('ready-to-show', () => win.show());
  win.loadFile(rendererPath('index.html'));
  return win;
}

/* ───────────────────────────────────────── install discovery */

function pkgVersion() {
  try {
    if (app.isPackaged) {
      return app.getVersion();
    }
    return require(path.join(__dirname, '..', '..', 'package.json')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function defaultUserDataPath() {
  // Match Electron's default `app.getPath('userData')` resolution for each OS.
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, USER_DATA_DIR_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', USER_DATA_DIR_NAME);
  }
  return path.join(os.homedir(), '.config', USER_DATA_DIR_NAME);
}

function normalizeDeletionPath(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = path.normalize(trimmed);
  if (!path.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Blocks drive roots and well-known parent folders so we never rm -rf a home
 * directory or Documents by accident. Targets only come from Testrix anchors.
 */
function isSafeDeletionTarget(target) {
  const normalized = normalizeDeletionPath(target);
  if (!normalized) {
    return false;
  }

  const blocked = new Set(
    [
      os.homedir(),
      process.env.USERPROFILE,
      process.env.APPDATA,
      process.env.LOCALAPPDATA,
      process.env.HOME,
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Library'),
      path.join(os.homedir(), '.config'),
    ]
      .filter(Boolean)
      .map((entry) => normalizeDeletionPath(entry))
      .filter(Boolean)
      .map((entry) => entry.toLowerCase()),
  );

  if (blocked.has(normalized.toLowerCase())) {
    return false;
  }

  const segments = normalized.split(path.sep).filter(Boolean);
  if (process.platform === 'win32') {
    return segments.length >= 3;
  }
  return segments.length >= 2;
}

function addDeletionTarget(targets, candidate) {
  const normalized = normalizeDeletionPath(candidate);
  if (!normalized || !isSafeDeletionTarget(normalized)) {
    return;
  }
  targets.add(normalized);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Resolves every on-disk folder Testrix may have written: Electron userData,
 * custom config roots from paths.json, profile workspaces, linked profile dirs,
 * and team Git workspaces from testrix.team.json.
 */
function collectDataDeletionTargets(userDataPath) {
  const targets = new Set();
  addDeletionTarget(targets, userDataPath);

  const anchor = readJsonFile(path.join(userDataPath, PATHS_ANCHOR_FILE));
  const sharedConfigDirs = [];

  if (anchor && typeof anchor === 'object') {
    if (anchor.schemaVersion === 1 && typeof anchor.configDir === 'string') {
      addDeletionTarget(targets, anchor.configDir);
      sharedConfigDirs.push(anchor.configDir);
    }
    if (anchor.schemaVersion === 2) {
      if (typeof anchor.sharedConfigDir === 'string') {
        addDeletionTarget(targets, anchor.sharedConfigDir);
        sharedConfigDirs.push(anchor.sharedConfigDir);
      }
      if (typeof anchor.profilesRoot === 'string') {
        addDeletionTarget(targets, anchor.profilesRoot);
      }
    }
  }

  const profilesManifest = readJsonFile(path.join(userDataPath, PROFILES_MANIFEST_FILE));
  if (profilesManifest && Array.isArray(profilesManifest.profiles)) {
    for (const profile of profilesManifest.profiles) {
      if (profile && typeof profile.linkedDir === 'string') {
        addDeletionTarget(targets, profile.linkedDir);
      }
    }
  }

  for (const sharedConfigDir of sharedConfigDirs) {
    const normalizedShared = normalizeDeletionPath(sharedConfigDir);
    if (!normalizedShared) {
      continue;
    }

    addDeletionTarget(targets, path.join(normalizedShared, TEAM_WORKSPACE_DIR_NAME));

    const teamConfig = readJsonFile(path.join(normalizedShared, TEAM_WORKSPACE_FILE));
    if (teamConfig && typeof teamConfig.teamRepoDir === 'string') {
      addDeletionTarget(targets, teamConfig.teamRepoDir);
    }
  }

  return [...targets].sort(
    (a, b) => b.split(path.sep).filter(Boolean).length - a.split(path.sep).filter(Boolean).length,
  );
}

function readMetaFromInstallDir(installDir) {
  try {
    const raw = fs.readFileSync(path.join(installDir, META_FILE), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Resolves `{ ok, scope, installDir, version, userDataPath, shortcuts,
 * uninstallScript, message? }` describing the installation that this
 * uninstaller exe belongs to.
 *
 * Strategy:
 *   1. Look for `.install-meta.json` next to the running executable.
 *   2. macOS: walk up to the enclosing `.app` bundle.
 *   3. Linux: use the directory containing the executable.
 *   4. As a last resort on Windows, query the HKCU uninstall key.
 */
function discoverInstall() {
  const exePath = process.execPath;
  const userDataPath = defaultUserDataPath();
  const dataDeletionTargets = collectDataDeletionTargets(userDataPath);

  // Walk up looking for `.install-meta.json`. macOS apps have the meta one
  // level above `Contents/MacOS`, so an upward scan is the cleanest match.
  let dir = path.dirname(exePath);
  for (let depth = 0; depth < 6; depth++) {
    const meta = readMetaFromInstallDir(dir);
    if (meta && meta.installDir) {
      return {
        ok: true,
        scope: meta.scope === 'machine' ? 'machine' : 'user',
        installDir: meta.installDir,
        version: meta.version || pkgVersion(),
        shortcuts: Array.isArray(meta.shortcuts) ? meta.shortcuts : [],
        uninstallScript: meta.uninstallScript || null,
        userDataPath,
        dataDeletionTargets,
      };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (process.platform === 'darwin') {
    // Find the enclosing `.app` bundle if any (`/Applications/Foo.app/Contents/MacOS/Foo`).
    const segments = exePath.split(path.sep);
    const idx = segments.findIndex((s) => s.endsWith('.app'));
    if (idx >= 0) {
      const installDir = segments.slice(0, idx + 1).join(path.sep);
      const scope = installDir.startsWith('/Applications/') ? 'machine' : 'user';
      return {
        ok: true,
        scope,
        installDir,
        version: pkgVersion(),
        shortcuts: [],
        uninstallScript: null,
        userDataPath,
        dataDeletionTargets,
      };
    }
  }

  if (process.platform === 'win32') {
    try {
      const q = spawnSync('reg', ['query', `HKCU\\${REG_SUBKEY}`, '/v', 'InstallLocation'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const m = /InstallLocation\s+REG_SZ\s+(.*)/.exec(q.stdout || '');
      if (m && fs.existsSync(m[1].trim())) {
        const installDir = m[1].trim();
        const meta = readMetaFromInstallDir(installDir);
        return {
          ok: true,
          scope: meta?.scope === 'machine' ? 'machine' : 'user',
          installDir,
          version: meta?.version || pkgVersion(),
          shortcuts: Array.isArray(meta?.shortcuts) ? meta.shortcuts : [],
          uninstallScript: meta?.uninstallScript || null,
          userDataPath,
          dataDeletionTargets,
        };
      }
    } catch (_) {
      /* fall through */
    }
  }

  // Last resort: just delete the directory containing the running exe.
  const installDir = path.dirname(exePath);
  return {
    ok: true,
    scope: 'unknown',
    installDir,
    version: pkgVersion(),
    shortcuts: [],
    uninstallScript: null,
    userDataPath,
    dataDeletionTargets,
  };
}

/* ─────────────────────────────────── platform-specific cleanup */

function cmdQuote(s) {
  return String(s).replace(/"/g, '""');
}

function shellQuote(s) {
  // POSIX single-quote escaping for bash/sh.
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function makeTempPath(ext) {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join(os.tmpdir(), `testrix-uninstall-${stamp}-${rand}.${ext}`);
}

/**
 * Windows: build a .cmd that polls until the main exe is unlocked, then
 * removes the install dir, registry key, and shortcuts.
 *
 * @returns {string} path to the temp .cmd
 */
function buildWindowsCleanupScript({ installDir, scope, shortcuts, dataPaths }) {
  const scriptPath = makeTempPath('cmd');
  const regRoot = scope === 'machine' ? 'HKLM' : 'HKCU';
  const lines = ['@echo off', 'setlocal'];
  lines.push(`set "INSTALL_DIR=${cmdQuote(installDir)}"`);
  lines.push(`set "MAIN_EXE=${cmdQuote(path.join(installDir, MAIN_EXE))}"`);
  lines.push(`set "REG_KEY=${regRoot}\\${REG_SUBKEY}"`);

  if (scope === 'machine') {
    /*
     * Self-elevate before touching Program Files / HKLM. `-WindowStyle Hidden`
     * on the relaunch makes the elevated cmd window invisible (UAC prompt is
     * still shown — that's required by Windows for elevation consent).
     */
    lines.push('if /i not "%~1"=="--elevated" (');
    lines.push('  net session >nul 2>&1');
    lines.push('  if errorlevel 1 (');
    lines.push('    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath \'%~f0\' -ArgumentList \'--elevated\' -Verb RunAs -WindowStyle Hidden"');
    lines.push('    exit /b 0');
    lines.push('  )');
    lines.push(')');
  }

  // Poll until the parent process has released `Testrix.exe`. We try a
  // single delete on the exe; if it succeeds (or the exe is already gone),
  // we can safely rm the whole install dir.
  lines.push('set TRIES=0');
  lines.push(':wait');
  lines.push('set /a TRIES=TRIES+1');
  lines.push('if exist "%MAIN_EXE%" (');
  lines.push('  del /f /q "%MAIN_EXE%" >nul 2>nul');
  lines.push('  if exist "%MAIN_EXE%" (');
  lines.push('    timeout /t 1 /nobreak >nul');
  lines.push('    if %TRIES% LSS 30 goto wait');
  lines.push('  )');
  lines.push(')');

  // Shortcuts
  for (const lnk of shortcuts) {
    lines.push(`del /f /q "${cmdQuote(lnk)}" >nul 2>nul`);
  }

  // Registry uninstall key
  lines.push('reg delete "%REG_KEY%" /f >nul 2>nul');

  // Optional: user data folders (settings, profiles, team Git workspace, JSON stores)
  for (const dataPath of dataPaths || []) {
    lines.push(`rmdir /s /q "${cmdQuote(dataPath)}" >nul 2>nul`);
  }

  // Install dir
  lines.push('rmdir /s /q "%INSTALL_DIR%" >nul 2>nul');

  /*
   * Intentionally no self-delete. We used to end the script with the classic
   * `(goto) 2>nul & del "%~f0"` trick, but under `cmd /d /c` it occasionally
   * leaves the host cmd at an interactive prompt — the exact bug that left a
   * visible window behind on the user's machine. Without self-delete the
   * script ends, `cmd /d /c` exits cleanly, and the ~600-byte file simply
   * sits in `%TEMP%` until Windows runs its temp cleanup.
   */
  lines.push('endlocal');
  lines.push('exit /b 0');

  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
  return scriptPath;
}

function vbsStringLiteral(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Builds a tiny GUI-subsystem launcher for Windows cleanup. Starting `cmd.exe`
 * directly, even with `windowsHide: true`, can still flash a console window on
 * some Windows builds. `wscript.exe` has no console and can launch the cleanup
 * command with window style `0` (hidden).
 *
 * @returns {string} path to the temp .vbs
 */
function buildWindowsHiddenLauncher(scriptPath) {
  const launcherPath = makeTempPath('vbs');
  const command = `cmd.exe /d /c ""${scriptPath}""`;
  const lines = [
    'On Error Resume Next',
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run ${vbsStringLiteral(command)}, 0, False`,
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'fso.DeleteFile WScript.ScriptFullName, True',
  ];
  fs.writeFileSync(launcherPath, lines.join('\r\n'), 'utf8');
  return launcherPath;
}

/**
 * macOS: build a `.sh` that waits for the running process to die, then
 * removes the .app bundle and optionally the user data folder.
 *
 * @returns {string} path to the temp .sh (chmod +x applied)
 */
function buildMacCleanupScript({ installDir, parentPid, dataPaths }) {
  const scriptPath = makeTempPath('sh');
  const lines = ['#!/usr/bin/env bash', 'set -eu'];
  lines.push(`PARENT_PID=${parentPid}`);
  lines.push(`INSTALL_DIR=${shellQuote(installDir)}`);
  lines.push('for i in $(seq 1 30); do');
  lines.push('  if ! kill -0 "$PARENT_PID" 2>/dev/null; then break; fi');
  lines.push('  sleep 1');
  lines.push('done');

  if (installDir.startsWith('/Applications/')) {
    // System install — fall through; `rm -rf /Applications/Foo.app` succeeds
    // for the user when they own the .app (Mac App Store handles permissions
    // differently, but this matches a drag-to-Applications install).
    lines.push('rm -rf "$INSTALL_DIR" || sudo -n rm -rf "$INSTALL_DIR" || true');
  } else {
    lines.push('rm -rf "$INSTALL_DIR"');
  }

  for (const dataPath of dataPaths || []) {
    lines.push(`rm -rf ${shellQuote(dataPath)} || true`);
  }

  // self-delete
  lines.push('rm -f "$0" || true');
  fs.writeFileSync(scriptPath, lines.join('\n'), 'utf8');
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

/**
 * Linux: build a `.sh` that waits for the running process to die, then
 * removes the install folder, the .desktop entry, and optionally the user
 * data folder.
 *
 * @returns {string} path to the temp .sh (chmod +x applied)
 */
function buildLinuxCleanupScript({ installDir, parentPid, shortcuts, dataPaths }) {
  const scriptPath = makeTempPath('sh');
  const lines = ['#!/usr/bin/env bash', 'set -eu'];
  lines.push(`PARENT_PID=${parentPid}`);
  lines.push(`INSTALL_DIR=${shellQuote(installDir)}`);
  lines.push('for i in $(seq 1 30); do');
  lines.push('  if ! kill -0 "$PARENT_PID" 2>/dev/null; then break; fi');
  lines.push('  sleep 1');
  lines.push('done');

  for (const lnk of shortcuts) {
    lines.push(`rm -f ${shellQuote(lnk)} || true`);
  }
  // Also try the default .desktop locations.
  lines.push('rm -f "$HOME/.local/share/applications/testrix.desktop" || true');
  lines.push('rm -f "$HOME/Desktop/testrix.desktop" || true');

  if (installDir.startsWith('/opt/') || installDir.startsWith('/usr/')) {
    lines.push('sudo -n rm -rf "$INSTALL_DIR" || rm -rf "$INSTALL_DIR" || true');
  } else {
    lines.push('rm -rf "$INSTALL_DIR" || true');
  }

  for (const dataPath of dataPaths || []) {
    lines.push(`rm -rf ${shellQuote(dataPath)} || true`);
  }

  lines.push('rm -f "$0" || true');
  fs.writeFileSync(scriptPath, lines.join('\n'), 'utf8');
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

/**
 * Spawns the cleanup script detached from this Electron process. On Windows we
 * route through a temporary `wscript.exe` launcher so cleanup runs completely
 * hidden with no console flash. On macOS / Linux we just spawn bash detached.
 */
function spawnCleanupDetached(scriptPath) {
  if (process.platform === 'win32') {
    const launcherPath = buildWindowsHiddenLauncher(scriptPath);
    const child = spawn('wscript.exe', ['//B', '//Nologo', launcherPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return;
  }
  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

/**
 * Reports a progress phase to the renderer if the window is still open. We
 * never throw from here — if the window has already closed (e.g. user mashed
 * the X) the rest of the uninstall still has to finish.
 */
function sendProgress(payload) {
  try {
    if (uninstallerWindow && !uninstallerWindow.isDestroyed()) {
      uninstallerWindow.webContents.send('uninstall:progress', payload);
    }
  } catch (_) {
    /* ignore */
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delete each known shortcut file. Failures are swallowed (user may have
 * already removed a shortcut by hand). Runs in-process so progress reported
 * to the renderer reflects actual filesystem state.
 */
function removeShortcutsInProcess(shortcuts) {
  for (const lnk of shortcuts || []) {
    try {
      if (fs.existsSync(lnk)) fs.unlinkSync(lnk);
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * Delete the per-scope Windows uninstall registry key in-process. No-op on
 * other platforms. Best-effort: a machine-scope HKLM delete may fail without
 * admin, in which case the deferred cleanup script picks it up after this
 * process exits (the script self-elevates).
 */
function removeRegistryInProcess(scope) {
  if (process.platform !== 'win32') return;
  const regRoot = scope === 'machine' ? 'HKLM' : 'HKCU';
  const key = `${regRoot}\\${REG_SUBKEY}`;
  try {
    spawnSync('reg', ['delete', key, '/f'], { windowsHide: true });
  } catch (_) {
    /* ignore — deferred script retries */
  }
}

/**
 * Recursively remove a directory in-process. Returns whether the path is
 * gone after the attempt.
 */
function removeDirInProcess(target) {
  if (!target || !fs.existsSync(target)) return true;
  try {
    fs.rmSync(target, { recursive: true, force: true });
    return !fs.existsSync(target);
  } catch (_) {
    return false;
  }
}

/**
 * Recursively delete the contents of `installDir`, skipping `runningExe`
 * (Windows holds an exclusive lock on the executable that owns this
 * process). Any other file that can't be unlinked (e.g. a DLL still loaded
 * by an Electron helper) is also skipped — the deferred cleanup script
 * picks it up after this process exits.
 *
 * `onProgress(percent)` is called as files are deleted, `percent` in [0, 1].
 * Returns the list of paths that could not be deleted in-process.
 */
async function removeInstallDirContents(installDir, runningExe, onProgress) {
  if (!installDir || !fs.existsSync(installDir)) {
    onProgress(1);
    return [];
  }

  // Two-pass: collect files first, dirs second (deepest first), so we can
  // delete children before their parents.
  const files = [];
  const dirs = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        dirs.push(full);
      } else {
        files.push(full);
      }
    }
  })(installDir);

  const total = files.length + dirs.length;
  if (total === 0) {
    onProgress(1);
    return [];
  }

  const failed = [];
  let done = 0;
  // Cap progress updates to ~60 so we don't flood IPC; yield to the event
  // loop on each emission so the renderer can repaint.
  const yieldEvery = Math.max(1, Math.floor(total / 60));

  const runningExeNormalized = runningExe ? path.normalize(runningExe).toLowerCase() : null;

  for (const file of files) {
    const isRunning =
      runningExeNormalized && path.normalize(file).toLowerCase() === runningExeNormalized;
    if (isRunning) {
      failed.push(file);
      done++;
      continue;
    }
    try {
      fs.unlinkSync(file);
    } catch (_) {
      failed.push(file);
    }
    done++;
    if (done % yieldEvery === 0) {
      onProgress(done / total);
      await sleep(0);
    }
  }

  for (const dir of dirs) {
    try {
      fs.rmdirSync(dir);
    } catch (_) {
      failed.push(dir);
    }
    done++;
    if (done % yieldEvery === 0) {
      onProgress(done / total);
      await sleep(0);
    }
  }

  onProgress(1);
  return failed;
}

/**
 * Schedule a detached cleanup script to run after this process exits. The
 * script's job is now narrow: wait for `<installDir>\Testrix.exe` to be
 * unlocked, then remove the install dir folder (which contains only the
 * running exe and any DLLs we couldn't unlink in-process by the time we got
 * here). Registry / shortcuts / user data are still passed through as a
 * safety net in case the in-process attempts failed silently.
 */
function scheduleDeferredCleanup({ installDir, scope, parentPid, dataPaths }) {
  if (process.platform === 'win32') {
    const script = buildWindowsCleanupScript({
      installDir,
      scope,
      shortcuts: [],
      dataPaths: dataPaths || [],
    });
    spawnCleanupDetached(script);
    return;
  }
  if (process.platform === 'darwin') {
    const script = buildMacCleanupScript({
      installDir,
      parentPid,
      dataPaths: dataPaths || [],
    });
    spawnCleanupDetached(script);
    return;
  }
  if (process.platform === 'linux') {
    const script = buildLinuxCleanupScript({
      installDir,
      parentPid,
      shortcuts: [],
      dataPaths: dataPaths || [],
    });
    spawnCleanupDetached(script);
  }
}

/**
 * Coordinates the in-process uninstall.
 *
 * Each step runs synchronously inside this process and reports real progress
 * to the renderer, so by the time the `done` phase fires the user can trust
 * that:
 *   - shortcuts are gone
 *   - the Apps & Features registry entry is gone
 *   - user data is gone (if they opted in)
 *   - every install-dir file we *can* unlink is gone
 *
 * The only things left for the deferred script to do are the few files
 * Windows had locked (mainly the running .exe) and the now-empty install
 * folder shell. The renderer no longer shows "done" prematurely — it shows
 * it once the in-process work above is verifiably complete.
 */
async function performUninstall({ removeUserData }) {
  const info = discoverInstall();
  if (!info.ok) {
    return { ok: false, message: info.message || 'Installation not found.' };
  }

  try {
    sendProgress({ phase: 'preparing', percent: 0 });

    sendProgress({ phase: 'removing-shortcuts', percent: 0.05 });
    removeShortcutsInProcess(info.shortcuts);
    sendProgress({ phase: 'removing-shortcuts', percent: 0.15 });

    sendProgress({ phase: 'removing-registry', percent: 0.2 });
    removeRegistryInProcess(info.scope);
    sendProgress({ phase: 'removing-registry', percent: 0.3 });

    const dataPaths =
      removeUserData && info.dataDeletionTargets?.length
        ? info.dataDeletionTargets
        : removeUserData && info.userDataPath
          ? collectDataDeletionTargets(info.userDataPath)
          : [];

    if (dataPaths.length > 0) {
      sendProgress({ phase: 'removing-data', percent: 0.35 });
      for (const target of dataPaths) {
        removeDirInProcess(target);
      }
      sendProgress({ phase: 'removing-data', percent: 0.5 });
    }

    sendProgress({ phase: 'removing-app', percent: 0.55 });
    const stillLocked = await removeInstallDirContents(
      info.installDir,
      process.execPath,
      (pct) => {
        sendProgress({ phase: 'removing-app', percent: 0.55 + pct * 0.4 });
      },
    );

    sendProgress({ phase: 'finalizing', percent: 0.97 });
    scheduleDeferredCleanup({
      installDir: info.installDir,
      scope: info.scope,
      parentPid: process.pid,
      dataPaths: removeUserData ? dataPaths : [],
    });

    sendProgress({ phase: 'done', percent: 1 });
    return {
      ok: true,
      lockedCount: stillLocked.length,
    };
  } catch (err) {
    return {
      ok: false,
      message: err.message || String(err),
      code: err.code || null,
    };
  }
}

/* ────────────────────────────────────────── boot */

function registerIpc() {
  ipcMain.handle('uninstall:getVersion', () => pkgVersion());
  ipcMain.handle('uninstall:getPlatform', () => {
    if (process.platform === 'darwin') return 'mac';
    if (process.platform === 'linux') return 'linux';
    return 'win';
  });
  ipcMain.handle('uninstall:getInstallInfo', () => {
    const info = discoverInstall();
    return info;
  });
  ipcMain.handle('uninstall:run', (_e, opts) => performUninstall(opts || {}));
  ipcMain.handle('uninstall:quit', () => app.quit());
  ipcMain.handle('uninstall:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.minimize();
  });
  ipcMain.handle('uninstall:openExternal', (_e, url) => {
    if (typeof url !== 'string') return;
    if (!/^https?:\/\//i.test(url)) return;
    shell.openExternal(url);
  });
}

function boot() {
  // The uninstaller has nothing to do if another instance is running — let
  // the existing window come to the front.
  const gotLock = app.requestSingleInstanceLock({ uninstaller: true });
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    if (uninstallerWindow && !uninstallerWindow.isDestroyed()) {
      if (uninstallerWindow.isMinimized()) uninstallerWindow.restore();
      uninstallerWindow.focus();
    }
  });

  // Match the main app's AppUserModelID on Windows so the uninstaller window
  // groups with any running app instance in the taskbar.
  if (process.platform === 'win32') {
    try {
      app.setAppUserModelId(APP_ID);
    } catch (_) {
      /* non-fatal */
    }
  }

  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  app.disableHardwareAcceleration();

  app.whenReady().then(() => {
    registerIpc();
    uninstallerWindow = createUninstallerWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        uninstallerWindow = createUninstallerWindow();
      }
    });
  });

  app.on('window-all-closed', () => app.quit());
}

module.exports = { boot };
