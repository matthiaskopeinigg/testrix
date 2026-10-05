import { Injectable, inject, signal } from '@angular/core';
import {
  DEFAULT_COOKIES_FILE,
  emptyCollectionCookie,
  mergeCookieJar,
  parseCookiesFile,
  type CollectionCookie,
  type CookiesFile,
} from '@testrix/contracts';

import { DesktopApiService } from '../../../core/desktop-api.service';

@Injectable({ providedIn: 'root' })
export class CookieJarStore {
  private readonly desktop = inject(DesktopApiService);
  readonly cookies = signal<readonly CollectionCookie[]>([]);

  hydrate(file: CookiesFile): void {
    this.cookies.set(parseCookiesFile(file).cookies);
  }

  async merge(incoming: readonly CollectionCookie[]): Promise<void> {
    if (incoming.length === 0)
      return;
    const next = mergeCookieJar(this.cookies(), incoming);
    this.cookies.set(next);
    await this.desktop.saveCookies({ cookies: next });
  }

  async add(): Promise<void> {
    const next = [...this.cookies(), emptyCollectionCookie('jar')];
    this.cookies.set(next);
    await this.desktop.saveCookies({ cookies: next });
  }

  async patch(id: string, patch: Partial<CollectionCookie>): Promise<void> {
    const next = this.cookies().map((cookie) => (cookie.id === id ? { ...cookie, ...patch } : cookie));
    this.cookies.set(next);
    await this.desktop.saveCookies({ cookies: next });
  }

  async remove(id: string): Promise<void> {
    const next = this.cookies().filter((cookie) => cookie.id !== id);
    this.cookies.set(next);
    await this.desktop.saveCookies({ cookies: next });
  }

  async clear(): Promise<void> {
    this.cookies.set([]);
    await this.desktop.saveCookies({ cookies: [] });
  }

  async replace(cookies: readonly CollectionCookie[]): Promise<void> {
    const next = parseCookiesFile({
      schemaVersion: DEFAULT_COOKIES_FILE.schemaVersion,
      cookies,
    }).cookies;
    this.cookies.set(next);
    await this.desktop.saveCookies({ cookies: next });
  }
}
