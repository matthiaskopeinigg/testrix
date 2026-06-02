const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
/*
 * `original-fs` is Electron's unhooked filesystem module. We need it for the
 * payload copy because Electron's normal `fs` hook treats `.asar` archives as
 * virtual directories — that would make our recursive walker descend into the
 * payload's `app.asar` and try to copy non-existent files (ENOENT). For every
 * read/write of the payload tree we go through `originalFs`; metadata, temp
 * files, registry batches, etc. keep using the regular `fs`.
 */
const originalFs = require('original-fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const common = require('./platforms/common');
const platform = require(`./platforms/${process.platform === 'darwin' ? 'mac' : process.platform === 'linux' ? 'linux' : 'windows'}`);

/*
 * Trim unused Chromium features. Keep GPU enabled — transparent splash windows
 * and CSS/SVG spinner animations break when hardware acceleration is disabled.
 */
app.commandLine.appendSwitch('disable-features', 'Translate,OptimizationGuideModelDownloading');

// #region agent log
/** @param {string} location @param {string} message @param {Record<string, unknown>} data @param {string} hypothesisId */
function agentDebugLog(location, message, data, hypothesisId) {
  const payload = {
    sessionId: 'e8295c',
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId: 'post-fix',
    packaged: app.isPackaged,
  };
  fetch('http://127.0.0.1:7736/ingest/d5806da4-cf16-47c7-b1e3-a0241cdfcf92', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e8295c' },
    body: JSON.stringify(payload),
  }).catch(() => {});
  if (app.isPackaged) {
    try {
      fs.appendFileSync(
        path.join(app.getPath('temp'), 'testrix-installer-debug-e8295c.log'),
        `${JSON.stringify(payload)}\n`,
      );
    } catch (_) {
      /* ignore */
    }
  }
}
// #endregion

const APP_ID = 'dev.testrix.app';
const REG_SUBKEY = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;
const MAIN_EXE = 'Testrix.exe';
const UNINSTALL_CMD = 'uninstall.cmd';
const META_FILE = '.install-meta.json';
const PAYLOAD_ARCHIVE = 'payload.zip';
const SILENT_UPDATE =
  process.argv.includes('--silent-update') || process.env.TESTRIX_SILENT_UPDATE === '1';
const APPENDED_PAYLOAD_MAGIC = Buffer.from('TESTRIXPK');
const APPENDED_PAYLOAD_FOOTER_BYTES = 8 + 8 + APPENDED_PAYLOAD_MAGIC.length;

/**
 * @param {Buffer} footerBuf
 * @param {number} footerPos
 * @param {number} fileSize
 * @returns {{ payloadOffset: number, payloadSize: number } | null}
 */
function parseFooterBuffer(footerBuf, footerPos, fileSize) {
  if (!footerBuf.subarray(16, 16 + APPENDED_PAYLOAD_MAGIC.length).equals(APPENDED_PAYLOAD_MAGIC)) {
    return null;
  }

  const payloadOffset = Number(footerBuf.readBigUInt64LE(0));
  const payloadSize = Number(footerBuf.readBigUInt64LE(8));
  const footerEnd = footerPos + APPENDED_PAYLOAD_FOOTER_BYTES;

  if (
    !Number.isFinite(payloadOffset) ||
    !Number.isFinite(payloadSize) ||
    payloadOffset < 0 ||
    payloadSize <= 0 ||
    payloadOffset + payloadSize !== footerPos ||
    footerEnd > fileSize
  ) {
    return null;
  }

  return { payloadOffset, payloadSize };
}

/**
 * Reads appended payload metadata from a thin portable installer exe.
 *
 * @param {string} exePath
 * @returns {{ payloadOffset: number, payloadSize: number } | null}
 */
