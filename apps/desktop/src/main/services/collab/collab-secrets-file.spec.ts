import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cipher = vi.hoisted(() => ({ isAvailable: true }));

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => cipher.isAvailable,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (data: Buffer) => {
      const text = data.toString('utf8');
      if (!text.startsWith('enc:'))
        throw new Error('bad ciphertext');
      return text.slice(4);
    },
  },
}));

const { readSecretsFile, updateSecretsFile } = await import('./collab-secrets-file');

describe('collab-secrets-file', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    cipher.isAvailable = true;
    dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-secrets-'));
    file = path.join(dir, 'secrets.local.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes an encrypted envelope and reads it back', async () => {
    // Act
    await updateSecretsFile(file, (current) => ({ ...current, environments: { v1: 'hunter2' } }));

    // Assert
    const raw = await readFile(file, 'utf8');
    expect(raw).not.toContain('hunter2');
    expect(JSON.parse(raw)).toMatchObject({ format: 'testrix-secrets', cipher: 'safeStorage' });
    expect((await readSecretsFile(file)).environments).toEqual({ v1: 'hunter2' });
  });

  it('migrates the plaintext layout and re-encrypts on the next write', async () => {
    // Arrange
    await writeFile(file, JSON.stringify({ environments: { v1: 'old' }, databases: { db: 'pw' } }), 'utf8');

    // Act
    const before = await readSecretsFile(file);
    await updateSecretsFile(file, (current) => current);

    // Assert
    expect(before.environments).toEqual({ v1: 'old' });
    expect(before.databases).toEqual({ db: 'pw' });
    expect(await readFile(file, 'utf8')).not.toContain('"old"');
  });

  it('keeps every concurrent update', async () => {
    // Act
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        updateSecretsFile(file, (current) => ({
          ...current,
          environments: { ...current.environments, [`v${index}`]: `s${index}` },
        })),
      ),
    );

    // Assert
    expect(Object.keys((await readSecretsFile(file)).environments)).toHaveLength(10);
  });

  it('keeps a copy of a file it cannot decrypt instead of losing it', async () => {
    // Arrange
    await writeFile(
      file,
      JSON.stringify({ format: 'testrix-secrets', version: 1, cipher: 'safeStorage', data: Buffer.from('garbage').toString('base64') }),
      'utf8',
    );

    // Act
    const secrets = await readSecretsFile(file);

    // Assert
    expect(secrets.environments).toEqual({});
    expect((await readdir(dir)).some((name) => name.startsWith('secrets.local.json.unreadable-'))).toBe(true);
  });

  it('refuses to write secrets when OS encryption is unavailable', async () => {
    // Arrange
    cipher.isAvailable = false;

    // Act
    const writing = updateSecretsFile(file, (current) => ({ ...current, databases: { db: 'pw' } }));

    // Assert
    await expect(writing).rejects.toThrow(/OS encryption is unavailable/);
    await expect(readFile(file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
