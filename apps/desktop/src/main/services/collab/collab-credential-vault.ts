import { safeStorage } from 'electron';
import { randomBytes } from 'node:crypto';
import { copyFile, readFile } from 'node:fs/promises';

import { appLogger } from '@testrix/electron-core';
import { defaultCollabIdentity, type CollabIdentity } from '@testrix/contracts';

import { isMissingFile, queueForPath, writeFileAtomic } from '../json-file';
import { CollabUserError } from './collab-errors';

export interface GitCredential {
  readonly username: string;
  readonly password: string;
}

export interface CollabPreferences {
  readonly identity: CollabIdentity;
  readonly presenceMode: 'active' | 'offline';
  readonly shareRuns: boolean;
  readonly deviceId: string;
}

/** OS-backed encryption. Defaults to Electron `safeStorage`; tests pass a fake. */
export interface VaultCipher {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

interface VaultFile {
  readonly identity: CollabIdentity | null;
  readonly presenceMode: 'active' | 'offline';
  readonly shareRuns: boolean;
  readonly deviceId: string;
  readonly git: Record<string, GitCredential>;
}

export const safeStorageCipher: VaultCipher = {
  isAvailable: () => typeof safeStorage?.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (data) => safeStorage.decryptString(data),
};

/**
 * Git credentials and Collab preferences, encrypted with Electron safeStorage
 * (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
 *
 * Git credentials are only stored when encryption is available. A vault that exists
 * but cannot be opened is never overwritten in place: it is copied aside on the
 * first change, and its device id is not persisted until then.
 */
export class CollabCredentialVault {
  private cached: VaultFile | null = null;
  private loading: Promise<VaultFile> | null = null;
  private isUnreadable = false;

  constructor(
    private readonly filePath: string,
    private readonly cipher: VaultCipher = safeStorageCipher,
  ) {}

  async preferences(fallbackName: string): Promise<CollabPreferences> {
    const file = await this.read();
    return {
      identity: file.identity ?? defaultCollabIdentity(fallbackName),
      presenceMode: file.presenceMode,
      shareRuns: file.shareRuns,
      deviceId: file.deviceId,
    };
  }

  async setIdentity(identity: CollabIdentity): Promise<void> {
    await this.mutate((current) => ({ ...current, identity }));
  }

  async setPresenceMode(mode: 'active' | 'offline'): Promise<void> {
    await this.mutate((current) => ({ ...current, presenceMode: mode }));
  }

  async setShareRuns(enabled: boolean): Promise<void> {
    await this.mutate((current) => ({ ...current, shareRuns: enabled }));
  }

  async getGit(remoteUrl: string): Promise<GitCredential | null> {
    return (await this.read()).git[remoteUrl] ?? null;
  }

  async setGit(remoteUrl: string, credential: GitCredential | null): Promise<void> {
    if (credential && !this.cipher.isAvailable()) {
      throw new CollabUserError(
        'This computer has no secure credential storage, so Testrix cannot save the password. Use an SSH address, or set up the system keychain and try again.',
        'tooling',
      );
    }
    await this.mutate((current) => {
      const git = { ...current.git };
      if (credential)
        git[remoteUrl] = credential;
      else
        delete git[remoteUrl];
      return { ...current, git };
    });
  }

  private mutate(change: (current: VaultFile) => VaultFile): Promise<void> {
    return queueForPath(this.filePath, async () => {
      const next = change(await this.read());
      await this.persist(next);
    });
  }

  private read(): Promise<VaultFile> {
    if (this.cached)
      return Promise.resolve(this.cached);
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(): Promise<VaultFile> {
    let parsed: Partial<VaultFile> | null = null;
    let exists = false;
    try {
      const raw = await readFile(this.filePath);
      exists = true;
      parsed = this.decode(raw);
    } catch (error) {
      if (!isMissingFile(error))
        appLogger.warn('collab-vault', `Could not read the vault: ${String(error)}`);
    }
    if (exists && !parsed) {
      this.isUnreadable = true;
      appLogger.warn('collab-vault', 'The Collab vault could not be decrypted; it is kept until the next change.');
    }
    const file: VaultFile = {
      identity: parsed?.identity ?? null,
      presenceMode: parsed?.presenceMode === 'offline' ? 'offline' : 'active',
      shareRuns: parsed?.shareRuns !== false,
      deviceId: parsed?.deviceId || randomBytes(6).toString('hex'),
      git: parsed?.git ?? {},
    };
    this.cached = file;
    if (!exists)
      await this.persist(file);
    return file;
  }

  /** Tries the encrypted form first, then the plaintext form older builds wrote. */
  private decode(raw: Buffer): Partial<VaultFile> | null {
    if (this.cipher.isAvailable()) {
      try {
        return asVaultObject(JSON.parse(this.cipher.decrypt(raw)));
      } catch {
        // fall through to the plaintext form
      }
    }
    try {
      return asVaultObject(JSON.parse(raw.toString('utf8')));
    } catch {
      return null;
    }
  }

  private async persist(file: VaultFile): Promise<void> {
    if (this.isUnreadable) {
      const backup = `${this.filePath}.unreadable-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await copyFile(this.filePath, backup).catch((error: unknown) =>
        appLogger.warn('collab-vault', `Could not keep a copy of the unreadable vault: ${String(error)}`),
      );
      this.isUnreadable = false;
    }
    this.cached = file;
    const isEncrypted = this.cipher.isAvailable();
    const json = JSON.stringify(isEncrypted ? file : { ...file, git: {} });
    await writeFileAtomic(this.filePath, isEncrypted ? this.cipher.encrypt(json) : Buffer.from(json, 'utf8'));
  }
}

function asVaultObject(value: unknown): Partial<VaultFile> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<VaultFile>) : null;
}
