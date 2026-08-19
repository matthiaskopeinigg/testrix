const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { app } = require('electron');
const {
  APP_ID,
  APP_NAME,
  META_FILE,
  cmdQuote,
  copyDirWithProgress,
  pkgVersion,
  readInstallMeta,
  writeInstallMeta: writeCommonInstallMeta,
} = require('./common');

const REG_SUBKEY = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;
const MAIN_EXECUTABLE = 'Testrix.exe';
const UNINSTALL_CMD = 'uninstall.cmd';

function defaultInstallDir(scope) {
  if (scope === 'machine') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    return path.join(programFiles, APP_NAME);
  }
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Programs', APP_NAME);
}

function payloadExists(payloadRoot) {
  return fs.existsSync(path.join(payloadRoot, MAIN_EXECUTABLE));
}

/**
 * Copies a payload directory with robocopy (much faster than per-file Node copy).
 * Exit codes 0–7 are success.
 *
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function copyDirRobocopy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const result = spawnSync(
    'robocopy',
    [from, to, '/E', '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'],
    { windowsHide: true, encoding: 'utf8' },
  );
  const code = result.status ?? 16;
  return code >= 0 && code < 8;
}

function getLaunchPath(installDir) {
  return path.join(installDir, MAIN_EXECUTABLE);
}

function isValidLaunchTarget(targetPath) {
  return path.basename(targetPath).toLowerCase() === MAIN_EXECUTABLE.toLowerCase();
}

function regSetSz(root, valueName, value, elevated) {
  const keyPath = `${root}\\${REG_SUBKEY}`;
  const escaped = String(value).replace(/"/g, '\\"');
  const cmd = `reg add "${keyPath}" /v "${valueName}" /t REG_SZ /d "${escaped}" /f`;
  if (elevated) {
    const bat = path.join(app.getPath('temp'), `aw-reg-${Date.now()}.bat`);
    fs.writeFileSync(bat, `@echo off\r\n${cmd}\r\n`, 'utf8');
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Start-Process -FilePath '${bat.replace(/'/g, "''")}' -Verb RunAs -Wait`,
    ]);
    try {
      fs.unlinkSync(bat);
    } catch {}
    return;
  }
  spawnSync('cmd', ['/d', '/c', cmd], { shell: true, windowsHide: true });
}

function regDeleteKey(root, elevated) {
  const keyPath = `${root}\\${REG_SUBKEY}`;
  const cmd = `reg delete "${keyPath}" /f`;
  if (elevated) {
    const bat = path.join(app.getPath('temp'), `aw-rd-${Date.now()}.bat`);
    fs.writeFileSync(bat, `@echo off\r\n${cmd}\r\n`, 'utf8');
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Start-Process -FilePath '${bat.replace(/'/g, "''")}' -Verb RunAs -Wait`,
    ]);
    try {
      fs.unlinkSync(bat);
    } catch {}
    return;
  }
  spawnSync('cmd', ['/d', '/c', cmd], { shell: true, windowsHide: true });
}

function elevateRobocopy(from, to) {
  const bat = path.join(app.getPath('temp'), `aw-copy-${Date.now()}.bat`);
  const lines = [
    '@echo off',
    `robocopy "${from}" "${to}" /E /R:2 /W:1 /NFL /NDL /NJH /NP`,
    'set RC=%ERRORLEVEL%',
    'if %RC% GEQ 8 exit /b 1',
    'exit /b 0',
  ];
  fs.writeFileSync(bat, lines.join('\r\n'), 'utf8');
  spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Start-Process -FilePath '${bat.replace(/'/g, "''")}' -Verb RunAs -Wait`,
  ]);
  try {
    fs.unlinkSync(bat);
  } catch {}
  return fs.existsSync(path.join(to, MAIN_EXECUTABLE));
}

async function installApp({ src, dest, scope, onProgress }) {
  if (scope === 'machine') {
    onProgress({ phase: 'copying', percent: null });
    if (!elevateRobocopy(src, dest)) {
      throw new Error('Elevated copy failed or was cancelled.');
    }
    return;
  }

  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch {}
  if (copyDirRobocopy(src, dest)) {
    onProgress({ phase: 'copying', percent: 1 });
    return;
  }
  await copyDirWithProgress(src, dest, ({ percent, current }) => {
    onProgress({ phase: 'copying', percent, current });
  });
}

/**
 * Creates a Start menu / desktop .lnk via Electron (no PowerShell).
 * Exploit Guard / ASR often blocks powershell -ExecutionPolicy Bypass + Add-Type.
 * Shortcut failures must not abort the install on locked-down work PCs.
 *
 * @param {string} lnkPath
 * @param {string} targetExe
 * @param {string} iconLocation
 * @param {string=} appUserModelId
 * @returns {boolean}
 */
