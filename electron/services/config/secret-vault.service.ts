import { safeStorage } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { VAULT_FILE_NAME, type SecretVaultMap } from '../../../shared/config/environment-secret-vault';
import { ErrorCodes, TestrixError } from '../../../shared/errors';

/**
 * Profile-local encrypted secret store. Refuses plaintext fallback.
 */
export class SecretVaultService {
  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  assertEncryptionAvailable(): void {
    if (!this.isEncryptionAvailable()) {
      throw new TestrixError(
        ErrorCodes.VAULT_ENCRYPTION_UNAVAILABLE,
        'OS encryption is unavailable. Testrix will not store new secrets in plaintext.',
      );
    }
  }

  async load(profileDir: string): Promise<SecretVaultMap> {
    const filePath = path.join(profileDir, VAULT_FILE_NAME);
    try {
      const data = await fs.readFile(filePath);
      if (!this.isEncryptionAvailable()) {
        return {};
      }
      const json = safeStorage.decryptString(data);
      const parsed = JSON.parse(json) as { entries?: SecretVaultMap };
      return parsed.entries ?? {};
    } catch {
      return {};
    }
  }

  async save(profileDir: string, secrets: SecretVaultMap): Promise<void> {
    const entries = Object.fromEntries(
      Object.entries(secrets).filter(([, value]) => value.length > 0),
    );
    if (Object.keys(entries).length === 0) {
      try {
        await fs.unlink(path.join(profileDir, VAULT_FILE_NAME));
      } catch {
        /* ignore missing file */
      }
      return;
    }
    this.assertEncryptionAvailable();
    await fs.mkdir(profileDir, { recursive: true });
    const payload = JSON.stringify({ version: 1, entries });
    const encrypted = safeStorage.encryptString(payload);
    await fs.writeFile(path.join(profileDir, VAULT_FILE_NAME), encrypted);
  }
}

export const secretVaultService = new SecretVaultService();