function readAppendedPayloadMeta(exePath) {
  if (!originalFs.existsSync(exePath)) {
    return null;
  }

  const fileSize = originalFs.statSync(exePath).size;
  if (fileSize < APPENDED_PAYLOAD_FOOTER_BYTES) {
    return null;
  }

  const fd = originalFs.openSync(exePath, 'r');

  try {
    const footerBuf = Buffer.alloc(APPENDED_PAYLOAD_FOOTER_BYTES);
    const footerAtEof = fileSize - APPENDED_PAYLOAD_FOOTER_BYTES;

    originalFs.readSync(fd, footerBuf, 0, APPENDED_PAYLOAD_FOOTER_BYTES, footerAtEof);
    const exact = parseFooterBuffer(footerBuf, footerAtEof, fileSize);
    if (exact) {
      return exact;
    }

    const probeSize = Math.min(fileSize, 256 * 1024);
    const tail = Buffer.alloc(probeSize);
    originalFs.readSync(fd, tail, 0, probeSize, fileSize - probeSize);

    for (let i = tail.length - APPENDED_PAYLOAD_MAGIC.length; i >= 0; i -= 1) {
      if (!tail.subarray(i, i + APPENDED_PAYLOAD_MAGIC.length).equals(APPENDED_PAYLOAD_MAGIC)) {
        continue;
      }

      const footerPos = fileSize - probeSize + i - 16;
      if (footerPos < 0) {
        continue;
      }

      originalFs.readSync(fd, footerBuf, 0, APPENDED_PAYLOAD_FOOTER_BYTES, footerPos);
      const meta = parseFooterBuffer(footerBuf, footerPos, fileSize);
      if (meta) {
        return meta;
      }
    }

    return null;
  } finally {
    originalFs.closeSync(fd);
  }
}

/**
 * Writes the appended payload slice beside the portable exe to a temp zip path.
 *
 * @param {string} sourceExe
 * @returns {string | null}
 */
function materializeAppendedPayloadArchive(sourceExe) {
  const meta = readAppendedPayloadMeta(sourceExe);
  if (!meta) {
    return null;
  }

  const tempZip = path.join(os.tmpdir(), 'TestrixSetup', pkgVersion(), PAYLOAD_ARCHIVE);
  if (originalFs.existsSync(tempZip)) {
    const existing = originalFs.statSync(tempZip);
    if (existing.size === meta.payloadSize) {
      return tempZip;
    }
    originalFs.rmSync(tempZip, { force: true });
  }

  originalFs.mkdirSync(path.dirname(tempZip), { recursive: true });

  const fd = originalFs.openSync(sourceExe, 'r');
  try {
    const payload = Buffer.alloc(meta.payloadSize);
    originalFs.readSync(fd, payload, 0, meta.payloadSize, meta.payloadOffset);
    originalFs.writeFileSync(tempZip, payload);
  } finally {
    originalFs.closeSync(fd);
  }

  return tempZip;
}

/**
 * Path to the single-file installer the user launched (portable exe, AppImage, or mac binary).
 *
 * @returns {string | null}
 */
