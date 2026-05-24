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
  psQuote,
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
  await copyDirWithProgress(src, dest, ({ percent, current }) => {
    onProgress({ phase: 'copying', percent, current });
  });
}

function createShortcut(lnkPath, targetExe, iconLocation, appUserModelId) {
  fs.mkdirSync(path.dirname(lnkPath), { recursive: true });
  const lines = [
    '$ErrorActionPreference = "Stop"',
    '$w = New-Object -ComObject WScript.Shell',
    `$s = $w.CreateShortcut('${psQuote(lnkPath)}')`,
    `$s.TargetPath = '${psQuote(targetExe)}'`,
    `$s.WorkingDirectory = '${psQuote(path.dirname(targetExe))}'`,
    `$s.IconLocation = '${psQuote(iconLocation)}' + ',0'`,
    '$s.Save()',
  ];
  if (appUserModelId) {
    lines.push(
      'try {',
      '$src = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      '[StructLayout(LayoutKind.Sequential)] public struct PROPERTYKEY { public Guid fmtid; public uint pid; }',
      '[StructLayout(LayoutKind.Sequential)] public struct PROPVARIANT { public ushort vt; public ushort r1; public ushort r2; public ushort r3; public IntPtr p1; public IntPtr p2; }',
      '[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IPropertyStore {',
      '  [PreserveSig] int GetCount(out uint count);',
      '  [PreserveSig] int GetAt(uint idx, out PROPERTYKEY pkey);',
      '  [PreserveSig] int GetValue(ref PROPERTYKEY pkey, out PROPVARIANT pv);',
      '  [PreserveSig] int SetValue(ref PROPERTYKEY pkey, ref PROPVARIANT pv);',
      '  [PreserveSig] int Commit(); }',
      '[ComImport, Guid("0000010B-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IPersistFile {',
      '  void GetClassID(out Guid pClassID);',
      '  [PreserveSig] int IsDirty();',
      '  void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);',
      '  void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);',
      '  void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);',
      '  void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName); }',
      '[ComImport, Guid("00021401-0000-0000-C000-000000000046")] public class CShellLink {}',
      'public static class AwAumid {',
      '  [DllImport("ole32.dll")] public static extern int PropVariantClear(ref PROPVARIANT pvar);',
      '  public static void Set(string lnk, string aumid) {',
      '    var link = (IPersistFile)new CShellLink();',
      '    link.Load(lnk, 2);',
      '    var store = (IPropertyStore)link;',
      '    var key = new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };',
      '    var pv = new PROPVARIANT { vt = 31, p1 = Marshal.StringToCoTaskMemUni(aumid) };',
      '    try {',
      '      Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref pv));',
      '      Marshal.ThrowExceptionForHR(store.Commit());',
      '      link.Save(lnk, true);',
      '    } finally {',
      '      PropVariantClear(ref pv);',
      '      Marshal.ReleaseComObject(store);',
      '      Marshal.ReleaseComObject(link);',
      '    } } }',
      '"@',
      'if (-not ([System.Management.Automation.PSTypeName]"AwAumid").Type) {',
      '  Add-Type -Language CSharp -TypeDefinition $src -ErrorAction Stop | Out-Null',
      '}',
      `[AwAumid]::Set('${psQuote(lnkPath)}', '${psQuote(appUserModelId)}')`,
      '} catch {',
      '  Write-Host "AUMID set skipped: $($_.Exception.Message)"',
      '}',
    );
  }

  const ps1 = path.join(app.getPath('temp'), `aw-lnk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`);
  fs.writeFileSync(ps1, '\uFEFF' + lines.join('\r\n'), 'utf8');
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
    encoding: 'utf8',
    windowsHide: true,
  });
  try {
    fs.unlinkSync(ps1);
  } catch {}
  if (result.status !== 0) {
    const err = new Error(
      `Shortcut creation failed for ${path.basename(lnkPath)}: ${
        (result.stderr || result.stdout || '').trim() || `exit ${result.status}`
      }`,
    );
    err.code = 'SHORTCUT_FAILED';
    throw err;
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
  createShortcut(startShortcut, mainExePath, iconLocation, APP_ID);

  const desktopBase =
    scope === 'machine'
      ? path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop')
      : path.join(process.env.USERPROFILE || os.homedir(), 'Desktop');
  const desktopShortcut = path.join(desktopBase, `${APP_NAME}.lnk`);
  createShortcut(desktopShortcut, mainExePath, iconLocation, APP_ID);

  const shortcuts = [startShortcut, desktopShortcut];
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
  runUninstall,
  writeInstallMeta,
  writeUninstaller,
};
