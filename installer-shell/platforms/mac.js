const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  APP_NAME,
  META_FILE,
  shellQuote,
  readInstallMeta,
  writeInstallMeta: writeCommonInstallMeta,
} = require('./common');

const APP_BUNDLE = `${APP_NAME}.app`;
const MAIN_EXECUTABLE = path.join(APP_BUNDLE, 'Contents', 'MacOS', APP_NAME);
const UNINSTALL_SCRIPT = 'uninstall.sh';

function defaultInstallDir(scope) {
  if (scope === 'machine') return path.join('/Applications', APP_BUNDLE);
  return path.join(os.homedir(), 'Applications', APP_BUNDLE);
}

function payloadBundlePath(payloadRoot) {
  const nested = path.join(payloadRoot, APP_BUNDLE);
  if (fs.existsSync(nested)) return nested;
  return payloadRoot;
}

function payloadExists(payloadRoot) {
  const bundle = payloadBundlePath(payloadRoot);
  return fs.existsSync(path.join(bundle, 'Contents', 'MacOS', APP_NAME));
}

function getLaunchPath(installDir) {
  return path.join(installDir, 'Contents', 'MacOS', APP_NAME);
}

function isValidLaunchTarget(targetPath) {
  const normalized = path.normalize(targetPath);
  return normalized.endsWith(path.normalize(path.join(APP_BUNDLE, 'Contents', 'MacOS', APP_NAME)));
}

function runAppleScriptShell(command, errorMessage) {
  const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const result = spawnSync('osascript', ['-e', `do shell script "${escaped}" with administrator privileges`], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${errorMessage}: ${(result.stderr || result.stdout || '').trim() || `exit ${result.status}`}`);
  }
}

function runElevatedScript(lines, errorMessage) {
  const scriptPath = path.join(os.tmpdir(), `testrix-setup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sh`);
  writeExecutableScript(scriptPath, ['#!/usr/bin/env bash', 'set -euo pipefail', ...lines]);
  try {
    runAppleScriptShell(`/bin/bash ${shellQuote(scriptPath)}`, errorMessage);
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {}
  }
}

async function installApp({ src, dest, scope, onProgress }) {
  const bundleSrc = payloadBundlePath(src);
  if (scope === 'machine') {
    onProgress({ phase: 'copying', percent: null });
    runElevatedScript(
      [
      `rm -rf ${shellQuote(dest)}`,
      `mkdir -p ${shellQuote(path.dirname(dest))}`,
      `cp -R ${shellQuote(bundleSrc)} ${shellQuote(dest)}`,
      `xattr -dr com.apple.quarantine ${shellQuote(dest)} 2>/dev/null || true`,
      ],
      'Elevated copy failed or was cancelled',
    );
    return;
  }

  onProgress({ phase: 'copying', percent: null });
  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch {}
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const result = spawnSync('cp', ['-R', bundleSrc, dest], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Bundle copy failed: ${(result.stderr || result.stdout || '').trim() || `exit ${result.status}`}`);
  }
  spawnSync('xattr', ['-dr', 'com.apple.quarantine', dest], { stdio: 'ignore' });
}

function writeExecutableScript(scriptPath, lines) {
  fs.writeFileSync(scriptPath, `${lines.join('\n')}\n`, 'utf8');
  fs.chmodSync(scriptPath, 0o755);
}

function writeUninstaller({ installDir }) {
  const scriptPath = path.join(installDir, 'Contents', 'Resources', UNINSTALL_SCRIPT);
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `INSTALL_DIR=${shellQuote(installDir)}`,
    `USER_DATA=${shellQuote(path.join(os.homedir(), 'Library', 'Application Support', APP_NAME))}`,
    'rm -rf "$USER_DATA" || true',
    'rm -rf "$INSTALL_DIR" || sudo -n rm -rf "$INSTALL_DIR" || true',
  ];
  if (installDir.startsWith('/Applications/')) {
    runElevatedScript(
      [
        `mkdir -p ${shellQuote(path.dirname(scriptPath))}`,
        `cat > ${shellQuote(scriptPath)} <<'EOF'`,
        ...lines,
        'EOF',
        `chmod 0755 ${shellQuote(scriptPath)}`,
      ],
      'Uninstaller script creation failed',
    );
    return scriptPath;
  }
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  writeExecutableScript(scriptPath, lines);
  return scriptPath;
}

function registerApp({ installDir }) {
  const shortcuts = [];
  const uninstallScript = writeUninstaller({ installDir, scope: installDir.startsWith('/Applications/') ? 'machine' : 'user', shortcuts });
  spawnSync('touch', [path.dirname(installDir)], { stdio: 'ignore' });
  return { shortcuts, uninstallScript, mainExePath: getLaunchPath(installDir) };
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
  return null;
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

module.exports = {
  defaultInstallDir,
  getLaunchPath,
  installApp,
  isValidLaunchTarget,
  payloadExists,
  registerApp,
  resolveExistingInstall,
  runUninstall,
  writeInstallMeta,
  writeUninstaller,
};