function resolveInstallerHostPath() {
  if (process.env.TX_INSTALLER_HOST) {
    return path.resolve(process.env.TX_INSTALLER_HOST);
  }

  const candidates = [];
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    candidates.push(process.env.PORTABLE_EXECUTABLE_FILE);
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, `${path.basename(process.execPath)}`));
  }
  if (process.env.APPIMAGE) {
    candidates.push(process.env.APPIMAGE);
  }
  if (process.platform === 'darwin' && app.isPackaged) {
    candidates.push(process.execPath);
  }

  for (const candidate of candidates) {
    if (candidate && readAppendedPayloadMeta(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolves application files to install.
 *
 * Single-file installers append `payload.zip` after the host binary (installed on demand).
 * Dev runs can point at an unpacked payload via `TX_PAYLOAD_ROOT`.
 */
function payloadDir() {
  if (process.env.TX_PAYLOAD_ROOT) {
    return path.resolve(process.env.TX_PAYLOAD_ROOT);
  }

  const appDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
  const candidates = [
    path.join(process.resourcesPath, 'payload'),
    path.join(appDir, 'payload'),
    path.join(__dirname, 'resources', 'payload'),
  ];

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.unshift(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'payload'));
  }

  for (const dir of candidates) {
    if (platform.payloadExists(dir)) {
      return dir;
    }
  }

  return path.join(os.tmpdir(), 'TestrixSetup', pkgVersion(), 'payload');
}

/**
 * Resolves a compressed payload archive when present (legacy/dev sidecar).
 *
 * @returns {string | null}
 */
function payloadArchivePath() {
  if (process.env.TX_PAYLOAD_ARCHIVE) {
    const forced = path.resolve(process.env.TX_PAYLOAD_ARCHIVE);
    return originalFs.existsSync(forced) ? forced : null;
  }

  const appDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
  const candidates = [
    path.join(process.resourcesPath, PAYLOAD_ARCHIVE),
    path.join(appDir, PAYLOAD_ARCHIVE),
    path.join(__dirname, 'resources', PAYLOAD_ARCHIVE),
  ];

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.unshift(path.join(process.env.PORTABLE_EXECUTABLE_DIR, PAYLOAD_ARCHIVE));
  }

  for (const candidate of candidates) {
    if (originalFs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Extracts `payload.zip` into `destDir` using the Windows built-in tar helper.
 *
 * @param {string} archivePath
 * @param {string} destDir
 * @param {(progress: { phase: string, percent: number | null }) => void} onProgress
 */
async function extractPayloadArchive(archivePath, destDir, onProgress) {
  onProgress({ phase: 'extracting', percent: null });
  originalFs.mkdirSync(destDir, { recursive: true });

  await new Promise((resolve, reject) => {
    const tarArgs = ['-xf', archivePath, '-C', destDir];
    const child = spawn('tar', tarArgs, { windowsHide: process.platform === 'win32' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`payload extract failed (tar exit ${code})`));
    });
  });

  if (!platform.payloadExists(destDir)) {
    throw new Error('Payload archive did not contain a valid application bundle.');
  }

  onProgress({ phase: 'extracting', percent: 1 });
}

/**
 * Returns whether an installable payload is present without extracting archives.
 *
 * @returns {{ ok: boolean, source: 'dir' | 'archive' | null, archivePath?: string, archiveKind?: 'file' | 'appended', payloadDir: string, message?: string }}
 */
function checkPayloadAvailable() {
  const dir = payloadDir();
  if (platform.payloadExists(dir)) {
    return { ok: true, source: 'dir', payloadDir: dir };
  }

  const hostPath = resolveInstallerHostPath();
  if (hostPath && readAppendedPayloadMeta(hostPath)) {
    return {
      ok: true,
      source: 'archive',
      archivePath: hostPath,
      archiveKind: 'appended',
      payloadDir: dir,
    };
  }

  const archive = payloadArchivePath();
  if (archive) {
    return {
      ok: true,
      source: 'archive',
      archivePath: archive,
      archiveKind: 'file',
      payloadDir: dir,
    };
  }

  return {
    ok: false,
    source: null,
    payloadDir: dir,
    message: resolvePayloadMissingMessage(),
  };
}

/**
 * @returns {string}
 */
function resolvePayloadMissingMessage() {
  const host = process.env.PORTABLE_EXECUTABLE_FILE || process.env.APPIMAGE || null;
  if (app.isPackaged && host && !readAppendedPayloadMeta(host)) {
    return (
      'Application payload missing from this installer file. Use release/Testrix Setup.exe ' +
      '(run npm run electron:build:win to rebuild), not the thin setup-shell-build artifact.'
    );
  }
  return (
    'Application payload missing. Re-download the installer or run sync-installer-payload after building the main app.'
  );
}

/**
 * Extracts a payload archive into `destDir` with administrator elevation.
 *
 * @param {string} archivePath
 * @param {string} destDir
 * @returns {boolean}
 */
function elevateExtractArchive(archivePath, destDir) {
  const bat = path.join(app.getPath('temp'), `aw-extract-${Date.now()}.bat`);
  const lines = [
    '@echo off',
    `if exist "${cmdQuote(destDir)}" rmdir /s /q "${cmdQuote(destDir)}"`,
    `mkdir "${cmdQuote(destDir)}"`,
    `tar -xf "${cmdQuote(archivePath)}" -C "${cmdQuote(destDir)}"`,
    'if errorlevel 1 exit /b 1',
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
  } catch (_) {}
  return platform.payloadExists(destDir);
}

/**
 * Installs payload from an archive directly into the destination directory.
 *
 * @param {string} archivePath
 * @param {string} destDir
 * @param {'user' | 'machine'} scope
 * @param {(progress: { phase: string, percent: number | null, current?: string }) => void} onProgress
 */
async function installPayloadFromArchive(archivePath, destDir, scope, onProgress) {
  onProgress({ phase: 'extracting', percent: null });

  const extractDir = path.join(os.tmpdir(), 'TestrixSetup', pkgVersion(), 'payload-staging');

  if (scope === 'machine' && process.platform === 'win32') {
    try {
      originalFs.rmSync(extractDir, { recursive: true, force: true });
    } catch (_) {}
    if (!elevateExtractArchive(archivePath, extractDir)) {
      throw new Error('Elevated extraction failed or was cancelled.');
    }
    onProgress({ phase: 'extracting', percent: 1 });
    onProgress({ phase: 'copying', percent: null });
    await platform.installApp({
      src: extractDir,
      dest: destDir,
      scope,
      onProgress,
    });
    return;
  }

  try {
    originalFs.rmSync(extractDir, { recursive: true, force: true });
  } catch (_) {}

  await extractPayloadArchive(archivePath, extractDir, onProgress);
  onProgress({ phase: 'copying', percent: scope === 'machine' ? null : 0 });
  await platform.installApp({
    src: extractDir,
    dest: destDir,
    scope,
    onProgress,
  });
}

function defaultInstallDir(scope) {
  if (scope === 'machine') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    return path.join(pf, 'Testrix');
  }
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Programs', 'Testrix');
}

