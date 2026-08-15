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

import type {
  CollectionFolderAuth,
  CollectionFolderAuthType,
  CollectionOAuth2GrantType,
} from '@shared/config';
import { COLLECTION_OAUTH2_GRANT_TYPES } from '@shared/config';
import type { DynamicVariableCatalogItem } from '@shared/dynamic-variables';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxToggleComponent } from '@app/shared/components/forms/tx-toggle/tx-toggle.component';
import { TxVariableInputComponent } from '@app/shared/components/editors/tx-variable-input/tx-variable-input.component';

const AUTH_TYPE_LABELS: Record<CollectionFolderAuthType, string> = {
  none: 'None',
  inherit: 'Inherit from parent',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  apiKey: 'API Key',
  oauth2: 'OAuth 2.0',
};

const API_KEY_IN_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'header', label: 'Header' },
  { value: 'query', label: 'Query' },
];

const OAUTH_GRANT_OPTIONS: readonly TxDropdownOption[] = COLLECTION_OAUTH2_GRANT_TYPES.map((value) => ({
  value,
  label:
    value === 'authorization_code'
      ? 'Authorization code'
      : value === 'client_credentials'
        ? 'Client credentials'
        : 'Password',
}));

@Component({
  selector: 'app-folder-tab-auth-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxToggleComponent,
    TxVariableInputComponent,
  ],
  templateUrl: './folder-tab-auth-panel.component.html',
  styleUrl: './folder-tab-auth-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Authorization editor for collection folders, HTTP requests, and WebSockets.
 */
export class FolderTabAuthPanelComponent {
  private readonly electron = inject(ElectronService);
  private readonly errors = inject(ErrorNotificationService);
  private readonly notifications = inject(TxNotificationService);

  readonly auth = input.required<CollectionFolderAuth>();
  readonly hasParentFolder = input(false);
  readonly catalog = input<readonly DynamicVariableCatalogItem[]>([]);
  /** Request or folder id used as the vault key for OAuth tokens. */
  readonly ownerId = input('');

  readonly authChange = output<CollectionFolderAuth>();
  readonly environmentVariableClick = output<{ readonly key: string }>();

  protected readonly tokenBusy = signal(false);
  protected readonly tokenStatus = signal<{
    readonly hasAccessToken: boolean;
    readonly expiresAt: number | null;
    readonly expired: boolean;
  } | null>(null);

  protected readonly tokenStatusLabel = computed(() => {
    const status = this.tokenStatus();
    if (!status?.hasAccessToken) {
      return 'No token stored. Get Token runs the grant and saves the access token in the local vault.';
    }
    if (status.expired) {
      return 'Stored token is expired. Send or Get Token will refresh it.';
    }
    if (status.expiresAt) {
      return `Token expires ${new Date(status.expiresAt).toLocaleString()}.`;
    }
    return 'Access token is stored in the local vault.';
  });

  constructor() {
    effect(() => {
      const ownerId = this.ownerId();
      const auth = this.auth();
      if (auth.type !== 'oauth2' || !ownerId) {
        this.tokenStatus.set(null);
        return;
      }
      void this.refreshTokenStatus(ownerId);
    });
  }

  protected readonly authTypeOptions = computed((): readonly TxDropdownOption[] => {
    const types: CollectionFolderAuthType[] = ['none', 'bearer', 'basic', 'apiKey', 'oauth2'];
    if (this.hasParentFolder()) {
      return [{ value: 'inherit', label: AUTH_TYPE_LABELS.inherit }, ...types.map((t) => ({
        value: t,
        label: AUTH_TYPE_LABELS[t],
      }))];
    }
    return types.map((t) => ({ value: t, label: AUTH_TYPE_LABELS[t] }));
  });

  protected readonly apiKeyInOptions = API_KEY_IN_OPTIONS;
  protected readonly oauthGrantOptions = OAUTH_GRANT_OPTIONS;

  protected handleTypeChange(type: string): void {
    const next = this.authForType(type as CollectionFolderAuthType);
    this.authChange.emit(next);
  }

  protected patchBearer(patch: Partial<{ token: string }>): void {
    const current = this.auth();
    if (current.type !== 'bearer') {
      return;
    }
    this.authChange.emit({ ...current, ...patch });
  }

  protected patchBasic(patch: Partial<{ username: string; password: string }>): void {
    const current = this.auth();
    if (current.type !== 'basic') {
      return;
    }
    this.authChange.emit({ ...current, ...patch });
  }

  protected patchApiKey(
    patch: Partial<{ name: string; value: string; in: 'header' | 'query' }>,
  ): void {
    const current = this.auth();
    if (current.type !== 'apiKey') {
      return;
    }
    this.authChange.emit({ ...current, ...patch });
  }

  protected patchOAuth2(
    patch: Partial<{
      grantType: CollectionOAuth2GrantType;
      authUrl: string;
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      scope: string;
      redirectUri: string;
      usePkce: boolean;
      tokenType: string;
      username: string;
      password: string;
    }>,
  ): void {
    const current = this.auth();
    if (current.type !== 'oauth2') {
      return;
    }
    this.authChange.emit({ ...current, ...patch });
  }

  protected async handleGetToken(): Promise<void> {
    const auth = this.auth();
    const ownerId = this.ownerId().trim();
    const api = this.electron.bridge();
    if (auth.type !== 'oauth2' || !ownerId || !api?.oauth) {
      return;
    }
    this.tokenBusy.set(true);
    try {
      await api.oauth.ensureToken({ ownerId, auth });
      await this.refreshTokenStatus(ownerId);
      this.notifications.showSuccess('OAuth token stored in the local vault.');
    } catch (error) {
      this.errors.reportUnknown(error);
    } finally {
      this.tokenBusy.set(false);
    }
  }

  protected async handleClearToken(): Promise<void> {
    const ownerId = this.ownerId().trim();
    const api = this.electron.bridge();
    if (!ownerId || !api?.oauth) {
      return;
    }
    this.tokenBusy.set(true);
    try {
      await api.oauth.clearToken(ownerId);
      await this.refreshTokenStatus(ownerId);
      this.notifications.showInfo('OAuth token cleared.');
    } catch (error) {
      this.errors.reportUnknown(error);
    } finally {
      this.tokenBusy.set(false);
    }
  }

  private async refreshTokenStatus(ownerId: string): Promise<void> {
    const api = this.electron.bridge();
    if (!api?.oauth) {
      this.tokenStatus.set(null);
      return;
    }
    try {
      const status = await api.oauth.tokenStatus(ownerId);
      this.tokenStatus.set({
        hasAccessToken: status.hasAccessToken,
        expiresAt: status.expiresAt,
        expired: status.expired,
      });
    } catch {
      this.tokenStatus.set(null);
    }
  }

  private authForType(type: CollectionFolderAuthType): CollectionFolderAuth {
    switch (type) {
      case 'inherit':
        return { type: 'inherit' };
      case 'bearer':
        return { type: 'bearer', token: '' };
      case 'basic':
        return { type: 'basic', username: '', password: '' };
      case 'apiKey':
        return { type: 'apiKey', name: '', value: '', in: 'header' };
      case 'oauth2':
        return {
          type: 'oauth2',
          grantType: 'client_credentials',
          authUrl: '',
          tokenUrl: '',
          clientId: '',
          clientSecret: '',
          scope: '',
          redirectUri: '',
          usePkce: true,
          tokenType: 'Bearer',
          username: '',
          password: '',
        };
      default:
        return { type: 'none' };
    }
  }
}
