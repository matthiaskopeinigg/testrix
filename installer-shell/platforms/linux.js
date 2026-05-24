const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  APP_NAME,
  META_FILE,
  copyDirWithProgress,
  shellQuote,
  writeInstallMeta: writeCommonInstallMeta,
  which,
} = require('./common');

const MAIN_EXECUTABLE = 'testrix';
const DESKTOP_ID = 'testrix.desktop';
const UNINSTALL_SCRIPT = 'uninstall.sh';

function defaultInstallDir(scope) {
  if (scope === 'machine') return path.join('/opt', 'testrix');
  return path.join(os.homedir(), '.local', 'share', 'testrix');
}

function payloadExists(payloadRoot) {
  return fs.existsSync(path.join(payloadRoot, MAIN_EXECUTABLE));
}

function getLaunchPath(installDir) {
  return path.join(installDir, MAIN_EXECUTABLE);
}

function isValidLaunchTarget(targetPath) {
  return path.basename(targetPath) === MAIN_EXECUTABLE;
}

function writeExecutableScript(scriptPath, lines) {
  fs.writeFileSync(scriptPath, `${lines.join('\n')}\n`, 'utf8');
  fs.chmodSync(scriptPath, 0o755);
}

function runElevatedScript(lines, errorMessage) {
  const scriptPath = path.join(os.tmpdir(), `testrix-setup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sh`);
  writeExecutableScript(scriptPath, ['#!/usr/bin/env bash', 'set -euo pipefail', ...lines]);
  const pkexec = which('pkexec');
  if (pkexec) {
    const result = spawnSync(pkexec, ['/bin/bash', scriptPath], { encoding: 'utf8' });
    try {
      fs.unlinkSync(scriptPath);
    } catch {}
    if (result.status !== 0) {
      throw new Error(`${errorMessage}: ${(result.stderr || result.stdout || '').trim() || `exit ${result.status}`}`);
    }
    return;
  }

  const sudo = which('sudo');
  if (sudo) {
    const result = spawnSync(sudo, ['/bin/bash', scriptPath], {
      encoding: 'utf8',
      stdio: 'inherit',
    });
    try {
      fs.unlinkSync(scriptPath);
    } catch {}
    if (result.status !== 0) {
      throw new Error(`${errorMessage}: sudo exited with ${result.status}`);
    }
    return;
  }

  try {
    fs.unlinkSync(scriptPath);
  } catch {}
  throw new Error('Machine-wide install requires pkexec or sudo, but neither is available.');
}

async function installApp({ src, dest, scope, onProgress }) {
  if (scope === 'machine') {
    onProgress({ phase: 'copying', percent: null });
    runElevatedScript(
      [
        `rm -rf ${shellQuote(dest)}`,
        `mkdir -p ${shellQuote(dest)}`,
        `cp -a ${shellQuote(src)}/. ${shellQuote(dest)}/`,
        `chmod +x ${shellQuote(path.join(dest, MAIN_EXECUTABLE))} || true`,
      ],
      'Elevated copy failed or was cancelled',
    );
    return;
  }

  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch {}
  await copyDirWithProgress(src, dest, ({ percent, current }) => {
    onProgress({ phase: 'copying', percent, current });
  });
  try {
    fs.chmodSync(getLaunchPath(dest), 0o755);
  } catch {}
}