function tryCreateShortcut(lnkPath, targetExe, iconLocation, appUserModelId) {
  try {
    fs.mkdirSync(path.dirname(lnkPath), { recursive: true });
    const { shell } = require('electron');
    return Boolean(
      shell.writeShortcutLink(lnkPath, 'replace', {
        target: targetExe,
        cwd: path.dirname(targetExe),
        icon: iconLocation,
        iconIndex: 0,
        description: APP_NAME,
        ...(appUserModelId ? { appUserModelId } : {}),
      }),
    );
  } catch {
    return false;
  }
}

/** Drops the Mark of the Web ADS so Defender does not treat copied binaries as internet downloads. */
function removeMarkOfTheWeb(filePath) {
  try {
    fs.unlinkSync(`${filePath}:Zone.Identifier`);
  } catch {
    /* no stream, or policy blocked the delete */
  }
}

/**
 * Clears MOTW on installed executables and DLLs.
 * @param {string} installDir
 */
function unblockInstalledFiles(installDir) {
  try {
    for (const name of fs.readdirSync(installDir)) {
      const lower = name.toLowerCase();
      if (lower.endsWith('.exe') || lower.endsWith('.dll')) {
        removeMarkOfTheWeb(path.join(installDir, name));
      }
    }
  } catch {
    /* ignore */
  }
}

function resolveShortcutIcon(installDir) {
  const candidates = [
    path.join(installDir, 'resources', 'icon.ico'),
    path.join(installDir, 'resources', 'app.asar.unpacked', 'public', 'icon.ico'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return getLaunchPath(installDir);
}

function writeUninstaller({ installDir, scope, shortcuts }) {
  const scriptPath = path.join(installDir, UNINSTALL_CMD);
  const regRoot = scope === 'machine' ? 'HKLM' : 'HKCU';
  const lines = [
    '@echo off',
    'setlocal',
    `set "INSTALL_DIR=${cmdQuote(installDir)}"`,
    `set "REG_KEY=${regRoot}\\${REG_SUBKEY}"`,
  ];
  if (scope === 'machine') {
    lines.push(
      'if /i not "%~1"=="--elevated" (',
      '  net session >nul 2>&1',
      '  if errorlevel 1 (',
      '    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath \'%~f0\' -ArgumentList \'--elevated\' -Verb RunAs -WindowStyle Hidden"',
      '    exit /b 0',
      '  )',
      ')',
    );
  }
  for (const shortcut of shortcuts) {
    lines.push(`del /f /q "${cmdQuote(shortcut)}" >nul 2>nul`);
  }
  lines.push(
    'reg delete "%REG_KEY%" /f >nul 2>nul',
    'set "CLEANUP=%TEMP%\\testrix-uninstall-%RANDOM%-%RANDOM%.cmd"',
    '> "%CLEANUP%" echo @echo off',
    '>> "%CLEANUP%" echo timeout /t 1 /nobreak ^>nul',
    '>> "%CLEANUP%" echo rmdir /s /q "%INSTALL_DIR%"',
    'start "" /min cmd /c "%CLEANUP%"',
    'endlocal',
    'exit /b 0',
  );
  const scriptBody = lines.join('\r\n');
  if (scope === 'machine') {
    const tempScript = path.join(app.getPath('temp'), `aw-uninstall-${Date.now()}.cmd`);
    fs.writeFileSync(tempScript, scriptBody, 'utf8');
    const bat = path.join(app.getPath('temp'), `aw-uninstall-copy-${Date.now()}.bat`);
    fs.writeFileSync(
      bat,
      ['@echo off', `copy /y "${tempScript}" "${scriptPath}" >nul`, 'exit /b %ERRORLEVEL%'].join('\r\n'),
      'utf8',
    );
    const result = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Start-Process -FilePath '${bat.replace(/'/g, "''")}' -Verb RunAs -Wait`,
    ]);
    try {
      fs.unlinkSync(tempScript);
      fs.unlinkSync(bat);
    } catch {}
    if (result.status !== 0) {
      throw new Error('Failed to write uninstall script.');
    }
    return scriptPath;
  }
  fs.writeFileSync(scriptPath, scriptBody, 'utf8');
  return scriptPath;
}

