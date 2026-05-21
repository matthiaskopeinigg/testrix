import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { CookieJar, type Cookie } from 'tough-cookie';

import { COOKIE_JAR_FILE_NAME } from '../../../shared/config/constants';
import type { StoredCookie } from '../../../shared/http/stored-cookie.schema';

function cookieToStored(row: Cookie): StoredCookie {
  const json = row.toJSON();
  const key = String(json.key ?? '').trim();
  return {
    key,
    value: String(json.value ?? ''),
    domain: String(json.domain ?? '').trim() || 'unknown',
    path: String(json.path ?? '/') || '/',
    expires: json.expires ? String(json.expires) : undefined,
    httpOnly: json.httpOnly === true,
    secure: json.secure === true,
    sameSite: json.sameSite ? String(json.sameSite) : undefined,
  };
}

/**
 * Per-profile persistent cookie jar backed by `tough-cookie` and `cookie-jar.json`.
 */
export class CookieJarStore {
  private jar = new CookieJar();
  private profileDir: string | null = null;
  private saveChain: Promise<void> = Promise.resolve();

  /** Loads or creates the jar for the active workspace profile directory. */
  async loadForProfile(profileDir: string): Promise<void> {
    this.profileDir = profileDir;
    const filePath = path.join(profileDir, COOKIE_JAR_FILE_NAME);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      this.jar = await CookieJar.deserialize(parsed as string | object);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        this.jar = new CookieJar();
        return;
      }
      this.jar = new CookieJar();
    }
  }

  /** Cookie header value for an outgoing request URL, or undefined when empty. */
  async getCookieHeader(url: string): Promise<string | undefined> {
    const value = await this.jar.getCookieString(url);
    return value && value.length > 0 ? value : undefined;
  }

  /** Merges Set-Cookie headers from a response into the jar for the request URL. */
  async absorbSetCookie(url: string, setCookieHeaders: readonly string[]): Promise<void> {
    if (setCookieHeaders.length === 0) {
      return;
    }
    for (const header of setCookieHeaders) {
      try {
        await this.jar.setCookie(header, url, { ignoreError: true });
      } catch {
        // Skip malformed Set-Cookie lines.
      }
    }
    this.scheduleSave();
  }

  async listAll(): Promise<readonly StoredCookie[]> {
    const cookies = await this.jar.store.getAllCookies();
    return cookies.map(cookieToStored).filter((c) => c.key.length > 0);
  }

  async deleteCookie(domain: string, path: string, key: string): Promise<void> {
    await this.jar.store.removeCookie(domain, path, key);
    this.scheduleSave();
  }

  async clearAll(): Promise<void> {
    await this.jar.store.removeAllCookies();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    this.saveChain = this.saveChain
      .then(() => this.persist())
      .catch(() => undefined);
  }

  private async persist(): Promise<void> {
    if (!this.profileDir) {
      return;
    }
    const filePath = path.join(this.profileDir, COOKIE_JAR_FILE_NAME);
    const serialized = await this.jar.serialize();
    const body = `${JSON.stringify(serialized, null, 2)}\n`;
    const tmp = `${filePath}.tmp`;
    await fs.mkdir(this.profileDir, { recursive: true });
    await fs.writeFile(tmp, body, 'utf8');
    await fs.unlink(filePath).catch(() => undefined);
    await fs.rename(tmp, filePath);
  }
}

export const cookieJarStore = new CookieJarStore();