function pkgVersion() {
  try {
    return require('./package.json').version;
  } catch {
    return '0.0.0';
  }
}

function writeInstallMeta(installDir, data) {
  fs.writeFileSync(path.join(installDir, META_FILE), JSON.stringify(data, null, 2), 'utf8');
}

function readInstallMeta(installDir) {
  const p = path.join(installDir, META_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** reg.exe add REG_SZ; value must not contain raw newlines */
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
    } catch (_) {}
  } else {
    spawnSync('cmd', ['/d', '/c', cmd], { shell: true, windowsHide: true });
  }
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
    } catch (_) {}
  } else {
    spawnSync('cmd', ['/d', '/c', cmd], { shell: true, windowsHide: true });
  }
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
  } catch (_) {}
  return fs.existsSync(path.join(to, MAIN_EXE));
}

function copyDir(from, to) {
  originalFs.mkdirSync(to, { recursive: true });
  originalFs.cpSync(from, to, { recursive: true, dereference: true });
}

/**
 * Lists every regular file under `rootDir` together with its size. Used to
 * compute a total byte count up-front so the progress bar can show a real
 * percentage instead of an indeterminate shimmer.
 *
 * Uses `original-fs` so `.asar` archives in the payload appear as plain files
 * (which is what we want to copy them as) instead of virtual directories.
 *
 * @param {string} rootDir
 * @returns {{ abs: string, rel: string, size: number }[]}
 */
function listFiles(rootDir) {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of originalFs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const r = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(abs, r);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          const st = originalFs.statSync(abs);
          out.push({ abs, rel: r, size: st.size });
        } catch (_) {
          /* ignore vanished entries */
        }
      }
    }
  };
  walk(rootDir, '');
  return out;
}

/**
 * Copies `from` -> `to` file-by-file. Calls `onProgress({ percent, current })`
 * roughly every 80 ms during the run, plus one final tick at 100 %. The
 * throttle keeps IPC traffic light enough that the renderer stays smooth on
 * slow disks.
 *
 * Per-file copy is wrapped in try/catch so the surfaced error includes the
 * offending relative path — much more actionable than a bare ENOENT from the
 * fs layer.
 *
 * @param {string} from
 * @param {string} to
 * @param {(progress: { percent: number, current: string }) => void} onProgress
 */
async function copyDirWithProgress(from, to, onProgress) {
  const files = listFiles(from);
  const total = files.reduce((s, f) => s + f.size, 0) || 1;
  let done = 0;
  let lastEmit = 0;
  originalFs.mkdirSync(to, { recursive: true });
  for (const f of files) {
    const dest = path.join(to, f.rel);
    try {
      await originalFs.promises.mkdir(path.dirname(dest), { recursive: true });
      await originalFs.promises.copyFile(f.abs, dest);
    } catch (err) {
      const wrapped = new Error(
        `Failed to copy "${f.rel}": ${err.message || String(err)}`,
      );
      wrapped.code = err.code;
      wrapped.failedFile = f.rel;
      throw wrapped;
    }
    done += f.size;
    const now = Date.now();
    if (now - lastEmit > 80) {
      onProgress({ percent: done / total, current: f.rel });
      lastEmit = now;
    }
  }
  onProgress({ percent: 1, current: '' });
}

