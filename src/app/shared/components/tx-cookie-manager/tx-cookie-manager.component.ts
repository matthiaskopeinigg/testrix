import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { StoredCookie } from '@shared/http/stored-cookie.schema';

import { CookieJarService } from '@app/core/http/cookie-jar.service';
import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxModalComponent } from '../tx-modal/tx-modal.component';
import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';

export interface TxCookieDomainGroup {
  readonly domain: string;
  readonly cookies: readonly StoredCookie[];
}

@Component({
  selector: 'tx-cookie-manager',
  standalone: true,
  imports: [
    FormsModule,
    TxModalComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxSpinnerComponent,
  ],
  templateUrl: './tx-cookie-manager.component.html',
  styleUrl: './tx-cookie-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxCookieManagerComponent {
  private readonly cookieJar = inject(CookieJarService);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly cookies = signal<readonly StoredCookie[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly isLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.open()) {
        void this.loadCookies();
      }
    });
  }

  protected readonly filteredGroups = computed((): readonly TxCookieDomainGroup[] => {
    const term = this.searchTerm().trim().toLowerCase();
    const groups = new Map<string, StoredCookie[]>();
    for (const cookie of this.cookies()) {
      const domain = cookie.domain.trim() || 'unknown';
      const matches =
        !term ||
        domain.toLowerCase().includes(term) ||
        cookie.key.toLowerCase().includes(term);
      if (!matches) {
        continue;
      }
      const list = groups.get(domain) ?? [];
      list.push(cookie);
      groups.set(domain, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, list]) => ({ domain, cookies: list }));
  });

  protected handleClose(): void {
    this.closed.emit();
  }

  protected handleSearchChange(value: string): void {
    this.searchTerm.set(value);
  }

  protected async handleDeleteCookie(cookie: StoredCookie): Promise<void> {
    await this.cookieJar.deleteCookie(cookie);
    await this.loadCookies();
  }

  protected async handleClearAll(): Promise<void> {
    if (!globalThis.confirm?.('Clear all cookies in this profile?')) {
      return;
    }
    await this.cookieJar.clearAll();
    await this.loadCookies();
  }

  protected async loadCookies(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      this.cookies.set(await this.cookieJar.listAll());
    } catch {
      this.cookies.set([]);
      this.loadError.set('Could not load cookies.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
