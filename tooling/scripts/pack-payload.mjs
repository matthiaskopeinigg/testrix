#!/usr/bin/env node
/**
 * Packs the built desktop app directory into apps/setup/resources/payload.zip
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const platform = (process.argv.find((arg) => arg.startsWith('--platform=')) ?? '--platform=win').split('=')[1];
const outDir = path.join(root, 'release', platform === 'win' ? 'win-unpacked' : `${platform}-unpacked`);
const payloadDir = path.join(root, 'apps/setup/resources');
mkdirSync(payloadDir, { recursive: true });
const zipPath = path.join(payloadDir, 'payload.zip');
if (existsSync(zipPath)) {
  rmSync(zipPath);
}

const builder = spawnSync(
  'npx',
  [
    'electron-builder',
    '--config',
    'apps/desktop/electron-builder.yml',
    `--${platform === 'win' ? 'win' : platform}`,
    'dir',
    '--publish',
    'never',
  ],
  { cwd: root, stdio: 'inherit', shell: true },
);
if (builder.status !== 0) {
  process.exit(builder.status ?? 1);
}

const source = existsSync(outDir) ? outDir : path.join(root, 'release', 'win-unpacked');
if (process.platform === 'win32') {
  spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path '${source}\\*' -DestinationPath '${zipPath}' -Force`],
    { stdio: 'inherit' },
  );
} else {
  spawnSync('zip', ['-r', zipPath, '.'], { cwd: source, stdio: 'inherit' });
}

console.log('Wrote', zipPath);