function psQuote(s) {
  return String(s).replace(/'/g, "''");
}

function cmdQuote(s) {
  return String(s).replace(/"/g, '""');
}

/**
 * Creates a Windows .lnk shortcut. The WScript.Shell COM object handles the
 * basics (TargetPath, IconLocation) cleanly; the AppUserModelID property is
 * NOT exposed via WScript.Shell, so we set it through `IPropertyStore` using
 * inline C# / P-Invoke. Matching the running process's `app.setAppUserModelId`
 * value (`dev.testrix.app`) means a pinned shortcut and the running app
 * share the same taskbar slot instead of stacking as two entries.
 *
 * The script is written to a temp `.ps1` file rather than passed via
 * `-Command` because the inline C# uses a here-string (`@"…"@`) and PowerShell
 * rejects here-strings whose header isn't on its own line.
 *
 * Failures in the AUMID block are caught inside the script so a property-store
 * problem (older PowerShell, locked-down host) doesn't abort the install — the
 * shortcut and icon still get applied either way.
 *
 * @param {string} lnkPath  Destination .lnk path.
 * @param {string} targetExe  Shortcut target (must be the main app's .exe).
 * @param {string} iconLocation  File whose icon is shown for the shortcut.
 *   Pass the standalone `.ico` (not the .exe) — see `resolveShortcutIcon`.
 * @param {string=} appUserModelId  Optional AUMID to attach to the shortcut.
 */
function createShortcut(lnkPath, targetExe, iconLocation, appUserModelId) {
  const dir = path.dirname(lnkPath);
  fs.mkdirSync(dir, { recursive: true });
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
      // STGM_READWRITE = 0x2 — IPropertyStore.Commit fails with STG_E_ACCESSDENIED if the
      // shell link was loaded read-only (the default mode for IPersistFile::Load).
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
  const ps1 = path.join(
    app.getPath('temp'),
    `aw-lnk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`,
  );
  // BOM + CRLF so PowerShell parses Unicode paths correctly on every locale.
  fs.writeFileSync(ps1, '\uFEFF' + lines.join('\r\n'), 'utf8');
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { encoding: 'utf8', windowsHide: true },
  );
  try {
    fs.unlinkSync(ps1);
  } catch (_) {}
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

/**
 * Resolves the standalone .ico file that ships inside `app.asar.unpacked`. We
 * prefer this over the .exe path because electron-builder runs with
 * `signAndEditExecutable: false`, so `Testrix.exe` still has the default
 * Electron icon embedded as its win32 resource — pointing shortcuts and
 * "Apps & Features" at this .ico is what gives users the Testrix logo.
 *
 * Falls back to the .exe if the .ico is missing for any reason (e.g. older
 * build layout) so shortcuts always have *some* icon source.
 *
 * @param {string} installDir
 * @returns {string}
 */
function resolveShortcutIcon(installDir) {
  const candidates = [
    path.join(installDir, 'resources', 'icon.ico'),
    path.join(installDir, 'resources', 'app.asar.unpacked', 'public', 'icon.ico'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(installDir, MAIN_EXE);
}

/**
 * Writes a stable uninstall command into the installation directory. The old
 * registry entry pointed to `process.execPath`, but the setup shell is packaged
 * as an Electron portable app, so `process.execPath` lives in a temporary
 * extraction directory that disappears after setup exits. Windows Settings then
 * cannot find the uninstaller later.
 *
 * The batch file removes shortcuts and the uninstall registry key immediately,
 * then starts a tiny temp cleanup script that deletes the install directory
 * after `uninstall.cmd` has exited (so the script is not trying to delete
 * itself while still running). Machine installs self-elevate before touching
 * Program Files / HKLM.
 *
 * @param {string} installDir
 * @param {'user' | 'machine'} scope
 * @param {string[]} shortcuts
 * @returns {string}
 */
function writeUninstallScript(installDir, scope, shortcuts) {
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
      '    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath \'%~f0\' -ArgumentList \'--elevated\' -Verb RunAs"',
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
    '>> "%CLEANUP%" echo del /f /q "%%~f0" ^>nul 2^>nul',
    'start "" /min cmd /d /c "%CLEANUP%"',
    'endlocal',
    'exit /b 0',
  );
  fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
  return scriptPath;
}

function registerUninstallWindows(installDir, scope, uninstallScript) {
  /*
   * `UninstallString` is what Apps & Features / Windows Settings invokes. We
   * route it through the installed app's executable with `--uninstall`, so
   * users get the full UI uninstaller (matches the installer's design and
   * works on all OSes through the same Electron renderer).
   *
   * `QuietUninstallString` keeps pointing at the bundled `.cmd` so scripted /
   * silent uninstalls (e.g. CI, deployment tools) still work without a UI.
   */
  const mainExe = path.join(installDir, MAIN_EXE);
  const uninstallString = `"${mainExe}" --uninstall`;
  const quietUninstallString = `"${uninstallScript}"`;
  const root = scope === 'machine' ? 'HKLM' : 'HKCU';
  const elevated = scope === 'machine';
  const displayIcon = resolveShortcutIcon(installDir);

  regSetSz(root, 'DisplayName', 'Testrix', elevated);
  regSetSz(root, 'DisplayVersion', pkgVersion(), elevated);
  regSetSz(root, 'Publisher', 'Matthias Kopeinigg', elevated);
  regSetSz(root, 'InstallLocation', installDir, elevated);
  regSetSz(root, 'DisplayIcon', displayIcon, elevated);
  regSetSz(root, 'UninstallString', uninstallString, elevated);
  regSetSz(root, 'QuietUninstallString', quietUninstallString, elevated);
  regSetSz(root, 'NoModify', '1', elevated);
  regSetSz(root, 'NoRepair', '1', elevated);
}

function runUninstall() {
  let installDir = null;
  let meta = null;
  for (const s of ['user', 'machine']) {
    const d = defaultInstallDir(s);
    if (fs.existsSync(path.join(d, META_FILE))) {
      meta = readInstallMeta(d);
      installDir = meta?.installDir || d;
      break;
    }
  }
  if (!installDir) {
    try {
      const q = spawnSync(
        'reg',
        ['query', `HKCU\\${REG_SUBKEY}`, '/v', 'InstallLocation'],
        { encoding: 'utf8', windowsHide: true },
      );
      const m = /InstallLocation\s+REG_SZ\s+(.*)/.exec(q.stdout || '');
      if (m) installDir = m[1].trim();
    } catch (_) {}
  }
  if (!installDir || !fs.existsSync(installDir)) {
    return { ok: false, error: 'Installation not found.' };
  }
  meta = readInstallMeta(installDir) || meta;
  const scope = meta?.scope === 'machine' ? 'machine' : 'user';

  const shortcuts = meta?.shortcuts;
  if (Array.isArray(shortcuts)) {
    for (const lnk of shortcuts) {
      try {
        if (lnk && fs.existsSync(lnk)) fs.unlinkSync(lnk);
      } catch (_) {}
    }
  }

  if (scope === 'machine') {
    const bat = path.join(app.getPath('temp'), `aw-uninst-${Date.now()}.bat`);
    fs.writeFileSync(
      bat,
      [
        '@echo off',
        `rmdir /s /q "${installDir}"`,
        `reg delete "HKLM\\${REG_SUBKEY}" /f`,
        'exit /b 0',
      ].join('\r\n'),
      'utf8',
    );
    spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Start-Process -FilePath '${bat.replace(/'/g, "''")}' -Verb RunAs -Wait`,
    ]);
    try {
      fs.unlinkSync(bat);
    } catch (_) {}
  } else {
    try {
      fs.rmSync(installDir, { recursive: true, force: true });
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
    regDeleteKey('HKCU', false);
  }

  return { ok: true };
}

