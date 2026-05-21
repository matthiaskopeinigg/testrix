import { Injectable, inject } from '@angular/core';

import type { StoredCookie } from '@shared/http/stored-cookie.schema';

import { ElectronService } from '../electron/electron.service';

@Injectable({ providedIn: 'root' })
export class CookieJarService {
  private readonly electron = inject(ElectronService);

  async listAll(): Promise<readonly StoredCookie[]> {
    const api = this.electron.bridge();
    if (!api?.cookies) {
      return [];
    }
    return api.cookies.getAll();
  }

  async deleteCookie(cookie: StoredCookie): Promise<void> {
    const api = this.electron.bridge();
    if (!api?.cookies) {
      return;
    }
    await api.cookies.delete({
      domain: cookie.domain,
      path: cookie.path,
      key: cookie.key,
    });
  }

  async clearAll(): Promise<void> {
    const api = this.electron.bridge();
    if (!api?.cookies) {
      return;
    }
    await api.cookies.clearAll();
  }
}
