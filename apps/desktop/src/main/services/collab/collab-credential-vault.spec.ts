import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ safeStorage: undefined }));

const { CollabCredentialVault } = await import('./collab-credential-vault');
type VaultCipher = import('./collab-credential-vault').VaultCipher;

function fakeCipher(isAvailable = true): VaultCipher {
  return {
    isAvailable: () => isAvailable,
    encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
    decrypt: (data) => {
      const text = data.toString('utf8');
      if (!text.startsWith('enc:'))
        throw new Error('bad ciphertext');
      return text.slice(4);
    },
  };
}

describe('CollabCredentialVault', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-vault-'));
    file = path.join(dir, 'collab-vault.bin');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('persists a device id once and keeps it across instances', async () => {
    // Arrange
    const first = new CollabCredentialVault(file, fakeCipher());

    // Act
    const a = await first.preferences('Sam');
    const b = await new CollabCredentialVault(file, fakeCipher()).preferences('Sam');

    // Assert
    expect(a.deviceId).toMatch(/^[0-9a-f]{12}$/);
    expect(b.deviceId).toBe(a.deviceId);
  });

  it('stores git credentials encrypted', async () => {
    // Arrange
    const vault = new CollabCredentialVault(file, fakeCipher());

    // Act
    await vault.setGit('https://example.test/repo.git', { username: 'sam', password: 'hunter2' });

    // Assert
    expect((await readFile(file, 'utf8')).startsWith('enc:')).toBe(true);
    const reopened = new CollabCredentialVault(file, fakeCipher());
    expect(await reopened.getGit('https://example.test/repo.git')).toEqual({ username: 'sam', password: 'hunter2' });
  });

  it('refuses to store git credentials without OS encryption', async () => {
    // Arrange
    const vault = new CollabCredentialVault(file, fakeCipher(false));

    // Act
    const saving = vault.setGit('https://example.test/repo.git', { username: 'sam', password: 'hunter2' });

    // Assert
    await expect(saving).rejects.toThrow(/secure credential storage/);
    const written = await readFile(file, 'utf8').catch(() => '');
    expect(written).not.toContain('hunter2');
  });

  it('keeps every change when setters run concurrently', async () => {
    // Arrange
    const vault = new CollabCredentialVault(file, fakeCipher());

    // Act
    await Promise.all([
      vault.setPresenceMode('offline'),
      vault.setShareRuns(false),
      vault.setGit('https://a.test/r.git', { username: 'a', password: '1' }),
      vault.setGit('https://b.test/r.git', { username: 'b', password: '2' }),
    ]);

    // Assert
    const reopened = new CollabCredentialVault(file, fakeCipher());
    const prefs = await reopened.preferences('Sam');
    expect(prefs.presenceMode).toBe('offline');
    expect(prefs.shareRuns).toBe(false);
    expect(await reopened.getGit('https://a.test/r.git')).not.toBeNull();
    expect(await reopened.getGit('https://b.test/r.git')).not.toBeNull();
  });

  it('reads the plaintext vault older builds wrote', async () => {
    // Arrange
    await writeFile(file, JSON.stringify({ deviceId: 'abcdefabcdef', presenceMode: 'offline' }), 'utf8');

    // Act
    const prefs = await new CollabCredentialVault(file, fakeCipher()).preferences('Sam');

    // Assert
    expect(prefs.deviceId).toBe('abcdefabcdef');
    expect(prefs.presenceMode).toBe('offline');
  });

  it('does not overwrite an unreadable vault on read, and keeps a copy on the first change', async () => {
    // Arrange
    await writeFile(file, Buffer.from([0, 1, 2, 3, 255]));
    const vault = new CollabCredentialVault(file, fakeCipher());

    // Act
    await vault.preferences('Sam');
    const untouched = await readFile(file);
    await vault.setShareRuns(false);

    // Assert
    expect([...untouched]).toEqual([0, 1, 2, 3, 255]);
    expect((await readdir(dir)).some((name) => name.startsWith('collab-vault.bin.unreadable-'))).toBe(true);
  });
});