/**
 * Fixed-size frameless window. Transparent + frame:false gives us full control
 * over the rounded corners and titlebar appearance. `paintWhenInitiallyHidden`
 * stays at its default (true) so the renderer paints behind the scenes while
 * Electron is still starting up; we then show the window in `ready-to-show`,
 * which is the recommended pattern for the fastest perceived open time.
 */
const WINDOW_WIDTH = 640;
const WINDOW_HEIGHT = 600;

function createWindow() {
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
    icon: path.join(__dirname, 'renderer', 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  void win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

let mainWindow = null;

/**
 * @param {{ phase: string, percent: number | null }} payload
 */
function payloadInfoResponse(available) {
  const appDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
  return {
    ok: available.ok,
    message: available.message || null,
    payloadDir: available.payloadDir,
    source: available.source,
    version: pkgVersion(),
    appDir,
  };
}

/**
 * Waits until the parent Testrix process exits so install files are unlocked.
 *
 * @returns {Promise<void>}
 */
function waitForParentExit() {
  const raw = process.env.TESTRIX_PARENT_PID;
  if (!raw) {
    return Promise.resolve();
  }
  const pid = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const poll = () => {
      try {
        process.kill(pid, 0);
        setTimeout(poll, 250);
      } catch {
        setTimeout(resolve, 750);
      }
    };
    poll();
  });
}

