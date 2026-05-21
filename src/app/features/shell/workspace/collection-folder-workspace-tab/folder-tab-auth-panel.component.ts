import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type {
  CollectionFolderAuth,
  CollectionFolderAuthType,
  CollectionOAuth2GrantType,
} from '@shared/config';
import { COLLECTION_OAUTH2_GRANT_TYPES } from '@shared/config';

import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxVariableInputComponent } from '@app/shared/components/tx-variable-input/tx-variable-input.component';

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
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxVariableInputComponent,
  ],
  templateUrl: './folder-tab-auth-panel.component.html',
  styleUrl: './folder-tab-auth-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderTabAuthPanelComponent {
  readonly auth = input.required<CollectionFolderAuth>();
  readonly hasParentFolder = input(false);

  readonly authChange = output<CollectionFolderAuth>();

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
    }>,
  ): void {
    const current = this.auth();
    if (current.type !== 'oauth2') {
      return;
    }
    this.authChange.emit({ ...current, ...patch });
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
        };
      default:
        return { type: 'none' };
    }
  }
}