function resolveIconPath(installDir) {
  const candidates = [
    path.join(installDir, 'resources', 'app.asar.unpacked', 'public', 'logo.png'),
    path.join(installDir, 'resources', 'app', 'public', 'logo.png'),
    path.join(installDir, 'public', 'logo.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function desktopEntry(installDir, iconPath) {
  const execPath = getLaunchPath(installDir);
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${APP_NAME}`,
    'Comment=Local-first API testing and development',
    `Exec=${execPath}`,
    iconPath ? `Icon=${iconPath}` : 'Icon=testrix',
    'Terminal=false',
    'Categories=Development;Utility;',
    'StartupWMClass=Testrix',
    '',
  ].join('\n');
}

function updateDesktopDatabase(dir) {
  const updater = which('update-desktop-database');
  if (!updater) return;
  spawnSync(updater, [dir], { stdio: 'ignore' });
}

function registerApp({ installDir, scope }) {
  const iconPath = resolveIconPath(installDir);
  const shortcuts = [];

  if (scope === 'machine') {
    const desktopPath = path.join('/usr', 'share', 'applications', DESKTOP_ID);
    runElevatedScript(
      [
        `mkdir -p ${shellQuote(path.dirname(desktopPath))}`,
        `cat > ${shellQuote(desktopPath)} <<'EOF'`,
        desktopEntry(installDir, iconPath),
        'EOF',
        `chmod 0644 ${shellQuote(desktopPath)}`,
        `command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database ${shellQuote(path.dirname(desktopPath))} || true`,
      ],
      'Desktop entry registration failed',
    );
    shortcuts.push(desktopPath);
    const uninstallScript = writeUninstaller({ installDir, scope, shortcuts });
    return { shortcuts, uninstallScript, mainExePath: getLaunchPath(installDir) };
  }

  const desktopDir = path.join(os.homedir(), '.local', 'share', 'applications');
  fs.mkdirSync(desktopDir, { recursive: true });
  const desktopPath = path.join(desktopDir, DESKTOP_ID);
  fs.writeFileSync(desktopPath, desktopEntry(installDir, iconPath), 'utf8');
  fs.chmodSync(desktopPath, 0o644);
  shortcuts.push(desktopPath);

  const userDesktop = path.join(os.homedir(), 'Desktop', DESKTOP_ID);
  try {
    if (fs.existsSync(path.dirname(userDesktop))) {
      fs.copyFileSync(desktopPath, userDesktop);
      fs.chmodSync(userDesktop, 0o755);
      shortcuts.push(userDesktop);
    }
  } catch {}

  updateDesktopDatabase(desktopDir);
  const uninstallScript = writeUninstaller({ installDir, scope, shortcuts });
  return { shortcuts, uninstallScript, mainExePath: getLaunchPath(installDir) };
}

function writeUninstaller({ installDir, scope, shortcuts }) {
  const scriptPath = path.join(installDir, UNINSTALL_SCRIPT);
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `INSTALL_DIR=${shellQuote(installDir)}`,
    ...shortcuts.map((shortcut) => `rm -f ${shellQuote(shortcut)} || true`),
    'rm -f "$HOME/.local/share/applications/testrix.desktop" || true',
    'rm -f "$HOME/Desktop/testrix.desktop" || true',
  ];

  if (scope === 'machine') {
    lines.push('sudo -n rm -f /usr/share/applications/testrix.desktop || true');
    lines.push('sudo -n rm -rf "$INSTALL_DIR" || rm -rf "$INSTALL_DIR" || true');
  } else {
    lines.push('rm -rf "$INSTALL_DIR" || true');
  }

  lines.push('command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" || true');
  if (scope === 'machine') {
    const scriptBody = `${lines.join('\n')}\n`;
    runElevatedScript(
      [
        `cat > ${shellQuote(scriptPath)} <<'EOF'`,
        scriptBody,
        'EOF',
        `chmod 0755 ${shellQuote(scriptPath)}`,
      ],
      'Uninstaller script creation failed',
    );
    return scriptPath;
  }
  writeExecutableScript(scriptPath, lines);
  return scriptPath;
}

function writeInstallMeta(installDir, data, scope) {
  if (scope !== 'machine') {
    writeCommonInstallMeta(installDir, data);
    return;
  }
  const metaPath = path.join(installDir, META_FILE);
  runElevatedScript(
    [
      `cat > ${shellQuote(metaPath)} <<'EOF'`,
      JSON.stringify(data, null, 2),
      'EOF',
      `chmod 0644 ${shellQuote(metaPath)}`,
    ],
    'Installation metadata creation failed',
  );
}

function runUninstall() {
  const candidates = [defaultInstallDir('user'), defaultInstallDir('machine')];
  for (const installDir of candidates) {
    if (fs.existsSync(installDir)) {
      try {
        fs.rmSync(installDir, { recursive: true, force: true });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    }
  }
  return { ok: false, error: 'Installation not found.' };
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
