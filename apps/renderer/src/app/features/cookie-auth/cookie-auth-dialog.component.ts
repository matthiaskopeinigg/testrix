import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  folderConfigOf,
  requestConfigOf,
  type CollectionCookie,
} from '@testrix/contracts';
import {
  TxButtonComponent,
  TxCheckComponent,
  TxHintComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
} from '@testrix/ui';

import { ShellStateService } from '../../core/shell-state.service';
import { CollectionsStore } from '../collections/collections.store';
import { CookieJarStore } from '../workbench/request/cookie-jar.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import { CookieAuthDialogService } from './cookie-auth-dialog.service';
import {
  clearedAuthSecrets,
  collectAuthEntries,
  filterJarCookies,
  findCollectionNode,
  isCookieExpired,
  type AuthJarEntry,
} from './cookie-auth-entries';

@Component({
  selector: 'tx-cookie-auth-dialog',
  standalone: true,
  imports: [
    TxOverlayComponent,
    TxButtonComponent,
    TxCheckComponent,
    TxHintComponent,
    TxInputComponent,
  ],
  templateUrl: './cookie-auth-dialog.component.html',
  styleUrl: './cookie-auth-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class CookieAuthDialogComponent {
  private readonly dialog = inject(CookieAuthDialogService);
  private readonly cookies = inject(CookieJarStore);
  private readonly collections = inject(CollectionsStore);
  private readonly workbench = inject(WorkbenchStore);
  private readonly shell = inject(ShellStateService);

  readonly titleId = 'tx-cookie-auth-title';
  readonly cookieQuery = signal('');
  readonly cookieDomain = signal('');
  readonly enabledOnly = signal(false);
  readonly expiredOnly = signal(false);
  readonly authQuery = signal('');
  readonly revealCookies = signal(false);
  readonly revealAuth = signal(false);

  readonly jarCookies = computed(() => this.cookies.cookies());
  readonly filteredCookies = computed(() =>
    filterJarCookies(this.jarCookies(), {
      query: this.cookieQuery(),
      domain: this.cookieDomain(),
      enabledOnly: this.enabledOnly(),
      expiredOnly: this.expiredOnly(),
    }),
  );

  readonly authEntries = computed(() => {
    const query = this.authQuery().trim().toLowerCase();
    const all = collectAuthEntries(this.collections.tree());
    if (!query)
      return all;
    return all.filter((entry) => {
      const haystack = `${entry.path} ${entry.authType} ${entry.summary}`.toLowerCase();
      return haystack.includes(query);
    });
  });

  close(): void {
    this.dialog.hide();
  }

  addCookie(): void {
    void this.cookies.add();
  }

  clearJar(): void {
    void this.cookies.clear();
  }

  clearExpired(): void {
    const next = this.jarCookies().filter((cookie) => !isCookieExpired(cookie.expires));
    void this.cookies.replace(next);
  }

  clearMatching(): void {
    const remove = new Set(this.filteredCookies().map((cookie) => cookie.id));
    const next = this.jarCookies().filter((cookie) => !remove.has(cookie.id));
    void this.cookies.replace(next);
  }

  removeCookie(id: string): void {
    void this.cookies.remove(id);
  }

  toggleCookie(id: string, checked: boolean): void {
    void this.cookies.patch(id, { enabled: checked });
  }

  patchCookie(
    id: string,
    field: 'name' | 'value' | 'domain' | 'path' | 'expires',
    event: Event,
  ): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    void this.cookies.patch(id, { [field]: target.value });
  }

  isExpired(cookie: CollectionCookie): boolean {
    return isCookieExpired(cookie.expires);
  }

  toggleRevealCookies(): void {
    this.revealCookies.update((value) => !value);
  }

  toggleRevealAuth(): void {
    this.revealAuth.update((value) => !value);
  }

  authSecretPreview(entry: AuthJarEntry): string {
    if (!this.revealAuth())
      return entry.hasSecrets ? '••••••••' : '—';
    const node = findCollectionNode(this.collections.tree(), entry.id);
    if (!node)
      return '—';
    const auth =
      node.kind === 'folder'
        ? folderConfigOf(node).auth
        : node.kind === 'http'
          ? requestConfigOf(node).auth
          : null;
    if (!auth)
      return '—';
    const secret =
      auth.accessToken ||
      auth.token ||
      auth.apiKey ||
      auth.password ||
      auth.refreshToken ||
      '';
    return secret || '—';
  }

  openAuthNode(entry: AuthJarEntry): void {
    const node = findCollectionNode(this.collections.tree(), entry.id);
    if (!node)
      return;
    this.ensureCollectionsRail();
    this.collections.applyPointerSelect(entry.id, {
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    });
    if (node.kind === 'folder') {
      this.workbench.openFromCollectionFolder(node, 'auth');
      this.close();
      return;
    }
    this.workbench.openFromNode(node);
    for (const group of this.workbench.groups()) {
      const tab = group.tabs.find((item) => item.nodeId === node.id && item.kind === 'http');
      if (tab)
        this.workbench.patchTab(tab.id, { requestSection: 'auth' });
    }
    this.close();
  }

  private ensureCollectionsRail(): void {
    this.shell.showSidebar();
    if (this.shell.activeRail() === 'collections')
      return;
    this.shell.selectRail('collections');
  }

  clearAuthSecrets(entry: AuthJarEntry): void {
    const node = findCollectionNode(this.collections.tree(), entry.id);
    if (!node)
      return;
    if (node.kind === 'folder') {
      const auth = clearedAuthSecrets(folderConfigOf(node).auth);
      this.collections.updateFolderConfig(node.id, { auth });
      return;
    }
    if (node.kind === 'http') {
      const auth = clearedAuthSecrets(requestConfigOf(node).auth);
      this.collections.updateHttpConfig(node.id, { auth });
    }
  }
}