function registerApp({ installDir, scope }) {
  const mainExePath = getLaunchPath(installDir);
  const iconLocation = resolveShortcutIcon(installDir);
  const startMenuParent =
    scope === 'machine'
      ? path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      : path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const shortcutDir = path.join(startMenuParent, APP_NAME);
  const startShortcut = path.join(shortcutDir, `${APP_NAME}.lnk`);
  tryCreateShortcut(startShortcut, mainExePath, iconLocation, APP_ID);

  const desktopBase =
    scope === 'machine'
      ? path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')
      : path.join(process.env.USERPROFILE || os.homedir(), 'Desktop');
  const desktopShortcut = path.join(desktopBase, `${APP_NAME}.lnk`);
  tryCreateShortcut(desktopShortcut, mainExePath, iconLocation, APP_ID);

  const shortcuts = [startShortcut, desktopShortcut].filter((lnk) => fs.existsSync(lnk));
  unblockInstalledFiles(installDir);
  const uninstallScript = writeUninstaller({ installDir, scope, shortcuts });
  const root = scope === 'machine' ? 'HKLM' : 'HKCU';
  const elevated = scope === 'machine';
  const uninstallString = `"${mainExePath}" --uninstall`;
  const quietUninstallString = `"${uninstallScript}"`;

  regSetSz(root, 'DisplayName', APP_NAME, elevated);
  regSetSz(root, 'DisplayVersion', pkgVersion(path.join(__dirname, '..', 'package.json')), elevated);
  regSetSz(root, 'Publisher', 'Matthias Kopeinigg', elevated);
  regSetSz(root, 'InstallLocation', installDir, elevated);
  regSetSz(root, 'DisplayIcon', iconLocation, elevated);
  regSetSz(root, 'UninstallString', uninstallString, elevated);
  regSetSz(root, 'QuietUninstallString', quietUninstallString, elevated);
  regSetSz(root, 'NoModify', '1', elevated);
  regSetSz(root, 'NoRepair', '1', elevated);

  return { shortcuts, uninstallScript, mainExePath };
}

function writeInstallMeta(installDir, data, scope) {
  if (scope !== 'machine') {
    writeCommonInstallMeta(installDir, data);
    return;
  }

  const tempMeta = path.join(app.getPath('temp'), `aw-meta-${Date.now()}.json`);
  fs.writeFileSync(tempMeta, JSON.stringify(data, null, 2), 'utf8');
  const destMeta = path.join(installDir, META_FILE);
  const bat = path.join(app.getPath('temp'), `aw-meta-${Date.now()}.bat`);
  fs.writeFileSync(
    bat,
    ['@echo off', `copy /y "${tempMeta}" "${destMeta}" >nul`, 'exit /b %ERRORLEVEL%'].join('\r\n'),
    'utf8',
  );
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Start-Process -FilePath '${bat.replace(/'/g, "''")}' -Verb RunAs -Wait`,
  ]);
  try {
    fs.unlinkSync(tempMeta);
    fs.unlinkSync(bat);
  } catch {}
  if (result.status !== 0) {
    throw new Error('Failed to write installation metadata.');
  }
}