/**
 * Resolves an existing install target for silent in-app updates.
 *
 * @returns {{ installDir: string, scope: 'user' | 'machine', mainExePath: string } | null}
 */
function resolveExistingInstallForSilentUpdate() {
  const forced = String(process.env.TESTRIX_INSTALL_DIR || '').trim();
  if (forced && fs.existsSync(forced)) {
    const meta = readInstallMeta(forced);
    return {
      installDir: forced,
      scope: meta?.scope === 'machine' ? 'machine' : 'user',
      mainExePath: platform.getLaunchPath(forced),
    };
  }

  if (typeof platform.resolveExistingInstall === 'function') {
    return platform.resolveExistingInstall();
  }

  return null;
}

/**
 * Installs or updates Testrix into `installDir`.
 *
 * @param {{ installDir: string, scope: 'user' | 'machine', onProgress?: (payload: object) => void }} opts
 */
async function performInstall(opts) {
  const scope = opts?.scope === 'machine' ? 'machine' : 'user';
  const available = checkPayloadAvailable();

  if (!available.ok) {
    return {
      ok: false,
      message:
        available.message ||
        'Application payload missing. Re-download the installer or run sync-installer-payload after building the main app.',
    };
  }

  const dest = String(opts?.installDir || '').trim() || platform.defaultInstallDir(scope);
  const onProgress = typeof opts?.onProgress === 'function' ? opts.onProgress : () => {};

  try {
    if (available.source === 'archive') {
      let archivePath = available.archivePath;
      if (available.archiveKind === 'appended') {
        archivePath = materializeAppendedPayloadArchive(available.archivePath);
        if (!archivePath) {
          return { ok: false, message: 'Failed to read embedded application payload.' };
        }
      }
      await installPayloadFromArchive(archivePath, dest, scope, onProgress);
    } else {
      const src = available.payloadDir;
      if (!platform.payloadExists(src)) {
        return {
          ok: false,
          message:
            available.message ||
            'Application payload missing. Re-download the installer or run sync-installer-payload after building the main app.',
        };
      }

      onProgress({ phase: 'preparing', percent: 0 });
      onProgress({ phase: 'copying', percent: scope === 'machine' ? null : 0 });
      await platform.installApp({
        src,
        dest,
        scope,
        onProgress,
      });
    }

    onProgress({ phase: 'finalizing', percent: 1 });

    const registration = platform.registerApp({ installDir: dest, scope });
    const installMeta = {
      scope,
      installDir: dest,
      version: pkgVersion(),
      shortcuts: registration.shortcuts || [],
      uninstallScript: registration.uninstallScript || null,
    };
    if (typeof platform.writeInstallMeta === 'function') {
      platform.writeInstallMeta(dest, installMeta, scope);
    } else {
      common.writeInstallMeta(dest, installMeta);
    }

    onProgress({ phase: 'done', percent: 1 });
    return {
      ok: true,
      installDir: dest,
      mainExePath: registration.mainExePath || platform.getLaunchPath(dest),
    };
  } catch (err) {
    return {
      ok: false,
      message: err.message || String(err),
      code: err.code || null,
      failedFile: err.failedFile || null,
    };
  }
}

/**
 * @param {string} exePath
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
async function launchInstalledApp(exePath) {
  const p = String(exePath || '').trim();
  if (!p || !path.isAbsolute(p) || !fs.existsSync(p)) {
    return { ok: false, message: 'Executable not found.' };
  }
  const resolved = path.resolve(p);
  if (!platform.isValidLaunchTarget(resolved)) {
    return { ok: false, message: 'Invalid launch target.' };
  }

  const installDir = path.dirname(resolved);
  if (process.platform === 'win32' && !fs.existsSync(path.join(installDir, 'icudtl.dat'))) {
    return {
      ok: false,
      message:
        'Installation is incomplete (missing Electron runtime files such as icudtl.dat). Uninstall and reinstall using a freshly built Testrix Setup.exe.',
    };
  }

  try {
    const child = spawn(resolved, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: installDir,
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
}

/**
 * Headless in-app update invoked by a running Testrix instance.
 *
 * @returns {Promise<boolean>} True when silent update handled startup (no UI).
 */
