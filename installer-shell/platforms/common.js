const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const originalFs = require('original-fs');

const APP_ID = 'dev.testrix.app';
const APP_NAME = 'Testrix';
const META_FILE = '.install-meta.json';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function cmdQuote(value) {
  return String(value).replace(/"/g, '""');
}

function psQuote(value) {
  return String(value).replace(/'/g, "''");
}

function writeInstallMeta(installDir, data) {
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, META_FILE), JSON.stringify(data, null, 2), 'utf8');
}

function readInstallMeta(installDir) {
  const metaPath = path.join(installDir, META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

function pkgVersion(packageJsonPath) {
  try {
    return require(packageJsonPath).version;
  } catch {
    return '0.0.0';
  }
}

function listFiles(rootDir) {
  const out = [];
  const walk = (dir, rel) => {
    for (const entry of originalFs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(abs, childRel);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          const stat = originalFs.statSync(abs);
          out.push({ abs, rel: childRel, size: stat.size, mode: stat.mode });
        } catch {
          /* ignore vanished entries */
        }
      }
    }
  };
  walk(rootDir, '');
  return out;
}

async function copyDirWithProgress(from, to, onProgress) {
  const files = listFiles(from);
  const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
  let done = 0;
  let lastEmit = 0;
  originalFs.mkdirSync(to, { recursive: true });

  for (const file of files) {
    const dest = path.join(to, file.rel);
    try {
      await originalFs.promises.mkdir(path.dirname(dest), { recursive: true });
      await originalFs.promises.copyFile(file.abs, dest);
      await originalFs.promises.chmod(dest, file.mode & 0o777).catch(() => {});
    } catch (err) {
      const wrapped = new Error(`Failed to copy "${file.rel}": ${err.message || String(err)}`);
      wrapped.code = err.code;
      wrapped.failedFile = file.rel;
      throw wrapped;
    }
    done += file.size;
    const now = Date.now();
    if (now - lastEmit > 80) {
      onProgress({ percent: done / total, current: file.rel });
      lastEmit = now;
    }
  }

  onProgress({ percent: 1, current: '' });
}

function which(command) {
  const result =
    process.platform === 'win32'
      ? spawnSync('where', [command], { encoding: 'utf8', windowsHide: true })
      : spawnSync('/bin/sh', ['-lc', `command -v ${shellQuote(command)}`], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const first = String(result.stdout || '').split(/\r?\n/).find(Boolean);
  return first || null;
}

function makeTempPath(ext) {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join(os.tmpdir(), `testrix-setup-${stamp}-${rand}.${ext}`);
}

module.exports = {
  APP_ID,
  APP_NAME,
  META_FILE,
  cmdQuote,
  copyDirWithProgress,
  listFiles,
  makeTempPath,
  pkgVersion,
  psQuote,
  readInstallMeta,
  shellQuote,
  which,
  writeInstallMeta,
};
