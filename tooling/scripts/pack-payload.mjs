#!/usr/bin/env node
/**
 * Packs the built desktop app directory into apps/setup/resources/payload.zip
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const platform = (
  process.argv.find((arg) => arg.startsWith('--platform=')) ?? '--platform=win'
).split('=')[1];
const outDir = path.join(
  root,
  'release',
  platform === 'win' ? 'win-unpacked' : `${platform}-unpacked`,
);
const payloadDir = path.join(root, 'apps/setup/resources');
mkdirSync(payloadDir, { recursive: true });
const zipPath = path.join(payloadDir, 'payload.zip');
if (existsSync(zipPath)) {
  rmSync(zipPath);
}

function zipPayload(source, destination) {
  if (existsSync(destination)) rmSync(destination);
  if (process.platform !== 'win32')
    return spawnSync('zip', ['-r', destination, '.'], { cwd: source, stdio: 'inherit' });

  const tar = spawnSync('tar', ['-a', '-cf', destination, '-C', source, '.'], { stdio: 'inherit' });
  if (tar.status === 0 && existsSync(destination)) return tar;

  const script = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$src = '${source.replace(/'/g, "''")}'`,
    `$dst = '${destination.replace(/'/g, "''")}'`,
    'for ($i = 0; $i -lt 6; $i++) {',
    '  try {',
    '    if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }',
    '    [System.IO.Compression.ZipFile]::CreateFromDirectory($src, $dst)',
    '    if (Test-Path -LiteralPath $dst) { exit 0 }',
    '  } catch {',
    '    Start-Sleep -Seconds 2',
    '    if ($i -eq 5) { throw }',
    '  }',
    '}',
    'exit 1',
  ].join('; ');
  return spawnSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'inherit' });
}

function hasVisualCppTools() {
  if (process.platform !== 'win32') return true;
  const vswhere = path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  );
  if (!existsSync(vswhere)) return false;
  const result = spawnSync(
    vswhere,
    [
      '-latest',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ],
    { encoding: 'utf8' },
  );
  return result.status === 0 && Boolean(result.stdout?.trim());
}

spawnSync(process.execPath, [path.join(root, 'tooling/scripts/sync-brand-assets.mjs')], {
  cwd: root,
  stdio: 'inherit',
});

const desktop = path.join(root, 'apps/desktop');
const skipRebuild =
  process.env.TESTRIX_SKIP_NATIVE_REBUILD === '1' ||
  (process.env.TESTRIX_FORCE_NATIVE_REBUILD !== '1' && !hasVisualCppTools());
if (skipRebuild)
  console.warn(
    'Skipping native rebuild (no Visual Studio C++ tools). SQLite in the packaged app stays built for Node. Install "Desktop development with C++" or set TESTRIX_FORCE_NATIVE_REBUILD=1 to rebuild.',
  );
const builderArgs = [
  'electron-builder',
  '--project',
  desktop,
  '--config',
  path.join(desktop, 'electron-builder.yml'),
  `--${platform === 'win' ? 'win' : platform}`,
  'dir',
  '--publish',
  'never',
];
if (skipRebuild) builderArgs.push('-c.npmRebuild=false');
const builder = spawnSync('npx', builderArgs, {
  cwd: desktop,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});
if (builder.status !== 0) {
  console.error(
    'electron-builder failed. Native modules need the Visual Studio C++ workload, or retry with TESTRIX_SKIP_NATIVE_REBUILD=1 (SQLite in the packaged app will stay built for Node).',
  );
  process.exit(builder.status ?? 1);
}

const source = existsSync(outDir) ? outDir : path.join(root, 'release', 'win-unpacked');
const zip = zipPayload(source, zipPath);
if (zip.status !== 0 || !existsSync(zipPath)) {
  console.error(`Failed to write ${zipPath}.`);
  process.exit(zip.status || 1);
}

console.log('Wrote', zipPath);