async function runSilentUpdateIfRequested() {
  if (!SILENT_UPDATE) {
    return false;
  }

  const existing = resolveExistingInstallForSilentUpdate();
  if (!existing?.installDir) {
    return false;
  }

  await waitForParentExit();

  const result = await performInstall({
    installDir: existing.installDir,
    scope: existing.scope === 'machine' ? 'machine' : 'user',
  });

  if (!result.ok) {
    await launchInstalledApp(existing.mainExePath);
    app.exit(1);
    return true;
  }

  const launchPath = result.mainExePath || existing.mainExePath;
  await launchInstalledApp(launchPath);
  app.exit(0);
  return true;
}

if (process.argv.includes('--uninstall')) {
  app.whenReady().then(() => {
    const r = platform.runUninstall();
    app.exit(r.ok ? 0 : 1);
  });
} else {
  app.whenReady().then(async () => {
    if (await runSilentUpdateIfRequested()) {
      return;
    }
    mainWindow = createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => app.quit());

ipcMain.handle('setup:getVersion', () => pkgVersion());

/**
 * Platform info for the renderer. Used by the help modal to render the right
 * uninstall path, app-folder convention, and "other platforms" guidance. The
 * shell itself is currently Windows-only, but the renderer ships with the
 * strings for all three platforms so the same shell can be reused (or mirrored)
 * for macOS and Linux without touching renderer code.
 */
ipcMain.handle('setup:getPlatform', () => {
  const p = process.platform;
  if (p === 'darwin') return 'mac';
  if (p === 'linux') return 'linux';
  return 'win';
});

ipcMain.handle('setup:getDefaultPaths', (_e, scope) => {
  const s = scope === 'machine' ? 'machine' : 'user';
  return {
    user: platform.defaultInstallDir('user'),
    machine: platform.defaultInstallDir('machine'),
    installDir: platform.defaultInstallDir(s),
  };
});

ipcMain.handle('setup:preparePayload', async () => payloadInfoResponse(checkPayloadAvailable()));

ipcMain.handle('setup:getPayloadInfo', async () => payloadInfoResponse(checkPayloadAvailable()));

ipcMain.handle('setup:install', async (event, opts) => {
  const scope = opts?.scope === 'machine' ? 'machine' : 'user';
  const wc = event.sender;
  const sendProgress = (payload) => {
    if (wc && !wc.isDestroyed()) wc.send('setup:progress', payload);
  };

  return performInstall({
    installDir: String(opts?.installDir || '').trim() || platform.defaultInstallDir(scope),
    scope,
    onProgress: sendProgress,
  });
});

ipcMain.handle('setup:uninstall', () => platform.runUninstall());

ipcMain.handle('setup:launchApp', async (_e, exePath) => {
  const p = String(exePath || '').trim();
  if (!p || !path.isAbsolute(p) || !fs.existsSync(p)) {
    return { ok: false, message: 'Executable not found.' };
  }
  const resolved = path.resolve(p);
  if (!platform.isValidLaunchTarget(resolved)) {
    return { ok: false, message: 'Invalid launch target.' };
  }

  const installDir = path.dirname(resolved);
  if (!fs.existsSync(path.join(installDir, 'icudtl.dat'))) {
    return {
      ok: false,
      message:
        'Installation is incomplete (missing Electron runtime files such as icudtl.dat). Uninstall and reinstall using a freshly built Testrix Setup.exe.',
    };
  }

  try {
    const openError = await shell.openPath(resolved);
    if (!openError) {
      return { ok: true };
    }

    const child = spawn(resolved, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: installDir,
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message || String(err) };
  }
});

ipcMain.handle('setup:quit', () => app.quit());

ipcMain.handle('setup:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.handle('setup:openExternal', (_e, url) => {
  if (typeof url !== 'string') return;
  if (!/^https?:\/\//i.test(url)) return;
  shell.openExternal(url);
});
