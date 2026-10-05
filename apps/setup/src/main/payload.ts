import { app } from 'electron';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { unzipSync } from 'node:zlib';

import { bundledPath } from '@testrix/electron-core';

import { readAppendedPayloadFooter } from './payload-footer';
import { resolvePayloadExePath } from './silent-update';

const originalFs = fs;

export async function resolvePayloadRoot(): Promise<string | null> {
  const candidates = [
    path.resolve(bundledPath('../resources/payload')),
    path.join(process.resourcesPath, 'payload'),
    path.join(path.dirname(process.execPath), 'resources', 'payload'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  const zip = [
    path.resolve(bundledPath('../resources/payload.zip')),
    path.join(process.resourcesPath, 'payload.zip'),
  ].find((file) => fs.existsSync(file));
  if (!zip) {
    return null;
  }
  const dest = await mkdtemp(path.join(os.tmpdir(), 'testrix-payload-'));
  await extractZipFile(zip, dest);
  return dest;
}

export async function extractAppendedPayload(): Promise<string | null> {
  const exePath = resolvePayloadExePath({
    fallbacks: [process.execPath, app.getPath('exe')],
  });
  if (!exePath) return null;
  const fileSize = originalFs.statSync(exePath).size;
  const fd = originalFs.openSync(exePath, 'r');
  try {
    const footer = readAppendedPayloadFooter(fileSize, (length, position) => {
      const bytes = Buffer.alloc(length);
      originalFs.readSync(fd, bytes, 0, length, position);
      return bytes;
    });
    if (!footer) return null;
    const { payloadOffset, payloadSize } = footer;
    const destDir = await mkdtemp(path.join(os.tmpdir(), 'testrix-payload-'));
    const zipPath = path.join(destDir, 'payload.zip');
    const stream = originalFs.createReadStream(exePath, {
      start: payloadOffset,
      end: payloadOffset + payloadSize - 1,
    });
    await pipeline(stream, createWriteStream(zipPath));
    const out = path.join(destDir, 'unpacked');
    fs.mkdirSync(out);
    await extractZipFile(zipPath, out);
    return out;
  } finally {
    originalFs.closeSync(fd);
  }
}

/** Unzips without blocking the Setup UI thread. */
export async function extractZipFile(zipPath: string, dest: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  if (process.platform === 'win32') {
    try {
      await run('tar', ['-xf', zipPath, '-C', dest], { windowsHide: true });
      return;
    } catch {
      const zip = zipPath.replace(/'/g, "''");
      const out = dest.replace(/'/g, "''");
      await run(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          [
            'Add-Type -AssemblyName System.IO.Compression.FileSystem',
            `[System.IO.Compression.ZipFile]::ExtractToDirectory('${zip}', '${out}')`,
          ].join('; '),
        ],
        { windowsHide: true },
      );
      return;
    }
  }
  await run('unzip', ['-o', zipPath, '-d', dest]);
  void createGunzip;
  void createReadStream;
  void unzipSync;
}
