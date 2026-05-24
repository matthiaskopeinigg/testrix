import { safeStorage } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const CREDENTIALS_FILE = '.testrix/credentials';

/**
 * Stores Git PAT encrypted via Electron safeStorage.
 */
export class TeamCredentialsService {
  private cache = new Map<string, string | null>();

  async saveToken(workspaceDir: string, token: string): Promise<void> {
    const dir = path.join(workspaceDir, '.testrix');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(workspaceDir, CREDENTIALS_FILE);

    if (!safeStorage.isEncryptionAvailable()) {
      await fs.writeFile(filePath, Buffer.from(token, 'utf8'));
      this.cache.set(workspaceDir, token);
      return;
    }

    const encrypted = safeStorage.encryptString(token);
    await fs.writeFile(filePath, encrypted);
    this.cache.set(workspaceDir, token);
  }

  async loadToken(workspaceDir: string): Promise<string | null> {
    const cached = this.cache.get(workspaceDir);
    if (cached !== undefined) {
      return cached;
    }

    const filePath = path.join(workspaceDir, CREDENTIALS_FILE);
    try {
      const data = await fs.readFile(filePath);
      if (safeStorage.isEncryptionAvailable()) {
        const token = safeStorage.decryptString(data);
        this.cache.set(workspaceDir, token);
        return token;
      }
      const token = data.toString('utf8');
      this.cache.set(workspaceDir, token);
      return token;
    } catch {
      this.cache.set(workspaceDir, null);
      return null;
    }
  }

  async clearToken(workspaceDir: string): Promise<void> {
    this.cache.delete(workspaceDir);
    try {
      await fs.unlink(path.join(workspaceDir, CREDENTIALS_FILE));
    } catch {
      /* ignore */
    }
  }

  invalidateCache(workspaceDir: string): void {
    this.cache.delete(workspaceDir);
  }
}

export const teamCredentialsService = new TeamCredentialsService();
