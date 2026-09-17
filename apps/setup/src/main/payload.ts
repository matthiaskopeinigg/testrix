import { app } from 'electron';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { unzipSync } from 'node:zlib';

import { PAYLOAD_MAGIC } from '@testrix/contracts';
import { bundledPath } from '@testrix/electron-core';

const originalFs = fs;

const MAGIC = Buffer.from(PAYLOAD_MAGIC);
const FOOTER_BYTES = 8 + 8 + MAGIC.length;

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
  const exePath = app.getPath('exe');
  if (!originalFs.existsSync(exePath)) {
    return null;
  }
  const fileSize = originalFs.statSync(exePath).size;
  if (fileSize < FOOTER_BYTES) {
    return null;
  }
  const fd = originalFs.openSync(exePath, 'r');
  try {
    const footer = Buffer.alloc(FOOTER_BYTES);
    originalFs.readSync(fd, footer, 0, FOOTER_BYTES, fileSize - FOOTER_BYTES);
    if (!footer.subarray(16).equals(MAGIC)) {
      return null;
    }
    const payloadOffset = Number(footer.readBigUInt64LE(0));
    const payloadSize = Number(footer.readBigUInt64LE(8));
    if (!Number.isFinite(payloadOffset) || payloadSize <= 0) {
      return null;
    }
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
  } catch {
    return null;
  } finally {
    originalFs.closeSync(fd);
  }
}

async function extractZipFile(zipPath: string, dest: string): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }
  execFileSync('unzip', ['-o', zipPath, '-d', dest]);
  void createGunzip;
  void createReadStream;
  void unzipSync;
}
