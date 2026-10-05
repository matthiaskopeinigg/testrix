import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { keepCorruptCopy, queueForPath, readJsonFile, writeFileAtomic, writeJsonFile } from './json-file';

describe('json-file', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-json-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null for a missing file without creating backups', async () => {
    // Arrange
    const file = path.join(dir, 'missing.json');

    // Act
    const value = await readJsonFile(file);

    // Assert
    expect(value).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it('keeps a copy of a corrupt file before returning null', async () => {
    // Arrange
    const file = path.join(dir, 'collections.json');
    await writeFile(file, '{ "collections": [', 'utf8');

    // Act
    const value = await readJsonFile(file);

    // Assert
    expect(value).toBeNull();
    const names = await readdir(dir);
    const backup = names.find((name) => name.startsWith('collections.json.corrupt-'));
    expect(backup).toBeDefined();
    expect(await readFile(path.join(dir, backup!), 'utf8')).toBe('{ "collections": [');
  });

  it('writes pretty JSON and leaves no temp files behind', async () => {
    // Arrange
    const file = path.join(dir, 'nested', 'settings.json');

    // Act
    await writeJsonFile(file, { a: 1 });

    // Assert
    expect(await readFile(file, 'utf8')).toBe('{\n  "a": 1\n}\n');
    expect(await readdir(path.dirname(file))).toEqual(['settings.json']);
  });

  it('keeps the last value when many writes race on one path', async () => {
    // Arrange
    const file = path.join(dir, 'race.json');

    // Act
    await Promise.all(Array.from({ length: 25 }, (_, index) => writeJsonFile(file, { index })));

    // Assert
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ index: 24 });
    expect(await readdir(dir)).toEqual(['race.json']);
  });

  it('runs queued tasks for one path strictly in order, even after a failure', async () => {
    // Arrange
    const file = path.join(dir, 'queue.json');
    const order: string[] = [];
    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

    // Act
    const first = queueForPath(file, async () => {
      await slow();
      order.push('first');
      throw new Error('boom');
    });
    const second = queueForPath(file, async () => {
      order.push('second');
    });

    // Assert
    await expect(first).rejects.toThrow('boom');
    await second;
    expect(order).toEqual(['first', 'second']);
  });

  it('leaves the previous content when an atomic write fails', async () => {
    // Arrange
    const file = path.join(dir, 'keep.json');
    await writeFileAtomic(file, 'old');

    // Act
    const failing = writeFileAtomic(path.join(file, 'not-a-dir', 'x.json'), 'new');

    // Assert
    await expect(failing).rejects.toBeDefined();
    expect(await readFile(file, 'utf8')).toBe('old');
  });

  it('copies a partly readable file aside on request', async () => {
    // Arrange
    const file = path.join(dir, 'collections.json');
    await writeFile(file, '{"collections":[]}', 'utf8');

    // Act
    await keepCorruptCopy(file, 'Dropped 1 node');

    // Assert
    const names = await readdir(dir);
    expect(names.some((name) => name.startsWith('collections.json.corrupt-'))).toBe(true);
  });
});