function resolveExistingInstall() {
  for (const scope of ['user', 'machine']) {
    const candidate = defaultInstallDir(scope);
    if (fs.existsSync(path.join(candidate, META_FILE))) {
      const meta = readInstallMeta(candidate);
      const installDir = meta?.installDir || candidate;
      return {
        installDir,
        scope: meta?.scope === 'machine' ? 'machine' : scope,
        mainExePath: getLaunchPath(installDir),
      };
    }
  }

  for (const root of ['HKCU', 'HKLM']) {
    try {
      const query = spawnSync('reg', ['query', `${root}\\${REG_SUBKEY}`, '/v', 'InstallLocation'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const match = /InstallLocation\s+REG_SZ\s+(.*)/.exec(query.stdout || '');
      const installDir = match?.[1]?.trim();
      if (!installDir || !fs.existsSync(installDir)) {
        continue;
      }
      const meta = readInstallMeta(installDir);
      return {
        installDir,
        scope: root === 'HKLM' || meta?.scope === 'machine' ? 'machine' : 'user',
        mainExePath: getLaunchPath(installDir),
      };
    } catch {}
  }

  return null;
}

function runUninstall() {
  let installDir = null;
  let meta = null;
  for (const scope of ['user', 'machine']) {
    const candidate = defaultInstallDir(scope);
    if (fs.existsSync(path.join(candidate, META_FILE))) {
      meta = readInstallMeta(candidate);
      installDir = meta?.installDir || candidate;
      break;
    }
  }

  if (!installDir) {
    try {
      const query = spawnSync('reg', ['query', `HKCU\\${REG_SUBKEY}`, '/v', 'InstallLocation'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const match = /InstallLocation\s+REG_SZ\s+(.*)/.exec(query.stdout || '');
      if (match) installDir = match[1].trim();
    } catch {}
  }

  if (!installDir || !fs.existsSync(installDir)) {
    return { ok: false, error: 'Installation not found.' };
  }

  meta = readInstallMeta(installDir) || meta;
  const scope = meta?.scope === 'machine' ? 'machine' : 'user';
  const shortcuts = Array.isArray(meta?.shortcuts) ? meta.shortcuts : [];
  for (const shortcut of shortcuts) {
    try {
      if (shortcut && fs.existsSync(shortcut)) fs.unlinkSync(shortcut);
    } catch {}
  }

  if (scope === 'machine') {
    const bat = path.join(app.getPath('temp'), `aw-uninst-${Date.now()}.bat`);
    fs.writeFileSync(
      bat,
      ['@echo off', `rmdir /s /q "${installDir}"`, `reg delete "HKLM\\${REG_SUBKEY}" /f`, 'exit /b 0'].join('\r\n'),
      'utf8',
    );
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Start-Process -FilePath '${bat.replace(/'/g, "''")}' -Verb RunAs -Wait`,
    ]);
    try {
      fs.unlinkSync(bat);
    } catch {}
    return { ok: true };
  }

  try {
    fs.rmSync(installDir, { recursive: true, force: true });
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
  regDeleteKey('HKCU', false);
  return { ok: true };
}

module.exports = {
  defaultInstallDir,
  getLaunchPath,
  installApp,
  isValidLaunchTarget,
  payloadExists,
  registerApp,
  resolveExistingInstall,
  runUninstall,
  unblockInstalledFiles,
  writeInstallMeta,
  writeUninstaller,
};
